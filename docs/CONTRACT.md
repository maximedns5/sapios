# Sapios — Contrat de la plateforme commune

Ce document fige les noms partagés par tout Sapios : comptes, admins, diplômes, notifications, conformité,
chiffrement. Le produit lui-même, Sapios Emploi, est décrit dans [`docs/EMPLOI_CONTRACT.md`](EMPLOI_CONTRACT.md),
qui fait foi pour tout ce qui touche aux candidats, recruteurs, offres et candidatures. Tout écart va dans
`docs/DEVIATIONS.md`.

Le produit de rencontre d'origine (profils, découverte, likes, matchs, profil intellectuel, lettres de
recommandation, événements) est **retiré** : son code reste consultable dans la branche `archive/dating`, et la
migration `20261031090000_nettoyage_dating` a supprimé ses tables, fonctions, types, tâches et le bucket `photos`.
Seule la liste d'attente de l'ancienne landing (`waitlist_signups`) est gardée, sans collecte, en attendant une
décision sur le sort de ses inscrits.

## 1. Enums Postgres (schéma `public`)

| Type | Valeurs |
|---|---|
| `access_tier` | `unlimited`, `standard`, `waitlist`, `refused` (vestige : dérivé par `apply_diploma_review`, sans effet dans l'emploi) |
| `submission_status` | `pending`, `processing`, `needs_review`, `approved`, `rejected`, `needs_more` |
| `photo_moderation` | `pending`, `approved`, `rejected` (photos des offres) |
| `report_status` | `open`, `actioned`, `dismissed` (signalements d'offres) |
| `admin_role` | `moderator`, `owner` |
| `push_platform` | `ios`, `android`, `web` |
| `study_field` | `education`, `arts`, `letters`, `philosophy`, `history`, `social_sciences`, `economics`, `law`, `sciences`, `mathematics`, `computing`, `engineering`, `agronomy`, `health` (libellés : `STUDY_FIELD_LABELS`) |

## 2. Tables communes

- `admins` : `user_id` PK, `role`. Personne ne s'y déclare : lecture admins seulement.
- `degree_submissions` : contrainte `check (status <> 'approved' or (reviewer_id is not null and level_verified is not null))`,
  `attempts`, `moderator_note`, `institution_verified`, `field_verified`. Le client ne lit ni `signals`, ni
  `moderator_note`, ni `extracted` : il passe par la vue `my_submissions`.
- `user_access` : `user_id` PK, `level` (échelle européenne : 5 = Bac+2, 6 = Bac+3, 7 = Bac+5, 8 = Bac+8),
  `tier`, `copy_key`, `source_submission_id`, `institution`, `study_field`, `granted_at`, `granted_by`. Écrit
  uniquement par `apply_diploma_review` ; le badge diplôme de l'emploi le lit.
- `access_policy` : niveau minimal → palier et clé de verdict. Gardée parce que `apply_diploma_review` en dérive
  encore `tier` et `copy_key` ; aucune autre lecture.
- `member_notices` : avis dans l'app (`inactivity_warning` et les types de l'emploi, `EmploiNotice`). Lu par son
  destinataire, acquitté par `ack_notice`.
- `push_tokens`, `terms_acceptances` (`user_id`, `version`), `app_copy` (PK `key`, `locale`), `app_settings`,
  `audit_log` (ajout seul, sans clé étrangère : survit à la suppression d'un compte).
- `waitlist_signups` : inscriptions de l'ancienne landing. Plus aucune insertion (ni `anon` ni `authenticated`) ;
  lecture et suppression par les admins.
- Schéma `private` (jamais exposé) : `inactivity_warnings`, `account_activity` (dernière activité dans l'app,
  remplace `profiles.last_active_at`), `rate_limits`.
- **Chiffrement** : clé `field_key` dans Vault, pgcrypto `pgp_sym_encrypt` (AES-256) ; seule colonne chiffrée :
  `candidate_identities.last_name_enc` (emploi). `identity_pepper` reste dans Vault. Ni l'une ni l'autre ne sont
  jamais recréées.

`app_settings` : `diploma_retention_days`, `max_submissions_per_30_days`, `inactive_warning_days` (730),
`inactive_grace_days` (30), `report_retention_days` (365, signalements d'offres traités), `audit_retention_days`
(1825), `notice_retention_days` (365), plus les réglages de l'emploi.

## 3. RPC communes

Toutes en `security definer`, `set search_path = ''`, `execute` révoqué à `anon` et `public`, accordé à
`authenticated`. Aucune fonction n'est exécutable par `anon`. Erreurs métier : `raise exception '<code>' using
errcode = 'P0001'`.

| Fonction | Retour | Erreurs |
|---|---|---|
| `is_admin()` | `bool` : compte de `admins` dont la session est **aal2** (double authentification). Toutes les règles et RPC d'admin en dépendent | — |
| `is_admin_account()` | `bool` : le compte figure dans `admins`, quel que soit le niveau de session (aiguillage du back-office seulement) | — |
| `ack_notice(p_id uuid)` | `void` | — |
| `admin_list_submissions(p_status submission_status default 'needs_review')` | `setof` (soumission + `legal_name` = prénom et nom du candidat déchiffrés, `birthdate` toujours nulle, `display_name` = prénom, `email`, `institution_verified`, `field_verified`), les plus anciennes d'abord, 500 au plus | `forbidden` |
| `admin_get_submission(p_id uuid)` | même ligne pour une soumission | `forbidden` |
| `admin_set_member_institution(p_user uuid, p_institution text, p_field study_field)` | `void` (rattrapage d'un diplôme déjà validé) | `forbidden`, `not_found`, `invalid_institution` |
| `admin_update_settings(p_values jsonb)` | `jsonb` (valeurs enregistrées). Clés : durées de conservation (bornes dans `RETENTION_SETTINGS`), `offer_lifetime_days` (7–180), `application_content_retention_days` (30–1095), `invitation_weekly_quota` (0–200), `apply_daily_quota` (1–200), `offer_banned_words` et `generic_email_domains` (listes nettoyées), `emploi_terms_candidate_version` et `emploi_terms_recruiter_version`. Avant / après dans `audit_log` | `forbidden`, `invalid_input`, `invalid_value`, `unknown_setting` |

Réservées à `service_role` :
- `apply_diploma_review(p_submission, p_reviewer, p_decision /* approve|reject|needs_more */, p_level, p_reason, p_institution default null, p_field default null)`
  → `jsonb { user_id, tier, level, copy_key }`. Une transaction : soumission, `user_access`, `audit_log`.
- `server_get_identity(p_user uuid)` → `setof (legal_name text, birthdate date)` : prénom et nom du candidat
  (process-diploma) ; `birthdate` nulle, l'emploi ne collecte pas de date de naissance.
- `diploma_queue_read(p_qty, p_vt)` / `diploma_queue_delete(p_msg_id)` : enveloppes sur `pgmq`.
- `diplomas_to_purge(p_days)` → `setof (id, storage_path)` ; `mark_diploma_purged(p_id)`.
- `inactive_accounts_to_purge(p_limit default 100)` → `setof (user_id)` ; `inactive_purge_eligible(p_user)` →
  `bool`, revérifié juste avant chaque suppression. Jamais un admin. Activité = la plus récente de
  `private.account_activity`, de la dernière connexion et de la création du compte.
- `consume_rate_limit(p_user, p_bucket, p_limit, p_window_seconds)` → `bool` : quotas des appels sortants
  (`company-lookup`, `geocode`).

Tâches `pg_cron` : `process-diploma` (chaque minute), `purge-diplomas` (3 h 17 UTC), `retention-daily`
(3 h 41 UTC : avertit les comptes inactifs — avis et email `notify` `inactivity` —, purge signalements d'offres
traités, journal et avis lus échus, puis `private.run_emploi_retention()`), `purge-inactive` (3 h 53 UTC), et
celles de l'emploi. Transitoire : `purge-dating-photos` (toutes les 10 min) vide puis supprime le bucket `photos`
d'un projet existant et se désinscrit dès qu'il n'existe plus.

## 4. Storage

- `diplomas` (privé) : `{user_id}/{uuid}.{ext}`, `insert` par le propriétaire dans son dossier, aucune lecture
  client. `offer-photos` : voir `docs/EMPLOI_CONTRACT.md` §4.
- `photos` (dating) : plus aucune règle d'accès ; supprimé par `purge-dating-photos`.

## 5. Edge Functions

Réponses JSON. Erreurs : `{ "error": "<code>" }`.

| Fonction | Auth | Rôle |
|---|---|---|
| `submit-diploma` | JWT utilisateur | dépôt d'un diplôme (`{ storage_path, mime }` → `201 { submission_id, status }`) |
| `process-diploma` | `x-sapios-secret` | extraction (ou revue manuelle sans `ANTHROPIC_API_KEY`) |
| `review-diploma` | JWT admin | URL signée (5 min) et décision, puis `notify` verdict |
| `notify` | `x-sapios-secret` | `{ type: "emploi", event, id }` (docs/EMPLOI_CONTRACT.md §8), `{ type: "verdict", user_id, copy_key }` (textes de l'emploi), `{ type: "inactivity", user_id, delete_after }` (email seulement) |
| `delete-account` | JWT utilisateur | `{ deleted: true }` |
| `purge-diplomas`, `purge-inactive` | `x-sapios-secret` | conservation |
| `company-lookup`, `geocode` | JWT utilisateur | voir `docs/EMPLOI_CONTRACT.md` §5 |
| `purge-dating-photos` | `x-sapios-secret` | transitoire : `{ removed, bucket_deleted }` |

Secret partagé : `SAPIOS_INTERNAL_SECRET` côté Edge Functions, même valeur dans Vault (`internal_secret`) côté
base. URL de base pour `pg_net` : Vault `project_url`.

## 6. Textes (`app_copy`, locale `fr`)

`email.footer`, `email.inactivity.subject|title|body|cta` (`{date}`, `{name}`), `notice.inactivity.title|body`
(`{date}`), `review.delay`. Les textes de l'emploi vivent dans `_shared/emploi_notify.ts` (notifications) et dans
l'app (`emploi.*`, repli local).

## 7. Comptes de test (seed local uniquement)

Mot de passe commun : `sapios-test-password`.

| Email | Rôle |
|---|---|
| `admin@sapios.test` | admin `owner` ; double authentification à enregistrer au premier passage dans le back-office |
| `pending@sapios.test` | candidate (Inès Garcia) dont le diplôme attend la revue ; un ancien refus de 45 jours sort dans `diplomas_to_purge(30)` |

Les comptes de l'emploi (candidats, recruteurs) : `docs/EMPLOI_CONTRACT.md` §9.

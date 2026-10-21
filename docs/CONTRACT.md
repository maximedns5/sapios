# Sapios — Contrat d'interface entre les modules

Ce document fige les noms partagés entre `supabase/` (base + Edge Functions), `apps/web`, `apps/mobile` et `packages/shared`. Il complète `docs/SAPIOS_BRIEF.md` (qui fait foi pour les règles métier). Si tu dois t'en écarter, note-le dans `docs/DEVIATIONS.md` avec la raison.

Décisions ouvertes du brief (§11) : on applique les valeurs par défaut du brief.
- Visibilité : tous les éligibles se voient (pas de filtre « même niveau ou supérieur »).
- Sortie de liste d'attente : admission par lot par un admin.
- Plateformes : mobile (Expo) + web (landing + back-office).
- Pas de test de QI, pas de paiement, France seulement.

## 1. Enums Postgres (schéma `public`)

| Type | Valeurs |
|---|---|
| `profile_status` | `onboarding`, `active`, `paused`, `banned` |
| `access_tier` | `unlimited`, `standard`, `waitlist`, `refused` |
| `submission_status` | `pending`, `processing`, `needs_review`, `approved`, `rejected`, `needs_more` |
| `swipe_direction` | `like`, `pass` |
| `gender` | `woman`, `man`, `nonbinary` |
| `photo_moderation` | `pending`, `approved`, `rejected` |
| `report_status` | `open`, `actioned`, `dismissed` |
| `admin_role` | `moderator`, `owner` |
| `push_platform` | `ios`, `android`, `web` |

## 2. Tables

Celles du brief §5, avec ces précisions :
- `profiles.seeking_genders gender[]`, `profiles.birth_year` n'existe pas : l'âge vient de `profile_private.birthdate`, exposé seulement par `get_feed`.
- `profiles.location geography(Point, 4326)` arrondie à ~1 km (3 décimales) par un trigger.
- `access_policy` : `id`, `min_level int unique` (1–8), `tier access_tier`, `daily_like_quota int null` (null = illimité), `can_browse bool`, `sees_likers bool`, `copy_key text`. Le palier d'un niveau N est la ligne avec le plus grand `min_level <= N`. Seed par défaut :

| min_level | tier | quota | can_browse | sees_likers | copy_key |
|---|---|---|---|---|---|
| 8 | unlimited | null | true | true | `verdict.unlimited` |
| 7 | standard | 20 | true | false | `verdict.standard` |
| 6 | waitlist | 0 | false | false | `verdict.waitlist` |
| 4 | refused | 0 | false | false | `verdict.refused` |
| 1 | refused | 0 | false | false | `verdict.uninstall` |

- `user_access` : `user_id` PK, `level int`, `tier access_tier`, `copy_key text`, `source_submission_id`, `granted_at`, `granted_by`. Pas de ligne = pas encore de verdict.
- `degree_submissions` : contrainte `check (status <> 'approved' or (reviewer_id is not null and level_verified is not null))`. Colonne en plus : `attempts int default 0` (essais d'extraction), `moderator_note text`. Le client ne lit ni `signals`, ni `moderator_note`, ni `extracted` (il passe par la vue `my_submissions`).
- `waitlist_signups` (landing) : `id`, `email citext unique`, `source text`, `created_at`. `anon` peut seulement `insert`. Aucune lecture hors admins.
- `app_copy` : PK (`key`, `locale`), `locale` par défaut `fr`.

## 3. RPC (appelées par `supabase.rpc`)

Toutes en `security definer`, `set search_path = ''`, `execute` révoqué à `anon` et `public`, accordé à `authenticated`. Erreurs métier levées avec `raise exception '<code>' using errcode = 'P0001'` ; le message est exactement le code ci-dessous.

| Fonction | Retour | Erreurs |
|---|---|---|
| `get_my_state()` | `jsonb` : `{ profile_status, onboarding: { identity_set, profile_complete, photos_count, consent_sensitive }, tier, level, copy_key, can_browse, daily_like_quota, likes_left_today, sees_likers, latest_submission: { id, status, created_at, rejection_reason } \| null, submissions_left }` | — |
| `set_identity(p_legal_name text, p_birthdate date)` | `void` | `identity_already_set`, `underage` |
| `set_sensitive_consent(p_granted bool, p_version text)` | `void` | — |
| `activate_profile()` | `void` (passe `onboarding` → `active`) | `identity_missing`, `profile_incomplete`, `photos_missing`, `consent_missing` |
| `set_paused(p_paused bool)` | `void` (`active` ⇄ `paused`) | `invalid_status` |
| `set_location(p_lat double precision, p_lng double precision)` | `void` | — |
| `get_feed(p_limit int default 20)` | `setof` (`id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[]`) | vide si palier non autorisé |
| `swipe(p_target uuid, p_direction swipe_direction)` | `jsonb` `{ matched bool, match_id uuid \| null }` | `not_eligible`, `quota_exceeded`, `target_unavailable`, `self_swipe` |
| `get_likers()` | même forme que `get_feed` | `not_allowed` (si `sees_likers` faux) |
| `get_matches()` | `setof` (`match_id, other_id, display_name, photo_path, last_message, last_message_at, unread_count`) | — |
| `unmatch(p_match_id uuid)` | `void` | `not_found` |
| `block_user(p_target uuid)` | `void` (dé-matche aussi) | — |
| `report_user(p_target uuid, p_reason text, p_details text)` | `uuid` | — |
| `export_my_data()` | `jsonb` | — |
| `is_admin()` | `bool` | — |
| `admin_admit_waitlist(p_user_ids uuid[], p_tier access_tier default 'standard')` | `int` (nombre admis) | `forbidden` |
| `admin_set_report_status(p_report_id uuid, p_status report_status, p_ban bool default false)` | `void` | `forbidden` |
| `admin_list_submissions(p_status submission_status default 'needs_review')` | `setof` (soumission + `legal_name`, `birthdate`, `display_name`) | `forbidden` |

Réservées à `service_role` (jamais `authenticated`) :
- `apply_diploma_review(p_submission uuid, p_reviewer uuid, p_decision text /* approve|reject|needs_more */, p_level int, p_reason text)` → `jsonb { user_id, tier, level, copy_key }`. Une seule transaction : soumission, `user_access`, `audit_log`.
- `diploma_queue_read(p_qty int, p_vt int)` / `diploma_queue_delete(p_msg_id bigint)` : enveloppes sur `pgmq`.
- `diplomas_to_purge(p_days int)` → `setof (id, storage_path)` ; `mark_diploma_purged(p_id uuid)`.

## 4. Storage

- Buckets privés `diplomas` et `photos`. Chemin d'objet : `{user_id}/{uuid}.{ext}` (le premier dossier est l'uid).
- `diplomas` : `insert` par le propriétaire dans son dossier, aucune lecture client.
- `photos` : `insert`/`delete` par le propriétaire ; `select` si propriétaire ou `public.can_view_profile(owner)`.

## 5. Edge Functions (`supabase/functions/<nom>/index.ts`)

Réponses JSON. Erreurs : `{ "error": "<code>" }` avec un statut HTTP adapté.

| Fonction | Auth | Corps | Réponse |
|---|---|---|---|
| `submit-diploma` | JWT utilisateur | `{ storage_path, mime }` | `201 { submission_id, status: "pending" }` ; erreurs `invalid_path`, `invalid_type`, `too_large`, `not_found`, `rate_limited`, `duplicate_document`, `already_verified_higher` |
| `process-diploma` | en-tête `x-sapios-secret` | `{}` | `{ processed: n }` |
| `review-diploma` | JWT admin | `{ action: "signed_url", submission_id }` → `{ url }` (5 min) ; `{ action: "decide", submission_id, decision: "approve"\|"reject"\|"needs_more", level?, reason? }` → `{ tier, level, copy_key }` | `forbidden` si non admin |
| `notify` | en-tête `x-sapios-secret` | `{ type: "match", match_id }` \| `{ type: "message", message_id }` \| `{ type: "verdict", user_id, copy_key }` | `{ sent: n }` |
| `delete-account` | JWT utilisateur | `{}` | `{ deleted: true }` |
| `purge-diplomas` | en-tête `x-sapios-secret` | `{}` | `{ purged: n }` |

Secret partagé : variable d'env `SAPIOS_INTERNAL_SECRET` côté Edge Functions, même valeur dans Vault (`internal_secret`) côté base. URL de base pour `pg_net` : Vault `project_url`.

## 6. Textes (`app_copy`, locale `fr`)

Clés minimales (le seed les remplit, le back-office les édite) :
`verdict.unlimited`, `verdict.standard`, `verdict.waitlist`, `verdict.refused`, `verdict.uninstall`, `verdict.rejected`, `verdict.needs_more`, `scan.title`, `scan.log.authenticity`, `scan.log.level`, `scan.log.einstein`, `scan.pending`, `feed.empty`, `match.title`, `onboarding.consent`, `push.match`, `push.message`, `push.verdict`.

## 7. Comptes de test (seed local uniquement)

Mot de passe commun : `sapios-test-password`. Tous à Paris (localisation proche), profils `active` sauf mention.

| Email | Niveau | Palier |
|---|---|---|
| `admin@sapios.test` | 8 | unlimited, + `admins(owner)` |
| `unlimited@sapios.test` | 8 | unlimited |
| `standard@sapios.test` | 7 | standard |
| `standard2@sapios.test` | 7 | standard |
| `waitlist@sapios.test` | 6 | waitlist |
| `refused@sapios.test` | 5 | refused (`verdict.refused`) |
| `uninstall@sapios.test` | 3 | refused (`verdict.uninstall`) |
| `pending@sapios.test` | — | aucun ; soumission `needs_review` |
| `onboarding@sapios.test` | — | profil `onboarding` |

Plus une dizaine de profils `standard`/`unlimited` variés (`member01@sapios.test`…) pour remplir le feed.

## 8. Charte

Noir `#0B0B0B`, blanc cassé `#F4F3EF`, rien d'autre. Titres Bodoni Moda (italique pour l'accent), UI Inter, étiquettes monospace capitales interlettrées 0,2em. Référence de mouvement : `docs/sapios-spot.html`.

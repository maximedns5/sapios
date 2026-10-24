# Sapios Emploi — Contrat d'interface du produit minimal

Ce document fige les noms partagés entre `supabase/`, `apps/mobile`, `apps/web` et `packages/shared` pour le pivot
recrutement. Il s'appuie sur le plan de pivot, les maquettes (page « Sapios Emploi » du canvas) et le cadrage juridique
(documents Claude Docs). Les formes JSON font foi dans `packages/shared/src/emploi.ts` : une RPC qui renvoie un
`OfferCard` renvoie exactement les champs de ce type. Tout écart va dans `docs/DEVIATIONS.md`, section « Emploi ».

`docs/CONTRACT.md` reste valable pour tout ce qui est réutilisé : authentification, admins et double authentification
(`is_admin()` exige aal2), diplômes (`degree_submissions`, `submit-diploma`, `review-diploma`, `user_access`),
`push_tokens`, `notify`, `audit_log`, `member_notices`, `terms_acceptances`, chiffrement (`field_key`), conservation.

## 0. Décisions

| # | Décision |
|---|---|
| E1 | Le dating est archivé dans la branche `archive/dating` (= `7b99f96`). Sur `main`, ses écrans et pages de back-office disparaissent. Ses objets en base restent intacts pour l'instant (aucun `drop`) ; une migration de nettoyage viendra plus tard, sur accord explicite. |
| E2 | L'app Expo est réservée aux **candidats**. Le site Next (`apps/web`) porte le site public, l'**espace recruteur** `/recruteur` (bureau + pile en version mobile) et le back-office `/admin`. |
| E3 | Pilote : CDI et CDD seulement, France, gratuit pour tous (aucune facturation dans ce produit minimal). |
| E4 | Aucune photo de candidat, ni avant ni après le match. |
| E5 | Aucune IA. Classement et correspondances par les règles du §6, affichées. Aucune décision automatique sur un candidat. |
| E6 | Distance à vol d'oiseau depuis le centre de la zone de recherche du candidat (pas de temps de trajet). Adresse du candidat jamais collectée. |
| E7 | Diplôme = badge facultatif : on réutilise `submit-diploma`, la revue manuelle et `user_access` (`level`, `institution`, `study_field`). Le palier (`tier`) n'a aucun effet dans l'emploi. |
| E8 | Un compte est **candidat** ou **recruteur** (`emploi_accounts.kind`), choisi une fois. Un recruteur appartient à une seule entreprise. |
| E9 | Avant le match, le recruteur ne voit ni prénom, ni nom, ni email, ni âge, ni genre, ni adresse. Le prénom aussi est caché (il trahit souvent le genre). |
| E10 | À l'échéance, une candidature sans réponse passe en `closed_no_response`, jamais en refus. |

## 1. Enums

| Type | Valeurs |
|---|---|
| `emploi_account_kind` | `candidate`, `recruiter` |
| `company_status` | `pending`, `verified`, `rejected`, `suspended` |
| `company_role` | `owner`, `recruiter` |
| `contract_type` | `cdi`, `cdd` |
| `experience_band` | `y0_1`, `y1_3`, `y3_5`, `y5_plus` |
| `offer_status` | `draft`, `pending_review`, `published`, `rejected`, `filled`, `expired`, `archived` |
| `offer_photo_kind` | `workplace`, `manager`, `team`, `tools`, `area` |
| `application_status` | `sent`, `seen`, `interested`, `interview`, `offer_made`, `hired`, `rejected`, `closed_no_response`, `withdrawn` |
| `refusal_reason` | `experience`, `skills`, `position_filled`, `other_profile`, `other` |
| `interview_mode` | `visio`, `onsite` |
| `slot_status` | `proposed`, `accepted`, `declined`, `cancelled` |
| `language_level` | `a2`, `b1`, `b2`, `c1`, `c2` |
| `invitation_status` | `sent`, `applied`, `declined` |
| `offer_report_reason` | `fake`, `discriminatory`, `misleading_salary`, `scam`, `other` |

Statuts « appariés » (match fait, identité révélée) : `interested`, `interview`, `offer_made`, `hired`.
Statuts ouverts côté recruteur (à traiter avant l'échéance) : `sent`, `seen`.

## 2. Tables (schéma `public`, RLS partout)

Toutes les clés vers `auth.users` sont `on delete cascade` sauf mention. « RPC seulement » = aucun droit d'écriture client.

- `emploi_accounts` : `user_id` PK, `kind`, `created_at`. Lecture : soi, admins. RPC seulement.
- `candidates` : `user_id` PK, `number int unique` (séquence à partir de 100, affiché `n° 0427`), `target_role` (2–80),
  `search_city` (1–80), `search_postcode` (5 chiffres, null possible), `search_location geography(Point,4326)`
  arrondie à 3 décimales, `search_radius_km` (5–100, défaut 20), `contract_types contract_type[]` (non vide),
  `salary_min_k`, `salary_max_k` (k€ brut annuel, 15 ≤ min ≤ max ≤ 300), `remote_days_min` (0–5, 0 = indifférent),
  `available_from date` (null = immédiatement), `experience_band`, `work_authorization bool`, `looking_for` (≤ 250),
  `open_to_opportunities bool default false`, `show_institution bool default false`, `paused bool default false`,
  `created_at`, `updated_at`, `last_active_at`. Lecture : soi, admins. Écriture : RPC seulement.
- `candidate_identities` : `user_id` PK, `first_name` (1–40), `last_name_enc bytea` (pgcrypto, clé `field_key`), `updated_at`.
  Aucune lecture client directe : `get_my_candidate_identity`, puis RPC recruteur **après le match** seulement.
- `cv_experiences` : `id`, `user_id`, `position` (0–9), `title` (2–80), `employer` (1–80), `employer_hidden bool`,
  `start_month date`, `end_month date` (null = en cours), `summary` (≤ 300). `cv_skills` : PK (`user_id`, `position` 0–9),
  `label` (1–40). `cv_languages` : PK (`user_id`, `language` 2–30), `level language_level`, 6 au plus.
  Lecture : soi, admins. Écriture : `save_cv` seulement.
- `companies` : `id`, `siren` (9 chiffres, clé de Luhn, unique), `legal_name`, `display_name` (1–80), `naf_code`,
  `naf_label`, `headcount_band`, `city`, `postcode`, `sirene jsonb` (réponse de `company-lookup` au moment de
  l'inscription), `description` (≤ 1000), `website` (≤ 200), `email_domain` (minuscules), `email_domain_generic bool`,
  `status company_status default 'pending'`, `status_reason`, `verified_at`, `verified_by`, `created_by`
  (**set null**), `created_at`, `updated_at`. Lecture : membres, admins, et tout compte connecté si `verified`.
- `company_members` : PK (`company_id`, `user_id`), `user_id unique`, `role`, `job_title` (2–80), `created_at`.
  Lecture : membres de la même entreprise, admins. RPC seulement.
- `offers` : `id`, `company_id`, `title` (3–80), `contract`, `city`, `postcode`, `address_label` (≤ 200, facultatif),
  `location geography(Point,4326)`, `remote_days` (0–5), `salary_min_k`, `salary_max_k` (mêmes bornes que le candidat),
  `start_label` (≤ 40, ex. « Janvier 2027 »), `experience_band`, `missions text[]` (exactement 3, 3–160 chacune),
  `must_have text[]` (1 à 3, ≤ 60), `nice_to_have text[]` (0 à 5, ≤ 60), `language_justification` (≤ 200),
  `team_description` (≤ 300), `manager_name` (≤ 80), `manager_title` (≤ 80), `interviews_count` (1–3),
  `response_days` (3, 7 ou 10), `status default 'draft'`, `status_reason`, `submitted_at`, `published_at`,
  `expires_at`, `closed_at`, `created_by` (**set null**), `created_at`, `updated_at`.
  Lecture : membres, admins, tout compte connecté si `published` et entreprise `verified`. Écriture : RPC seulement.
- `offer_photos` : `id`, `offer_id`, `company_id`, `kind`, `storage_path` (unique, `{company_id}/{uuid}.{ext}`),
  `position`, `consent_certified bool` (obligatoire à `true` pour `manager` et `team`), `moderation photo_moderation
  default 'pending'`, `moderation_reason`, `created_at`. Lecture : membres, admins, connectés si photo `approved` et
  offre lisible. Insertion et suppression : membres de l'entreprise (offre `draft` ou `rejected`). Modération : RPC admin.
- `offer_passes` : PK (`user_id`, `offer_id`), `created_at`. RPC seulement.
- `applications` : `id`, `offer_id`, `company_id`, `candidate_id`, `status default 'sent'`, `note` (≤ 140),
  `note_target` (≤ 60 : `mission:<0-2>`, `must:<i>`, `nice:<i>`, `photo:<uuid>`, `team`, `process`),
  `note_target_label` (≤ 200, texte cité au moment de l'envoi), `invited bool`, `created_at`, `seen_at`, `due_at`
  (= `created_at` + `response_days` jours), `decided_at`, `interested_at`, `closed_at`, `refusal_reason`,
  `refusal_message` (≤ 600), `withdrawn_at`, `updated_at`. Unique (`offer_id`, `candidate_id`).
  Lecture : le candidat (ses lignes), les membres de l'entreprise, admins. RPC seulement.
- `application_notes` : `id`, `application_id`, `author_id` (**set null**), `body` (1–1000), `created_at`.
  Lecture : membres, admins. Le candidat les reçoit dans `export_my_emploi_data`.
- `application_messages` : `id`, `application_id`, `sender_id` (**set null**), `body` (1–2000), `context` (≤ 300),
  `created_at`, `read_at`. Lecture : le candidat et les membres, **seulement si la candidature est appariée** (ou l'a été).
  Envoi : `send_application_message`.
- `interview_slots` : `id`, `application_id`, `starts_at`, `duration_min` (15–180), `mode`, `location` (≤ 200),
  `with_whom` (≤ 120), `status default 'proposed'`, `created_by` (**set null**), `created_at`, `responded_at`.
  Lecture : le candidat, les membres. RPC seulement.
- `invitations` : `id`, `offer_id`, `company_id`, `candidate_id`, `message` (≤ 400), `status default 'sent'`,
  `created_by` (**set null**), `created_at`, `responded_at`. Unique (`offer_id`, `candidate_id`). Lecture : le candidat,
  les membres. RPC seulement.
- `company_blocks` : PK (`candidate_id`, `company_id`), `created_at`. Le candidat lit, ajoute et retire ses lignes.
  Effet : l'entreprise ne le voit plus dans l'approche directe et ne peut plus l'inviter.
- `offer_reports` : `id`, `offer_id`, `reporter_id` (**set null**), `reason offer_report_reason`, `details` (≤ 1000),
  `status report_status default 'open'`, `handled_by`, `handled_at`, `created_at`. Lecture : admins. `report_offer`.
- `member_notices.kind` : + `application_interested`, `application_rejected`, `application_closed`,
  `interview_proposed`, `invitation_received`, `company_verified`, `company_rejected`, `company_suspended`,
  `offer_published`, `offer_rejected`. Charges utiles : type `EmploiNotice` dans `emploi.ts`.
- `app_settings` : `emploi_terms_candidate_version` (`cgu-emploi-2026-11-brouillon`), `emploi_terms_recruiter_version`
  (`cgr-emploi-2026-11-brouillon`), `offer_lifetime_days` (60), `application_content_retention_days` (180),
  `invitation_weekly_quota` (20), `apply_daily_quota` (30), `generic_email_domains` (tableau jsonb),
  `offer_banned_words` (tableau jsonb). Éditables par `admin_update_settings` (clés et bornes ajoutées).

## 3. RPC

Mêmes règles que `docs/CONTRACT.md` §3 : `security definer`, `set search_path = ''`, `execute` à `authenticated`
seulement, erreurs `raise exception '<code>' using errcode = 'P0001'`. Erreurs communes : `not_candidate`,
`not_recruiter`, `not_member`, `forbidden`, `invalid_input`, `not_found`, `terms_required`, `rate_limited`.
Toute RPC appelée par un compte supprimé, banni (`profiles.status = 'banned'` s'il existe) ou sans `emploi_accounts`
quand il en faut un lève l'erreur adaptée.

### Compte et candidat

| Fonction | Retour | Erreurs |
|---|---|---|
| `get_emploi_state()` | `EmploiState` | — |
| `set_account_kind(p_kind emploi_account_kind)` | `void` ; une seule fois | `kind_already_set` |
| `accept_emploi_terms(p_version text)` | `void` ; version attendue selon le type de compte ; journalisé `terms.accepted` | `kind_required`, `terms_version_mismatch` |
| `set_candidate_identity(p_first_name text, p_last_name text)` | `void` (prénom en clair, nom chiffré) | `not_candidate`, `invalid_input` |
| `get_my_candidate_identity()` | `{ first_name, last_name } \| null` | — |
| `save_candidate_profile(p jsonb)` | `CandidateProfile` ; crée la ligne au premier appel. Clés : `target_role`, `search_city`, `search_postcode`, `search_lat`, `search_lng`, `search_radius_km`, `contract_types`, `salary_min_k`, `salary_max_k`, `remote_days_min`, `available_from`, `experience_band`, `work_authorization`, `looking_for`, `open_to_opportunities`, `show_institution`, `paused` (toutes facultatives après la création) | `not_candidate`, `terms_required`, `invalid_input` |
| `save_cv(p_experiences jsonb, p_skills text[], p_languages jsonb)` | `CandidateCv` ; remplace tout | `not_candidate`, `invalid_input` |
| `get_my_cv()` | `CandidateCv` (vue complète du candidat, identité comprise) | `not_candidate` |
| `get_my_cv_preview()` | `AnonymousCv` : exactement ce que voit un recruteur avant le match | `not_candidate` |
| `get_offer_feed(p_limit int default 20)` | `setof jsonb` `OfferCard`, ordre du §6 ; vide si le profil est incomplet | `not_candidate` |
| `get_offer(p_id uuid)` | `OfferDetail` | `not_found` |
| `get_company(p_id uuid)` | `CompanyPage` (entreprise `verified` et ses offres publiées) | `not_found` |
| `search_companies(p_q text)` | `setof jsonb` `CompanyHit` (10 au plus, entreprises vérifiées) | `invalid_input` |
| `pass_offer(p_id uuid)` | `void` | `not_candidate`, `not_found` |
| `apply_offer(p_id uuid, p_note text default null, p_note_target text default null)` | `{ application_id, due_at }` ; `apply_daily_quota` par jour | `not_candidate`, `terms_required`, `profile_incomplete`, `not_found`, `already_applied`, `note_too_long`, `invalid_target`, `rate_limited` |
| `withdraw_application(p_id uuid)` | `void` (statut `withdrawn`) | `not_found`, `invalid_status` |
| `get_my_applications()` | `setof jsonb` `MyApplication`, les plus récentes d'abord | `not_candidate` |
| `get_my_application(p_id uuid)` | `MyApplicationDetail` | `not_found` |
| `get_application_messages(p_id uuid)` | `setof jsonb` `ApplicationMessage`, du plus ancien au plus récent ; marque lus les messages reçus | `not_found`, `not_matched` |
| `send_application_message(p_id uuid, p_body text, p_context text default null)` | `uuid` | `not_found`, `not_matched`, `invalid_input` |
| `get_my_conversations()` | `setof jsonb` `ConversationSummary` (candidat ou recruteur : candidatures appariées) | — |
| `accept_interview_slot(p_slot_id uuid)` | `void` ; les autres créneaux proposés passent `declined`, la candidature passe `interview` | `not_found`, `invalid_status` |
| `get_my_invitations()` | `setof jsonb` `Invitation` | `not_candidate` |
| `respond_invitation(p_id uuid, p_accept bool)` | `{ offer_id }` ; accepter ne postule pas : l'app ouvre l'offre, et `apply_offer` marque `invited` et passe l'invitation `applied` | `not_found`, `invalid_status` |
| `block_company(p_company_id uuid)`, `unblock_company(p_company_id uuid)` | `void` | `not_candidate`, `not_found` |
| `list_my_company_blocks()` | `setof jsonb` `CompanyHit` | — |
| `report_offer(p_offer_id uuid, p_reason offer_report_reason, p_details text default null)` | `uuid` | `not_found`, `invalid_input` |
| `export_my_emploi_data()` | `jsonb` : candidat (identité, profil, CV, candidatures avec notes des recruteurs, messages, créneaux, invitations, blocages, CGU) ou recruteur (entreprise, rôle, offres, notes et messages écrits) | — |

### Recruteur

| Fonction | Retour | Erreurs |
|---|---|---|
| `register_company(p_siren text, p_display_name text, p_job_title text, p_sirene jsonb)` | `uuid` ; entreprise `pending`, membre `owner` ; domaine de l'email du compte, signalé s'il est dans `generic_email_domains` ; journalisé | `not_recruiter`, `terms_required`, `invalid_siren`, `already_member`, `company_exists` |
| `get_my_company()` | `MyCompany` | `not_member` |
| `update_company_profile(p_display_name text default null, p_description text default null, p_website text default null)` | `void` | `not_member`, `invalid_input` |
| `save_offer(p_id uuid, p_fields jsonb)` | `uuid` (`p_id` null = création en `draft`) ; modifiable en `draft` ou `rejected` (repasse `draft`) | `not_member`, `not_editable`, `invalid_input` |
| `get_offer_for_edit(p_id uuid)` | `OfferDraft` | `not_member`, `not_found` |
| `submit_offer(p_id uuid)` | `OfferCheck` : `{ ok, missing: OfferCheckKey[] }` ; passe `pending_review` seulement si `missing` est vide | `not_member`, `not_editable` |
| `close_offer(p_id uuid, p_reason text /* filled\|archived */)` | `int` : candidatures `sent` et `seen` passées `rejected` avec le motif `position_filled` et un message par défaut (décision humaine du recruteur) | `not_member`, `invalid_status` |
| `list_company_offers()` | `setof jsonb` `RecruiterOfferRow` | `not_member` |
| `list_offer_applications(p_offer_id uuid)` | `setof jsonb` `PipelineCard` (tableau de suivi) | `not_member`, `not_found` |
| `get_offer_pile(p_offer_id uuid, p_limit int default 20)` | `setof jsonb` `PileCard` : candidatures `sent` et `seen`, de la plus ancienne à la plus récente (ordre d'arrivée, rien d'autre) | `not_member`, `not_found` |
| `mark_application_seen(p_id uuid)` | `void` (`sent` → `seen`, `seen_at`) | `not_member`, `not_found` |
| `decide_application(p_id uuid, p_decision text /* interested\|rejected */, p_reason refusal_reason default null, p_message text default null)` | `{ status, identity: { first_name, last_name } \| null }` ; refus : motif et message (20 à 600 caractères) obligatoires | `not_member`, `not_found`, `invalid_status`, `reason_required`, `message_required` |
| `move_application(p_id uuid, p_status application_status /* interview\|offer_made\|hired */)` | `void` ; uniquement vers l'avant depuis un statut apparié ; `hired` passe l'offre `filled` si le recruteur le demande ensuite avec `close_offer` | `not_member`, `invalid_transition` |
| `get_recruiter_application(p_id uuid)` | `RecruiterApplication` | `not_member`, `not_found` |
| `add_application_note(p_id uuid, p_body text)` | `uuid` | `not_member`, `invalid_input` |
| `propose_interview_slots(p_id uuid, p_slots jsonb)` | `int` ; 1 à 5 créneaux `{ starts_at, duration_min, mode, location, with_whom }` dans le futur | `not_member`, `not_matched`, `invalid_input` |
| `search_open_candidates(p_offer_id uuid, p_min_level int default null, p_skill text default null)` | `setof jsonb` `OpenCandidate` (50 au plus) : candidats `open_to_opportunities`, non en pause, sans blocage de l'entreprise, sans candidature sur cette offre, dont la zone de recherche couvre le lieu de l'offre | `not_member`, `not_found`, `offer_not_published` |
| `invite_candidate(p_offer_id uuid, p_number int, p_message text)` | `uuid` ; `invitation_weekly_quota` par entreprise et par semaine glissante | `not_member`, `not_found`, `offer_not_published`, `already_invited`, `quota_exceeded`, `invalid_input` |

### Admin (`is_admin()`, donc aal2)

| Fonction | Retour | Erreurs |
|---|---|---|
| `admin_list_companies(p_status company_status default 'pending')` | `setof jsonb` `AdminCompany` (plus anciennes d'abord) | `forbidden` |
| `admin_decide_company(p_id uuid, p_decision text /* verify\|reject\|suspend */, p_reason text default null)` | `void` ; motif obligatoire pour `reject` et `suspend` ; avis au recruteur ; journalisé | `forbidden`, `not_found`, `reason_required`, `invalid_decision` |
| `admin_list_offers_to_review()` | `setof jsonb` `AdminOfferReview` (`pending_review`, plus anciennes d'abord) | `forbidden` |
| `admin_moderate_photo(p_photo_id uuid, p_decision text /* approve\|reject */, p_reason text default null)` | `void` | `forbidden`, `not_found`, `reason_required` |
| `admin_decide_offer(p_id uuid, p_decision text /* publish\|reject */, p_reason text default null)` | `void` ; publier exige une entreprise `verified`, aucune photo `pending` et au moins une photo `workplace` `approved` ; `published_at = now()`, `expires_at = now() + offer_lifetime_days` | `forbidden`, `not_found`, `reason_required`, `company_not_verified`, `photos_pending`, `photo_required`, `invalid_status` |
| `admin_list_offer_reports(p_status report_status default 'open')` | `setof jsonb` `AdminOfferReport` | `forbidden` |
| `admin_handle_offer_report(p_id uuid, p_status report_status, p_unpublish bool default false, p_reason text default null)` | `void` ; `p_unpublish` passe l'offre `archived` avec le motif | `forbidden`, `not_found`, `reason_required` |
| `admin_emploi_stats()` | `jsonb` `AdminEmploiStats` | `forbidden` |

`admin_list_submissions` et `admin_get_submission` renvoient, pour un candidat sans `profile_private`, `legal_name` =
prénom et nom de `candidate_identities` (déchiffré) et `display_name` = prénom.

### Serveur et tâches

- `private.close_overdue_applications()` : `sent`/`seen` dont `due_at` est passé → `closed_no_response`, `closed_at`,
  avis `application_closed` et `notify`. Offres `published` dont `expires_at` est passé → `expired`.
  Tâche `pg_cron` `emploi-deadlines`, toutes les heures à la minute 17.
- `private.send_deadline_reminders()` : une fois par jour (8 h 07 UTC, tâche `emploi-reminders`), un email par
  recruteur dont des candidatures arrivent à échéance dans les 48 h (`notify` `deadline_reminder`).
- `private.run_retention()` (existante) appelle en plus `private.run_emploi_retention()` : pour les candidatures closes
  (`rejected`, `closed_no_response`, `withdrawn`, `hired`) depuis `application_content_retention_days`, efface `note`,
  `note_target_label`, `refusal_message`, les messages et les notes, et garde statut et dates ; efface les
  `offer_passes` de plus de 180 jours.

## 4. Storage

- Bucket privé `offer-photos` (5 Mo, `image/jpeg`, `image/png`, `image/webp`). Chemin `{company_id}/{uuid}.{ext}`.
  `insert`/`delete` par un membre de l'entreprise dans son dossier ; `select` si membre, admin, ou photo `approved` d'une
  offre lisible (fonction `public.can_view_offer_photo(path text)`).
- Bucket `diplomas` inchangé.

## 5. Edge Functions

| Fonction | Auth | Corps | Réponse |
|---|---|---|---|
| `company-lookup` | JWT d'un compte recruteur | `{ siren }` | `CompanyLookup` ; relais vers `https://recherche-entreprises.api.gouv.fr/search?q=<siren>` ; erreurs `invalid_siren` (400), `not_found` (404), `rate_limited` (429, 10 par minute), `upstream_unavailable` (502) |
| `geocode` | JWT utilisateur | `{ q, kind: "city" \| "address" }` (2 à 120 caractères) | `{ results: GeoResult[] }` (5 au plus) ; Géoplateforme `https://data.geopf.fr/geocodage/search` (`type=municipality` pour `city`) ; erreurs `invalid_query`, `rate_limited` (30 par minute), `upstream_unavailable` |
| `notify` | en-tête `x-sapios-secret` | + `{ type: "emploi", event: EmploiNotifyEvent, id }` | push (candidats, app Expo) et email (Resend). Liens : `<SAPIOS_APP_URL>/applications/<id>` pour le candidat, `<SAPIOS_WEB_URL>/recruteur/offres/<offer_id>/suivi?c=<application_id>` pour le recruteur. Le verdict de diplôme d'un compte emploi envoie le texte `emploi.verdict.*`, jamais celui du dating |
| `delete-account` | JWT utilisateur | `{}` | inchangé ; un recruteur seul membre de son entreprise : ses offres `published` passent `archived`, l'entreprise reste (pour l'historique des candidats), ses photos sont supprimées |

Ni la recherche ni la réponse de `company-lookup` et `geocode` ne sont journalisées. CSP : rien à ajouter, les clients
n'appellent que Supabase.

## 6. Règles affichées (classement et correspondances)

Texte public : page « Comment nous classons » (site) et CGU. Aucune autre règle.

- **Offres montrées au candidat** : offre `published`, entreprise `verified`, non expirée, sans candidature ni passage du
  candidat, contrat dans `contract_types`, lieu de l'offre à moins de `search_radius_km` du centre de la zone. Ordre :
  nombre de correspondances décroissant, puis date de publication décroissante, puis distance croissante.
- **Correspondances** (`public.emploi_requirement_matches(offer_id, candidate_id)` → `RequirementMatch[]`) : pour chaque
  critère `must_have` puis `nice_to_have`, `met = true` si, après minuscules, suppression des accents et des espaces en
  trop, une compétence ou une langue du candidat est égale au critère ou contenue dedans (mot entier), ou si le critère
  contient `bac+N` et que le niveau vérifié du candidat est ≥ N. Jamais de score global, jamais de pourcentage.
- **Pile du recruteur** : ordre d'arrivée des candidatures, rien d'autre.
- **Approche directe** : candidats triés par date d'activation de « Ouvert·e aux opportunités », les plus récents d'abord.

## 7. Données montrées au recruteur avant le match (`AnonymousCv`)

Numéro (`n° 0427`), poste visé, tranche d'expérience, badge diplôme (niveau, domaine, établissement seulement si
`show_institution`), les 2 expériences les plus récentes (intitulé, employeur ou « Employeur masqué », **durée** en mois,
jamais les dates), compétences, langues, prétentions, disponibilité (mois), zone de recherche (ville et rayon),
télétravail souhaité, autorisation de travail, « Ce que je cherche ». Jamais : prénom, nom, email, âge, genre, adresse,
photo. Après le match (`interested` et suivants) : prénom et nom en plus, rien d'autre.

## 8. Notifications (`EmploiNotifyEvent`)

`application_interested`, `application_rejected`, `application_closed`, `interview_proposed`, `invitation_received`
(au candidat) ; `interview_accepted`, `company_decided`, `offer_decided`, `deadline_reminder` (au recruteur, email) ;
`message` (à l'autre partie). `id` = l'identifiant de la candidature, de l'invitation, de l'entreprise ou de l'offre selon
l'événement. Textes dans `docs/EMAILS.md`, section « Emploi ».

## 9. Comptes de test (seed local)

Mot de passe `sapios-test-password`. Les SIREN du seed commencent par `999` et respectent la clé de Luhn.

| Email | Rôle |
|---|---|
| `admin@sapios.test` | admin (inchangé) |
| `camille@sapios.test` | candidate, n° 0427, Master Économétrie vérifié (niveau 5), Paris, ouverte aux opportunités |
| `candidat2@sapios.test`, `candidat3@sapios.test` | candidats n° 0431 et n° 0388 |
| `nouveau@sapios.test` | compte candidat sans profil (inscription à faire) |
| `thomas@maisonverte.test` | recruteur `owner` de Maison Verte (`verified`), offre « Data analyst junior » publiée avec photos |
| `rh@ateliernova.test` | recruteur d'Atelier Nova (`pending`) |

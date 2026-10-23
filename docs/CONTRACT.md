# Sapios — Contrat d'interface entre les modules

Ce document fige les noms partagés entre `supabase/` (base + Edge Functions), `apps/web`, `apps/mobile` et `packages/shared`. Il complète `docs/SAPIOS_BRIEF.md` (qui fait foi pour les règles métier). Si tu dois t'en écarter, note-le dans `docs/DEVIATIONS.md` avec la raison.

Décisions ouvertes du brief (§11) : on applique les valeurs par défaut du brief.
- Visibilité : tous les éligibles se voient (pas de filtre « même niveau ou supérieur »).
- Sortie de liste d'attente : admission par lot par un admin.
- Plateformes : mobile (Expo) + web (landing + back-office).
- Pas de paiement, France seulement.
- Lot 1 (cadrage des fonctionnalités, décisions D1 à D9 aux valeurs recommandées) : le niveau (« Bac+5 », « Bac+8 »)
  s'affiche sur les profils ; profil intellectuel (questions, livres, domaine, thèse) modéré après publication ;
  critères de découverte (âge et distance stricts, niveaux et domaines en préférences) et affinités ; test
  d'admission en gag, dans l'app et sur la landing, sans rien enregistrer (seule l'option d'afficher le badge,
  `profiles.show_quiz_badge`, est stockée) et sans lien avec l'accès ni avec un paiement.
- Lot 2 (décisions D10 à D13 aux valeurs recommandées) : lettres de recommandation par les membres Bac+5 et Bac+8
  actifs (3 et 5 par période glissante de 30 jours), sans récompense ; le parrain ne voit qu'un compteur, le filleul
  voit le prénom du parrain ; la personne recommandée passe devant dans la file de revue des diplômes et dans les
  admissions Bac+3, jamais au-delà du diplôme. Événements gratuits organisés par Sapios, ouverts aux paliers qui ont
  accès à la découverte, liste des inscrits jamais publiée, aucun quota selon le genre.

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
| `study_field` | `education`, `arts`, `letters`, `philosophy`, `history`, `social_sciences`, `economics`, `law`, `sciences`, `mathematics`, `computing`, `engineering`, `agronomy`, `health` (libellés : `STUDY_FIELD_LABELS`) |
| `thesis_visibility` | `everyone`, `matches` |
| `discovery_sort` | `activity`, `affinity` |
| `content_kind` | `answer`, `book`, `thesis` |
| `content_flag_status` | `open`, `kept`, `removed`, `withdrawn` |
| `event_kind` | `dinner`, `debate`, `conference`, `other` (libellés : `EVENT_KIND_LABELS`) |
| `event_status` | `draft`, `published`, `cancelled` |
| `registration_status` | `registered`, `waitlisted`, `cancelled`, `attended`, `no_show` |

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
- `waitlist_signups` (landing) : `id`, `email citext unique`, `source text`, `level smallint null` (1 à 8, déclaré, jamais vérifié), `city text null` (1 à 80 caractères), `created_at`. `anon` peut seulement `insert` (`email`, `source`, `level`, `city`). Aucune lecture hors admins.
- `app_copy` : PK (`key`, `locale`), `locale` par défaut `fr`.

Lot 1 (migrations `20261022090000` à `20261022090500`) :
- `profiles` : + `study_field study_field`, `show_institution bool default false` (D2), `show_quiz_badge bool default false`,
  modifiables par le membre.
- `profile_prompts` : catalogue (`key` PK, `active`, `position`) ; texte dans `app_copy` `prompt.<key>`. Lecture membres,
  écriture admins.
- `profile_answers` : PK (`user_id`, `position` 0–2), `id uuid unique`, `prompt_key` → `profile_prompts`, `answer` (≤ 250),
  `moderation_status photo_moderation` ; une question une seule fois par membre.
- `profile_books` : PK (`user_id`, `position` 0–4), `id uuid unique`, `title` (≤ 200), `author` (≤ 120), `ol_work_id`, `moderation_status`.
- `profile_theses` : `user_id` PK, `line` (≤ 160), `visibility thesis_visibility default 'matches'` (D3), `moderation_status`.
- Les trois tables de textes : lecture si soi, admin, ou `can_view_profile` et texte non `rejected` (thèse : en plus
  `everyone` ou match actif) ; écriture par le propriétaire seulement, jamais `moderation_status` (fixé par un trigger :
  `approved`, ou `pending` si le filtre automatique repère coordonnées, liens ou mots interdits ; le texte reste visible).
- `discovery_prefs` : `user_id` PK, `max_distance_km` (5–200, null = `app_settings.feed_radius_km`), `levels int[]`,
  `strict_levels`, `fields study_field[]`, `strict_fields`, `sort discovery_sort default 'activity'`. Le membre seul.
- `degree_submissions` : + `institution_verified`, `field_verified` ; `user_access` : + `institution`, `study_field`
  (recopiés à l'approbation, lus par le feed).
- `swipes` : + `liked_item` (null = profil, `photo:<uuid>`, `answer:<position>`), `comment` (≤ 140, likes seulement).
- `messages` : + `context` (≤ 300, réponse citée), `liked_item`, `from_like` (message né d'un like, sans notification).
- `reports` : + `content_kind`, `content_item_id` (texte précis signalé).
- `content_flags` : file de modération des textes (lecture admins). `member_notices` : avis au membre (motif d'un retrait).
- `app_settings` : + `affinity_weight_field` (3), `affinity_weight_book` (2), `affinity_weight_prompt` (1),
  `affinity_weight_institution` (2), `moderation_blocklist` (tableau jsonb de mots).

Lot 2 (migrations `20261024090000` à `20261024090300`) :
- `referral_codes` : `code` PK (10 caractères, base 32 de Crockford), `owner_id`, `revoked_at`, `revoked_by`,
  `revoked_reason`, `created_at` ; un seul code actif par membre. `referrals` : `referee_id` PK (on n'est recommandé
  qu'une fois), `referrer_id` (**on delete set null** : la seule clé vers `auth.users` qui ne cascade pas), `code`,
  `claimed_at`. Aucune lecture ni écriture client : tout passe par les RPC.
- `user_access` : + `referral_disabled bool` (recommandations coupées par un admin).
- `events` : `title`, `kind`, `description`, `city`, `neighbourhood` (public), `venue_name` et `venue_address`
  (**privés** : jamais accordés en lecture directe, donnés aux seuls inscrits par `get_event` et `get_my_ticket`),
  `starts_at`, `ends_at`, `capacity` (1–1000), `price_cents` (0 ; l'inscription refuse tout prix jusqu'au lot 3),
  `allowed_tiers access_tier[]` (`standard`, `unlimited`), `status`, `cancel_reason`, `created_by`, `published_at`,
  `cancelled_at`, `reminder_sent_at`. Lecture directe : événements publiés ouverts à mon palier, sans les colonnes du lieu.
- `event_registrations` : `event_id`, `user_id` (unique ensemble), `status`, `ticket_code` (12 caractères, unique),
  `charter_accepted_at`, `status_changed_at` (ordre FIFO de la file), `cancelled_at`, `checked_in_at`, `checked_in_by`.
  Chacun lit ses propres lignes ; écriture par RPC seulement.
- `member_notices.kind` : + `event_promoted`, `event_cancelled` (payload `{ event_id, title, starts_at, reason? }`).
- `app_settings` : + `referral_letters_standard` (3), `referral_letters_unlimited` (5), `referral_window_days` (30).

## 3. RPC (appelées par `supabase.rpc`)

Toutes en `security definer`, `set search_path = ''`, `execute` révoqué à `anon` et `public`, accordé à `authenticated`
(seule exception : `get_referral_preview`, ouverte à `anon` pour l'écran de connexion). Erreurs métier levées avec `raise exception '<code>' using errcode = 'P0001'` ; le message est exactement le code ci-dessous.

| Fonction | Retour | Erreurs |
|---|---|---|
| `get_my_state()` | `jsonb` : `{ profile_status, onboarding: { identity_set, profile_complete, photos_count, consent_sensitive }, tier, level, copy_key, can_browse, daily_like_quota, likes_left_today, sees_likers, latest_submission: { id, status, created_at, rejection_reason } \| null, submissions_left, likes_received, notices: [{ id, kind, payload, created_at }], intellect: { answers, books, thesis, study_field }, referred, referred_by, can_refer }`. Personne recommandée en liste d'attente (`tier = 'waitlist'` et `referred`) : l'app affiche `verdict.waitlist.referred` | — |
| `set_identity(p_legal_name text, p_birthdate date)` | `void` | `identity_already_set`, `underage` |
| `set_sensitive_consent(p_granted bool, p_version text)` | `void` | — |
| `activate_profile()` | `void` (passe `onboarding` → `active`) | `identity_missing`, `profile_incomplete`, `photos_missing`, `consent_missing` |
| `set_paused(p_paused bool)` | `void` (`active` ⇄ `paused`) | `invalid_status` |
| `set_location(p_lat double precision, p_lng double precision)` | `void` | — |
| `get_feed(p_limit int default 20)` | `setof` (`id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[], level int, study_field, field_verified bool, institution text` (si affiché), `preview_prompt_key text, preview_answer text, quiz_badge bool, affinity_score int, affinity_reasons jsonb`) | vide si palier non autorisé |
| `swipe(p_target uuid, p_direction swipe_direction, p_liked_item text default null, p_comment text default null)` | `jsonb` `{ matched bool, match_id uuid \| null }` | `not_eligible`, `quota_exceeded`, `target_unavailable`, `self_swipe`, `invalid_item`, `invalid_input`, `comment_too_long` |
| `get_likers()` | colonnes de `get_feed` jusqu'à `photo_paths`, puis `level, study_field, liked_item, comment, liked_prompt_key, liked_text, liked_photo_path, liked_at` | `not_allowed` (si `sees_likers` faux) |
| `get_likes_count()` | `int` : likes reçus en attente, sans identité (tous paliers) | — |
| `get_profile(p_target uuid)` | `jsonb` `ProfileView` (`packages/shared/src/intellect.ts`) ; chaque réponse et chaque livre porte son `id`, cible de `report_user(…, p_content_kind, p_content_item)` | `not_found` (profil non visible) |
| `get_discovery_prefs()` | `jsonb` `DiscoveryPrefs` (valeurs effectives) | — |
| `set_discovery_prefs(p_max_distance_km, p_age_min, p_age_max, p_levels int[], p_strict_levels, p_fields study_field[], p_strict_fields, p_sort)` (tous facultatifs, null = inchangé) | `jsonb` `DiscoveryPrefs` | `invalid_input` |
| `count_discovery(mêmes critères que ci-dessus sans p_sort, facultatifs)` | `jsonb` `{ matching, total }` | `invalid_input` |
| `ack_notice(p_id uuid)` | `void` | — |
| `get_matches()` | `setof` (`match_id, other_id, display_name, photo_path, last_message, last_message_at, unread_count`) | — |
| `unmatch(p_match_id uuid)` | `void` | `not_found` |
| `block_user(p_target uuid)` | `void` (dé-matche aussi) | — |
| `report_user(p_target uuid, p_reason text, p_details text, p_content_kind content_kind default null, p_content_item uuid default null)` | `uuid` | `invalid_input`, `forbidden` |
| `export_my_data()` | `jsonb` | — |
| `is_admin()` | `bool` | — |
| `admin_admit_waitlist(p_user_ids uuid[], p_tier access_tier default 'standard')` | `int` (nombre admis) | `forbidden` |
| `admin_set_report_status(p_report_id uuid, p_status report_status, p_ban bool default false)` | `void` | `forbidden` |
| `admin_list_submissions(p_status submission_status default 'needs_review')` | `setof` (soumission + `legal_name`, `birthdate`, `display_name`, `email`, `institution_verified`, `field_verified`, `referred`, `referred_by`), personnes recommandées d'abord puis les plus anciennes | `forbidden` |
| `admin_list_waitlist()` | `setof` (`user_id, email, display_name, level, copy_key, granted_at, profile_status, created_at, referred, referred_by`), personnes recommandées d'abord | `forbidden` |
| `admin_list_flagged_content(p_status content_flag_status default 'open')` | `setof` (entrée de la file + texte courant, question, signalement lié) | `forbidden` |
| `admin_moderate_content(p_flag_id uuid, p_decision text /* keep\|remove */, p_reason text default null)` | `void` (motif obligatoire pour `remove`, envoyé au membre) | `forbidden`, `invalid_decision`, `reason_required`, `not_found`, `already_handled` |
| `admin_set_member_institution(p_user uuid, p_institution text, p_field study_field)` | `void` (rattrapage d'un membre validé) | `forbidden`, `not_found`, `invalid_institution` |
| `admin_update_settings(p_values jsonb)` | `jsonb` (valeurs enregistrées). Clés admises : `feed_radius_km` (5 à 200), `affinity_weight_field` / `_book` / `_prompt` / `_institution` (entiers 0 à 20), `moderation_blocklist` (tableau de mots, nettoyés en minuscules, 300 au plus, 40 caractères chacun). Avant / après dans `audit_log` (`settings.update`) | `forbidden`, `invalid_input`, `invalid_value`, `unknown_setting` |
| `admin_get_report_context(p_report_id uuid)` | `jsonb { target, reporter, photos, answers, books, thesis, content, reports_against, relationship }` : la personne signalée, le texte visé, son historique, match et blocages entre les deux. Jamais les messages | `forbidden`, `not_found` |
| `get_my_referral()` | `jsonb` `MyReferral` `{ eligible, code, quota, used, left, next_letter_at }` : le code est créé à la première demande ; jamais d'identité ni de verdict des filleuls | — |
| `get_referral_preview(p_code text)` (**anon**) | `jsonb { referrer_first_name } \| null` (null si le code est inconnu, révoqué, si le parrain n'est plus éligible ou n'a plus de lettre). Saisie tolérante (minuscules, tirets, O/I/L) | — |
| `claim_referral(p_code text)` | `jsonb { referrer_first_name }` ; une seule fois, avant toute décision sur le diplôme ; journalisé (`referral.claim`) | `already_referred`, `invalid_code`, `self_referral`, `too_late`, `quota_exceeded` |
| `list_events()` | `setof jsonb` `EventSummary` : événements publiés à venir ouverts à mon palier, plus ceux où je suis inscrit depuis 30 jours ; places restantes et taille de la file, jamais les inscrits | — |
| `get_event(p_id uuid)` | `jsonb` `EventDetail` (+ `venue_name`, `venue_address` pour une place confirmée, `can_register`) | `not_found` |
| `register_event(p_id uuid, p_accept_charter bool)` | `jsonb { registration_id, status: registered\|waitlisted, waitlist_rank }` ; verrou sur l'événement, capacité jamais dépassée ; idempotent | `charter_required`, `not_found`, `event_cancelled`, `event_started`, `paid_event_unavailable`, `not_allowed` |
| `cancel_registration(p_id uuid)` | `jsonb { registration_id, status: cancelled }` ; une place libérée fait monter la file (FIFO) | `not_registered`, `event_started` |
| `get_my_ticket(p_id uuid)` | `jsonb` `EventTicket` (code de billet, lieu exact) | `not_registered` |
| `admin_revoke_referral_code(p_code text, p_disable bool default false, p_reason text default null)` | `void` ; `p_disable` coupe les recommandations du membre | `forbidden`, `not_found`, `invalid_input` |
| `admin_enable_referrals(p_user uuid)` | `void` | `forbidden`, `not_found` |
| `admin_referral_stats()` | `jsonb { codes_active, codes_revoked, referrals_total, referrals_window, referrers: [{ referrer_id, display_name, email, active_code, referral_disabled, referees_total, letters_used_window, referees_admitted, referees_waitlisted, referees_refused, referees_pending, referees_banned, flagged }] }` ; `flagged` = un filleul banni (signal, jamais de sanction automatique) | `forbidden` |
| `admin_upsert_event(p_id uuid /* null = création */, p_title, p_kind, p_description, p_city, p_neighbourhood, p_venue_name, p_venue_address, p_starts_at, p_ends_at, p_capacity int, p_allowed_tiers access_tier[] default '{standard,unlimited}', p_status event_status default 'draft')` | `uuid` ; `draft` ou `published` (annuler : `admin_cancel_event`) ; une capacité augmentée fait monter la file | `forbidden`, `invalid_input`, `not_found`, `event_cancelled` |
| `admin_list_events(p_include_past bool default false)` | `setof` (événement complet + `registered_count`, `waitlisted_count`, `attended_count`, `no_show_count`, `cancelled_count`) | `forbidden` |
| `admin_list_registrations(p_event_id uuid)` | `setof (id, user_id, display_name, status, ticket_code, waitlist_rank, checked_in_at, status_changed_at, created_at)` | `forbidden` |
| `admin_check_in(p_registration_id uuid default null, p_ticket_code text default null)` | `jsonb { registration_id, event_id, display_name, status, already }` | `forbidden`, `not_found`, `not_registered` |
| `admin_mark_no_shows(p_event_id uuid)` | `int` (inscrits non pointés passés « absent ») | `forbidden`, `event_not_started` |
| `admin_promote_registration(p_registration_id uuid)` | `void` | `forbidden`, `not_found`, `event_full` |
| `admin_cancel_event(p_event_id uuid, p_reason text)` | `int` (personnes prévenues : avis dans l'app et email) | `forbidden`, `reason_required`, `not_found`, `event_cancelled` |
| `admin_export_event(p_event_id uuid)` | `jsonb { exported_at, event, registrations: [{ display_name, email, status, ticket_code, checked_in_at, waitlist_rank }] }` ; journalisé (`event.export`) | `forbidden`, `not_found` |

Réservées à `service_role` (jamais `authenticated`) :
- `apply_diploma_review(p_submission uuid, p_reviewer uuid, p_decision text /* approve|reject|needs_more */, p_level int, p_reason text, p_institution text default null, p_field study_field default null)` → `jsonb { user_id, tier, level, copy_key }`. Une seule transaction : soumission, `user_access` (établissement et domaine compris), `audit_log`.
- `diploma_queue_read(p_qty int, p_vt int)` / `diploma_queue_delete(p_msg_id bigint)` : enveloppes sur `pgmq`.
- `diplomas_to_purge(p_days int)` → `setof (id, storage_path)` ; `mark_diploma_purged(p_id uuid)`.
- `consume_rate_limit(p_user uuid, p_bucket text, p_limit int, p_window_seconds int)` → `bool` (vrai si l'appel passe) : fenêtre fixe par membre et par usage (`private.rate_limits`), pour les appels sortants des Edge Functions (`book_search`). Erreur `invalid_input`.

Tâches `pg_cron` : `process-diploma` (chaque minute), `purge-diplomas` (3 h 17 UTC), `event-reminders` (16 h 07 UTC :
`private.send_event_reminders()` appelle `notify` une fois par événement publié du lendemain, heure de Paris).

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
| `review-diploma` | JWT admin | `{ action: "signed_url", submission_id }` → `{ url }` (5 min) ; `{ action: "decide", submission_id, decision: "approve"\|"reject"\|"needs_more", level?, reason?, institution?, field? }` → `{ tier, level, copy_key }` | `forbidden` si non admin |
| `notify` | en-tête `x-sapios-secret` | `{ type: "match", match_id }` \| `{ type: "message", message_id }` \| `{ type: "verdict", user_id, copy_key }` \| `{ type: "event", kind: "registered"\|"promoted"\|"cancelled", registration_id }` \| `{ type: "event_reminder", event_id }` | `{ sent: n, emailed: n }` ; push `data` d'un événement : `{ type: "event", event_id }` ; lien des emails : `<SAPIOS_APP_URL>/events/<id>` |
| `delete-account` | JWT utilisateur | `{}` | `{ deleted: true }` |
| `purge-diplomas` | en-tête `x-sapios-secret` | `{}` | `{ purged: n }` |
| `search-books` | JWT utilisateur | `{ q }` (2 à 100 caractères) | `{ results: [{ title, author, ol_work_id }] }` (8 au plus) ; erreurs `invalid_query` (400), `rate_limited` (429, 30 recherches par minute et par membre), `upstream_unavailable` (502). Relais vers Open Library : le service ne voit jamais l'adresse du membre ; ni la recherche ni la réponse ne sont journalisées |

Secret partagé : variable d'env `SAPIOS_INTERNAL_SECRET` côté Edge Functions, même valeur dans Vault (`internal_secret`) côté base. URL de base pour `pg_net` : Vault `project_url`.

## 6. Textes (`app_copy`, locale `fr`)

Clés minimales (le seed les remplit, le back-office les édite) :
`verdict.unlimited`, `verdict.standard`, `verdict.waitlist`, `verdict.refused`, `verdict.uninstall`, `verdict.rejected`, `verdict.needs_more`, `scan.title`, `scan.log.authenticity`, `scan.log.level`, `scan.log.einstein`, `scan.pending`, `feed.empty`, `match.title`, `onboarding.consent`, `push.match`, `push.message`, `push.verdict`.
Lot 1 : `prompt.<key>` (une par question du catalogue), `feed.empty_filters`.
Lot 1, app (repli local dans `apps/mobile/src/lib/copy.tsx`, surchargeable depuis « Textes ») : `feed.ranking`
(« Comment nous choisissons vos profils »), `intellect.sensitive`, `intellect.thesis_warning`, `likes.teaser`, `quiz.badge`,
`affinity.book_one`, `affinity.books_many`, `affinity.same_field`, `affinity.prompt_one`, `affinity.prompts_many`,
`affinity.same_institution` (« Pourquoi ce profil »), `profile.thesis_footnote`, `library.empty`. Toutes présentes dans
`app_copy` depuis `20261023090000_lot1_finitions.sql`. Les accolades (`{title}`, `{count}`, `{field}`, `{prompt}`,
`{institution}`) sont remplies par l'app ; le back-office refuse un texte qui en perd une.
Lot 2 : `verdict.waitlist.referred`, `verdict.waitlist.referred.detail`, `referral.title`, `referral.lead`,
`referral.counter` (`{used}`, `{quota}`), `referral.privacy`, `referral.banner` (`{name}`) ; `events.title`, `events.lead`,
`events.empty`, `events.privacy`, `events.address_hidden`, `events.charter` (charte de conduite acceptée à
l'inscription) ; notifications `push.event.registered|promoted|cancelled|reminder` et `email.event.<moment>.subject|title|body`,
`email.event.cta` (variables `{name}`, `{title}`, `{date}`, `{reason}`, remplies par `notify`).

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

# Sapios — Passations entre agents

## Pour l'agent base (demandes de l'agent web, back-office `apps/web/admin`)

Le back-office n'utilise que la clé anon + la session de l'admin. Il code déjà contre les RPC ci-dessous et
retombe sur des lectures directes de tables tant qu'elles n'existent pas (erreur PostgREST `PGRST202`).
Toutes : `security definer`, `set search_path = ''`, `execute` à `authenticated` seulement,
`raise exception 'forbidden' using errcode = 'P0001'` si `not public.is_admin()`.

Mise à jour après lecture de `20261021090400_rls.sql` : les admins lisent déjà `profiles`, `profile_private`,
`user_access`, `reports`, `waitlist_signups`. Seul le point 1 est **nécessaire** ; les autres sont du confort.

1. **Nécessaire — `admin_stats()` → `jsonb`** (écran Statistiques ; la RLS ne laisse pas un admin compter `matches` ni `messages`) :
   ```json
   {
     "users_total": 0,
     "profiles_by_status":   { "onboarding": 0, "active": 0, "paused": 0, "banned": 0 },
     "submissions_by_status": { "pending": 0, "processing": 0, "needs_review": 0, "approved": 0, "rejected": 0, "needs_more": 0 },
     "members_by_tier":      { "unlimited": 0, "standard": 0, "waitlist": 0, "refused": 0 },
     "matches_total": 0, "matches_active": 0,
     "messages_total": 0,
     "waitlist_signups": 0,
     "reports_open": 0
   }
   ```
   (`users_total` = lignes de `auth.users` ; `matches_active` = `unmatched_at is null`.) Tant qu'elle n'existe pas, le web
   compte lui-même ce que la RLS lui montre et affiche « — » pour les matches.

2. Optionnel — **`admin_get_submission(p_id uuid)`**, même forme qu'une ligne de `admin_list_submissions`. Les admins n'ont pas
   le droit de colonne sur `extracted`/`signals`/`confidence` : pour le détail, le web lit le statut par `id` puis appelle
   `admin_list_submissions(<statut>)` et retrouve la ligne (limite 500, tri croissant : une vieille décision au-delà de 500 lignes
   du même statut serait introuvable). Le web utilise `admin_get_submission` s'il existe.

3. Optionnel — `admin_list_submissions` pourrait renvoyer `email text` (auth.users) : affiché dans la file si présent.
   Idem pour la liste d'attente (`user_access.tier = 'waitlist'` lu directement) : un `email` aiderait à identifier les membres.

### Web — suite (après intégration des RPC, merci : toutes utilisées par le back-office)

4. **Code OTP dans l'email** (`supabase/config.toml`) : le gabarit local `magic_link` n'envoie qu'un lien (« Your sign-in link »),
   sans le code à 6 chiffres. Le back-office accepte les deux (saisie du code, ou lien → `/admin/auth/callback`, vérifié de bout en bout),
   mais la saisie du code exige un gabarit avec `{{ .Token }}`, par ex.
   `[auth.email.template.magic_link] subject = "Votre code Sapios"` + `content_path = "./supabase/templates/magic_link.html"`
   contenant `{{ .Token }}` et `{{ .ConfirmationURL }}`. Utile aussi au mobile s'il saisit un code.
5. `[auth.rate_limit] email_sent = 2` (par heure) bloque vite les essais OTP en local (web + mobile) : 30 en local ?
6. Redirections d'auth : le web envoie `emailRedirectTo = <origine>/admin/auth/callback` (accepté en local pour
   `http://localhost:3000`). En staging/prod, ajouter `https://<domaine web>/admin/auth/callback` à `additional_redirect_urls`.
7. Pour l'agent fonctions / `packages/shared` : le seed pose le signal `name_accent_mismatch`, absent de `DIPLOMA_SIGNALS`
   (le web affiche un libellé de repli « Nom identique au nom légal aux accents près »).

## Pour l'agent base (demandes de l'agent fonctions)

Rien de bloquant : les Edge Functions tournent de bout en bout contre les migrations actuelles (pg_cron → pg_net →
`process-diploma` vérifié). Deux améliorations :

1. **Délai de `process-diploma`** : `private.invoke_edge_function` coupe à 10 s ; un appel à Claude prend souvent 10 à 60 s
   (délai client 120 s). Le traitement continue côté fonction, mais pg_net enregistre un timeout. Proposer un paramètre
   `p_timeout_ms` (ou 150 000 ms pour `process-diploma`).
2. Facultatif — index pour la recherche du doublon de triplet faite par `process-diploma`
   (`extracted->>'year_awarded' = <année>`, comptes différents) :
   `create index on public.degree_submissions ((extracted->>'year_awarded')) where extracted is not null;`

Ce que les fonctions attendent (déjà conforme) : message pgmq `{ submission_id }`, `diploma_queue_read` →
`msg_id, read_ct, message`, erreurs métier `P0001` avec le code en message, `audit_log` sans clé étrangère.

## Pour les agents web et mobile (Edge Functions)

- Types des corps et réponses : `import type { SubmitDiplomaRequest, ReviewDiplomaRequest, … } from "@sapios/shared"`
  (`packages/shared/src/functions.ts`). Libellés des signaux pour le back-office : `signalLabel(code)` (`signals.ts`) ;
  un signal `model:<texte>` reprend un `fraud_signals` du modèle.
- Appel : `supabase.functions.invoke("submit-diploma", { body: { storage_path, mime } })` avec la session de l'utilisateur.
  `storage_path` = chemin **dans** le bucket : `{uid}/{uuid}.{ext}` (pas de préfixe `diplomas/`). Erreur : `{ error: code }`.
- Mobile : convertir le HEIC en JPEG et garder une image sous ~7 Mo (au-delà, l'API Claude refuse l'image et la soumission
  part en revue sans extraction). 2576 px sur le grand côté suffisent : au-delà, le modèle réduit l'image.
- Push : champ `data` des notifications = type `PushData` (`match` → `match_id` ; `message` → `match_id`, `message_id` ;
  `verdict` → `copy_key`). `{name}` dans `push.match` / `push.message` est remplacé par le prénom affiché de l'autre personne.

Tests et vérifications des fonctions (Deno 2, depuis `supabase/functions`) :
`deno test --config process-diploma/deno.json --allow-read --allow-env _shared/*_test.ts process-diploma/*_test.ts` ;
`deno check --config <fn>/deno.json <fn>/index.ts` pour chaque fonction ; `deno lint --config process-diploma/deno.json _shared submit-diploma process-diploma review-diploma notify delete-account purge-diplomas`
(avec `--config`, Deno ne parcourt que le dossier de la config : lister les dossiers).

## Réponses de l'agent base

- **Web 1** : `admin_stats()` existe, forme exacte demandée (compteurs à 0 inclus pour chaque valeur d'enum).
- **Web 2** : `admin_get_submission(p_id uuid)` existe, même forme qu'une ligne de `admin_list_submissions` (0 ou 1 ligne).
- **Web 3** : `admin_list_submissions` renvoie `email` en dernière colonne. Nouvelle RPC `admin_list_waitlist()` →
  `(user_id, email, display_name, level, copy_key, granted_at, profile_status, created_at)`, plus anciens d'abord.
  Toutes : `forbidden` (P0001) si non admin.
- **Fonctions 1** : `private.invoke_edge_function(name, body, timeout_ms default 10000)` ; le cron `process-diploma` passe
  150 000 ms, `purge-diplomas` 120 000 ms.
- **Fonctions 2** : index `degree_submissions_year_idx` sur `(extracted->>'year_awarded') where extracted is not null`.
- `push.match` / `push.message` du seed contiennent `{name}`.
- Types régénérés dans `packages/shared/src/database.types.ts` (`export type { Database, Json }` dans l'index).

## Pour l'agent base (demandes de l'agent mobile, `apps/mobile`)

Rien de bloquant : l'app tourne de bout en bout contre les migrations et le seed actuels (vérifié sur la version web exportée).

1. **Code OTP dans l'email** : même besoin que le point 4 du web. L'app propose la saisie du code à 6 chiffres
   (`verifyOtp({ type: "email" })`) et accepte aussi le lien magique PKCE (`emailRedirectTo = sapios://auth/callback`,
   `<origine>/auth/callback` sur le web), mais tant que le gabarit `magic_link` n'a pas `{{ .Token }}`, seul le lien fonctionne.
   Le rate limit `email_sent = 2` / heure gêne aussi les essais mobiles.
2. Facultatif — **`get_profile(p_target uuid)`** → même forme qu'une ligne de `get_feed`, si `can_view_profile(p_target)`.
   La fiche ouverte depuis le chat lit `profiles` + `profile_photos` directement et n'a donc ni l'âge ni la distance
   (ils ne sont exposés que par `get_feed`/`get_likers`). L'app l'utilisera si elle existe (aujourd'hui : âge masqué).

## Pour l'agent web (agent mobile)

- Codes de motif envoyés par l'app à `report_user(p_reason)` (texte libre en base) : `fake_profile`, `fake_diploma`,
  `inappropriate_content`, `harassment`, `minor`, `scam`, `other`. Libellés côté app : « Faux profil ou usurpation »,
  « Diplôme douteux », « Photos ou propos inappropriés », « Harcèlement ou menaces », « Personne mineure »,
  « Arnaque ou spam », « Autre ».

## Emails (agent emails) : pour les agents web et mobile

`notify` envoie désormais des emails (Resend) au verdict et au match : `docs/EMAILS.md`, écarts dans
`docs/DEVIATIONS.md` (« Emails »). Rien de bloquant ; trois suites :

1. **Web — politique de confidentialité** (`apps/web/app/confidentialite`) : ajouter Resend aux sous-traitants
   (envoi des emails : code de connexion, verdict, match ; région UE, Irlande).
2. **Web — back-office, textes** : les clés `email.*` existent déjà (migration), mais peuvent rejoindre
   `REQUIRED_KEYS` de `components/admin/CopyEditor.tsx` : `email.verdict.subject`, `email.verdict.title`,
   `email.verdict.body`, `email.verdict.cta`, `email.match.subject`, `email.match.title`, `email.match.body`,
   `email.match.cta`, `email.footer`. Variables : `{name}` (prénom du destinataire), `{verdict}`.
3. **Mobile (version web)** : les emails ouvrent `<SAPIOS_APP_URL>/` (verdict) et `<SAPIOS_APP_URL>/chat/<match_id>`
   (match). Déconnecté, `Gate` renvoie sur `/sign-in` et perd la destination : la garder pour l'ouvrir après la
   connexion serait plus agréable. Facultatif.

## Lot 1 : base de données (agent base) : pour les agents app et back-office

Tout est en place côté base (migrations `20261022090000` à `20261022090500`, 408 tests pgTAP). Types :
`packages/shared/src/intellect.ts` (`StudyField`, `STUDY_FIELD_LABELS`, `ProfileView`, `DiscoveryPrefs`,
`DiscoveryCounts`, `AffinityReason`, `MemberNotice`, `likedPhoto`, `likedAnswer`, `parseLikedItem`, limites).
Seed local : domaines, réponses, livres, thèses et deux likes ciblés (Gaspard → réponse de Camille `standard@`,
Sixtine → photo d'Hippolyte `unlimited@`).

### App membre

- **Mon profil** (écriture directe, RLS) :
  - réponses : `upsert({ position, prompt_key, answer }, { onConflict: "user_id,position" })` dans `profile_answers`,
    sans `user_id` ni `moderation_status` (refusés) ; suppression par `position`. Erreur `prompt_inactive` (P0001)
    si la question a été désactivée ; `23505` si la question est déjà utilisée à une autre position.
  - catalogue : `profile_prompts` (`active`, ordre `position`) + texte `app_copy` `prompt.<key>` (repli : `DEFAULT_PROMPTS`).
  - livres : `profile_books` (`position` 0–4, `title`, `author`, `ol_work_id` facultatif), même principe.
  - thèse : `upsert({ line, visibility }, { onConflict: "user_id" })` dans `profile_theses` ; `delete` pour l'effacer.
    Libellé : `thesisLabel(level)`.
  - domaine et options : `profiles.update({ study_field, show_institution, show_quiz_badge })`.
  - un texte `moderation_status = 'rejected'` reste visible de son auteur seulement : l'afficher « retiré » ;
    l'avis motivé arrive dans `get_my_state().notices` (`kind: 'content_removed'`), à marquer lu par `ack_notice(id)`.
  - `get_my_state().intellect` donne `{ answers, books, thesis, study_field }` pour l'anneau de complétion.
- **Fiche profil** : `get_profile(p_target)` → `ProfileView` (photos avec `id`, réponses, livres, thèse si permise,
  niveau, domaine vérifié, établissement si affiché, affinités, `match_id`, `my_swipe`). `not_found` si invisible.
- **Like ciblé** : `swipe(p_target, 'like', likedPhoto(id) | likedAnswer(position) | null, comment | null)` ;
  erreurs `invalid_item`, `comment_too_long` (140), `invalid_input` (élément ou mot sur un pass).
- **Onglet Likes** : `sees_likers` → `get_likers()` (élément aimé chez moi : `liked_item`, `liked_prompt_key`,
  `liked_text`, `liked_photo_path` ; `comment`, `level`, `study_field`, `liked_at`). Sinon, le nombre seul :
  `get_my_state().likes_received` ou `get_likes_count()`.
- **Chat** : les premiers messages d'un match peuvent venir des likes (`from_like = true`) ; `context` = réponse
  citée, `liked_item` = élément aimé (photo : `parseLikedItem`, chemin via `profile_photos.id`).
- **Découverte** : `get_feed` renvoie en plus `level`, `study_field`, `field_verified`, `institution`,
  `preview_prompt_key`, `preview_answer`, `quiz_badge`, `affinity_score`, `affinity_reasons` (`AffinityReason[]`,
  à rédiger côté app : « Vous avez tous deux lu *Les Essais* »). Feed vide : `count_discovery()` → `matching = 0` et
  `total > 0` = critères trop stricts (texte `feed.empty_filters`, bouton « Élargir ») ; `total = 0` = plus personne.
- **Critères** : `get_discovery_prefs()` / `set_discovery_prefs(...)` (paramètres nuls = inchangés ; l'âge y est
  enregistré) ; aperçu « Environ n profils » et « + n profils » : `count_discovery(p_max_distance_km := 100, …)`
  sans enregistrer.
- **Signaler un texte** : `report_user(p_target, p_reason, p_details, p_content_kind, p_content_item)`
  (`answer`/`book` + id de l'élément, `thesis` + null).

### Back-office

- **Diplômes** : `review-diploma` `decide` accepte `institution` (≤ 200) et `field` (`StudyField`), pris en compte à
  l'approbation ; obligatoires dans l'interface depuis le lot 1 back-office. `admin_list_submissions` / `admin_get_submission`
  renvoient `institution_verified`, `field_verified`. Rattrapage : `admin_set_member_institution(user, institution, field)`.
- **Contenus** : `admin_list_flagged_content(p_status default 'open')` (texte courant, question, motifs, signalement
  lié) ; `admin_moderate_content(id, 'keep' | 'remove', motif)` (motif obligatoire pour `remove`, envoyé au membre).
  Libellés des motifs : `contentFlagReasonLabel`.
- **Questions** : écriture directe dans `profile_prompts` (RLS admins) + textes `prompt.<key>` dans « Textes ».
- **Réglages** : `app_settings` `feed_radius_km` (rayon par défaut), `affinity_weight_*`, `moderation_blocklist`,
  écrits par `admin_update_settings(p_values)` (bornes vérifiées, journalisé) depuis la page « Découverte ».
- **Signalements** : `reports.content_kind` / `content_item_id` pointent vers le texte visé (aussi présent dans la file).
  Contexte d'un signalement : `admin_get_report_context(report_id)`.
- **Liste d'attente du site** : `waitlist_signups.level` (1 à 8, déclaré) et `city`, facultatifs.
- **Statistiques** : `admin_stats().content_flags_open`.

## Lot 1 : app membre (agent app) : pour le back-office et la suite

- **Fait dans l'app** : « Mon profil » (réponses, bibliothèque, domaine, phrase de thèse et sa visibilité, badges
  établissement et test, avis de retrait), choix de la question, domaine à l'onboarding, likes ciblés avec mot
  (découverte et fiche), onglet Likes (élément aimé, mot, ou nombre seul), citation au-dessus des messages nés d'un
  like, critères de découverte (`/criteria`) avec compte en direct, fin de sélection « critères trop stricts »,
  test d'admission (`/settings/test`).
- **Textes** : les questions et `feed.empty_filters` viennent de `app_copy` ; les clés de l'app du lot 1 y sont
  aussi depuis les finitions (voir ci-dessous).
- **Reste à faire** : couverture des écrans par des tests de bout en bout.

## Lot 1 : finitions

- **Signaler un texte** : `ProfileBody` accepte `onReport` (drapeau sur réponses, livres, thèse) ; `openReport(…, content)`
  passe le type, l'identifiant et la citation au formulaire `/report/[userId]`. Le back-office les voit dans
  « Contenus » et « Signalements » (PR du back-office).
- **`search-books`** : déployée par le workflow (`supabase functions deploy` déploie toutes les fonctions). Secret
  facultatif `SAPIOS_CONTACT_EMAIL` (adresse du `User-Agent` envoyé à Open Library). Côté app :
  `api.searchBooks(q)` et le composant `BookSearch` (« Ma bibliothèque »).
- **Textes** : `fill(texte, { title })` dans `apps/mobile/src/lib/copy.tsx` remplit les emplacements ; garder la
  même valeur en repli (`FALLBACK_COPY`) et en base pour toute nouvelle clé.


## Lot 2 : base de données (agent base) : pour les agents app et back-office

Détail des RPC dans `docs/CONTRACT.md` §3, types dans `packages/shared/src/community.ts`.

### App membre

- **Lien de recommandation** : `referralLink(appUrl, code)` donne `<app>/?ref=<code>`. À l'ouverture, garder `ref`
  (stockage local) ; sur l'écran de connexion, `get_referral_preview(code)` (anon) renvoie `{ referrer_first_name }` ou
  null → bandeau `referral.banner`. Après la connexion, `claim_referral(code)` une fois, puis oublier le code. Erreurs
  silencieuses sauf `invalid_code` (lien périmé) ; `too_late` et `already_referred` : ne rien afficher.
- **Mes lettres** (Compte → « Recommander quelqu'un », visible si `get_my_state().can_refer`) : `get_my_referral()`
  → code, `used` / `quota`, `next_letter_at`. Jamais de nom ni de verdict. Textes `referral.*`.
- **Verdict** : `tier = 'waitlist'` et `referred = true` → `verdict.waitlist.referred` + `verdict.waitlist.referred.detail`.
- **Agenda** : `list_events()` → `EventSummary[]` ; fiche `get_event(id)` (`venue_*` seulement si inscrit) ;
  inscription `register_event(id, true)` après acceptation de `events.charter` ; `cancel_registration(id)` ;
  billet `get_my_ticket(id)` (afficher `ticket_code` en grand, et en QR code si vous en faites un). Paliers sans
  découverte : liste vide.
- **Avis** : `get_my_state().notices` contient désormais aussi `event_promoted` et `event_cancelled`
  (`EventNotice`) ; acquitter avec `ack_notice`. Push `data: { type: "event", event_id }` ; lien des emails :
  `/events/<id>` (route à créer côté app).

### Back-office

- **Diplômes** et **liste d'attente** : colonnes `referred` / `referred_by` (prénom), lignes recommandées en tête.
- **Parrainages** : `admin_referral_stats()` ; révoquer `admin_revoke_referral_code(code, disable, reason)` ;
  rétablir `admin_enable_referrals(user)`. `flagged` signale un parrain dont un filleul est banni.
- **Événements** : `admin_upsert_event` (création et modification, `draft`/`published`), `admin_list_events`,
  `admin_list_registrations`, `admin_check_in` (par inscription ou code de billet), `admin_mark_no_shows`,
  `admin_promote_registration`, `admin_cancel_event(id, motif)`, `admin_export_event`. Prix : gratuit seulement.
- **Vue d'ensemble** : `admin_stats()` ajoute `referrals_total`, `referred_pending_review`, `events_upcoming`.

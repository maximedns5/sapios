
## Edge Functions et `packages/shared` (agent fonctions)

1. **Exemple du brief §4.3 corrigé (SDK `@anthropic-ai/sdk` 0.132.1, vérifié dans les types et le code du SDK).**
   - Le repli serveur `fallbacks: "default"` n'existe que sur l'API bêta : l'appel est
     `client.beta.messages.parse({ …, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })` avec
     `betaZodOutputFormat` (`@anthropic-ai/sdk/helpers/beta/zod`) au lieu de `client.messages.parse` + `zodOutputFormat`.
     Le reste de l'exemple est juste : `output_config: { effort: "medium", format }`, bloc `document`/`image` base64 avant le texte,
     `stop_reason === "refusal"` testé avant `parsed_output`.
   - Les helpers zod du SDK utilisent l'API zod 4 : le schéma partagé importe `zod/v4` (présent dans zod 3.25+ et zod 4),
     pas `zod`.
   - `parse()` lève une `AnthropicError` quand la réponse ne respecte pas le schéma (les bornes `min`/`max` sont retirées du
     JSON Schema envoyé et vérifiées côté client) : la soumission part en revue avec le signal `extraction_unparseable`.
   - Une image dont l'encodage base64 dépasse 10 Mo est refusée par l'API (le brief accepte 15 Mo) : elle n'est pas envoyée,
     la soumission part en revue avec `file_too_large_for_extraction`.
2. **Codes d'erreur ajoutés** (le contrat §5 n'en liste qu'une partie) : communs `unauthorized` (401), `invalid_body`,
   `method_not_allowed`, `misconfigured`, `internal_error` ; `review-diploma` : `invalid_action`, `invalid_decision`,
   `invalid_level`, `not_found`, `file_purged` (410), et les codes métier de `apply_diploma_review` renvoyés tels quels
   (`already_decided` 409…). Types dans `packages/shared/src/functions.ts`.
3. **`review-diploma` / `decide`** : `tier` et `level` peuvent être `null` (refus d'un compte sans palier).
4. **`submit-diploma`** : `already_verified_higher` = le compte a déjà le niveau 8 (rien de plus haut à obtenir). Un préfixe
   `diplomas/` dans `storage_path` est toléré. Un fichier refusé après examen (`too_large`, contenu ≠ type déclaré, doublon,
   `rate_limited`, `already_verified_higher`) est supprimé du stockage, sauf s'il est déjà rattaché à une soumission.
5. **Verdict** : `review-diploma` notifie en appelant directement le module partagé de `notify` (`_shared/push.ts`), sans
   aller-retour HTTP. `notify` accepte toujours `{ type: "verdict" }`.
6. **`purge-diplomas`** appelle `diplomas_to_purge(null)` : la durée vient de `app_settings.diploma_retention_days`
   (défaut SQL 30 jours) au lieu d'un 30 codé en dur.
7. **Variable d'env facultative `SAPIOS_PUBLIC_SUPABASE_URL`** : en local, les fonctions voient `SUPABASE_URL=http://kong:8000` ;
   l'URL signée du back-office est réécrite vers l'adresse publique. À laisser vide en production.

## Base de données (agent base : `supabase/migrations`, `seed.sql`, `tests`, `config.toml`)

Écarts au contrat :

1. **`can_view_profile`** : en plus des règles du brief §6, deux membres d'un match actif, sans blocage, se voient tant que la
   cible n'est pas bannie (photo et prénom du chat même si l'autre est en pause ou change de palier). Le lecteur doit avoir un
   palier `can_browse` et ne pas être banni ; la cible doit être `active` avec un palier `can_browse` ; aucun blocage.
2. **Codes d'erreur ajoutés** (toujours `P0001`, message = code) : `not_authenticated` (RPC sans `auth.uid()`),
   `invalid_input` (`set_identity` sans nom ou sans date, `report_user` invalide), `invalid_location` (`set_location`),
   `invalid_status` (`activate_profile` sur un compte banni), `invalid_tier` (`admin_admit_waitlist` vers autre chose que
   `standard`/`unlimited`), `forbidden` (`report_user` par un banni), `photos_limit` (7e photo). `apply_diploma_review` :
   `forbidden` (relecteur absent de `admins`), `invalid_decision`, `invalid_level`, `not_found`, `already_decided`,
   `policy_missing`. Gardes en `42501` : `status_forbidden` (écriture de `profiles.status`), `server_only`,
   `audit_log_append_only`, `forbidden` (modération de photo par un non-admin).
3. **RPC ajoutées pour le back-office** (demandes web) : `admin_stats() → jsonb`, `admin_get_submission(p_id)`,
   `admin_list_waitlist()` ; `admin_list_submissions` renvoie aussi `email` (dernière colonne).
4. **Tables / colonnes ajoutées** : `app_settings(key, value jsonb)` (`feed_radius_km` = 50, `diploma_retention_days` = 30,
   `max_submissions_per_30_days` = 3 ; les fonctions ont ces valeurs en repli) ; `reports.handled_by/handled_at` ;
   `push_tokens.updated_at`, clé primaire sur `token` + unique `(user_id, token)` (les deux `onConflict` marchent) : un jeton
   enregistré par un autre compte lui est transféré.
5. **`private.invoke_edge_function(name, body, timeout_ms)`** lit aussi un secret Vault facultatif `anon_key` (en-tête
   `Authorization`), inutile tant que `verify_jwt = false` sur `notify`/`process-diploma`/`purge-diplomas`.

Précisions d'implémentation (conformes au contrat, à connaître côté clients) :

- `storage_path` = chemin **dans** le bucket, `{user_id}/…` (contrainte `check` sur `profile_photos` et `degree_submissions`).
- `activate_profile` : identité, puis profil complet (`display_name`, `gender`, `seeking_genders` non vide, `city` ; bio et
  localisation facultatives), puis ≥ 2 photos non refusées, puis consentement. Sans effet si déjà `active`/`paused`.
- `set_sensitive_consent(false, …)` efface `seeking_genders` et repasse un profil `active`/`paused` en `onboarding`.
- `profile_private` : écriture uniquement par `set_identity` (une fois, 18 ans à Paris) et `set_sensitive_consent` ; correction par
  un admin. `profiles` : le client modifie `display_name, gender, seeking_genders, age_min, age_max, bio, city` ; la position passe
  par `set_location` (arrondie à 3 décimales).
- `get_feed` : lecteur `active` avec palier `can_browse`, sinon vide ; sans localisation du lecteur, pas de filtre de distance et
  `distance_km = null` ; avec localisation, les candidats sans localisation sont exclus. Tri : jour (Paris) de dernière activité,
  puis distance, puis activité. `p_limit` borné à 1..100. `get_feed`, `swipe` et `get_my_state` mettent à jour `last_active_at`.
- `swipe` : un `pass` peut devenir `like` (compté dans le quota) ; un like n'est jamais retiré (unmatch/block). Seuls les likes
  comptent dans le quota. `matched = false` si le match existe mais a été défait.
- `messages` : lecture et écriture seulement dans un match actif sans blocage (l'historique disparaît après unmatch/blocage) ;
  le client ne modifie que `read_at`, et seulement sur les messages reçus.
- `blocks` : création par `block_user` (qui dé-matche), lecture et suppression (déblocage) de ses propres lignes.
  `reports` : création par `report_user` uniquement.
- `degree_submissions` : le client lit ses lignes sans `extracted`, `signals`, `confidence`, `moderator_note`, `doc_sha256`,
  `reviewer_id` (vue `my_submissions` conseillée) ; un admin peut modifier `moderator_note` directement. Une soumission
  `approved`/`rejected` ne change plus de statut (trigger). `needs_more` compte comme une décision pour la purge.
- `apply_diploma_review` ne rétrograde jamais : il garde le meilleur niveau et le meilleur palier déjà acquis (ex. admission
  manuelle depuis la liste d'attente).
- Lecture de `app_copy`, `access_policy`, `app_settings` réservée à `authenticated` : `anon` ne lit rien (la landing ne lit pas
  `app_copy`) et peut seulement insérer dans `waitlist_signups` (doublon → `23505`, HTTP 409).
- Seed : photos placeholder (charte noir/blanc cassé) envoyées depuis `supabase/seed/photos` par `db reset`
  (`[storage.buckets.photos] objects_path`). Les fichiers diplômes seedés n'existent pas dans Storage.

## App mobile (agent mobile : `apps/mobile`)

Aucun écart aux noms du contrat (RPC, Storage, Edge Functions, clés `app_copy`). Choix à connaître :

1. **Ordre de l'onboarding** : identité → consentement → profil → photos → `activate_profile`. Le consentement à la donnée
   sensible (art. 9) est demandé **avant** la saisie des genres recherchés, qui en dépendent ; sans consentement, le champ
   « Je cherche » n'est pas affiché. Après un retrait (`set_sensitive_consent(false)`), le profil repasse en `onboarding`
   côté base et l'app renvoie sur l'écran de consentement.
2. **Verdict « vu »** : rien n'indique en base qu'un verdict a été montré ; l'app mémorise localement (AsyncStorage, par compte)
   les clés `tier:<copy_key>:<niveau>` et `sub:<id>:<statut>`. Un verdict qui ouvre le feed est montré une fois puis
   « Entrer » mène au feed ; sur un nouvel appareil, il est rejoué une fois.
3. **Version web de l'app** (vérification Playwright) : caméra, Sign in with Apple et push Expo sont neutralisés (boutons
   désactivés avec la mention « Indisponible sur le web »), l'export RGPD est téléchargé au lieu de passer par `expo-sharing`.
4. **Images** : photos de profil réencodées en JPEG 1600 px ; diplômes en image réencodés en JPEG 2400 px (2000 px si le
   fichier dépasse 7 Mo, limite de l'extraction), PDF envoyés tels quels après contrôle des 15 Mo. La position est arrondie à
   0,01° sur l'appareil avant `set_location` (la base arrondit ensuite à 3 décimales).

## Mode manuel (décision du porteur du projet, 21 oct. 2026)

Pas de clé API Claude en staging ni en prod pour l'instant : le porteur du projet valide lui-même chaque diplôme.

- Sans `ANTHROPIC_API_KEY`, `process-diploma` ne télécharge pas le fichier et n'appelle aucun modèle : la soumission passe
  en `needs_review` avec le seul marqueur `manual_review`, qui n'est pas un signal de fraude.
- `extraction_unavailable` ne signifie plus que « clé présente mais refusée par l'API (401/403) ».
- Le back-office reconnaît `manual_review` : pas de colonnes ni de panneau IA, une grille de vérification à l'œil à la place.
- Ajouter une clé suffit à réactiver l'extraction (brief §4.3) pour les soumissions suivantes, sans redéploiement.


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
3. **Version web de l'app** (publiée sur Vercel, voir le README) : l'option caméra est masquée (sélection de fichier et
   glisser-déposer à la place), Sign in with Apple reste affiché mais désactivé (« iOS uniquement »), le push Expo est
   remplacé par les notifications dans l'app (badges, bandeaux, titre de l'onglet) et les emails de verdict et de match,
   l'export RGPD est téléchargé au lieu de passer par `expo-sharing`.
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

## Emails (agent emails, 21 oct. 2026)

Détail et marche à suivre : `docs/EMAILS.md`.

1. **`notify` envoie aussi des emails** (API HTTP de Resend), en plus du push : un email au verdict, un email à
   chacune des deux personnes d'un nouveau match, aucun pour les messages. Réponse `{ sent, emailed }` au lieu de
   `{ sent }` (contrat §5) : `sent` reste le nombre de push acceptés par Expo, `emailed` le nombre d'emails acceptés
   par Resend (`NotifyResponse` dans `packages/shared`).
2. **Point d'entrée commun** `_shared/notify.ts` (`dispatch`), appelé par `notify` et par `review-diploma` (qui
   appelait `_shared/push.ts` directement, écart « Edge Functions » n° 5). Les deux canaux sont indépendants : un
   échec Resend (réseau, 4xx, 5xx, délai de 10 s) est journalisé et absorbé, avec deux nouveaux essais après un
   429 ; une erreur du push remonte comme avant.
3. **Canal facultatif** : actif seulement si `RESEND_API_KEY` et `EMAIL_FROM` sont définis (secrets des Edge
   Functions), sinon ignoré avec un journal. `SAPIOS_APP_URL` (adresse de l'app membre) donne les liens :
   `/` pour le verdict, `/chat/<match_id>` pour le match, comme `routeForPush` de l'app.
4. **Clés `app_copy` ajoutées** (contrat §6), par la migration `20261021091000_email_copy.sql` :
   `email.verdict.subject`, `email.verdict.title`, `email.verdict.body`, `email.verdict.cta`,
   `email.match.subject`, `email.match.title`, `email.match.body`, `email.match.cta`, `email.footer`.
   Dans les emails, `{name}` est le prénom du **destinataire** (dans `push.match`/`push.message`, c'est l'autre
   personne) ; `{verdict}` est le texte de son verdict. Le prénom de l'autre personne d'un match n'apparaît jamais
   dans un email : avec le genre du destinataire, il révélerait une orientation (brief §9).
5. **Destinataires** : adresse lue par `auth.admin.getUserById` au moment de l'envoi. Ignorés : profil `banned`
   ou absent, compte Auth absent, supprimé, anonyme, `banned_until` futur, adresse non confirmée.
6. **Nouveau sous-traitant** : Resend (brief §9), à ajouter à la politique de confidentialité avec son DPA.
7. **Auth** : le SMTP des projets hébergés passe par Resend (`smtp.resend.com`), réglé dans le dashboard ; les
   gabarits `supabase/templates/*.html` y sont recopiés à la main. Mailpit reste le SMTP local.

## Site public : landing simple et test d'admission (lot 1, 22 oct. 2026)

1. **Charte** : le site public (landing, `/test`, pages légales, 404) quitte la charte noir et blanc du brief
   (§« Charte visuelle ») pour la « direction simple » validée sur maquettes : fond blanc, Plus Jakarta Sans,
   accent `#4338E0` (variable `--accent` de `apps/web/app/site.css`), Bodoni Moda italique pour le logo seul.
   Tout est rangé sous `.site` : le back-office garde `globals.css`, Inter et Plex Mono, sans changement.
2. **Landing** : la transposition du spot au défilement (GSAP, Lenis, Splitting.js, brief « Landing page ») est
   remplacée par une page courte animée en CSS ; les trois bibliothèques sont retirées. Bouton « Postuler » fixé en
   bas sur téléphone (audit n° 02), bloc « Pour de vrai » (n° 01), suite expliquée après l'inscription (n° 03).
3. **Liste d'attente** : email obligatoire ; niveau de diplôme déclaré et ville facultatifs (colonnes `level` et
   `city` de `waitlist_signups`, lot 1 back-office), mentionnés dans la politique de confidentialité. Le niveau n'est
   pas vérifié à ce stade : il sert seulement à préparer l'ouverture. `source` vaut `landing`, ou `test` quand
   l'inscription suit le test.
4. **Test d'admission** (fonctionnalité 2, option A, décision ouverte n° 6 du brief) : un gag assumé, dix
   questions, chronomètre de 3 minutes, résultat « QI estimé : 130 » pour tout le monde, mention « test non
   scientifique » à l'entrée et au résultat. Tout se passe dans le navigateur : rien n'est envoyé ni enregistré,
   aucun lien avec l'accès, aucun paiement à proximité. Contenu dans `packages/shared/src/quiz.ts` (`QUIZ`),
   repris par l'app. Image à partager générée au build (`/test/partage/story` et `/test/partage/carre`).

## Lot 1 : base de données (agent base, 22 oct. 2026)

Profil intellectuel, likes ciblés et découverte par critères (décisions D1 à D9 aux valeurs recommandées).
Contrat mis à jour (§1, §2, §3, §5, §6) ; formes jsonb typées dans `packages/shared/src/intellect.ts`.

1. **Thèse dans sa propre table `profile_theses`** (et non `profiles.thesis_line` / `thesis_visibility`) : `profiles`
   est lisible en entier par tout membre qui voit le profil, et révoquer une colonne casserait les `select *` des
   clients. La table porte sa propre règle de lecture (D3 : `everyone`, ou match actif) et son statut de modération.
2. **`profile_answers` et `profile_books` ont un `id` unique** en plus de la clé (`user_id`, `position`) : la file de
   modération et les signalements visent un texte précis même si le membre réordonne ses réponses. Les likes
   ciblés gardent le format demandé `answer:<position>` : un like suit la position, pas le texte.
3. **Réponses : 250 caractères au plus en base** (le cadrage dit 200 dans le parcours, 250 dans l'impact
   technique) ; l'app peut afficher une limite plus basse.
4. **`discovery_prefs.max_distance_km` nul = rayon par défaut** (`app_settings.feed_radius_km`, réglable dans le
   back-office), au lieu d'un défaut 50 figé dans la ligne. `get_discovery_prefs` renvoie la valeur effective.
   L'âge recherché reste dans `profiles` ; `set_discovery_prefs` l'enregistre (un seul endroit, cadrage §3).
5. **Ordre du feed** : tri `activity` (défaut, D9) = jour d'activité, puis préférences (niveaux et domaines choisis),
   puis score d'affinité, puis distance ; tri `affinity` = préférences, affinité, jour d'activité, distance.
   `count_discovery().total` ignore tous les critères du membre (rayon compris) : `matching = 0` et `total > 0`
   signifie « critères trop stricts ».
6. **Modération** : un texte repéré (`pending`) reste publié jusqu'à la décision (D6) ; un texte modifié après un
   retrait repasse en file (motif `edited_after_removal`). Le membre qui supprime son texte clôt l'entrée
   (`withdrawn`). La contestation d'un retrait passe pour l'instant par la page contact (pas de RPC dédiée).
   Les mots joints aux likes ne sont pas filtrés : ce sont des messages privés destinés à une seule personne.
7. **Likes ciblés** : un like existant n'est jamais réécrit (idempotence d'origine) ; au match, les mots des likes
   deviennent des messages `from_like` qui ne déclenchent pas la notification « nouveau message » (le match l'est
   déjà). `get_likes_count()` et `get_my_state().likes_received` donnent le nombre seul à tous les paliers (D16).
8. **`apply_diploma_review(…, p_institution, p_field)`** : paramètres facultatifs pour ne pas casser le
   back-office actuel ; le back-office du lot 1 les rendra obligatoires à l'approbation. Le domaine vérifié devient
   celui du profil s'il est vide. `admin_set_member_institution` permet le rattrapage des membres déjà validés.
9. **Avis au membre** : table `member_notices` (motif d'un retrait, obligation de motivation du DSA), lus via
   `get_my_state().notices`, marqués lus par `ack_notice`.
10. **Extension `unaccent`** ajoutée (comparaison des titres de livres, des établissements et de la liste de mots).

## Lot 1 : back-office (22 oct. 2026)

Le back-office garde sa charte noir et blanc : c'est un outil interne, la « direction simple » ne concerne que
l'app membre et le site public.

1. **Établissement et domaine obligatoires à la validation** (dans l'interface ; `apply_diploma_review` les garde
   facultatifs pour les appels existants). L'établissement est prérempli par l'extraction IA quand elle existe.
   Rattrapage des membres validés avant le lot 1 : sur la soumission qui donne leur niveau (file « Validé », mention
   « À saisir »), par `admin_set_member_institution`.
2. **Revue d'un diplôme (audit n° 22)** : document à gauche sur environ 60 % de la largeur avec une loupe (clic),
   décision collée à droite et visible sans défiler sur un écran de 900 px, grille de revue manuelle repliée,
   raccourcis (1 à 8 niveau, X case d'examen, V / R / C décision, Entrée envoi ; jamais pendant la saisie dans un
   champ), passage automatique au dossier suivant après 1,5 s (désactivable, choix gardé dans le navigateur).
   Non fait : le niveau déclaré par le membre (n° 08), qui n'existe pas en base, et la vignette dans la file.
3. **Réglages de la découverte et de la modération** par `admin_update_settings` (validé, journalisé) plutôt que
   par écriture directe : les autres écrans de configuration (paliers, textes, questions) écrivent toujours en direct
   sous la RLS admin, sans trace.
4. **Signalements (audit n° 23)** : contexte complet par `admin_get_report_context` (photos, profil, diplôme validé,
   texte visé, historique, match et blocages). Les messages ne sont pas montrés : le formulaire de signalement ne
   l'annonce pas au membre. Pour « Diplôme douteux », un lien mène au diplôme validé ; l'action « Demander un nouveau
   justificatif » n'est pas faite (elle demande de rouvrir une décision, donc une règle à écrire).
5. **Motifs de retrait d'un texte** : cinq phrases prêtes (coordonnées, propos injurieux, contenu sexuel, donnée sur un
   tiers, publicité), modifiables avant envoi, adressées au membre (obligation de motivation du DSA).


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

## Lot 1 : app membre (agent app, 22 oct. 2026)

Profil intellectuel, likes ciblés, critères et test d'admission dans `apps/mobile`, sur les RPC du lot 1.

1. **Fiche complète pour chaque carte** : `get_feed` ne renvoie pas les identifiants des photos ni toutes les
   réponses ; la découverte appelle `get_profile` pour la carte affichée et la suivante. Tant que la fiche n'est pas
   arrivée, le cœur d'une photo aime tout le profil et l'aperçu de réponse n'a pas de cœur (pas de position).
2. **Croix « passer » ancrée sous le profil** (barre fixe au-dessus des onglets) au lieu de flotter sur la carte : elle
   ne cache plus jamais un texte.
3. **Éditeurs du profil sous `/settings/*`** (`me`, `question`, `field`, `test`) : la règle de routage autorise
   `/settings` dans tous les états, donc pendant la relecture du diplôme (« montrez-nous le reste »). Les critères
   vivent en `/criteria`, réservé aux paliers qui voient la découverte.
4. **Réponses limitées à 200 caractères dans l'interface** (250 en base). Pas de réordonnancement des réponses : un
   like cible une position (`answer:<n>`).
5. **Réordonner les livres** : un échange passe par une place libre (les identifiants suivent les textes) ; bibliothèque
   pleine (5 livres), les deux lignes sont réécrites (nouveaux identifiants, filtre automatique rejoué). Un livre
   retiré par la modération ne se déplace pas. Titres seuls (D4) ; recherche Open Library depuis les finitions.
6. **L'âge recherché se règle dans les critères** pour les membres qui voient la découverte ; « Modifier mon profil »
   n'écrit plus `age_min` / `age_max` dans ce cas (il ne les écrase pas). L'onboarding garde son curseur.
7. **Niveaux proposés dans les critères** : Bac+3, Bac+5, Bac+8 (niveaux normalisés 6, 7, 8 : un Bac+3 admis par lot
   voit la découverte).
8. **Contester un retrait** : bouton « Contester » qui ouvre un email à l'éditeur (pas de RPC dédiée, comme prévu).
9. **Test d'admission dans l'app** : mêmes questions que la landing (`QUIZ`), rien d'enregistré sauf
   `show_quiz_badge`. Le partage télécharge l'image story du site (`EXPO_PUBLIC_SITE_URL/test/partage/story`) et
   ouvre la feuille de partage sur téléphone ; sur le web, partage du navigateur, sinon l'image s'ouvre dans un onglet.
10. **Signaler un texte précis** : fait dans les finitions du lot 1 (ci-dessous).

## Lot 1 : finitions (22 oct. 2026)

1. **Signaler un texte précis** : un petit drapeau sur chaque réponse, livre et phrase de thèse (découverte et fiche)
   ouvre le formulaire de signalement, qui cite le texte et appelle `report_user` avec `p_content_kind` et
   `p_content_item`. `get_profile` renvoie pour cela l'`id` de chaque réponse et de chaque livre. « Bloquer aussi »
   n'est pas coché d'office quand on signale un texte (il l'est pour une personne). La bio n'a pas de drapeau : elle
   n'est pas un `content_kind` ; on signale alors la personne.
2. **Recherche de livres par Open Library** (FEATURES §1, « Prestataires ») : Edge Function `search-books`, relais
   authentifié. Open Library ne voit que le texte cherché et l'adresse du serveur. Délai de 4 s, 8 résultats au plus,
   `User-Agent` avec l'adresse de contact (`SAPIOS_CONTACT_EMAIL`, sinon `contact@sapios.app`). Une panne ne renvoie
   que `upstream_unavailable`, sans message : l'URL contient la recherche et ne doit pas finir dans les journaux.
   Quota en base (`private.rate_limits`, fenêtre fixe de 60 s, 30 recherches par membre) plutôt qu'en mémoire : les
   instances des Edge Functions sont éphémères et multiples. La saisie à la main reste possible ; une œuvre choisie
   dans le catalogue enregistre `ol_work_id`. Open Library n'est pas un sous-traitant (aucune donnée de compte) ; la
   politique de confidentialité le mentionne quand même.
3. **Textes modifiables** : les clés de l'app du lot 1 sont dans `app_copy` (migration `20261023090000`), y compris
   les phrases de « Pourquoi ce profil » avec emplacements `{title}`, `{count}`… Le back-office nomme les groupes et
   refuse un texte qui perd un emplacement. Les questions du test d'admission restent dans `packages/shared/src/quiz.ts` :
   la landing les affiche à des visiteurs anonymes, qui ne lisent pas `app_copy`.


## Lot 2 : base de données (agent base, 23 oct. 2026)

Lettres de recommandation et événements gratuits (cadrage §5 et §6, décisions D10 à D13 aux valeurs recommandées).

1. **`get_referral_preview` ouverte à `anon`** : seule exception à « anon n'exécute aucune fonction ». L'écran de
   connexion affiche « Recommandé·e par Camille » avant l'inscription. Elle ne renvoie que le prénom affiché, et rien
   si le code est inconnu, révoqué ou inutilisable. Pas de quota d'appels : un code a 32^10 ≈ 10^15 valeurs,
   l'énumération est hors de portée, et la base ne connaît pas l'adresse IP d'un appel anonyme.
2. **`referrals.referrer_id` en `on delete set null`** : seule clé vers `auth.users` qui ne cascade pas. Si le
   parrain supprime son compte, la personne recommandée garde sa priorité ; le prénom disparaît.
3. **Codes en base 32 de Crockford** (sans I, L, O ni U) plutôt qu'un alphabet maison ; la saisie lit O comme 0 et
   I ou L comme 1, ignore espaces et tirets. Les billets d'événement utilisent le même alphabet (12 caractères).
4. **Code créé à la première demande** (`get_my_referral`), pas à l'admission. Un admin qui révoque un code peut aussi
   couper les recommandations du membre (`user_access.referral_disabled`), sinon un nouveau code serait créé.
5. **Éligibilité du parrain** : palier `standard` ou `unlimited` avec accès à la découverte, profil actif ou en pause,
   recommandations non coupées. Les lettres utilisées sont celles des 30 derniers jours (réglable) ; une lettre se
   libère 30 jours après son utilisation. Un filleul qui supprime son compte libère sa lettre.
6. **« Avant toute décision »** = aucun palier attribué et aucun dossier examiné (`reviewed_at`), y compris une
   demande de complément.
7. **Priorité** : seulement l'ordre des listes (`admin_list_submissions`, `admin_list_waitlist`). `admin_admit_waitlist`
   prend toujours les identifiants choisis par l'admin.
8. **Verdict d'une personne recommandée en liste d'attente** : l'app choisit `verdict.waitlist.referred` quand
   `tier = 'waitlist'` et `referred = true` ; `user_access.copy_key` (et donc l'email de verdict) reste `verdict.waitlist`.
9. **Événements visibles des membres actifs ou en pause** (pas seulement `active`) : une pause cache le profil de la
   découverte, pas l'agenda.
10. **Lieu exact** : `venue_name` et `venue_address` ne sont jamais accordés en lecture directe (droits par colonne) ;
    seules `get_event` (place confirmée) et `get_my_ticket` les renvoient. Les emails et les push ne contiennent ni le
    lieu ni les autres inscrits.
11. **File d'attente** : ordre de `status_changed_at` à l'heure réelle (`clock_timestamp()`), pas l'heure de début de
    transaction. Une personne arrivée quand il reste des places mais qu'une file existe rejoint la file (la file est
    remplie automatiquement à chaque place libérée, ce cas ne devrait pas se produire).
12. **Capacité** : verrou sur la ligne de l'événement (`for update`) dans `register_event`, `cancel_registration`,
    `admin_promote_registration` et `admin_upsert_event` ; les tests pgTAP sont séquentiels.
13. **Dépublier** un événement qui a des inscrits est refusé (`invalid_input`) : il faut l'annuler, ce qui prévient.
14. **Rappel la veille** à 16 h 07 UTC (17 h ou 18 h à Paris), une fois par événement (`reminder_sent_at`), renvoyé si
    l'admin change la date. Les emails d'événement passent par `notify`, sans effet tant que Resend n'est pas configuré.
15. **Clés des emails d'événement** dans leur propre migration et leur propre liste (`EVENT_EMAIL_COPY_KEYS`) :
    `EMAIL_COPY_KEYS` reste celle du lot 0, vérifiée contre la migration d'origine.

## Lot 2 : back-office (23 oct. 2026)

Pages « Événements », « Inscrits » (par événement) et « Parrainages » ; repères « Prioritaire » dans les files.

1. **Navigation** : les quatre pages de configuration (Paliers, Découverte, Questions, Textes) passent sous un seul
   onglet « Réglages », avec une barre secondaire, comme sur la maquette du lot 2 : onze onglets ne tenaient plus sur un
   écran de 1440 px.
2. **Réglages des lettres** depuis « Parrainages » : `admin_update_settings` accepte en plus
   `referral_letters_standard`, `referral_letters_unlimited` (0 à 20) et `referral_window_days` (7 à 90), validés et
   tracés comme les autres (migration `20261025120000_lot2_back_office.sql`).
3. **`admin_referral_stats`** renvoie en plus `tier` et `level` du parrain (affichage seulement). Les membres qui
   n'ont recommandé personne n'y figurent pas : un code sans filleul se révoque en le saisissant.
4. **Pointage par code de billet** : le code est cherché dans les inscrits de l'événement affiché avant tout appel ;
   un billet d'un autre événement est refusé à l'écran, alors que `admin_check_in(p_ticket_code)` le pointerait.
5. **Publication** : l'interface exige l'adresse privée avant de publier (les inscrits la reçoivent) ; la base ne
   l'impose pas. La capacité ne descend pas sous le nombre de places prises.
6. **Export CSV des inscrits** : seul écran du back-office où figurent les emails (`admin_export_event`) ; le fichier
   est produit dans le navigateur, rien n'est stocké.
7. **Landing** : un lien `/?ref=CODE` enregistre l'inscription à la liste d'attente avec `source = ref:CODE` (code
   normalisé et vérifié) ; la liste d'attente l'affiche « Recommandation · CODE ».

## Lot 2 : app membre (agent app, 23 oct. 2026)

1. **Pas de rang chiffré dans le verdict « recommandé »** : la maquette montrait « 42e → 37e », mais la base ne
   publie aucune position sur la liste d'attente. L'app montre une file de dossiers anonymes où le vôtre remonte :
   une illustration, sans chiffre inventé.
2. **Lien de recommandation** : `<app>/?ref=<code>` (`referralLink` du paquet partagé) plutôt que `sapios.app/r/<code>`
   des maquettes ; aucune route courte n'existe côté site.
3. **Agenda sans barre d'onglets** : `/events` et ses écrans sont des pages empilées (retour en haut à gauche), comme
   les critères, et non un onglet caché : la découverte reste l'entrée (bandeau), et « Mon profil » → « Mes événements ».
4. **Charte** : les quatre règles résumées sont dans l'app ; le texte complet vient de `events.charter` (back-office).
   Pas de prénom de référente : la base n'en connaît pas, l'app parle d'« une personne de l'équipe ».
5. **Programme** : la description de l'événement est affichée telle quelle, paragraphe par paragraphe (pas de champ
   « programme » ni d'heures structurées en base).


## Conformité : base et app (agent conformité, 23 oct. 2026)

Plan d'action de l'AIPD (sections 2, 4 et 7) et des CGU (articles 1.2, 5.5, 13.2 et 14.1), côté base et app.

1. **CGU par version** : `app_settings.terms_version` (texte libre, seed `2026-10-brouillon`). Changer la valeur
   redemande l'acceptation à tout le monde. `accept_terms` n'accepte que la version en vigueur
   (`terms_version_mismatch` sinon) : une app ouverte sur une version périmée relit l'état.
2. **Ordre des erreurs de `activate_profile`** : `terms_required` vient après `consent_missing`. Dans l'app, l'étape
   des conditions passe avant tout le reste ; la base ne fait que garantir qu'aucun profil ne s'active sans elles.
3. **Étape 1 sur 6** : l'inscription compte une étape de plus (`SIGNUP_STEPS` = 6) ; « Conditions d'utilisation » est
   la première. Un membre qui a déjà accepté une version antérieure voit l'écran bloquant « Nos conditions évoluent »
   (accepter, supprimer son compte ou se déconnecter), même pendant l'inscription.
4. **Écran de connexion** : il n'y a pas d'acceptation implicite (« En continuant, vous acceptez… » a disparu). Le
   pied de page renvoie aux CGU, mentions légales, confidentialité et contact, et annonce l'étape des conditions.
5. **Inactivité** mesurée par la plus récente de `profiles.last_active_at` (`touch_activity`, appelée par
   `get_my_state`), `auth.users.last_sign_in_at` et la création du compte. Avertissement à `inactive_warning_days`
   (avis dans l'app et email), suppression `inactive_grace_days` plus tard, revérifiée compte par compte juste avant.
   L'avis n'est lu qu'au retour du membre, donc une fois le compte sauvé : son texte le dit. Les admins ne sont jamais
   avertis ni supprimés. Un compte banni inactif est supprimé au même terme, sans avis ni email.
6. **Avertissement privé** : `private.inactivity_warnings`, jamais exposé ; toute activité l'efface.
7. **Signalements conservés après la suppression de la personne visée** : clés étrangères en `set null` (plus en
   `cascade`), pseudonymes stables par personne, `target_deleted_at`. Purge `report_retention_days` après la
   suppression de la personne visée ; les signalements sur des comptes existants restent. Le compte de l'auteur
   supprimé : le signalement reste, sous pseudonyme.
8. **Identités bannies** : empreintes prises à la suppression d'un compte banni (pas au bannissement : tant que le
   compte existe, l'identité est en clair dans `profile_private`). HMAC-SHA-256 avec le poivre Vault `identity_pepper` ;
   email normalisé (minuscules, sans espaces) et identité normalisée (nom sans accents ni casse ni espaces multiples
   + date de naissance). Une inscription avec le même email est bannie dès sa création ; une identité légale identique
   bannit le profil sans enregistrer l'identité. Sans poivre, rien n'est gardé ni comparé (le journal le note).
9. **Journal** : `audit_log` reste en ajout seul ; le trigger laisse passer une suppression seulement dans la purge
   serveur (réglage de transaction `sapios.audit_purge`) et seulement pour des lignes plus vieilles que
   `audit_retention_days`.
10. **Avis** : seuls les avis lus (`read_at`) sont purgés, `notice_retention_days` après leur lecture.
11. **Suppression partagée** : `delete-account` et `purge-inactive` utilisent `_shared/account.ts` (photos, diplômes,
    journal, compte). La purge traite 100 comptes par passage.
12. **Rappel de sécurité dans une conversation** : affiché quand les deux personnes ont écrit, masqué pour de bon par
    conversation sur l'appareil (stockage local, pas en base). Le billet remplace la phrase sur la personne de l'équipe
    par le bloc « Avant l'événement » (`safety.event.*`).
13. **Seed** : les profils seedés ont accepté la version en vigueur, pour ne pas bloquer les comptes de test.

## Conformité : site et back-office (26 oct. 2026)

1. **Double authentification dans `is_admin()`** plutôt que dans chaque RPC : toutes les règles d'accès et RPC d'admin
   passent déjà par cette fonction ; une seule condition (`auth.jwt() ->> 'aal' = 'aal2'`) ferme tous les chemins.
   `is_admin_account()` (sans aal) ne sert qu'à aiguiller l'interface. Pas de réglage pour désactiver l'exigence : elle
   vaut aussi en local, d'où l'activation de TOTP dans `config.toml`.
2. **Hébergeurs** : les adresses de Vercel et Supabase trouvées en ligne ne concordaient pas (brouillon des mentions
   légales). La page publiée met `[À compléter]` plutôt qu'une adresse non vérifiée.
3. **Pages légales** : les notes « [Juriste] », les sections « À lire d'abord » et « Points à valider » des brouillons
   ne sont pas publiées ; les autres passages entre crochets restent, signalés par le bandeau « Version provisoire ».

## Sécurité : chiffrement en base des champs sensibles (27 oct. 2026)

Nom légal, date de naissance et texte libre des signalements sont chiffrés dans la base (migration
`20261027090000_chiffrement_champs`).

1. **Clé dans Vault** (`field_key`, 32 octets aléatoires), créée par la migration si elle manque : rien à configurer sur
   staging ni en production. Ne jamais la recréer ni la changer : les données déjà chiffrées deviendraient illisibles.
2. **pgcrypto** (`pgp_sym_encrypt`, AES-256 avec contrôle d'intégrité, `s2k-mode=1` car la clé est déjà aléatoire)
   plutôt que la transparent column encryption de pgsodium, que Supabase retire.
3. **Ce que cela protège** : une copie ou un export de la base, une sauvegarde, l'affichage d'une table dans le tableau
   de bord, un journal. **Ce que cela ne protège pas** : une personne qui a un accès SQL complet au projet (tableau de
   bord Supabase, mot de passe de la base) peut lire Vault, donc la clé. D'où la double authentification sur les
   comptes Supabase, Vercel et GitHub.
4. **Âge** : `birth_month` garde en clair le 1er jour du mois de naissance, pour la découverte et les profils sans
   déchiffrer. L'âge affiché change donc jusqu'à un mois avant l'anniversaire réel. Le contrôle des 18 ans se fait sur
   la date complète, dans `set_identity`, avant chiffrement.
5. **`degree_submissions.extracted` reste en clair** : vide en mode manuel, et la détection des doublons de
   process-diploma l'interroge par année (`extracted->>year_awarded`). À chiffrer si l'extraction automatique revient.
6. **Le back-office ne lit plus `reports` ni `profile_private` directement** : signalements par `admin_list_reports`,
   noms légaux de la liste d'attente par `admin_list_identities`. L'app lit l'identité du membre par
   `get_my_identity` ; process-diploma par `server_get_identity`.

## Sécurité : CSP et en-têtes HTTP (26 oct. 2026)

1. **Styles en ligne autorisés** (`style-src 'unsafe-inline'`) sur l'app comme sur le site : react-native-web et
   les attributs `style` des composants en dépendent. Les scripts, eux, n'ont aucune exception.
2. **Site rendu à chaque requête** : la CSP à nonce l'exige (une page générée au build n'a pas de nonce). La landing,
   le test et les pages légales ne sont plus prégénérés ; seules les images de partage du test le restent.
3. **`upgrade-insecure-requests`** : posé par le site seulement en HTTPS (pas en local). Sur l'app, Vercel sert
   toujours en HTTPS.
4. **zod en mode `jitless`** (schéma d'extraction partagé) : même résultat d'analyse, sans `new Function`.

## Emploi · site public et pages légales (24 oct. 2026)

- **Textes légaux alignés sur le contrat emploi, pas copiés mot pour mot.** Les brouillons Claude Docs (CGU candidats,
  conditions recruteurs, politique de confidentialité) parlaient encore d'une photo de candidat après le match, d'une
  adresse ou d'un « point de départ » pour le temps de trajet, de cinq compétences et d'un email révélé au match. Les
  pages publiques suivent `docs/EMPLOI_CONTRACT.md` : aucune photo de candidat (E4), distance depuis le centre de la ville
  de recherche sans adresse (E6), dix compétences au plus, prénom et nom seuls au match (E9). Les quotas et durées
  repris du contrat : 400 caractères et 20 invitations par semaine et par entreprise pour l'approche directe, effacement
  des notes, messages et mots 6 mois après la clôture d'une candidature.
- **Retirés des pages publiques** : notes « [Juriste] », listes « Points à vérifier avec l'avocat », cases à cocher de
  mise en ligne, sources. Les passages « [À compléter] » restent visibles, avec le bandeau « Version provisoire » tant
  que `NEXT_PUBLIC_LEGAL_PAGES_READY` n'est pas `true`. Les listes imbriquées et titres `###` des brouillons sont mis à
  plat (le rendu Markdown des pages légales ne gère que `##`, listes simples et tableaux).
- **Politique de confidentialité en Markdown** (`content/legal/confidentialite.md`) au lieu de la page codée en dur du
  dating. Elle prend le bandeau « Version provisoire » et le `noindex` comme les autres textes, mais reste toujours liée
  au pied de page. Jetons `{{contactEmail}}`, `{{privacyEmail}}`, `{{privacyUpdatedAt}}` remplacés à la lecture
  (`readLegal`).
- **Signaler une conversation ou une invitation** : la base ne prévoit que `report_offer` ; les CGU renvoient ces
  signalements vers l'email de contact.
- **Liste d'attente** : le formulaire est retiré, la table `waitlist_signups` n'est pas touchée.

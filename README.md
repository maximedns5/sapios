# Sapios

Sapios Emploi : recrutement à l'aveugle, diplôme vérifié. Contrat du produit : [`docs/EMPLOI_CONTRACT.md`](docs/EMPLOI_CONTRACT.md). Plateforme commune (comptes, admins, diplômes, conformité) : [`docs/CONTRACT.md`](docs/CONTRACT.md). L'application de rencontre d'origine est retirée ; son code reste dans la branche `archive/dating` et son brief dans [`docs/SAPIOS_BRIEF.md`](docs/SAPIOS_BRIEF.md). Écarts assumés : [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md). Demandes entre modules : [`docs/HANDOFF.md`](docs/HANDOFF.md). Emails (Resend, SMTP, gabarits) : [`docs/EMAILS.md`](docs/EMAILS.md).

## Structure

| Dossier | Contenu |
|---|---|
| `supabase/migrations` | Schéma Postgres, RLS, fonctions SQL, Storage, file `pgmq`, `pg_cron`, Realtime |
| `supabase/seed.sql`, `supabase/seed/` | Comptes de test, entreprises, offres et photos de démonstration, diplôme de démonstration |
| `supabase/tests` | Tests pgTAP |
| `supabase/functions` | Edge Functions Deno : `submit-diploma`, `process-diploma`, `review-diploma`, `notify`, `delete-account`, `purge-diplomas`, `purge-inactive`, `company-lookup`, `geocode`, et la fonction transitoire `purge-dating-photos` |
| `supabase/templates` | Emails d'authentification (lien + code à 6 chiffres), à recopier dans le dashboard des projets hébergés |
| `packages/shared` | Enums, schéma d'extraction zod, signaux, types des Edge Functions, types générés de la base |
| `apps/web` | Next.js : site public (`/`), pages légales, espace recruteur (`/recruteur`), back-office (`/admin`) |
| `apps/mobile` | Expo (expo-router) : app candidat |

## Développement local

Prérequis : Node 22, pnpm 10, Docker, Deno 2 (tests des Edge Functions).

```sh
pnpm install
pnpm db:start          # stack Supabase locale
pnpm db:reset          # migrations + seed + fichiers de démonstration
pnpm db:test           # pgTAP
pnpm db:types          # régénère packages/shared/src/database.types.ts

cp supabase/functions/.env.example supabase/functions/.env
cp apps/web/.env.example apps/web/.env.local       # URL et clé anon : `npx supabase status`
cp apps/mobile/.env.example apps/mobile/.env

pnpm --filter web dev                  # http://localhost:3000
pnpm --filter @sapios/mobile start     # Expo
```

Emails locaux (codes de connexion) : Mailpit, http://127.0.0.1:54324. Les emails de `notify` (Resend) restent désactivés sans `RESEND_API_KEY` : voir [`docs/EMAILS.md`](docs/EMAILS.md).

Comptes de test (mot de passe `sapios-test-password`) : `admin@sapios.test`, `pending@sapios.test`, et ceux de l'emploi (`camille@sapios.test`, `thomas@maisonverte.test`…). Détail dans `docs/CONTRACT.md` §7 et `docs/EMPLOI_CONTRACT.md` §9.

## Vérifications

```sh
pnpm db:test
cd supabase/functions && deno test --config process-diploma/deno.json --allow-read --allow-env _shared/*_test.ts process-diploma/*_test.ts
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web build
pnpm --filter @sapios/mobile typecheck
```

La CI (`.github/workflows/ci.yml`) lance tout cela à chaque pull request.

## Staging et production (à faire)

1. Deux projets Supabase en région UE (Francfort) : `sapios-staging`, `sapios-prod`.
   Déploiement : `.github/workflows/deploy.yml` (staging après une CI verte sur `main`, production à la main). Secrets par environnement GitHub `staging` et `production` : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`.
2. Secrets des Edge Functions (`supabase secrets set`) : `ANTHROPIC_API_KEY`, `EXPO_ACCESS_TOKEN`, `SAPIOS_INTERNAL_SECRET`, et pour les emails `RESEND_API_KEY`, `EMAIL_FROM`, `SAPIOS_APP_URL`, `SAPIOS_WEB_URL` ([`docs/EMAILS.md`](docs/EMAILS.md) §4).
3. Secrets Vault `project_url` et `internal_secret` : voir l'en-tête de `supabase/seed.sql`.
4. Auth : URL de redirection `https://<domaine>/admin/auth/callback` et `sapios://`, fournisseurs Apple et Google, SMTP Resend et gabarits des emails : [`docs/EMAILS.md`](docs/EMAILS.md) §5 et §6 (sans SMTP, seuls les membres de l'équipe Supabase reçoivent leur code).
5. Ne jamais exposer la clé `service_role` hors des Edge Functions.

### Back-office et landing sur Vercel

1. Vercel → *Add New → Project* → importer `maximedns5/sapios`.
2. *Root Directory* : `apps/web` (Next.js est détecté ; laisser « Include files outside the root directory » activé pour `packages/shared`).
3. Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL` (`https://<Project ID>.supabase.co`) et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publique `anon`) du projet visé ; facultatif : `NEXT_PUBLIC_APP_URL` (adresse de l’application candidat, cible du bouton « Je cherche un emploi » ; sans elle, le bouton mène à « Comment ça marche »), `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`, `NEXT_PUBLIC_SITE_URL` (adresse publique du site, ex. `https://sapios.fr`, utilisée pour les aperçus de liens, le plan du site et `robots.txt` ; à défaut, le domaine de production Vercel).
4. Supabase → *Authentication → URL Configuration* : *Site URL* = l'URL Vercel, et `https://<url-vercel>/**` dans les *Redirect URLs*.

### App membre sur Vercel

L'app Expo (`apps/mobile`) est publiée en site web, sur un second projet Vercel, distinct du site. Elle est liée depuis le bouton « Je cherche un emploi » (`NEXT_PUBLIC_APP_URL`) et n'est pas indexée : `noindex` dans la page et en en-tête `X-Robots-Tag`, `robots.txt` qui interdit tout.

1. Vercel → *Add New → Project* → importer à nouveau `maximedns5/sapios` (un projet par application, même dépôt).
2. *Root Directory* : `apps/mobile`, *Framework Preset* : *Other*. Laisser « Include files outside the root directory » activé (`packages/shared`, lockfile pnpm à la racine). Node 22.
3. Le reste vient de `apps/mobile/vercel.json` : build `pnpm exec expo export --platform web`, sortie `dist`, toute URL sans fichier servie par `index.html` (un rechargement de `/chat/…` ou `/messages?m=…` fonctionne), `/_expo/static` et `/assets` en cache immuable (noms hachés), `index.html` revalidé à chaque visite.
4. Variables d'environnement (lues au build, donc *Redeploy* après modification) : `EXPO_PUBLIC_SUPABASE_URL` (`https://<Project ID>.supabase.co`) et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (clé publique `anon`). Il en manque une : le build échoue en la nommant. Facultatif : `EXPO_PUBLIC_CONTACT_EMAIL`. Jamais `EXPO_PUBLIC_ENABLE_PASSWORD_LOGIN` hors préproduction (connexion par mot de passe des comptes de test).
5. Supabase → *Authentication → URL Configuration* : ajouter `https://<url-app-vercel>/**` aux *Redirect URLs* (et l'adresse de préproduction, ex. `https://<projet>-*-<équipe>.vercel.app/**`). Sur le web, le lien magique et la connexion Google reviennent sur `https://<url-app>/auth/callback` ; une adresse absente de la liste renvoie sur la *Site URL* (la landing) et la connexion échoue.

Choix de sortie : `web.output: "single"` (une seule page, routage côté navigateur). Tout l'écran dépend de la session gardée dans `localStorage` et de `get_emploi_state()` ; un rendu statique par route n'apporterait ni référencement (non voulu) ni contenu utile, et devrait rendre côté serveur des modules natifs.

Vérifier en local : `apps/mobile/.env` rempli, `pnpm --filter @sapios/mobile export:web`, puis servir `apps/mobile/dist` avec une réécriture vers `index.html` (comportement de `vercel.json`) ; pour tester le lien magique, servir sur `http://localhost:3000`, déjà dans les Redirect URLs locales.

Sur le web, pas de push : les messages arrivent par l'abonnement Realtime, et l'état du compte (`get_emploi_state()`) est relu au retour sur l'onglet.

### Mode manuel

Sans `ANTHROPIC_API_KEY`, chaque diplôme part en revue humaine sans extraction IA (marqueur `manual_review`). Ajouter la clé dans les secrets des Edge Functions réactive l'extraction.

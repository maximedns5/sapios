# Sapios

Application de rencontre réservée aux diplômés : le niveau du diplôme validé ouvre ou ferme l'accès. Brief produit : [`docs/SAPIOS_BRIEF.md`](docs/SAPIOS_BRIEF.md). Contrat d'interface entre modules : [`docs/CONTRACT.md`](docs/CONTRACT.md). Écarts assumés : [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md). Demandes entre modules : [`docs/HANDOFF.md`](docs/HANDOFF.md). Emails (Resend, SMTP, gabarits) : [`docs/EMAILS.md`](docs/EMAILS.md).

## Structure

| Dossier | Contenu |
|---|---|
| `supabase/migrations` | Schéma Postgres, RLS, fonctions SQL, Storage, file `pgmq`, `pg_cron`, Realtime |
| `supabase/seed.sql`, `supabase/seed/` | Paliers, textes, comptes de test, photos et diplôme de démonstration |
| `supabase/tests` | Tests pgTAP (dont les 8 tests obligatoires du brief §10) |
| `supabase/functions` | Edge Functions Deno : `submit-diploma`, `process-diploma`, `review-diploma`, `notify`, `delete-account`, `purge-diplomas` |
| `supabase/templates` | Emails d'authentification (lien + code à 6 chiffres), à recopier dans le dashboard des projets hébergés |
| `packages/shared` | Enums, schéma d'extraction zod, signaux, types des Edge Functions, types générés de la base |
| `apps/web` | Next.js : landing (`/`), pages légales, back-office (`/admin`) |
| `apps/mobile` | Expo (expo-router) : parcours membre complet |

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

Emails locaux (codes de connexion) : Mailpit, http://127.0.0.1:54324. Les emails de verdict et de match (Resend) restent désactivés sans `RESEND_API_KEY` : voir [`docs/EMAILS.md`](docs/EMAILS.md).

Comptes de test (mot de passe `sapios-test-password`) : `admin@`, `unlimited@`, `standard@`, `standard2@`, `waitlist@`, `refused@`, `uninstall@`, `pending@`, `onboarding@`, `member01@`… `member13@sapios.test`. Détail dans `docs/CONTRACT.md` §7.

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
2. Secrets des Edge Functions (`supabase secrets set`) : `ANTHROPIC_API_KEY`, `EXPO_ACCESS_TOKEN`, `SAPIOS_INTERNAL_SECRET`, et pour les emails de verdict et de match `RESEND_API_KEY`, `EMAIL_FROM`, `SAPIOS_APP_URL` ([`docs/EMAILS.md`](docs/EMAILS.md) §4).
3. Secrets Vault `project_url` et `internal_secret` : voir l'en-tête de `supabase/seed.sql`.
4. Auth : URL de redirection `https://<domaine>/admin/auth/callback` et `sapios://`, fournisseurs Apple et Google, SMTP Resend et gabarits des emails : [`docs/EMAILS.md`](docs/EMAILS.md) §5 et §6 (sans SMTP, seuls les membres de l'équipe Supabase reçoivent leur code).
5. Ne jamais exposer la clé `service_role` hors des Edge Functions.

### Back-office et landing sur Vercel

1. Vercel → *Add New → Project* → importer `maximedns5/sapios`.
2. *Root Directory* : `apps/web` (Next.js est détecté ; laisser « Include files outside the root directory » activé pour `packages/shared`).
3. Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL` (`https://<Project ID>.supabase.co`) et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publique `anon`) du projet visé ; facultatif : `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`.
4. Supabase → *Authentication → URL Configuration* : *Site URL* = l'URL Vercel, et `https://<url-vercel>/**` dans les *Redirect URLs*.

### Mode manuel

Sans `ANTHROPIC_API_KEY`, chaque diplôme part en revue humaine sans extraction IA (marqueur `manual_review`). Ajouter la clé dans les secrets des Edge Functions réactive l'extraction.

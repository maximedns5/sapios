# Sapios

Application de rencontre réservée aux diplômés : le niveau du diplôme validé ouvre ou ferme l'accès. Brief produit : [`docs/SAPIOS_BRIEF.md`](docs/SAPIOS_BRIEF.md). Contrat d'interface entre modules : [`docs/CONTRACT.md`](docs/CONTRACT.md). Écarts assumés : [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md). Demandes entre modules : [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Structure

| Dossier | Contenu |
|---|---|
| `supabase/migrations` | Schéma Postgres, RLS, fonctions SQL, Storage, file `pgmq`, `pg_cron`, Realtime |
| `supabase/seed.sql`, `supabase/seed/` | Paliers, textes, comptes de test, photos et diplôme de démonstration |
| `supabase/tests` | Tests pgTAP (dont les 8 tests obligatoires du brief §10) |
| `supabase/functions` | Edge Functions Deno : `submit-diploma`, `process-diploma`, `review-diploma`, `notify`, `delete-account`, `purge-diplomas` |
| `supabase/templates` | Emails d'authentification (lien + code à 6 chiffres) |
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

Emails locaux (codes de connexion) : Mailpit, http://127.0.0.1:54324.

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
2. Secrets des Edge Functions (`supabase secrets set`) : `ANTHROPIC_API_KEY`, `EXPO_ACCESS_TOKEN`, `SAPIOS_INTERNAL_SECRET`.
3. Secrets Vault `project_url` et `internal_secret` : voir l'en-tête de `supabase/seed.sql`.
4. Auth : URL de redirection `https://<domaine>/admin/auth/callback` et `sapios://`, fournisseurs Apple et Google, SMTP.
5. Ne jamais exposer la clé `service_role` hors des Edge Functions.

// Tâche quotidienne (pg_cron → pg_net, en-tête x-sapios-secret) : suppression des comptes inactifs
// avertis depuis plus de `inactive_grace_days` (conformité, AIPD section 7). Jamais un admin ; un
// membre revenu entre la liste et la suppression est sauté (revérification par compte).
import { purgeInactive, purgeInactiveDeps } from "../_shared/account.ts";
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { handle, json } from "../_shared/http.ts";
import type { PurgeInactiveResponse } from "../_shared/shared.ts";

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  return json(await purgeInactive(purgeInactiveDeps(adminClient())) satisfies PurgeInactiveResponse);
}));

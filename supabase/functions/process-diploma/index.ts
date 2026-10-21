// Appelée chaque minute par pg_cron (via pg_net) avec l'en-tête x-sapios-secret. Corps : `{}`.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { extractorFromEnv } from "../_shared/extractor.ts";
import { handle, json } from "../_shared/http.ts";
import type { ProcessDiplomaResponse } from "../_shared/shared.ts";
import { processQueue } from "./process.ts";
import { createProcessStore } from "./store.ts";

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const processed = await processQueue({
    store: createProcessStore(adminClient()),
    extract: extractorFromEnv(),
    log: (msg, extra) => console.warn(`[process-diploma] ${msg}`, extra ?? ""),
  });
  return json({ processed } satisfies ProcessDiplomaResponse);
}));

// Géocodage d'une ville (zone de recherche du candidat) ou d'une adresse (lieu d'une offre)
// (docs/EMPLOI_CONTRACT.md §5). Quota par compte en base ; rien n'est journalisé.
import { adminClient, requireUser } from "../_shared/auth.ts";
import { GEOCODE_LIMIT, RATE_WINDOW_SECONDS } from "../_shared/emploi.ts";
import { geocode, parseGeoQuery } from "../_shared/geocode.ts";
import { handle, HttpError, json, readJsonObject } from "../_shared/http.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);
  const { q, kind } = parseGeoQuery(await readJsonObject(req));

  const { data: allowed, error } = await db.rpc("consume_rate_limit", {
    p_user: user.id,
    p_bucket: "geocode",
    p_limit: GEOCODE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (error) throw error;
  if (allowed !== true) throw new HttpError(429, "rate_limited");

  return json({ results: await geocode(q, kind) });
}, { cors: true }));

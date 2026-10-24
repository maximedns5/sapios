// Recherche d'une entreprise par SIREN pour l'inscription d'un recruteur (docs/EMPLOI_CONTRACT.md §5).
// Réservée aux comptes recruteurs ; quota par compte en base ; rien n'est journalisé.
import { adminClient, requireUser } from "../_shared/auth.ts";
import { lookupCompany, parseSiren } from "../_shared/company.ts";
import { COMPANY_LOOKUP_LIMIT, RATE_WINDOW_SECONDS } from "../_shared/emploi.ts";
import { handle, HttpError, json, readJsonObject } from "../_shared/http.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);
  const siren = parseSiren((await readJsonObject(req)).siren);

  const kind = await db.from("emploi_accounts").select("kind").eq("user_id", user.id).maybeSingle();
  if (kind.error) throw kind.error;
  if (kind.data?.kind !== "recruiter") throw new HttpError(403, "not_recruiter");

  const { data: allowed, error } = await db.rpc("consume_rate_limit", {
    p_user: user.id,
    p_bucket: "company_lookup",
    p_limit: COMPANY_LOOKUP_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (error) throw error;
  if (allowed !== true) throw new HttpError(429, "rate_limited");

  return json(await lookupCompany(siren));
}, { cors: true }));

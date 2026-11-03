// Réinitialisation de la double authentification d'un recruteur qui a perdu son téléphone, par un admin
// (`is_admin()` évalué avec son JWT, donc en session aal2) : facteurs supprimés par l'API Auth admin, trace
// dans `audit_log`. Le recruteur enregistre une nouvelle application à sa prochaine visite de « Sécurité ».
import { adminClient, requireAdmin } from "../_shared/auth.ts";
import { asString, handle, HttpError, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { MFA_RESET_REASON_MAX, MFA_RESET_REASON_MIN, type MfaResetResponse, resetRecruiterMfa } from "../_shared/mfa.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireAdmin(req, db);
  const body = await readJsonObject(req);
  const reason = asString(body.reason)?.trim() ?? "";
  if (!isUuid(body.user_id) || reason.length < MFA_RESET_REASON_MIN || reason.length > MFA_RESET_REASON_MAX) {
    throw new HttpError(400, "invalid_input");
  }
  const result: MfaResetResponse = await resetRecruiterMfa(db, user.id, body.user_id, reason);
  return json(result);
}, { cors: true }));

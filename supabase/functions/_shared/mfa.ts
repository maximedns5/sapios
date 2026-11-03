// Double authentification des recruteurs : contrôle de la session (delete-account) et réinitialisation par
// un admin (admin-reset-mfa) quand un recruteur a perdu son téléphone.
import type { SupabaseClient } from "./deps.ts";
import { HttpError } from "./http.ts";

export const MFA_RESET_REASON_MIN = 3;
export const MFA_RESET_REASON_MAX = 500;

/**
 * Exige une session suffisante : un compte qui a un facteur vérifié doit être en aal2
 * (`public.mfa_session_ok()`, évaluée avec le JWT du membre). Sans facteur, toute session passe.
 */
export async function requireMfaSession(user: SupabaseClient): Promise<void> {
  const { data, error } = await user.rpc("mfa_session_ok");
  if (error) throw error;
  if (data !== true) throw new HttpError(403, "mfa_required");
}

export interface MfaResetResponse {
  removed: number;
}

/**
 * Supprime les facteurs MFA d'un recruteur, pour qu'il en enregistre un nouveau à sa prochaine connexion.
 * Réservé aux membres d'une entreprise : un compte admin se réinitialise dans Supabase, pas ici. Journalisé.
 */
export async function resetRecruiterMfa(
  db: SupabaseClient,
  adminId: string,
  userId: string,
  reason: string,
): Promise<MfaResetResponse> {
  const member = await db.from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
  if (member.error) throw member.error;
  if (!member.data) throw new HttpError(404, "not_found");
  const admin = await db.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (admin.error) throw admin.error;
  if (admin.data) throw new HttpError(403, "forbidden");

  const listed = await db.auth.admin.mfa.listFactors({ userId });
  if (listed.error) throw listed.error;
  let removed = 0;
  for (const factor of listed.data?.factors ?? []) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (error) throw error;
    removed++;
  }

  const logged = await db.from("audit_log").insert({
    actor_id: adminId,
    action: "recruiter.mfa_reset",
    entity: "user",
    entity_id: userId,
    payload: { reason, removed, company_id: (member.data as { company_id: string }).company_id },
  });
  if (logged.error) throw logged.error;
  return { removed };
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Double authentification du back-office (TOTP). `public.is_admin()` exige une session aal2 :
// sans elle, aucune RPC ni règle d'accès d'admin ne passe, quoi qu'affichent ces écrans.

/** Ligne de facteur telle que la renvoie `auth.mfa.listFactors()`. */
export interface TotpFactor {
  id: string;
  friendly_name?: string | null;
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
}

/**
 * Vrai si le compte connecté figure parmi les admins, quel que soit son niveau d'authentification.
 * Sert seulement à aiguiller vers l'enrôlement ou la vérification ; `null` si la base ne répond pas.
 * Appel non typé : la fonction est plus récente que les types partagés générés.
 */
export async function isAdminAccount(supabase: SupabaseClient): Promise<boolean | null> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc("is_admin_account");
  if (error) return null;
  return data === true;
}

/** Facteurs TOTP vérifiés du compte connecté. */
export async function verifiedFactors(supabase: SupabaseClient): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return ((data?.totp ?? []) as TotpFactor[]).filter((f) => f.status === "verified");
}

/** Supprime les enrôlements commencés et jamais validés (rechargement de page, abandon). */
export async function dropUnverifiedFactors(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  const all = ((data?.all ?? []) as Array<TotpFactor & { factor_type?: string }>).filter(
    (f) => f.status === "unverified" && (f.factor_type ?? "totp") === "totp",
  );
  for (const f of all) await supabase.auth.mfa.unenroll({ factorId: f.id });
}

/** Libellé lisible d'un secret TOTP : groupes de 4 caractères. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export const MFA_MESSAGES = {
  invalid: "Code refusé. Vérifiez l’heure de votre téléphone et saisissez le code affiché maintenant.",
  enroll: "Impossible de préparer l’enregistrement. Rechargez la page ; si l’erreur persiste, la double authentification n’est peut-être pas activée dans Supabase.",
  generic: "Opération impossible pour l’instant. Réessayez dans un instant.",
} as const;

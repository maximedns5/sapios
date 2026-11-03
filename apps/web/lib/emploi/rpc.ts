import type { SupabaseClient } from "@supabase/supabase-js";

// Les RPC et tables de l'emploi (docs/EMPLOI_CONTRACT.md) n'entrent dans `database.types.ts` qu'avec la
// migration de la base : en attendant, on les appelle sans typage généré, et on type la réponse avec les
// formes de `@sapios/shared` (emploi.ts), qui font foi.
type Untyped = SupabaseClient;

/** Client Supabase sans typage généré (mêmes droits : clé anon et session de l'utilisateur). */
export function untyped(client: unknown): Untyped {
  return client as Untyped;
}

/** Page du code à 6 chiffres des recruteurs protégés par la double authentification. */
export const MFA_CHALLENGE_PATH = "/recruteur/double-authentification";

export async function rpc<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: unknown }> {
  const { data, error } = await untyped(client).rpc(fn, args ?? {});
  // Session aal1 d'un compte protégé (expirée ou ouverte ailleurs) : retour au code, côté serveur comme navigateur.
  if ((error as { message?: string } | null)?.message === "mfa_required") {
    if (typeof window === "undefined") {
      const { redirect } = await import("next/navigation");
      redirect(MFA_CHALLENGE_PATH);
    } else {
      // Hors rendu (gestionnaires d'événements, effets) : rechargement complet vers le code, la session est relue.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- appelé hors des composants
      window.location.assign(MFA_CHALLENGE_PATH);
    }
  }
  return { data: (data as T | null) ?? null, error: error ?? null };
}

/** Appel qui doit réussir : lève l'erreur PostgREST telle quelle (à passer à `describeEmploiError`). */
export async function rpcOrThrow<T>(client: unknown, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc<T>(client, fn, args);
  if (error) throw error;
  return data as T;
}

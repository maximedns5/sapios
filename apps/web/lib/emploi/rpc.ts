import type { SupabaseClient } from "@supabase/supabase-js";

// Les RPC et tables de l'emploi (docs/EMPLOI_CONTRACT.md) n'entrent dans `database.types.ts` qu'avec la
// migration de la base : en attendant, on les appelle sans typage généré, et on type la réponse avec les
// formes de `@sapios/shared` (emploi.ts), qui font foi.
type Untyped = SupabaseClient;

/** Client Supabase sans typage généré (mêmes droits : clé anon et session de l'utilisateur). */
export function untyped(client: unknown): Untyped {
  return client as Untyped;
}

export async function rpc<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: unknown }> {
  const { data, error } = await untyped(client).rpc(fn, args ?? {});
  return { data: (data as T | null) ?? null, error: error ?? null };
}

/** Appel qui doit réussir : lève l'erreur PostgREST telle quelle (à passer à `describeEmploiError`). */
export async function rpcOrThrow<T>(client: unknown, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc<T>(client, fn, args);
  if (error) throw error;
  return data as T;
}

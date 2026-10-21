import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@sapios/shared";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Client navigateur : clé anon + session de l'utilisateur (cookies). */
export function createClient() {
  assertSupabaseEnv();
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

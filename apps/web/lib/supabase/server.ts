import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@sapios/shared";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Client serveur (composants serveur) : lit la session dans les cookies, clé anon uniquement. */
export async function createClient() {
  assertSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un composant serveur : le proxy se charge du rafraîchissement.
        }
      },
    },
  });
}

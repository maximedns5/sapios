// Seules la clé anon et l'URL publique sont lues : aucune clé service_role dans le web.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function assertSupabaseEnv(): void {
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    // Variables NEXT_PUBLIC_* : lues au build, un redéploiement est nécessaire après les avoir ajoutées.
    throw new Error(
      `Variable(s) manquante(s) au build : ${missing.join(", ")} (voir apps/web/.env.example). ` +
        "Sur Vercel : Settings → Environment Variables, puis Redeploy.",
    );
  }
}

import { createClient, type SupabaseClient, type User } from "./deps.ts";
import { HttpError } from "./http.ts";
import { INTERNAL_SECRET_HEADER } from "./shared.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, "misconfigured");
  return value;
}

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Client `service_role` : n'existe que dans les Edge Functions. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: noSession });
}

/** Client qui agit au nom de l'utilisateur (RLS et `auth.uid()` appliqués). */
export function userClient(token: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function requireUser(req: Request, admin: SupabaseClient): Promise<{ user: User; token: string }> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "unauthorized");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  return { user: data.user, token };
}

/** Utilisateur authentifié et admin selon `public.is_admin()`, évalué avec son propre JWT. */
export async function requireAdmin(req: Request, admin: SupabaseClient): Promise<{ user: User; token: string }> {
  const auth = await requireUser(req, admin);
  const { data, error } = await userClient(auth.token).rpc("is_admin");
  if (error) {
    console.error("is_admin", error);
    throw new HttpError(403, "forbidden");
  }
  if (data !== true) throw new HttpError(403, "forbidden");
  return auth;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Fonctions appelées par la base : secret partagé obligatoire, jamais d'accès sans lui. */
export function requireInternalSecret(req: Request, expected = Deno.env.get("SAPIOS_INTERNAL_SECRET")): void {
  if (!expected) throw new HttpError(500, "misconfigured");
  const given = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!given || !timingSafeEqual(given, expected)) throw new HttpError(401, "unauthorized");
}

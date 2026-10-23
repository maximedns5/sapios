import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Politique de sécurité du contenu (CSP) du site et du back-office : c'est le seul endroit où elle se
// règle. Un nonce neuf par requête : Next.js l'ajoute à ses propres scripts, le layout le pose sur le
// script de démarrage, et aucun autre script ne s'exécute ('strict-dynamic', ni 'unsafe-inline' ni
// 'unsafe-eval' en production). Ajouter une origine : dans la liste de la directive concernée.
// Casse en production : CSP_REPORT_ONLY=true sur Vercel (le navigateur signale sans bloquer), puis
// redéployer.
function contentSecurityPolicy(nonce: string, https: boolean): string {
  const supabase = supabaseOrigins();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React se sert d'eval en développement (piles d'erreurs), jamais en production.
      ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
    ],
    // Styles en ligne (attributs style, animations) : ils n'exécutent pas de code.
    "style-src": ["'self'", "'unsafe-inline'"],
    // data: pour le QR code de la double authentification ; Supabase pour les photos et diplômes signés.
    "img-src": ["'self'", "data:", "blob:", ...supabase.http],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabase.http, ...supabase.ws],
    // Diplôme en PDF dans le back-office : lien signé Supabase dans une iframe.
    "frame-src": supabase.http.length ? supabase.http : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

function supabaseOrigins(): { http: string[]; ws: string[] } {
  if (!SUPABASE_URL) return { http: [], ws: [] };
  try {
    const url = new URL(SUPABASE_URL);
    return { http: [url.origin], ws: [`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`] };
  } catch {
    return { http: [], ws: [] };
  }
}

const CSP_HEADER =
  process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy(nonce, https);

  // Next.js lit le nonce dans la CSP de la requête transmise au rendu.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set(CSP_HEADER, csp);
    return res;
  };

  let response = next();
  if (!request.nextUrl.pathname.startsWith("/admin") || !SUPABASE_URL || !SUPABASE_ANON_KEY) return response;

  // Back-office : rafraîchit la session Supabase (cookies) avant le rendu.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    {
      // Toutes les pages, sauf les fichiers statiques de Next et les icônes ; les préchargements de
      // next/link n'ont pas besoin de CSP.
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

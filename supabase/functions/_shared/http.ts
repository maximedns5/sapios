export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200, cors = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(cors ? corsHeaders : {}) },
  });
}

/** Corps JSON objet ; un corps vide vaut `{}`. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.trim() === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_body");
  return body as Record<string, unknown>;
}

/**
 * Point d'entrée commun : POST seulement, CORS pour les fonctions appelées depuis un navigateur,
 * erreurs métier `{ error: code }`, erreurs inattendues journalisées et masquées.
 */
export function handle(
  handler: (req: Request) => Promise<Response>,
  opts: { cors?: boolean } = {},
): (req: Request) => Promise<Response> {
  const cors = opts.cors ?? false;
  return async (req) => {
    if (cors && req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    try {
      const res = await handler(req);
      if (cors) for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status, cors);
      console.error(err);
      return json({ error: "internal_error" }, 500, cors);
    }
  };
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

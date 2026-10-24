// Géocodage d'une ville ou d'une adresse (fonction geocode) : relais vers le service de la Géoplateforme
// (IGN, ex-API Adresse), pour que le service ne voie jamais l'adresse IP du membre. Rien n'est journalisé.
import type { GeoResult } from "./emploi.ts";
import { HttpError } from "./http.ts";

export const GEOCODE_URL = "https://data.geopf.fr/geocodage/search";
export const GEOCODE_TIMEOUT_MS = 4000;
export const GEOCODE_MAX_RESULTS = 5;

// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export type GeoKind = "city" | "address";

export function parseGeoQuery(body: Record<string, unknown>): { q: string; kind: GeoKind } {
  const kind = body.kind === "address" ? "address" : body.kind === "city" || body.kind === undefined ? "city" : null;
  if (!kind || typeof body.q !== "string") throw new HttpError(400, "invalid_query");
  const q = body.q.normalize("NFC").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > 120) throw new HttpError(400, "invalid_query");
  return { q, kind };
}

export function geocodeUrl(q: string, kind: GeoKind): string {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(GEOCODE_MAX_RESULTS));
  url.searchParams.set("autocomplete", "1");
  if (kind === "city") url.searchParams.set("type", "municipality");
  return url.toString();
}

/** FeatureCollection GeoJSON → au plus 5 résultats complets. */
export function toGeoResults(payload: unknown): GeoResult[] {
  const features = (payload as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: GeoResult[] = [];
  for (const f of features) {
    const coords = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
    const p = ((f as { properties?: unknown })?.properties ?? {}) as Record<string, unknown>;
    if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") continue;
    const city = typeof p.city === "string" ? p.city : typeof p.name === "string" ? p.name : null;
    const label = typeof p.label === "string" ? p.label : city;
    if (!city || !label) continue;
    const postcode = typeof p.postcode === "string" && /^\d{5}$/.test(p.postcode) ? p.postcode : null;
    out.push({ label: label.slice(0, 200), city: city.slice(0, 80), postcode, lat: coords[1], lng: coords[0] });
    if (out.length >= GEOCODE_MAX_RESULTS) break;
  }
  return out;
}

export async function geocode(q: string, kind: GeoKind, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<GeoResult[]> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? GEOCODE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(geocodeUrl(q, kind), { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch {
    throw new HttpError(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new HttpError(502, "upstream_unavailable");
  return toGeoResults(await res.json().catch(() => null));
}

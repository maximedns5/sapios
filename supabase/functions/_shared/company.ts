// Recherche d'une entreprise par son SIREN (fonction company-lookup) : relais vers l'API publique
// Recherche d'entreprises (recherche-entreprises.api.gouv.fr, données Sirene de l'Insee, sans clé).
// Ni la requête ni la réponse ne sont journalisées ; une panne ne renvoie qu'un code.
import { type CompanyLookup, isValidSiren } from "./emploi.ts";
import { HttpError } from "./http.ts";

export const COMPANY_SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";
export const COMPANY_LOOKUP_TIMEOUT_MS = 5000;

/** Tranches d'effectif salarié de l'Insee (code → libellé). */
export const HEADCOUNT_BANDS: Record<string, string> = {
  "NN": "Non renseigné",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

/** SIREN saisi (espaces tolérés), clé de Luhn vérifiée, sinon `invalid_siren`. */
export function parseSiren(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "invalid_siren");
  const siren = value.replace(/\s/g, "");
  if (!isValidSiren(siren)) throw new HttpError(400, "invalid_siren");
  return siren;
}

export function companySearchUrl(siren: string): string {
  const url = new URL(COMPANY_SEARCH_URL);
  url.searchParams.set("q", siren);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "5");
  return url.toString();
}

function str(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

/** Réponse de l'API → CompanyLookup du SIREN demandé, ou null s'il n'y figure pas. */
export function toCompanyLookup(payload: unknown, siren: string): CompanyLookup | null {
  const results = (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  const hit = results.find((r) => r && typeof r === "object" && (r as { siren?: unknown }).siren === siren) as
    | Record<string, unknown>
    | undefined;
  if (!hit) return null;
  const siege = (hit.siege && typeof hit.siege === "object" ? hit.siege : {}) as Record<string, unknown>;
  const band = str(hit.tranche_effectif_salarie, 4);
  const postcode = str(siege.code_postal, 5);
  return {
    siren,
    legal_name: str(hit.nom_raison_sociale) ?? str(hit.nom_complet) ?? siren,
    naf_code: str(hit.activite_principale, 10),
    naf_label: str(hit.libelle_activite_principale),
    headcount_band: band ? HEADCOUNT_BANDS[band] ?? null : null,
    address: str(siege.adresse),
    city: str(siege.libelle_commune, 80),
    postcode: postcode && /^\d{5}$/.test(postcode) ? postcode : null,
    created_on: str(hit.date_creation, 10),
    active: hit.etat_administratif === "A",
    diffusion: hit.statut_diffusion === "P" ? "P" : "O",
  };
}

export type CompanyLookupOptions = { fetch?: typeof fetch; timeoutMs?: number };

export async function lookupCompany(siren: string, opts: CompanyLookupOptions = {}): Promise<CompanyLookup> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? COMPANY_LOOKUP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(companySearchUrl(siren), { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch {
    throw new HttpError(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new HttpError(429, "rate_limited");
  if (!res.ok) throw new HttpError(502, "upstream_unavailable");
  const found = toCompanyLookup(await res.json().catch(() => null), siren);
  if (!found) throw new HttpError(404, "not_found");
  return found;
}

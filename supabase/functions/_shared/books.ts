// Recherche de livres par Open Library, relayée par la fonction search-books (FEATURES §1,
// « Prestataires ») : le service ne reçoit que le texte cherché, jamais l'adresse du membre.
// Ni la requête ni la réponse ne sont journalisées ; une panne ne renvoie qu'un code.
import { HttpError } from "./http.ts";
import {
  BOOK_AUTHOR_MAX_LENGTH,
  BOOK_SEARCH_MAX_LENGTH,
  BOOK_SEARCH_MAX_RESULTS,
  BOOK_SEARCH_MIN_LENGTH,
  BOOK_TITLE_MAX_LENGTH,
  type BookSuggestion,
} from "./shared.ts";

export const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
export const BOOK_SEARCH_TIMEOUT_MS = 4000;

// Caractères de contrôle (C0 et DEL), remplacés par une espace : volontaire.
// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const WORK_KEY = /^\/works\/(OL[0-9]+W)$/;

/** Texte cherché : chaîne de 2 à 100 caractères après nettoyage, sinon `invalid_query`. */
export function parseBookQuery(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "invalid_query");
  const q = value.normalize("NFC").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (q.length < BOOK_SEARCH_MIN_LENGTH || q.length > BOOK_SEARCH_MAX_LENGTH) {
    throw new HttpError(400, "invalid_query");
  }
  return q;
}

/** URL de recherche : seulement les champs utiles, quelques résultats de plus pour dédoublonner. */
export function bookSearchUrl(q: string): string {
  const url = new URL(OPEN_LIBRARY_SEARCH_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "key,title,author_name");
  url.searchParams.set("limit", String(BOOK_SEARCH_MAX_RESULTS * 2));
  url.searchParams.set("lang", "fr");
  return url.toString();
}

function clip(text: string, max: number): string {
  const clean = text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

/** Réponse d'Open Library → au plus 8 suggestions : titre, premier auteur, identifiant d'œuvre. */
export function toBookSuggestions(payload: unknown): BookSuggestion[] {
  const docs = (payload as { docs?: unknown } | null)?.docs;
  if (!Array.isArray(docs)) return [];
  const seen = new Set<string>();
  const out: BookSuggestion[] = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const d = doc as { key?: unknown; title?: unknown; author_name?: unknown };
    if (typeof d.title !== "string") continue;
    const title = clip(d.title, BOOK_TITLE_MAX_LENGTH);
    if (!title) continue;
    const first = Array.isArray(d.author_name) ? d.author_name.find((a) => typeof a === "string") : undefined;
    const author = typeof first === "string" ? clip(first, BOOK_AUTHOR_MAX_LENGTH) || null : null;
    const work = typeof d.key === "string" ? WORK_KEY.exec(d.key)?.[1] ?? null : null;
    const dedupe = `${title.toLocaleLowerCase("fr")}|${(author ?? "").toLocaleLowerCase("fr")}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ title, author, ol_work_id: work });
    if (out.length >= BOOK_SEARCH_MAX_RESULTS) break;
  }
  return out;
}

/** En-tête User-Agent demandé par Open Library : nom du service et contact. */
export function bookSearchUserAgent(contact = Deno.env.get("SAPIOS_CONTACT_EMAIL") ?? "contact@sapios.app"): string {
  return `Sapios/1.0 (${contact})`;
}

export type BookSearchOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

/**
 * Appel à Open Library avec délai court. Toute panne (réseau, délai, statut, JSON) devient
 * `upstream_unavailable` sans message : l'URL, qui contient la recherche, n'est jamais journalisée.
 */
export async function searchOpenLibrary(q: string, opts: BookSearchOptions = {}): Promise<BookSuggestion[]> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? BOOK_SEARCH_TIMEOUT_MS);
  try {
    const res = await doFetch(bookSearchUrl(q), {
      headers: { "User-Agent": opts.userAgent ?? bookSearchUserAgent(), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new HttpError(502, "upstream_unavailable");
    }
    return toBookSuggestions(await res.json());
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

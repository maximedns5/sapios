// Recherche de livres pour « Ma bibliothèque » : relais authentifié vers Open Library, pour que le
// service ne voie jamais l'adresse du membre. Quota par membre en base ; rien n'est journalisé.
import { adminClient, requireUser } from "../_shared/auth.ts";
import { parseBookQuery, searchOpenLibrary } from "../_shared/books.ts";
import { handle, HttpError, json, readJsonObject } from "../_shared/http.ts";
import { BOOK_SEARCH_LIMIT, BOOK_SEARCH_WINDOW_SECONDS, type SearchBooksResponse } from "../_shared/shared.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);
  const q = parseBookQuery((await readJsonObject(req)).q);

  const { data: allowed, error } = await db.rpc("consume_rate_limit", {
    p_user: user.id,
    p_bucket: "book_search",
    p_limit: BOOK_SEARCH_LIMIT,
    p_window_seconds: BOOK_SEARCH_WINDOW_SECONDS,
  });
  if (error) throw error;
  if (allowed !== true) throw new HttpError(429, "rate_limited");

  const results = await searchOpenLibrary(q);
  return json({ results } satisfies SearchBooksResponse);
}, { cors: true }));

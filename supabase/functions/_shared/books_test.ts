import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  bookSearchUrl,
  bookSearchUserAgent,
  parseBookQuery,
  searchOpenLibrary,
  toBookSuggestions,
} from "./books.ts";
import { HttpError } from "./http.ts";

Deno.test("parseBookQuery : nettoie et borne le texte cherché", () => {
  assertEquals(parseBookQuery("  Les   Essais\n "), "Les Essais");
  assertEquals(parseBookQuery("Montaigne\u0000"), "Montaigne");
  for (const bad of [undefined, null, 42, "", " a ", "x".repeat(101)]) {
    const err = assertThrows(() => parseBookQuery(bad), HttpError);
    assertEquals(err.code, "invalid_query");
    assertEquals(err.status, 400);
  }
});

Deno.test("bookSearchUrl : champs utiles seulement, langue française", () => {
  const url = new URL(bookSearchUrl("la montagne magique"));
  assertEquals(url.origin + url.pathname, "https://openlibrary.org/search.json");
  assertEquals(url.searchParams.get("q"), "la montagne magique");
  assertEquals(url.searchParams.get("fields"), "key,title,author_name");
  assertEquals(url.searchParams.get("lang"), "fr");
});

Deno.test("toBookSuggestions : titre, premier auteur, identifiant d'œuvre, sans doublon", () => {
  const out = toBookSuggestions({
    docs: [
      { key: "/works/OL45804W", title: "Les Essais", author_name: ["Michel de Montaigne", "Autre"] },
      { key: "/works/OL45804W", title: "Les essais", author_name: ["Michel de Montaigne"] },
      { key: "/books/OL1M", title: "Sans œuvre" },
      { key: "/works/OL9W", title: 42 },
      { title: "   " },
      "pas un objet",
      { key: "/works/OL7W", title: "T".repeat(300), author_name: ["A".repeat(300)] },
    ],
  });
  assertEquals(out.length, 3);
  assertEquals(out[0], { title: "Les Essais", author: "Michel de Montaigne", ol_work_id: "OL45804W" });
  assertEquals(out[1], { title: "Sans œuvre", author: null, ol_work_id: null });
  assertEquals(out[2].title.length, 200);
  assertEquals(out[2].author?.length, 120);
  assertEquals(toBookSuggestions({}), []);
  assertEquals(toBookSuggestions(null), []);
});

Deno.test("toBookSuggestions : au plus 8 résultats", () => {
  const docs = Array.from({ length: 20 }, (_, i) => ({ key: `/works/OL${i}W`, title: `Livre ${i}` }));
  assertEquals(toBookSuggestions({ docs }).length, 8);
});

Deno.test("bookSearchUserAgent : nom du service et contact", () => {
  assertEquals(bookSearchUserAgent("contact@example.org"), "Sapios/1.0 (contact@example.org)");
});

Deno.test("searchOpenLibrary : en-têtes, réponse convertie", async () => {
  let seen: Request | null = null;
  const fakeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    seen = new Request(input, init);
    return Promise.resolve(Response.json({ docs: [{ key: "/works/OL1W", title: "Candide", author_name: ["Voltaire"] }] }));
  }) as typeof fetch;
  const out = await searchOpenLibrary("candide", { fetch: fakeFetch, userAgent: "Sapios/1.0 (t@t.fr)" });
  assertEquals(out, [{ title: "Candide", author: "Voltaire", ol_work_id: "OL1W" }]);
  assertEquals(seen!.headers.get("User-Agent"), "Sapios/1.0 (t@t.fr)");
  assertEquals(new URL(seen!.url).searchParams.get("q"), "candide");
});

Deno.test("searchOpenLibrary : panne, statut d'erreur ou délai → upstream_unavailable, sans détail", async () => {
  const failing = [
    (() => Promise.reject(new TypeError("error sending request for url (https://openlibrary.org/search.json?q=secret)"))) as typeof fetch,
    (() => Promise.resolve(new Response("busy", { status: 503 }))) as typeof fetch,
    (() => Promise.resolve(new Response("pas du json", { status: 200 }))) as typeof fetch,
  ];
  for (const f of failing) {
    const err = await assertRejects(() => searchOpenLibrary("secret", { fetch: f }), HttpError);
    assertEquals(err.code, "upstream_unavailable");
    assertEquals(err.message, "upstream_unavailable");
  }
  const slow = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
  const err = await assertRejects(() => searchOpenLibrary("lent", { fetch: slow, timeoutMs: 20 }), HttpError);
  assertEquals(err.code, "upstream_unavailable");
});

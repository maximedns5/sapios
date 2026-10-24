import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { geocode, geocodeUrl, parseGeoQuery, toGeoResults } from "./geocode.ts";
import { HttpError } from "./http.ts";

Deno.test("parseGeoQuery : texte borné, ville par défaut", () => {
  assertEquals(parseGeoQuery({ q: "  Paris  11e " }), { q: "Paris 11e", kind: "city" });
  assertEquals(parseGeoQuery({ q: "14 rue de la Roquette", kind: "address" }).kind, "address");
  for (const bad of [{}, { q: "a" }, { q: "x".repeat(121) }, { q: "Paris", kind: "pays" }, { q: 42 }]) {
    assertEquals(assertThrows(() => parseGeoQuery(bad as Record<string, unknown>), HttpError).code, "invalid_query");
  }
});

Deno.test("geocodeUrl : Géoplateforme, communes pour une ville", () => {
  const city = new URL(geocodeUrl("Lyon", "city"));
  assertEquals(city.origin + city.pathname, "https://data.geopf.fr/geocodage/search");
  assertEquals(city.searchParams.get("type"), "municipality");
  assertEquals(new URL(geocodeUrl("1 rue X", "address")).searchParams.get("type"), null);
});

const FEATURES = {
  type: "FeatureCollection",
  features: [
    { geometry: { coordinates: [2.3522, 48.8566] }, properties: { label: "Paris", city: "Paris", postcode: "75001" } },
    { geometry: { coordinates: [4.835, 45.758] }, properties: { label: "Lyon", name: "Lyon", postcode: "69 001" } },
    { geometry: { coordinates: ["x", 1] }, properties: { label: "Cassé" } },
    { properties: { label: "Sans géométrie" } },
  ],
};

Deno.test("toGeoResults : libellé, ville, code postal, coordonnées", () => {
  assertEquals(toGeoResults(FEATURES), [
    { label: "Paris", city: "Paris", postcode: "75001", lat: 48.8566, lng: 2.3522 },
    { label: "Lyon", city: "Lyon", postcode: null, lat: 45.758, lng: 4.835 },
  ]);
  assertEquals(toGeoResults(null), []);
});

Deno.test("geocode : panne amont = upstream_unavailable", async () => {
  const out = await geocode("Paris", "city", { fetch: (() => Promise.resolve(Response.json(FEATURES))) as typeof fetch });
  assertEquals(out.length, 2);
  const err = await assertRejects(
    () => geocode("Paris", "city", { fetch: (() => Promise.resolve(new Response("", { status: 503 }))) as typeof fetch }),
    HttpError,
  );
  assertEquals(err.code, "upstream_unavailable");
});

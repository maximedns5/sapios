import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { companySearchUrl, lookupCompany, parseSiren, toCompanyLookup } from "./company.ts";
import { HttpError } from "./http.ts";

Deno.test("parseSiren : espaces tolérés, clé de Luhn vérifiée", () => {
  assertEquals(parseSiren("732 829 320"), "732829320");
  for (const bad of [undefined, 42, "", "12345678", "123456789", "7328293200"]) {
    const err = assertThrows(() => parseSiren(bad), HttpError);
    assertEquals(err.code, "invalid_siren");
    assertEquals(err.status, 400);
  }
});

Deno.test("companySearchUrl : API Recherche d'entreprises", () => {
  const url = new URL(companySearchUrl("732829320"));
  assertEquals(url.origin + url.pathname, "https://recherche-entreprises.api.gouv.fr/search");
  assertEquals(url.searchParams.get("q"), "732829320");
});

const PAYLOAD = {
  results: [
    { siren: "111111118", nom_complet: "Homonyme" },
    {
      siren: "732829320",
      nom_complet: "MAISON VERTE (MAISON VERTE SAS)",
      nom_raison_sociale: "MAISON VERTE SAS",
      activite_principale: "35.11Z",
      libelle_activite_principale: "Production d'électricité",
      tranche_effectif_salarie: "22",
      date_creation: "2014-03-12",
      etat_administratif: "A",
      statut_diffusion: "O",
      siege: { adresse: "14 RUE DE LA ROQUETTE 75011 PARIS", code_postal: "75011", libelle_commune: "PARIS" },
    },
  ],
};

Deno.test("toCompanyLookup : le SIREN exact, tranche d'effectif lisible", () => {
  assertEquals(toCompanyLookup(PAYLOAD, "732829320"), {
    siren: "732829320",
    legal_name: "MAISON VERTE SAS",
    naf_code: "35.11Z",
    naf_label: "Production d'électricité",
    headcount_band: "100 à 199 salariés",
    address: "14 RUE DE LA ROQUETTE 75011 PARIS",
    city: "PARIS",
    postcode: "75011",
    created_on: "2014-03-12",
    active: true,
    diffusion: "O",
  });
  assertEquals(toCompanyLookup(PAYLOAD, "999999999"), null);
  assertEquals(toCompanyLookup({}, "732829320"), null);
});

Deno.test("toCompanyLookup : société cessée, diffusion partielle", () => {
  const out = toCompanyLookup({ results: [{ siren: "732829320", nom_complet: "X", etat_administratif: "C", statut_diffusion: "P" }] },
    "732829320");
  assertEquals(out?.active, false);
  assertEquals(out?.diffusion, "P");
  assertEquals(out?.siren, "732829320");
});

Deno.test("lookupCompany : réponse convertie, erreurs en codes", async () => {
  const ok = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
  assertEquals((await lookupCompany("732829320", { fetch: ok(PAYLOAD) as typeof fetch })).legal_name, "MAISON VERTE SAS");
  const notFound = await assertRejects(() => lookupCompany("732829320", { fetch: ok({ results: [] }) as typeof fetch }), HttpError);
  assertEquals(notFound.code, "not_found");
  const limited = await assertRejects(() => lookupCompany("732829320", { fetch: ok({}, 429) as typeof fetch }), HttpError);
  assertEquals(limited.code, "rate_limited");
  const down = await assertRejects(() => lookupCompany("732829320", { fetch: ok({}, 500) as typeof fetch }), HttpError);
  assertEquals(down.code, "upstream_unavailable");
  const broken = await assertRejects(
    () => lookupCompany("732829320", { fetch: (() => Promise.reject(new TypeError("réseau"))) as typeof fetch }),
    HttpError,
  );
  assertEquals(broken.code, "upstream_unavailable");
});

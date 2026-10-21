import { assertEquals, assertThrows } from "@std/assert";
import { bearerToken, requireInternalSecret, timingSafeEqual } from "./auth.ts";
import { HttpError } from "./http.ts";

const req = (headers: Record<string, string>) => new Request("http://x", { method: "POST", headers });

Deno.test("secret interne : accepté seulement s'il est identique", () => {
  requireInternalSecret(req({ "x-sapios-secret": "s3cret" }), "s3cret");
  const cases: Record<string, string>[] = [{}, { "x-sapios-secret": "s3cre" }, { "x-sapios-secret": "s3cret!" }, { Authorization: "Bearer s3cret" }];
  for (const headers of cases) {
    const err = assertThrows(() => requireInternalSecret(req(headers), "s3cret"), HttpError);
    assertEquals([err.status, err.code], [401, "unauthorized"]);
  }
});

Deno.test("secret interne non configuré : tout est refusé", () => {
  const err = assertThrows(() => requireInternalSecret(req({ "x-sapios-secret": "" }), ""), HttpError);
  assertEquals(err.code, "misconfigured");
});

Deno.test("comparaison en temps constant et jeton Bearer", () => {
  assertEquals(timingSafeEqual("abc", "abc"), true);
  assertEquals(timingSafeEqual("abc", "abd"), false);
  assertEquals(timingSafeEqual("abc", "abcd"), false);
  assertEquals(bearerToken(req({ Authorization: "Bearer a.b.c" })), "a.b.c");
  assertEquals(bearerToken(req({})), null);
});

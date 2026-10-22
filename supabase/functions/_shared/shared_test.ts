// Garde-fous de la source unique `packages/shared` : les Edge Functions l'importent directement,
// sans copie. Ces tests échouent si une modification du paquet le rend inutilisable depuis Deno
// ou si les import maps des fonctions divergent.
import { assert, assertEquals } from "@std/assert";
import { DEGREE_TYPES, DIPLOMA_EXTENSIONS, DIPLOMA_MIME_TYPES, Extraction } from "./shared.ts";

const functionsDir = new URL("../", import.meta.url);
const sharedSrc = new URL("../../../packages/shared/src/", import.meta.url);
const FUNCTIONS = ["submit-diploma", "process-diploma", "review-diploma", "notify", "delete-account", "purge-diplomas"];

Deno.test("chaque fonction a un deno.json identique (même version de zod)", async () => {
  const configs = await Promise.all(
    FUNCTIONS.map((f) => Deno.readTextFile(new URL(`${f}/deno.json`, functionsDir)).then(JSON.parse)),
  );
  for (const c of configs) assertEquals(c, configs[0]);
  assertEquals(configs[0].imports["zod/v4"], "npm:zod@3.25.76/v4");
});

Deno.test("la version de zod des fonctions est celle du paquet partagé", async () => {
  const lock = await Deno.readTextFile(new URL("../../../pnpm-lock.yaml", import.meta.url));
  assert(/^\s{2}zod@3\.25\.76:/m.test(lock), "pnpm-lock.yaml ne résout plus zod@3.25.76 : mettre à jour les deno.json");
});

Deno.test("packages/shared : seuls des imports compatibles Deno dans les fichiers importés par les fonctions", async () => {
  const shim = await Deno.readTextFile(new URL("shared.ts", import.meta.url));
  const files = [...shim.matchAll(/packages\/shared\/src\/([\w-]+\.ts)/g)].map((m) => m[1]);
  assertEquals(files.length, 5);
  for (const file of files) {
    const src = await Deno.readTextFile(new URL(file, sharedSrc));
    for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      const [, , typeOnly, spec] = m;
      const ok = spec === "zod/v4" || (typeOnly !== undefined && /^\.\/[\w-]+\.ts$/.test(spec));
      assert(ok, `${file} : import non portable « ${m[0].trim()} » (seuls zod/v4 et les imports de type en ./x.ts)`);
    }
  }
});

Deno.test("le schéma partagé est celui du brief §4.3", () => {
  assertEquals(Object.keys(Extraction.shape).sort(), [
    "confidence",
    "country",
    "degree_title",
    "degree_type",
    "field_of_study",
    "fraud_signals",
    "holder_full_name",
    "honors",
    "institution",
    "is_diploma",
    "level_estimate",
    "year_awarded",
  ]);
  assertEquals(DEGREE_TYPES.length, 8);
  assertEquals(new Set(Object.values(DIPLOMA_EXTENSIONS)), new Set(DIPLOMA_MIME_TYPES));
  assert(!Extraction.safeParse({ level_estimate: 9 }).success);
});

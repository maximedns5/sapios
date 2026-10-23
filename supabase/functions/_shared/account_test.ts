import { assertEquals } from "@std/assert";
import { purgeInactive } from "./account.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

Deno.test("purge-inactive : supprime les comptes encore éligibles, saute les membres revenus", async () => {
  const deleted: string[] = [];
  const res = await purgeInactive({
    listDue: () => Promise.resolve([A, B, C]),
    stillEligible: (id) => Promise.resolve(id !== B),
    deleteAccount: (id) => {
      deleted.push(id);
      return Promise.resolve();
    },
  });
  assertEquals(deleted, [A, C]);
  assertEquals(res, { purged: 2, skipped: 1 });
});

Deno.test("purge-inactive : un échec n'arrête pas les suivants", async () => {
  const deleted: string[] = [];
  const res = await purgeInactive({
    listDue: () => Promise.resolve([A, B]),
    stillEligible: () => Promise.resolve(true),
    deleteAccount: (id) => {
      if (id === A) return Promise.reject(new Error("storage indisponible"));
      deleted.push(id);
      return Promise.resolve();
    },
  });
  assertEquals(deleted, [B]);
  assertEquals(res, { purged: 1, skipped: 1 });
});

Deno.test("purge-inactive : rien à faire", async () => {
  const res = await purgeInactive({
    listDue: () => Promise.resolve([]),
    stillEligible: () => Promise.resolve(true),
    deleteAccount: () => Promise.reject(new Error("jamais appelé")),
  });
  assertEquals(res, { purged: 0, skipped: 0 });
});

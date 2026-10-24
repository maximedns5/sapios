import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { EMPLOI_NOTIFY_EVENTS, isValidSiren } from "./emploi.ts";
import {
  buildEmploiEmails,
  buildEmploiPush,
  dispatchEmploi,
  EMPLOI_TEXTS,
  type EmploiNotification,
  type EmploiNotifyDeps,
  verdictVariant,
} from "./emploi_notify.ts";

const TOKEN = "ExponentPushToken[abc]";

function notif(over: Partial<EmploiNotification> = {}): EmploiNotification {
  return {
    event: "application_interested",
    variant: null,
    audience: "candidate",
    recipients: [{ user_id: "u1", name: "Camille" }],
    vars: { offer: "Data analyst junior", company: "Maison Verte" },
    path: "/applications/a1",
    target_id: "a1",
    ...over,
  };
}

Deno.test("emploi.ts : mêmes événements que packages/shared/src/emploi.ts", async () => {
  const source = await Deno.readTextFile(new URL("../../../packages/shared/src/emploi.ts", import.meta.url));
  const block = /EMPLOI_NOTIFY_EVENTS = \[([\s\S]*?)\] as const/.exec(source)?.[1] ?? "";
  const listed = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assertEquals(listed, [...EMPLOI_NOTIFY_EVENTS]);
  assert(isValidSiren("732829320") && !isValidSiren("123456789"));
});

Deno.test("textes : un texte pour chaque événement et variante", () => {
  const keys = [
    "application_interested", "application_rejected", "application_closed", "interview_proposed", "invitation_received",
    "message.to_candidate", "message.to_recruiter", "interview_accepted", "company_decided.verified",
    "company_decided.rejected", "company_decided.suspended", "offer_decided.published", "offer_decided.rejected",
    "deadline_reminder", "diploma_verdict.approved", "diploma_verdict.rejected", "diploma_verdict.needs_more",
  ];
  for (const k of keys) assert(EMPLOI_TEXTS[k], k);
});

Deno.test("push : candidats seulement, lien de l'app dans les données", () => {
  const push = buildEmploiPush(notif(), [{ user_id: "u1", token: TOKEN }, { user_id: "u2", token: TOKEN }, { user_id: "u1", token: "x" }]);
  assertEquals(push.length, 1);
  assertEquals(push[0].body, "Maison Verte veut vous rencontrer : c’est un match pour « Data analyst junior ».");
  assertEquals(push[0].data, { type: "emploi", event: "application_interested", id: "a1" });
  assertEquals(buildEmploiPush(notif({ audience: "recruiter" }), [{ user_id: "u1", token: TOKEN }]), []);
});

Deno.test("email : lien app pour un candidat, site pour un recruteur ; formule sans prénom", () => {
  const people = new Map([["u1", { email: "c@x.fr", name: null }]]);
  const urls = { appUrl: "https://app.sapios.fr", webUrl: "https://sapios.fr" };
  const [cand] = buildEmploiEmails(notif(), people, urls, "k");
  assertStringIncludes(cand.text, "https://app.sapios.fr/applications/a1");
  assertStringIncludes(cand.text, "Bonjour Camille,");
  assertEquals(cand.kind, "emploi");
  assertEquals(cand.idempotencyKey, "emploi-k-u1");

  const rec = notif({
    event: "offer_decided", variant: "rejected", audience: "recruiter", recipients: [{ user_id: "u1", name: null }],
    vars: { offer: "Data analyst junior", reason: "Photo du lieu à refaire" }, path: "/recruteur/offres/o1",
  });
  const [mail] = buildEmploiEmails(rec, people, urls, "k");
  assertStringIncludes(mail.text, "https://sapios.fr/recruteur/offres/o1");
  assertStringIncludes(mail.text, "Bonjour,");
  assertStringIncludes(mail.text, "Photo du lieu à refaire");
  assertEquals(buildEmploiEmails(notif(), new Map(), urls, "k"), [], "sans adresse utilisable : pas d'email");
});

Deno.test("email : date lisible et niveau Bac+N", () => {
  const people = new Map([["u1", { email: "r@x.fr", name: null }]]);
  const [m] = buildEmploiEmails(notif({
    event: "interview_accepted", audience: "recruiter", recipients: [{ user_id: "u1", name: "Thomas" }],
    vars: { candidate: "Camille Laurent", offer: "Data analyst junior", date: "2026-11-05T08:30:00Z" }, path: "/recruteur",
  }), people, { appUrl: null, webUrl: null }, "k");
  assertStringIncludes(m.text, "jeudi 5 novembre à 9 h 30");
  const [v] = buildEmploiEmails(notif({ event: "diploma_verdict", variant: "approved", vars: { level: 7 } }),
    new Map([["u1", { email: "c@x.fr", name: null }]]), { appUrl: null, webUrl: null }, "k");
  assertStringIncludes(v.text, "le badge Bac+5", "niveau européen 7 = Bac+5");
  assertEquals(verdictVariant("verdict.rejected"), "rejected");
  assertEquals(verdictVariant("verdict.needs_more"), "needs_more");
  assertEquals(verdictVariant("verdict.standard"), "approved");
});

Deno.test("dispatchEmploi : notification périmée = null, sinon push et email", async () => {
  const sent: string[] = [];
  const deps = (n: EmploiNotification | null): EmploiNotifyDeps => ({
    store: {
      notification: () => Promise.resolve(n),
      tokens: () => Promise.resolve([{ user_id: "u1", token: TOKEN }]),
      recipients: () => Promise.resolve(new Map([["u1", { email: "c@x.fr", name: null }]])),
    },
    push: {
      store: { deleteTokens: () => Promise.resolve() } as unknown as EmploiNotifyDeps["push"]["store"],
      fetch: ((url: string) => {
        sent.push(String(url));
        return Promise.resolve(Response.json({ data: [{ status: "ok", id: "1" }] }));
      }) as unknown as typeof fetch,
    },
    email: {
      store: {} as EmploiNotifyDeps["email"]["store"],
      config: { apiKey: "k", from: "Sapios <a@b.fr>", appUrl: "https://app.sapios.fr" },
      fetch: ((url: string) => {
        sent.push(String(url));
        return Promise.resolve(Response.json({ id: "e1" }));
      }) as unknown as typeof fetch,
    },
    webUrl: null,
  });
  assertEquals(await dispatchEmploi(deps(null), "application_interested", "a1"), null);
  assertEquals(await dispatchEmploi(deps(notif()), "application_interested", "a1"), { sent: 1, emailed: 1 });
  assertEquals(sent.length, 2);
  // Message vers un candidat : push seulement.
  assertEquals(await dispatchEmploi(deps(notif({ event: "message", variant: "to_candidate" })), "message", "m1"),
    { sent: 1, emailed: 0 });
});

import { assertEquals } from "@std/assert";
import { buildMessages, EXPO_PUSH_URL, formatEventDate, notify, type PushStore, sendExpo } from "./push.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const EVENT = "55555555-5555-4555-8555-555555555555";
const REG_A = "66666666-6666-4666-8666-666666666666";
const REG_B = "77777777-7777-4777-8777-777777777777";

function store(over: Partial<PushStore> = {}) {
  const deleted: string[] = [];
  const s: PushStore = {
    matchParticipants: (id) => Promise.resolve(id === MATCH ? [A, B] : null),
    message: (id) => Promise.resolve(id === MESSAGE ? { match_id: MATCH, sender_id: A } : null),
    displayNames: () => Promise.resolve(new Map([[A, "Alice"], [B, "Bruno"]])),
    copy: (keys) =>
      Promise.resolve(
        new Map(
          [
            ["push.match", "Match avec {name}."],
            ["push.message", "{name} vous a écrit."],
            ["push.verdict", "Le verdict est tombé."],
            ["verdict.standard", "Accès toléré."],
          ].filter(([k]) => keys.includes(k)) as [string, string][],
        ),
      ),
    tokens: (ids) =>
      Promise.resolve(
        [
          { user_id: A, token: "ExponentPushToken[aaa]" },
          { user_id: B, token: "ExponentPushToken[bbb]" },
          { user_id: B, token: "not-an-expo-token" },
        ].filter((t) => ids.includes(t.user_id)),
      ),
    deleteTokens: (tokens) => {
      deleted.push(...tokens);
      return Promise.resolve();
    },
    registration: (id) =>
      Promise.resolve(
        id === REG_A
          ? { user_id: A, event_id: EVENT, status: "registered" }
          : id === REG_B
          ? { user_id: B, event_id: EVENT, status: "cancelled" }
          : null,
      ),
    event: (id) =>
      Promise.resolve(
        id === EVENT
          ? { id: EVENT, title: "Dîner de thèse", starts_at: "2026-11-14T18:30:00Z", status: "published", cancel_reason: null }
          : null,
      ),
    eventAttendees: () => Promise.resolve([A, B]),
    ...over,
  };
  return { s, deleted };
}

Deno.test("match : les deux personnes sont notifiées, {name} = l'autre", async () => {
  const msgs = await buildMessages(store().s, { type: "match", match_id: MATCH });
  assertEquals(msgs.map((m) => [m.to, m.body]), [
    ["ExponentPushToken[aaa]", "Match avec Bruno."],
    ["ExponentPushToken[bbb]", "Match avec Alice."],
  ]);
  assertEquals(msgs[0].data, { type: "match", match_id: MATCH });
});

Deno.test("message : l'expéditeur n'est jamais notifié", async () => {
  const msgs = await buildMessages(store().s, { type: "message", message_id: MESSAGE });
  assertEquals(msgs.map((m) => m.to), ["ExponentPushToken[bbb]"]);
  assertEquals(msgs[0].body, "Alice vous a écrit.");
  assertEquals(msgs[0].data, { type: "message", match_id: MATCH, message_id: MESSAGE });
});

Deno.test("verdict : titre push.verdict, corps = texte du verdict", async () => {
  const msgs = await buildMessages(store().s, { type: "verdict", user_id: B, copy_key: "verdict.standard" });
  assertEquals(msgs.map((m) => [m.to, m.title, m.body]), [["ExponentPushToken[bbb]", "Le verdict est tombé.", "Accès toléré."]]);
});

Deno.test("textes absents de app_copy : repli non vide", async () => {
  const { s } = store({ copy: () => Promise.resolve(new Map()) });
  const msgs = await buildMessages(s, { type: "verdict", user_id: A, copy_key: "verdict.unknown" });
  assertEquals(msgs[0].body, "Votre verdict est tombé.");
  assertEquals(msgs[0].title, undefined);
});

Deno.test("envoi Expo : en-tête Authorization, jetons DeviceNotRegistered supprimés", async () => {
  const { s, deleted } = store();
  const requests: { url: string; init: RequestInit }[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Promise.resolve(Response.json({
      data: [
        { status: "ok", id: "t1" },
        { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
      ],
    }));
  }) as typeof fetch;

  const sent = await notify({ store: s, fetch: fakeFetch, accessToken: "expo-token" }, { type: "match", match_id: MATCH });
  assertEquals(sent, 1);
  assertEquals(deleted, ["ExponentPushToken[bbb]"]);
  assertEquals(requests.length, 1);
  assertEquals(requests[0].url, EXPO_PUSH_URL);
  assertEquals((requests[0].init.headers as Record<string, string>).Authorization, "Bearer expo-token");
  assertEquals(JSON.parse(requests[0].init.body as string).length, 2);
});

Deno.test("envoi Expo : un lot injoignable n'interrompt pas l'envoi", async () => {
  const { s, deleted } = store();
  const failing = (() => Promise.reject(new TypeError("dns error"))) as typeof fetch;
  assertEquals(await notify({ store: s, fetch: failing }, { type: "match", match_id: MATCH }), 0);
  assertEquals(deleted, []);
});

Deno.test("envoi Expo : sans jeton d'accès, pas d'en-tête Authorization ; rien à envoyer, pas d'appel", async () => {
  let calls = 0;
  let auth: string | undefined;
  const fakeFetch = ((_: string, init: RequestInit) => {
    calls++;
    auth = (init.headers as Record<string, string>).Authorization;
    return Promise.resolve(Response.json({ data: [{ status: "ok" }] }));
  }) as typeof fetch;
  const { s } = store();
  assertEquals(await sendExpo({ store: s, fetch: fakeFetch }, [{ to: "ExponentPushToken[aaa]", body: "x", data: { type: "verdict", copy_key: "k" }, sound: "default" }]), 1);
  assertEquals(auth, undefined);
  assertEquals(await notify({ store: s, fetch: fakeFetch }, { type: "match", match_id: "55555555-5555-4555-8555-555555555555" }), 0);
  assertEquals(calls, 1);
});

Deno.test("date d'un événement : jour et heure de Paris, en français", () => {
  assertEquals(formatEventDate("2026-11-14T18:30:00Z"), "samedi 14 novembre à 19 h 30");
  assertEquals(formatEventDate("2026-07-03T07:05:00Z"), "vendredi 3 juillet à 9 h 05");
  assertEquals(formatEventDate("pas une date"), "");
});

Deno.test("événement : place confirmée, notifiée à la seule personne inscrite", async () => {
  const msgs = await buildMessages(store().s, { type: "event", kind: "registered", registration_id: REG_A });
  assertEquals(msgs.map((m) => [m.to, m.body]), [
    ["ExponentPushToken[aaa]", "Place confirmée : Dîner de thèse, samedi 14 novembre à 19 h 30."],
  ]);
  assertEquals(msgs[0].data, { type: "event", event_id: EVENT });
});

Deno.test("événement : notification périmée (désinscrit entre-temps) non envoyée", async () => {
  assertEquals(await buildMessages(store().s, { type: "event", kind: "registered", registration_id: REG_B }), []);
  assertEquals(await buildMessages(store().s, { type: "event", kind: "promoted", registration_id: "unknown" }), []);
});

Deno.test("événement annulé : motif repris, seulement si l'événement est bien annulé", async () => {
  const cancelled = store({
    event: () =>
      Promise.resolve({
        id: EVENT,
        title: "Dîner de thèse",
        starts_at: "2026-11-14T18:30:00Z",
        status: "cancelled",
        cancel_reason: "Le restaurant ferme.",
      }),
    copy: () => Promise.resolve(new Map([["push.event.cancelled", "{title} est annulé. {reason}"]])),
  });
  const msgs = await buildMessages(cancelled.s, { type: "event", kind: "cancelled", registration_id: REG_B });
  assertEquals(msgs.map((m) => [m.to, m.body]), [["ExponentPushToken[bbb]", "Dîner de thèse est annulé. Le restaurant ferme."]]);
  assertEquals(await buildMessages(store().s, { type: "event", kind: "cancelled", registration_id: REG_B }), []);
});

Deno.test("rappel de la veille : toutes les places confirmées", async () => {
  const msgs = await buildMessages(store().s, { type: "event_reminder", event_id: EVENT });
  assertEquals(msgs.map((m) => m.to), ["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"]);
  assertEquals(msgs[0].body, "C'est demain : Dîner de thèse, samedi 14 novembre à 19 h 30.");
});

Deno.test("inactivité : jamais de push (email et avis dans l'app seulement)", async () => {
  const msgs = await buildMessages(store().s, {
    type: "inactivity",
    user_id: "11111111-1111-4111-8111-111111111111",
    delete_after: "2028-12-14",
  });
  assertEquals(msgs, []);
});

import { assertEquals } from "@std/assert";
import { EXPO_PUSH_URL, formatEventDate, type PushMessage, type PushStore, sendExpo } from "./push.ts";

const A = "11111111-1111-4111-8111-111111111111";

function store() {
  const deleted: string[] = [];
  const s: PushStore = {
    tokens: () => Promise.resolve([{ user_id: A, token: "ExponentPushToken[aaa]" }]),
    deleteTokens: (tokens) => {
      deleted.push(...tokens);
      return Promise.resolve();
    },
  };
  return { s, deleted };
}

function message(to: string): PushMessage {
  return { to, body: "Thomas vous a proposé des créneaux.", data: { type: "emploi", event: "interview_proposed", id: A }, sound: "default" };
}

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

  const sent = await sendExpo({ store: s, fetch: fakeFetch, accessToken: "expo-token" },
    [message("ExponentPushToken[aaa]"), message("ExponentPushToken[bbb]")]);
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
  assertEquals(await sendExpo({ store: s, fetch: failing }, [message("ExponentPushToken[aaa]")]), 0);
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
  assertEquals(await sendExpo({ store: s, fetch: fakeFetch }, [message("ExponentPushToken[aaa]")]), 1);
  assertEquals(auth, undefined);
  assertEquals(await sendExpo({ store: s, fetch: fakeFetch }, []), 0);
  assertEquals(calls, 1);
});

Deno.test("date d'un entretien : jour et heure de Paris, en français", () => {
  assertEquals(formatEventDate("2026-11-14T18:30:00Z"), "samedi 14 novembre à 19 h 30");
  assertEquals(formatEventDate("2026-07-03T07:05:00Z"), "vendredi 3 juillet à 9 h 05");
  assertEquals(formatEventDate("pas une date"), "");
});

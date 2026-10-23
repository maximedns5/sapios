import { assertEquals, assertRejects } from "@std/assert";
import { type EmailConfig, type EmailStore, RESEND_API_URL } from "./email.ts";
import { dispatch, type NotifyDeps } from "./notify.ts";
import { EXPO_PUSH_URL, type PushStore } from "./push.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const CONFIG: EmailConfig = { apiKey: "re_test", from: "Sapios <bonjour@mail.sapios.test>", appUrl: "https://app.sapios.test" };

const pushStore: PushStore = {
  matchParticipants: (id) => Promise.resolve(id === MATCH ? [A, B] : null),
  message: (id) => Promise.resolve(id === MESSAGE ? { match_id: MATCH, sender_id: A } : null),
  displayNames: () => Promise.resolve(new Map([[A, "Alice"], [B, "Bruno"]])),
  copy: () => Promise.resolve(new Map()),
  tokens: (ids) => Promise.resolve(ids.map((user_id) => ({ user_id, token: `ExponentPushToken[${user_id}]` }))),
  deleteTokens: () => Promise.resolve(),
  registration: () => Promise.resolve(null),
  event: () => Promise.resolve(null),
  eventAttendees: () => Promise.resolve([]),
};

const emailStore: EmailStore = {
  matchParticipants: pushStore.matchParticipants,
  registration: pushStore.registration,
  event: pushStore.event,
  eventAttendees: pushStore.eventAttendees,
  copy: () => Promise.resolve(new Map()),
  recipients: (ids) =>
    Promise.resolve(new Map(ids.map((id) => [id, { email: `${id.slice(0, 4)}@exemple.fr`, name: null }]))),
};

/** `fetch` simulé : Expo accepte tout, Resend répond `resendStatus`. */
function network(resendStatus = 200) {
  const urls: string[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    urls.push(url);
    if (url === EXPO_PUSH_URL) {
      const batch = JSON.parse(init.body as string) as unknown[];
      return Promise.resolve(Response.json({ data: batch.map(() => ({ status: "ok" })) }));
    }
    if (url === RESEND_API_URL) {
      return Promise.resolve(
        resendStatus === 200 ? Response.json({ id: "e1" }) : Response.json({ message: "down" }, { status: resendStatus }),
      );
    }
    return Promise.reject(new Error(`URL inattendue ${url}`));
  }) as typeof fetch;
  return { fetch: fakeFetch, urls };
}

function deps(fetch: typeof globalThis.fetch, over: { config?: EmailConfig | null; push?: Partial<PushStore> } = {}): NotifyDeps {
  return {
    push: { store: { ...pushStore, ...over.push }, fetch },
    email: { store: emailStore, config: over.config === undefined ? CONFIG : over.config, fetch, sleep: () => Promise.resolve() },
  };
}

Deno.test("dispatch : push et email pour un match", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch), { type: "match", match_id: MATCH }), { sent: 2, emailed: 2 });
  assertEquals(urls.filter((u) => u === RESEND_API_URL).length, 2);
});

Deno.test("dispatch : un échec Resend ne fait échouer ni le push ni notify", async () => {
  for (const status of [500, 401, 429]) {
    const { fetch } = network(status);
    assertEquals(await dispatch(deps(fetch), { type: "verdict", user_id: B, copy_key: "verdict.standard" }), { sent: 1, emailed: 0 });
  }
  const unreachable = ((url: string, init: RequestInit) =>
    url === RESEND_API_URL ? Promise.reject(new TypeError("dns error")) : network().fetch(url, init)) as typeof fetch;
  assertEquals(await dispatch(deps(unreachable), { type: "match", match_id: MATCH }), { sent: 2, emailed: 0 });
});

Deno.test("dispatch : sans configuration email, push seul", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch, { config: null }), { type: "match", match_id: MATCH }), { sent: 2, emailed: 0 });
  assertEquals(urls, [EXPO_PUSH_URL]);
});

Deno.test("dispatch : message = push seul, jamais d'email", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch), { type: "message", message_id: MESSAGE }), { sent: 1, emailed: 0 });
  assertEquals(urls, [EXPO_PUSH_URL]);
});

Deno.test("dispatch : une erreur du push remonte, l'email part quand même", async () => {
  const { fetch, urls } = network();
  const broken = deps(fetch, { push: { tokens: () => Promise.reject(new Error("push_tokens: timeout")) } });
  await assertRejects(() => dispatch(broken, { type: "verdict", user_id: A, copy_key: "verdict.standard" }), Error, "push_tokens");
  assertEquals(urls, [RESEND_API_URL]);
});

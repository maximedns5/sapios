import { assertEquals } from "@std/assert";
import { type EmailConfig, type EmailStore, RESEND_API_URL } from "./email.ts";
import type { EmploiNotification } from "./emploi_notify.ts";
import { dispatch, type NotifyDeps } from "./notify.ts";
import { EXPO_PUSH_URL, type PushStore } from "./push.ts";

const A = "11111111-1111-4111-8111-111111111111";
const CONFIG: EmailConfig = { apiKey: "re_test", from: "Sapios <bonjour@mail.sapios.test>", appUrl: "https://app.sapios.test" };

const pushStore: PushStore = {
  tokens: (ids) => Promise.resolve(ids.map((user_id) => ({ user_id, token: `ExponentPushToken[${user_id}]` }))),
  deleteTokens: () => Promise.resolve(),
};

const emailStore: EmailStore = {
  copy: () => Promise.resolve(new Map()),
  recipients: (ids) =>
    Promise.resolve(new Map(ids.map((id) => [id, { email: `${id.slice(0, 4)}@exemple.fr`, name: "Camille" }]))),
};

function verdictNotification(variant: string): EmploiNotification {
  return {
    event: "diploma_verdict",
    variant,
    audience: "candidate",
    recipients: [{ user_id: A, name: "Camille" }],
    vars: { level: 7 },
    path: "/profile",
    target_id: A,
  };
}

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

function deps(
  fetch: typeof globalThis.fetch,
  over: { config?: EmailConfig | null; notification?: EmploiNotification | null } = {},
): NotifyDeps {
  const push = { store: pushStore, fetch };
  const email = { store: emailStore, config: over.config === undefined ? CONFIG : over.config, fetch, sleep: () => Promise.resolve() };
  const seen: { event: string; id: string }[] = [];
  return {
    push,
    email,
    emploi: {
      store: {
        notification: (event, id) => {
          seen.push({ event, id });
          return Promise.resolve(over.notification === undefined ? verdictNotification("approved") : over.notification);
        },
        tokens: pushStore.tokens,
        recipients: emailStore.recipients,
      },
      push,
      email,
      webUrl: null,
    },
  };
}

Deno.test("dispatch : verdict d'un diplôme, textes de l'emploi (push et email)", async () => {
  const { fetch, urls } = network();
  const res = await dispatch(deps(fetch), { type: "verdict", user_id: A, copy_key: "verdict.standard" });
  assertEquals(res, { sent: 1, emailed: 1 });
  assertEquals(urls.sort(), [EXPO_PUSH_URL, RESEND_API_URL].sort());
});

Deno.test("dispatch : verdict sans notification (compte supprimé ou hors emploi), rien n'est envoyé", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch, { notification: null }), { type: "verdict", user_id: A, copy_key: "verdict.rejected" }),
    { sent: 0, emailed: 0 });
  assertEquals(urls, []);
});

Deno.test("dispatch : inactivité = email seul, jamais de push", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch), { type: "inactivity", user_id: A, delete_after: "2028-12-14" }), { sent: 0, emailed: 1 });
  assertEquals(urls, [RESEND_API_URL]);
});

Deno.test("dispatch : sans configuration email, l'inactivité n'envoie rien et le verdict garde le push", async () => {
  const { fetch, urls } = network();
  assertEquals(await dispatch(deps(fetch, { config: null }), { type: "inactivity", user_id: A, delete_after: "2028-12-14" }),
    { sent: 0, emailed: 0 });
  assertEquals(await dispatch(deps(fetch, { config: null }), { type: "verdict", user_id: A, copy_key: "verdict.standard" }),
    { sent: 1, emailed: 0 });
  assertEquals(urls, [EXPO_PUSH_URL]);
});

Deno.test("dispatch : un échec Resend ne fait échouer ni le push ni notify", async () => {
  const { fetch } = network(500);
  assertEquals(await dispatch(deps(fetch), { type: "verdict", user_id: A, copy_key: "verdict.standard" }), { sent: 1, emailed: 0 });
});

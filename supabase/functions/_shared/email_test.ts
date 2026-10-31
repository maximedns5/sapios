import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { User } from "./deps.ts";
import {
  buildEmails,
  createEmailStore,
  deliverableAddress,
  type EmailConfig,
  emailConfigFromEnv,
  formatDay,
  INACTIVITY_EMAIL_COPY_KEYS,
  type EmailDeps,
  type EmailStore,
  sendEmails,
} from "./email.ts";
import { FakeSupabase } from "./testing/fake_supabase.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CONFIG: EmailConfig = { apiKey: "re_test", from: "Sapios <bonjour@mail.sapios.test>", appUrl: "https://app.sapios.test" };
const INACTIVITY = { type: "inactivity", user_id: A, delete_after: "2028-12-14" } as const;

const COPY = new Map([
  ["email.inactivity.subject", "Votre compte sera supprimé le {date}"],
  ["email.inactivity.title", "Vous nous manquez."],
  ["email.inactivity.body", "{name}, sans connexion d'ici le {date}, votre compte sera supprimé."],
  ["email.inactivity.cta", "Garder mon compte"],
  ["email.footer", "Vous avez un compte Sapios."],
]);

const PEOPLE: [string, { email: string; name: string | null }][] = [
  [A, { email: "alice@exemple.fr", name: "Alice" }],
  [B, { email: "bruno@exemple.fr", name: "Bruno" }],
];

function store(over: Partial<EmailStore> = {}): EmailStore {
  return {
    copy: (keys) => Promise.resolve(new Map([...COPY].filter(([k]) => keys.includes(k)))),
    recipients: (ids) => Promise.resolve(new Map(PEOPLE.filter(([id]) => ids.includes(id)))),
    ...over,
  };
}

const refuse = () => Promise.reject(new Error("ne doit pas être appelé"));
const untouchable: EmailStore = { copy: refuse, recipients: refuse };

type Call = { url: string; headers: Record<string, string>; payload: Record<string, unknown> };

/** `fetch` simulé de Resend : réponses dans l'ordre, puis succès. */
function resend(responses: (Response | Error)[] = []) {
  const calls: Call[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, payload: JSON.parse(init.body as string) });
    const r = responses.shift() ?? Response.json({ id: `email-${calls.length}` });
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }) as typeof fetch;
  return { fetch: fakeFetch, calls };
}

function deps(over: Partial<EmailDeps> = {}): EmailDeps {
  return { store: store(), config: CONFIG, sleep: () => Promise.resolve(), ...over };
}

Deno.test("canal désactivé sans RESEND_API_KEY ou EMAIL_FROM : rien n'est lu ni envoyé", async () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(emailConfigFromEnv(env({})), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: "re_x" })), null);
  assertEquals(emailConfigFromEnv(env({ EMAIL_FROM: "Sapios <a@b.fr>" })), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: " ", EMAIL_FROM: "a@b.fr" })), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Sapios" })), null);

  const { fetch, calls } = resend();
  assertEquals(await sendEmails(deps({ fetch, config: null, store: untouchable }), INACTIVITY), 0);
  assertEquals(calls.length, 0);
});

Deno.test("SAPIOS_APP_URL : « / » final retiré ; absent ou invalide, emails sans lien", async () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  const base = { RESEND_API_KEY: "re_x", EMAIL_FROM: "Sapios <a@b.fr>" };
  assertEquals(emailConfigFromEnv(env({ ...base, SAPIOS_APP_URL: "https://app.sapios.fr/" })), {
    apiKey: "re_x",
    from: "Sapios <a@b.fr>",
    appUrl: "https://app.sapios.fr",
  });
  assertEquals(emailConfigFromEnv(env(base))?.appUrl, null);
  assertEquals(emailConfigFromEnv(env({ ...base, SAPIOS_APP_URL: "javascript:alert(1)" }))?.appUrl, null);

  const [email] = await buildEmails(store(), { ...CONFIG, appUrl: null }, INACTIVITY);
  assertFalse(email.html.includes("href="));
  assertFalse(email.text.includes("Garder mon compte"));
});

Deno.test("échec Resend absorbé : réseau, 500, 422", async () => {
  for (const failure of [new TypeError("dns error"), new Response("oops", { status: 500 }), Response.json({ name: "validation_error", message: "bad from" }, { status: 422 })]) {
    const { fetch, calls } = resend([failure]);
    assertEquals(await sendEmails(deps({ fetch }), INACTIVITY), 0);
    assertEquals(calls.length, 1);
  }
  // Réponse 200 sans identifiant : non comptée.
  const odd = resend([Response.json({})]);
  assertEquals(await sendEmails(deps({ fetch: odd.fetch }), INACTIVITY), 0);
});

Deno.test("429 : nouvel essai après retry-after, trois essais au plus", async () => {
  const waits: number[] = [];
  const sleep = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  const tooMany = () => Response.json({ name: "rate_limit_exceeded" }, { status: 429, headers: { "retry-after": "2" } });
  const once = resend([tooMany()]);
  assertEquals(await sendEmails(deps({ fetch: once.fetch, sleep }), INACTIVITY), 1);
  assertEquals(once.calls.length, 2);
  assertEquals(waits.length, 1);
  assert(waits[0] >= 2000 && waits[0] < 2500);

  const always = resend([tooMany(), tooMany(), tooMany(), tooMany()]);
  assertEquals(await sendEmails(deps({ fetch: always.fetch, sleep }), INACTIVITY), 0);
  assertEquals(always.calls.length, 3);
});

Deno.test("erreur de lecture (base, Auth) : absorbée, aucun envoi", async () => {
  const { fetch, calls } = resend();
  const broken = store({ recipients: () => Promise.reject(new Error("candidate_identities: timeout")) });
  assertEquals(await sendEmails(deps({ fetch, store: broken }), INACTIVITY), 0);
  assertEquals(calls.length, 0);
});

Deno.test("contenu échappé : prénom piégé, pas de HTML injecté ni de saut de ligne dans le sujet", async () => {
  const people = new Map([[A, { email: "eve@exemple.fr", name: '<img src=x onerror=alert(1)> & "co"\nBcc: x' }]]);
  const trap = store({
    recipients: () => Promise.resolve(people),
    copy: () => Promise.resolve(new Map([["email.inactivity.subject", "{name}, à bientôt"]])),
  });
  const [email] = await buildEmails(trap, CONFIG, INACTIVITY);
  assertFalse(email.html.includes("<img"));
  assertStringIncludes(email.html, "&#60;img src=x onerror=alert(1)&#62; &#38; &#34;co&#34;");
  assertFalse(email.subject.includes("\n"));
  assertStringIncludes(email.subject, "Bcc: x");
});

Deno.test("textes absents ou vides dans app_copy : repli non vide", async () => {
  const empty = store({ copy: () => Promise.resolve(new Map([["email.inactivity.subject", "  "]])) });
  const [email] = await buildEmails(empty, CONFIG, INACTIVITY);
  assertEquals(email.subject, "Votre compte Sapios sera supprimé le 14 décembre 2028");
  assertStringIncludes(email.text, "Alice, vous ne vous êtes pas connecté·e depuis longtemps.");

  const anonymous = store({ recipients: () => Promise.resolve(new Map([[A, { email: "a@exemple.fr", name: null }]])) });
  const [unnamed] = await buildEmails(anonymous, CONFIG, INACTIVITY);
  assertStringIncludes(unnamed.text, "Bonjour, sans connexion");
});

const confirmed = (id: string, email: string, extra: Partial<User> = {}) => ({
  id,
  email,
  email_confirmed_at: "2026-10-01T00:00:00Z",
  ...extra,
});

Deno.test("destinataires : adresse lue par l'API admin, prénom du candidat ou du recruteur ; supprimés et adresses non confirmées ignorés", async () => {
  const C = "66666666-6666-4666-8666-666666666666";
  const D = "77777777-7777-4777-8777-777777777777";
  const E = "88888888-8888-4888-8888-888888888888";
  const db = new FakeSupabase();
  db.tables.candidate_identities = [{ user_id: A, first_name: "Alice" }, { user_id: D, first_name: "Dan" }];
  db.tables.company_members = [{ user_id: B, first_name: "Bruno" }, { user_id: C, first_name: "Chloé" }];
  db.users = {
    [A]: confirmed(A, "alice@exemple.fr"),
    [B]: confirmed(B, "bruno@exemple.fr"),
    [C]: confirmed(C, "chloe@exemple.fr", { banned_until: "2999-01-01T00:00:00Z" }),
    [D]: { id: D, email: "dan@exemple.fr", email_confirmed_at: null },
    // E : pas de compte Auth (supprimé entre-temps).
  };
  const people = await createEmailStore(db.asClient()).recipients([A, B, C, D, E]);
  assertEquals([...people.entries()], [
    [A, { email: "alice@exemple.fr", name: "Alice" }],
    [B, { email: "bruno@exemple.fr", name: "Bruno" }],
  ]);
  assertEquals(db.writes(), []);
});

Deno.test("inactivité en base : textes de app_copy et adresse du compte", async () => {
  const db = new FakeSupabase();
  db.tables.candidate_identities = [{ user_id: A, first_name: "Alice" }];
  db.tables.company_members = [];
  db.tables.app_copy = [...COPY].map(([key, text]) => ({ key, locale: "fr", text }));
  db.users = { [A]: confirmed(A, "alice@exemple.fr") };
  const { fetch, calls } = resend();
  const sent = await sendEmails({ store: createEmailStore(db.asClient()), config: CONFIG, fetch }, INACTIVITY);
  assertEquals(sent, 1);
  assertEquals(calls.map((c) => c.payload.to), [["alice@exemple.fr"]]);
  assertEquals(calls[0].payload.subject, "Votre compte sera supprimé le 14 décembre 2028");
});

Deno.test("adresse utilisable : confirmée, ni supprimée, ni anonyme, ni suspendue", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const user = (extra: Partial<User>) => ({ ...confirmed(A, "a@exemple.fr"), ...extra }) as User;
  assertEquals(deliverableAddress(user({}), now), "a@exemple.fr");
  assertEquals(deliverableAddress(user({ banned_until: "2026-10-20T00:00:00Z" }), now), "a@exemple.fr");
  assertEquals(deliverableAddress(user({ banned_until: "2026-10-22T00:00:00Z" }), now), null);
  assertEquals(deliverableAddress(user({ deleted_at: "2026-10-20T00:00:00Z" }), now), null);
  assertEquals(deliverableAddress(user({ is_anonymous: true }), now), null);
  assertEquals(deliverableAddress(user({ email_confirmed_at: undefined }), now), null);
  assertEquals(deliverableAddress(user({ email: "" }), now), null);
});

Deno.test("gabarits Auth (à recopier dans le dashboard) : code, lien, charte, déclarés dans config.toml", async () => {
  const supabaseDir = new URL("../../", import.meta.url);
  const config = await Deno.readTextFile(new URL("config.toml", supabaseDir));
  for (const name of ["magic_link", "confirmation"]) {
    const html = await Deno.readTextFile(new URL(`templates/${name}.html`, supabaseDir));
    assertStringIncludes(html, "{{ .Token }}");
    assertStringIncludes(html, 'href="{{ .ConfirmationURL }}"');
    assertEquals([...new Set(html.match(/#[0-9A-Fa-f]{6}\b/g))].sort(), ["#0B0B0B", "#F4F3EF"]);
    assertStringIncludes(config, `[auth.email.template.${name}]`);
    assertStringIncludes(config, `content_path = "./supabase/templates/${name}.html"`);
  }
});

Deno.test("inactivité : un email au membre averti, avec la date de suppression et le lien de l'app", async () => {
  const [email, ...rest] = await buildEmails(store(), CONFIG, { type: "inactivity", user_id: A, delete_after: "2028-12-14" });
  assertEquals(rest, []);
  assertEquals(email.to, "alice@exemple.fr");
  assertEquals(email.kind, "inactivity");
  assertStringIncludes(email.subject, "14 décembre 2028");
  assertStringIncludes(email.text, "Alice");
  assertStringIncludes(email.html, "https://app.sapios.test/");
  assertEquals(email.idempotencyKey, `inactivity-${A}-2028-12-14`);
});

Deno.test("inactivité : compte supprimé, aucun email", async () => {
  const none = store({ recipients: () => Promise.resolve(new Map()) });
  assertEquals(await buildEmails(none, CONFIG, { type: "inactivity", user_id: A, delete_after: "2028-12-14" }), []);
});

Deno.test("date de suppression : « 14 décembre 2028 », vide si illisible", () => {
  assertEquals(formatDay("2028-12-14"), "14 décembre 2028");
  assertEquals(formatDay("demain"), "");
});

Deno.test("clés de l'email d'inactivité : créées par une migration idempotente, avec {date}", async () => {
  const dir = new URL("../../migrations/", import.meta.url);
  let sql = "";
  for await (const entry of Deno.readDir(dir)) {
    const content = await Deno.readTextFile(new URL(entry.name, dir));
    if (content.includes("'email.inactivity.subject'")) sql = content;
  }
  assert(sql, "aucune migration ne crée les textes de l'email d'inactivité");
  for (const key of INACTIVITY_EMAIL_COPY_KEYS) assertStringIncludes(sql, `('${key}', 'fr',`);
  assertStringIncludes(sql, "on conflict (key, locale) do nothing");
  assertStringIncludes(sql, "{date}");
});

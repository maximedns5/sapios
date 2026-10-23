import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { User } from "./deps.ts";
import {
  buildEmails,
  createEmailStore,
  deliverableAddress,
  EMAIL_COPY_KEYS,
  type EmailConfig,
  EVENT_EMAIL_COPY_KEYS,
  emailConfigFromEnv,
  formatDay,
  INACTIVITY_EMAIL_COPY_KEYS,
  type EmailDeps,
  type EmailStore,
  RESEND_API_URL,
  sendEmails,
} from "./email.ts";
import { FakeSupabase } from "./testing/fake_supabase.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const EVENT = "55555555-5555-4555-8555-555555555555";
const REG_A = "66666666-6666-4666-8666-666666666666";
const CONFIG: EmailConfig = { apiKey: "re_test", from: "Sapios <bonjour@mail.sapios.test>", appUrl: "https://app.sapios.test" };

const COPY = new Map([
  ["email.verdict.subject", "Votre verdict est tombé, {name}."],
  ["email.verdict.title", "{verdict}"],
  ["email.verdict.body", "{name}, le jury a délibéré.\n\nLa suite vous attend dans l'application."],
  ["email.verdict.cta", "Voir mon verdict"],
  ["email.match.subject", "Nouveau match."],
  ["email.match.title", "Intellectuellement compatibles."],
  ["email.match.body", "{name}, quelqu'un vous a liké en retour."],
  ["email.match.cta", "Ouvrir la conversation"],
  ["email.footer", "Vous avez un compte Sapios."],
  ["verdict.standard", "Accès toléré."],
]);

const PEOPLE: [string, { email: string; name: string | null }][] = [
  [A, { email: "alice@exemple.fr", name: "Alice" }],
  [B, { email: "bruno@exemple.fr", name: "Bruno" }],
];

const DINNER = {
  id: EVENT,
  title: "Dîner de thèse",
  starts_at: "2026-11-14T18:30:00Z",
  status: "published",
  cancel_reason: null as string | null,
};

function store(over: Partial<EmailStore> = {}): EmailStore {
  return {
    matchParticipants: (id) => Promise.resolve(id === MATCH ? [A, B] : null),
    copy: (keys) => Promise.resolve(new Map([...COPY].filter(([k]) => keys.includes(k)))),
    recipients: (ids) => Promise.resolve(new Map(PEOPLE.filter(([id]) => ids.includes(id)))),
    registration: (id) => Promise.resolve(id === REG_A ? { user_id: A, event_id: EVENT, status: "registered" } : null),
    event: (id) => Promise.resolve(id === EVENT ? DINNER : null),
    eventAttendees: () => Promise.resolve([A, B]),
    ...over,
  };
}

const refuse = () => Promise.reject(new Error("ne doit pas être appelé"));
const untouchable: EmailStore = {
  matchParticipants: refuse,
  copy: refuse,
  recipients: refuse,
  registration: refuse,
  event: refuse,
  eventAttendees: refuse,
};

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

Deno.test("verdict : un email au destinataire, avec son prénom, son verdict et le lien de l'app", async () => {
  const { fetch, calls } = resend();
  const sent = await sendEmails(deps({ fetch }), { type: "verdict", user_id: B, copy_key: "verdict.standard" });
  assertEquals(sent, 1);
  assertEquals(calls.length, 1);
  const [{ url, headers, payload }] = calls;
  assertEquals(url, RESEND_API_URL);
  assertEquals(headers.Authorization, "Bearer re_test");
  assertEquals(headers["Content-Type"], "application/json");
  assertEquals(headers["Idempotency-Key"], undefined);
  assertEquals(payload.from, "Sapios <bonjour@mail.sapios.test>");
  assertEquals(payload.to, ["bruno@exemple.fr"]);
  assertEquals(payload.subject, "Votre verdict est tombé, Bruno.");
  assertEquals(payload.tags, [{ name: "category", value: "verdict" }]);

  const html = payload.html as string;
  assertStringIncludes(html, "Accès toléré.");
  assertStringIncludes(html, "Bruno, le jury a délibéré.");
  assertStringIncludes(html, 'href="https://app.sapios.test/"');
  assertStringIncludes(html, "Vous avez un compte Sapios.");
  // Charte : deux couleurs, rien d'autre.
  assertEquals([...new Set(html.match(/#[0-9A-Fa-f]{6}\b/g))].sort(), ["#0B0B0B", "#F4F3EF"]);

  const text = payload.text as string;
  assertStringIncludes(text, "SAPIOS · VERDICT");
  assertStringIncludes(text, "Accès toléré.");
  assertStringIncludes(text, "Bruno, le jury a délibéré.\n\nLa suite vous attend dans l'application.");
  assertStringIncludes(text, "Voir mon verdict : https://app.sapios.test/");
  assertFalse(/<[a-z]/i.test(text));
});

Deno.test("match : un email à chacun des deux, sans le prénom de l'autre personne", async () => {
  const { fetch, calls } = resend();
  assertEquals(await sendEmails(deps({ fetch }), { type: "match", match_id: MATCH }), 2);
  assertEquals(calls.map((c) => c.payload.to), [["alice@exemple.fr"], ["bruno@exemple.fr"]]);
  assertEquals(calls.map((c) => c.headers["Idempotency-Key"]), [`match-${MATCH}-${A}`, `match-${MATCH}-${B}`]);
  const [toAlice, toBruno] = calls.map((c) => `${c.payload.subject}\n${c.payload.html}\n${c.payload.text}`);
  assertStringIncludes(toAlice, "Alice, quelqu'un vous a liké en retour.");
  assertFalse(toAlice.includes("Bruno"));
  assertStringIncludes(toBruno, "Bruno, quelqu'un vous a liké en retour.");
  assertFalse(toBruno.includes("Alice"));
  assertStringIncludes(toAlice, `https://app.sapios.test/chat/${MATCH}`);
  assertEquals(calls[0].payload.tags, [{ name: "category", value: "match" }]);
});

Deno.test("message : jamais d'email (le badge de l'app suffit)", async () => {
  const { fetch, calls } = resend();
  assertEquals(await sendEmails(deps({ fetch, store: untouchable }), { type: "message", message_id: MESSAGE }), 0);
  assertEquals(calls.length, 0);
});

Deno.test("canal désactivé sans RESEND_API_KEY ou EMAIL_FROM : rien n'est lu ni envoyé", async () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(emailConfigFromEnv(env({})), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: "re_x" })), null);
  assertEquals(emailConfigFromEnv(env({ EMAIL_FROM: "Sapios <a@b.fr>" })), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: " ", EMAIL_FROM: "a@b.fr" })), null);
  assertEquals(emailConfigFromEnv(env({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Sapios" })), null);

  const { fetch, calls } = resend();
  const off = deps({ fetch, config: null, store: untouchable });
  assertEquals(await sendEmails(off, { type: "verdict", user_id: A, copy_key: "verdict.standard" }), 0);
  assertEquals(await sendEmails(off, { type: "match", match_id: MATCH }), 0);
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

  const [email] = await buildEmails(store(), { ...CONFIG, appUrl: null }, { type: "match", match_id: MATCH });
  assertFalse(email.html.includes("href="));
  assertFalse(email.text.includes("Ouvrir la conversation"));
});

Deno.test("échec Resend absorbé : réseau, 500, 422 ; les autres emails partent quand même", async () => {
  const verdict = { type: "verdict", user_id: A, copy_key: "verdict.standard" } as const;
  for (const failure of [new TypeError("dns error"), new Response("oops", { status: 500 }), Response.json({ name: "validation_error", message: "bad from" }, { status: 422 })]) {
    const { fetch, calls } = resend([failure]);
    assertEquals(await sendEmails(deps({ fetch }), verdict), 0);
    assertEquals(calls.length, 1);
  }
  const { fetch, calls } = resend([new Response(null, { status: 503 })]);
  assertEquals(await sendEmails(deps({ fetch }), { type: "match", match_id: MATCH }), 1);
  assertEquals(calls.length, 2);
  // Réponse 200 sans identifiant : non comptée.
  const odd = resend([Response.json({})]);
  assertEquals(await sendEmails(deps({ fetch: odd.fetch }), verdict), 0);
});

Deno.test("429 : nouvel essai après retry-after, trois essais au plus", async () => {
  const waits: number[] = [];
  const sleep = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  const tooMany = () => Response.json({ name: "rate_limit_exceeded" }, { status: 429, headers: { "retry-after": "2" } });
  const once = resend([tooMany()]);
  assertEquals(await sendEmails(deps({ fetch: once.fetch, sleep }), { type: "verdict", user_id: A, copy_key: "verdict.standard" }), 1);
  assertEquals(once.calls.length, 2);
  assertEquals(waits.length, 1);
  assert(waits[0] >= 2000 && waits[0] < 2500);

  const always = resend([tooMany(), tooMany(), tooMany(), tooMany()]);
  assertEquals(await sendEmails(deps({ fetch: always.fetch, sleep }), { type: "verdict", user_id: A, copy_key: "verdict.standard" }), 0);
  assertEquals(always.calls.length, 3);
});

Deno.test("erreur de lecture (base, Auth) : absorbée, aucun envoi", async () => {
  const { fetch, calls } = resend();
  const broken = store({ recipients: () => Promise.reject(new Error("profiles: timeout")) });
  assertEquals(await sendEmails(deps({ fetch, store: broken }), { type: "match", match_id: MATCH }), 0);
  assertEquals(await sendEmails(deps({ fetch, store: broken }), { type: "verdict", user_id: A, copy_key: "verdict.standard" }), 0);
  assertEquals(await sendEmails(deps({ fetch }), { type: "match", match_id: "55555555-5555-4555-8555-555555555555" }), 0);
  assertEquals(calls.length, 0);
});

Deno.test("contenu échappé : prénom piégé, pas de HTML injecté ni de saut de ligne dans le sujet", async () => {
  const people = new Map([[A, { email: "eve@exemple.fr", name: '<img src=x onerror=alert(1)> & "co"\nBcc: x' }]]);
  const [email] = await buildEmails(store({ recipients: () => Promise.resolve(people) }), CONFIG, {
    type: "verdict",
    user_id: A,
    copy_key: "verdict.standard",
  });
  assertFalse(email.html.includes("<img"));
  assertStringIncludes(email.html, "&#60;img src=x onerror=alert(1)&#62; &#38; &#34;co&#34;");
  assertFalse(email.subject.includes("\n"));
  assertStringIncludes(email.subject, "Bcc: x");
});

Deno.test("textes absents ou vides dans app_copy : repli non vide", async () => {
  const empty = store({ copy: () => Promise.resolve(new Map([["email.verdict.subject", "  "]])) });
  const [verdict] = await buildEmails(empty, CONFIG, { type: "verdict", user_id: B, copy_key: "verdict.inconnu" });
  assertEquals(verdict.subject, "Votre verdict est tombé.");
  assertStringIncludes(verdict.html, "Verdict rendu.");
  assertStringIncludes(verdict.text, "Bruno, votre verdict vous attend dans l'application.");

  const anonymous = store({ recipients: () => Promise.resolve(new Map([[A, { email: "a@exemple.fr", name: null }]])) });
  const [match] = await buildEmails(anonymous, CONFIG, { type: "match", match_id: MATCH });
  assertStringIncludes(match.text, "Bonjour, quelqu'un vous a liké en retour.");
});

const confirmed = (id: string, email: string, extra: Partial<User> = {}) => ({
  id,
  email,
  email_confirmed_at: "2026-10-01T00:00:00Z",
  ...extra,
});

Deno.test("destinataires : adresse lue par l'API admin ; bannis, supprimés et adresses non confirmées ignorés", async () => {
  const C = "66666666-6666-4666-8666-666666666666";
  const D = "77777777-7777-4777-8777-777777777777";
  const E = "88888888-8888-4888-8888-888888888888";
  const db = new FakeSupabase();
  db.tables.profiles = [
    { id: A, display_name: "Alice", status: "active" },
    { id: B, display_name: "Bruno", status: "banned" },
    { id: C, display_name: "Chloé", status: "paused" },
    { id: D, display_name: "Dan", status: "active" },
    { id: E, display_name: "Emma", status: "active" },
    // Pas de profil pour F : compte supprimé (cascade).
  ];
  db.users = {
    [A]: confirmed(A, "alice@exemple.fr"),
    [B]: confirmed(B, "bruno@exemple.fr"),
    [C]: confirmed(C, "chloe@exemple.fr", { banned_until: "2999-01-01T00:00:00Z" }),
    [D]: { id: D, email: "dan@exemple.fr", email_confirmed_at: null },
    // E : profil sans compte Auth (supprimé entre-temps).
  };
  const F = "99999999-9999-4999-8999-999999999999";
  const people = await createEmailStore(db.asClient()).recipients([A, B, C, D, E, F]);
  assertEquals([...people.entries()], [[A, { email: "alice@exemple.fr", name: "Alice" }]]);
  // Le compte banni n'est même pas lu dans Auth.
  assertFalse(db.authCalls.includes(B));
  assertEquals(db.writes(), []);
});

Deno.test("match en base : seul le membre non banni reçoit l'email", async () => {
  const db = new FakeSupabase();
  db.tables.matches = [{ id: MATCH, user_a: A, user_b: B }];
  db.tables.profiles = [
    { id: A, display_name: "Alice", status: "active" },
    { id: B, display_name: "Bruno", status: "banned" },
  ];
  db.tables.app_copy = [...COPY].map(([key, text]) => ({ key, locale: "fr", text }));
  db.users = { [A]: confirmed(A, "alice@exemple.fr"), [B]: confirmed(B, "bruno@exemple.fr") };
  const { fetch, calls } = resend();
  const sent = await sendEmails({ store: createEmailStore(db.asClient()), config: CONFIG, fetch }, { type: "match", match_id: MATCH });
  assertEquals(sent, 1);
  assertEquals(calls.map((c) => c.payload.to), [["alice@exemple.fr"]]);
  assertEquals(calls[0].payload.subject, "Nouveau match.");
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

Deno.test("clés email : toutes créées par une migration idempotente, avec {name} et {verdict}", async () => {
  const dir = new URL("../../migrations/", import.meta.url);
  let sql = "";
  for await (const entry of Deno.readDir(dir)) {
    const content = await Deno.readTextFile(new URL(entry.name, dir));
    if (content.includes("'email.footer'")) sql = content;
  }
  assert(sql, "aucune migration ne crée les textes des emails");
  for (const key of EMAIL_COPY_KEYS) assertStringIncludes(sql, `('${key}', 'fr',`);
  assertStringIncludes(sql, "on conflict (key, locale) do nothing");
  assertStringIncludes(sql, "{verdict}");
  assertStringIncludes(sql, "{name}");
});

Deno.test("événement : email de confirmation, sans le lieu exact, lien vers l'événement", async () => {
  const [email, ...rest] = await buildEmails(store(), CONFIG, { type: "event", kind: "registered", registration_id: REG_A });
  assertEquals(rest, []);
  assertEquals(email.to, "alice@exemple.fr");
  assertEquals(email.subject, "Place confirmée : Dîner de thèse");
  assertStringIncludes(email.text, "Alice, rendez-vous samedi 14 novembre à 19 h 30.");
  assertStringIncludes(email.html, "https://app.sapios.test/events/" + EVENT);
  assertEquals(email.idempotencyKey, `event-registered-${REG_A}-${A}`);
});

Deno.test("événement annulé : le motif figure dans l'email", async () => {
  const cancelled = store({
    registration: () => Promise.resolve({ user_id: B, event_id: EVENT, status: "cancelled" }),
    event: () => Promise.resolve({ ...DINNER, status: "cancelled", cancel_reason: "Le restaurant ferme ce soir-là." }),
  });
  const [email] = await buildEmails(cancelled, CONFIG, { type: "event", kind: "cancelled", registration_id: REG_A });
  assertEquals(email.to, "bruno@exemple.fr");
  assertEquals(email.subject, "Annulé : Dîner de thèse");
  assertStringIncludes(email.text, "Le restaurant ferme ce soir-là.");
});

Deno.test("rappel de la veille : un email par personne inscrite", async () => {
  const emails = await buildEmails(store(), CONFIG, { type: "event_reminder", event_id: EVENT });
  assertEquals(emails.map((e) => e.to), ["alice@exemple.fr", "bruno@exemple.fr"]);
  assertEquals(emails[1].idempotencyKey, `event-reminder-${EVENT}-${B}`);
});

Deno.test("événement périmé ou inconnu : aucun email", async () => {
  const stale = store({ registration: () => Promise.resolve({ user_id: A, event_id: EVENT, status: "cancelled" }) });
  assertEquals(await buildEmails(stale, CONFIG, { type: "event", kind: "registered", registration_id: REG_A }), []);
  assertEquals(await buildEmails(store(), CONFIG, { type: "event_reminder", event_id: MATCH }), []);
});

Deno.test("clés email d'événement : toutes créées par une migration idempotente", async () => {
  const dir = new URL("../../migrations/", import.meta.url);
  let sql = "";
  for await (const entry of Deno.readDir(dir)) {
    const content = await Deno.readTextFile(new URL(entry.name, dir));
    if (content.includes("'email.event.cta'")) sql = content;
  }
  assert(sql, "aucune migration ne crée les textes des emails d'événement");
  for (const key of EVENT_EMAIL_COPY_KEYS) assertStringIncludes(sql, `('${key}', 'fr',`);
  assertStringIncludes(sql, "on conflict (key, locale) do nothing");
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

Deno.test("inactivité : compte banni ou supprimé, aucun email ; jamais de push", async () => {
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

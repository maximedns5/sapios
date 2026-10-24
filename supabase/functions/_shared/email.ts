// Emails transactionnels via l'API HTTP de Resend : verdict, nouveau match, événements et avertissement
// d'inactivité (docs/EMAILS.md).
// Complément du push, absent de l'app web : canal facultatif, jamais bloquant. Toute erreur est
// journalisée puis absorbée. Pas d'email pour les messages (le badge de l'app suffit).
import type { SupabaseClient, User } from "./deps.ts";
import { cleanText, type EmailContent, renderHtml, renderText } from "./email_template.ts";
import { createPushStore, type EventMoment, eventTargets, eventVars, fill, type PushStore } from "./push.ts";
import type { NotifyRequest } from "./shared.ts";

export const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;
/** Une admission par lot envoie plusieurs verdicts d'un coup : la limite de débit de Resend tombe vite. */
const RESEND_MAX_ATTEMPTS = 3;

/** Clés `app_copy` des emails (migration 20261021091000_email_copy.sql). */
export const EMAIL_COPY_KEYS = [
  "email.verdict.subject",
  "email.verdict.title",
  "email.verdict.body",
  "email.verdict.cta",
  "email.match.subject",
  "email.match.title",
  "email.match.body",
  "email.match.cta",
  "email.footer",
] as const;

/** Clés `app_copy` des emails d'événement (migration 20261024090300_lot2_copy.sql). */
export const EVENT_EMAIL_COPY_KEYS = [
  "email.event.registered.subject",
  "email.event.registered.title",
  "email.event.registered.body",
  "email.event.promoted.subject",
  "email.event.promoted.title",
  "email.event.promoted.body",
  "email.event.cancelled.subject",
  "email.event.cancelled.title",
  "email.event.cancelled.body",
  "email.event.reminder.subject",
  "email.event.reminder.title",
  "email.event.reminder.body",
  "email.event.cta",
] as const;
/** Clés `app_copy` de l'email d'inactivité (migration 20261026090300_conformite_copy.sql). */
export const INACTIVITY_EMAIL_COPY_KEYS = [
  "email.inactivity.subject",
  "email.inactivity.title",
  "email.inactivity.body",
  "email.inactivity.cta",
] as const;
export type EmailCopyKey =
  | (typeof EMAIL_COPY_KEYS)[number]
  | (typeof EVENT_EMAIL_COPY_KEYS)[number]
  | (typeof INACTIVITY_EMAIL_COPY_KEYS)[number];

/** Repli si une clé manque ou est vide dans `app_copy` : un email n'est jamais vide. */
const FALLBACK_COPY: Record<EmailCopyKey, string> = {
  "email.verdict.subject": "Votre verdict est tombé.",
  "email.verdict.title": "{verdict}",
  "email.verdict.body": "{name}, votre verdict vous attend dans l'application.",
  "email.verdict.cta": "Voir mon verdict",
  "email.match.subject": "Nouveau match.",
  "email.match.title": "Nouveau match.",
  "email.match.body": "{name}, quelqu'un vous a liké en retour. La suite se passe dans l'application.",
  "email.match.cta": "Ouvrir la conversation",
  "email.footer": "Vous recevez cet email parce que vous avez un compte Sapios.",
  "email.event.registered.subject": "Place confirmée : {title}",
  "email.event.registered.title": "Votre place est réservée.",
  "email.event.registered.body": "{name}, rendez-vous {date}. L'adresse exacte et votre billet sont dans l'application.",
  "email.event.promoted.subject": "Une place s'est libérée : {title}",
  "email.event.promoted.title": "Vous êtes inscrit·e.",
  "email.event.promoted.body": "{name}, une place s'est libérée pour « {title} », {date}. L'adresse exacte et votre billet sont dans l'application.",
  "email.event.cancelled.subject": "Annulé : {title}",
  "email.event.cancelled.title": "Événement annulé.",
  "email.event.cancelled.body": "{name}, « {title} », prévu {date}, est annulé.\n\n{reason}",
  "email.event.reminder.subject": "C'est demain : {title}",
  "email.event.reminder.title": "C'est demain.",
  "email.event.reminder.body": "{name}, « {title} » a lieu {date}. L'adresse exacte et votre billet sont dans l'application.",
  "email.event.cta": "Voir l'événement",
  "email.inactivity.subject": "Votre compte Sapios sera supprimé le {date}",
  "email.inactivity.title": "Vous nous manquez. Un peu.",
  "email.inactivity.body":
    "{name}, vous ne vous êtes pas connecté·e depuis longtemps. Sans connexion d'ici le {date}, votre compte et toutes vos données seront supprimés. Pour le garder, il suffit d'ouvrir l'application.",
  "email.inactivity.cta": "Garder mon compte",
};
/** `{name}` sans prénom affiché : « Bonjour, … ». */
const FALLBACK_NAME = "Bonjour";
const FALLBACK_VERDICT = "Verdict rendu.";

export type EmailKind = "verdict" | "match" | "event" | "inactivity" | "emploi";

export interface EmailConfig {
  apiKey: string;
  /** Expéditeur sur le domaine vérifié chez Resend, ex. `Sapios <bonjour@mail.exemple.fr>`. */
  from: string;
  /** Adresse de l'app membre, sans « / » final ; null : emails sans lien. */
  appUrl: string | null;
}

export interface EmailRecipient {
  email: string;
  /** Prénom affiché du destinataire. */
  name: string | null;
}

export interface EmailStore extends Pick<PushStore, "matchParticipants" | "copy" | "registration" | "event" | "eventAttendees"> {
  /** Adresses lues côté serveur ; les comptes bannis, supprimés ou sans adresse confirmée sont absents. */
  recipients(userIds: string[]): Promise<Map<string, EmailRecipient>>;
}

export interface EmailDeps {
  store: EmailStore;
  /** null : canal désactivé (RESEND_API_KEY ou EMAIL_FROM absent). */
  config: EmailConfig | null;
  fetch?: typeof fetch;
  /** Attente entre deux essais (remplacée dans les tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface OutgoingEmail {
  userId: string;
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}

type Env = (name: string) => string | undefined;

export function emailConfigFromEnv(env: Env = (name) => Deno.env.get(name)): EmailConfig | null {
  const apiKey = env("RESEND_API_KEY")?.trim();
  const from = env("EMAIL_FROM")?.trim();
  if (!apiKey || !from) return null;
  if (!from.includes("@")) {
    console.warn("email : EMAIL_FROM n'est pas une adresse, canal désactivé");
    return null;
  }
  const rawUrl = env("SAPIOS_APP_URL")?.trim();
  let appUrl: string | null = null;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "https:" || url.protocol === "http:") appUrl = url.toString().replace(/\/+$/, "");
    } catch {
      // traité juste en dessous
    }
    if (!appUrl) console.warn("email : SAPIOS_APP_URL invalide, emails envoyés sans lien");
  }
  return { apiKey, from, appUrl };
}

function text(copy: Map<string, string>, key: string, fallback: string, vars: Record<string, string>): string {
  const raw = copy.get(key);
  return fill(raw?.trim() ? raw : fallback, vars);
}

/** Textes d'un email : sujet, titre, corps et bouton. */
interface EmailKeys {
  subject: EmailCopyKey;
  title: EmailCopyKey;
  body: EmailCopyKey;
  cta: EmailCopyKey;
}

const VERDICT_KEYS: EmailKeys = {
  subject: "email.verdict.subject",
  title: "email.verdict.title",
  body: "email.verdict.body",
  cta: "email.verdict.cta",
};
const MATCH_KEYS: EmailKeys = {
  subject: "email.match.subject",
  title: "email.match.title",
  body: "email.match.body",
  cta: "email.match.cta",
};
const INACTIVITY_KEYS: EmailKeys = {
  subject: "email.inactivity.subject",
  title: "email.inactivity.title",
  body: "email.inactivity.body",
  cta: "email.inactivity.cta",
};
function eventKeys(moment: EventMoment): EmailKeys {
  return {
    subject: `email.event.${moment}.subject`,
    title: `email.event.${moment}.title`,
    body: `email.event.${moment}.body`,
    cta: "email.event.cta",
  };
}
const LABELS: Record<EmailKind, string> = {
  verdict: "Sapios · Verdict",
  match: "Sapios · Match",
  event: "Sapios · Événement",
  inactivity: "Sapios · Compte",
  emploi: "Sapios Emploi",
};

/** « 14 décembre 2028 » pour une date AAAA-MM-JJ ; chaîne vide si illisible. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" })
    .format(date);
}

function compose(
  kind: EmailKind,
  keys: EmailKeys,
  userId: string,
  recipient: EmailRecipient,
  copy: Map<string, string>,
  vars: Record<string, string>,
  url: string | null,
  idempotencyKey?: string,
): OutgoingEmail {
  const t = (key: EmailCopyKey) => text(copy, key, FALLBACK_COPY[key], vars);
  const content: EmailContent = {
    label: LABELS[kind],
    subject: cleanText(t(keys.subject)),
    title: t(keys.title),
    body: t(keys.body),
    cta: url ? { label: t(keys.cta), url } : undefined,
    footer: t("email.footer"),
    inverted: kind === "verdict",
  };
  return {
    userId,
    kind,
    to: recipient.email,
    subject: content.subject,
    html: renderHtml(content),
    text: renderText(content),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

/**
 * Emails d'une notification (sans les envoyer). Données exposées : prénom du destinataire et, pour le
 * verdict, son propre verdict ; pour un événement, son titre, sa date et le motif d'annulation, jamais
 * le lieu exact ni les autres inscrits. Jamais le prénom de l'autre personne d'un match : avec le
 * genre du destinataire, il suffirait à deviner une orientation (donnée sensible, brief §9).
 */
export async function buildEmails(store: EmailStore, config: EmailConfig, req: NotifyRequest): Promise<OutgoingEmail[]> {
  if (req.type === "verdict") {
    const [people, copy] = await Promise.all([
      store.recipients([req.user_id]),
      store.copy([...EMAIL_COPY_KEYS, req.copy_key]),
    ]);
    const person = people.get(req.user_id);
    if (!person) return [];
    const verdict = copy.get(req.copy_key)?.trim() || FALLBACK_VERDICT;
    const vars = { name: person.name ?? FALLBACK_NAME, verdict };
    return [compose("verdict", VERDICT_KEYS, req.user_id, person, copy, vars, config.appUrl ? `${config.appUrl}/` : null)];
  }

  if (req.type === "match") {
    const pair = await store.matchParticipants(req.match_id);
    if (!pair) return [];
    const [people, copy] = await Promise.all([store.recipients(pair), store.copy([...EMAIL_COPY_KEYS])]);
    const url = config.appUrl ? `${config.appUrl}/chat/${req.match_id}` : null;
    return pair.flatMap((userId) => {
      const person = people.get(userId);
      if (!person) return [];
      const vars = { name: person.name ?? FALLBACK_NAME };
      return [compose("match", MATCH_KEYS, userId, person, copy, vars, url, `match-${req.match_id}-${userId}`)];
    });
  }

  if (req.type === "inactivity") {
    const [people, copy] = await Promise.all([
      store.recipients([req.user_id]),
      store.copy([...INACTIVITY_EMAIL_COPY_KEYS, "email.footer"]),
    ]);
    const person = people.get(req.user_id);
    if (!person) return [];
    const vars = { name: person.name ?? FALLBACK_NAME, date: formatDay(req.delete_after) };
    const url = config.appUrl ? `${config.appUrl}/` : null;
    return [compose("inactivity", INACTIVITY_KEYS, req.user_id, person, copy, vars, url,
      `inactivity-${req.user_id}-${req.delete_after}`)];
  }

  if (req.type === "event" || req.type === "event_reminder") {
    const found = await eventTargets(store, req);
    if (!found) return [];
    const keys = eventKeys(found.moment);
    const [people, copy] = await Promise.all([
      store.recipients(found.userIds),
      store.copy([...Object.values(keys), "email.footer"]),
    ]);
    const url = config.appUrl ? `${config.appUrl}/events/${found.event.id}` : null;
    // Un rappel par événement et par personne ; une inscription ne reçoit qu'un email par étape.
    const idem = req.type === "event" ? `event-${req.kind}-${req.registration_id}` : `event-reminder-${found.event.id}`;
    return found.userIds.flatMap((userId) => {
      const person = people.get(userId);
      if (!person) return [];
      const vars = { ...eventVars(found.event), name: person.name ?? FALLBACK_NAME };
      return [compose("event", keys, userId, person, copy, vars, url, `${idem}-${userId}`)];
    });
  }

  return [];
}

type ResendBody = { id?: string; name?: string; message?: string };

async function postOnce(doFetch: typeof fetch, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await doFetch(RESEND_API_URL, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null) as ResendBody | null;
    return { status: res.status, ok: res.ok, retryAfter: res.headers.get("retry-after"), body };
  } finally {
    clearTimeout(timer);
  }
}

/** Délai avant de réessayer après un 429 : `retry-after` (secondes) borné à 5 s, plus un peu de hasard. */
function retryDelayMs(retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  const base = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 5) * 1000 : 1000;
  return base + Math.floor(Math.random() * 500);
}

/** Un envoi ; renvoie true si Resend l'a accepté. Réessaie seulement après un 429. N'échoue jamais. */
export async function sendResend(deps: EmailDeps & { config: EmailConfig }, email: OutgoingEmail): Promise<boolean> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${deps.config.apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "sapios-notify",
  };
  if (email.idempotencyKey) headers["Idempotency-Key"] = email.idempotencyKey;
  const body = JSON.stringify({
    from: deps.config.from,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [{ name: "category", value: email.kind }],
  });
  // Journaux : identifiant du compte, jamais l'adresse.
  const who = `${email.kind} ${email.userId}`;
  for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await postOnce(doFetch, { method: "POST", headers, body });
    } catch (err) {
      console.error(`email ${who} : Resend injoignable`, err instanceof Error ? err.message : err);
      return false;
    }
    if (res.ok && typeof res.body?.id === "string") return true;
    if (res.status === 429 && attempt < RESEND_MAX_ATTEMPTS) {
      await sleep(retryDelayMs(res.retryAfter));
      continue;
    }
    console.error(`email ${who} : refusé par Resend`, res.status, res.body?.name ?? "", res.body?.message ?? "");
    return false;
  }
  return false;
}

/** Envoie les emails d'un événement ; renvoie le nombre acceptés par Resend. Ne rejette jamais. */
export async function sendEmails(deps: EmailDeps, req: NotifyRequest): Promise<number> {
  if (req.type === "message") return 0;
  if (!deps.config) {
    console.info(`email : canal désactivé (RESEND_API_KEY ou EMAIL_FROM absent), ${req.type} sans email`);
    return 0;
  }
  try {
    const emails = await buildEmails(deps.store, deps.config, req);
    let sent = 0;
    // Un par un : la limite de débit de Resend est basse (quelques requêtes par seconde).
    for (const email of emails) if (await sendResend({ ...deps, config: deps.config }, email)) sent++;
    return sent;
  } catch (err) {
    console.error(`email ${req.type} : préparation impossible`, err);
    return 0;
  }
}

/** Adresse utilisable : confirmée, compte ni supprimé, ni anonyme, ni suspendu côté Auth. */
export function deliverableAddress(user: User, now = Date.now()): string | null {
  if (!user.email || !user.email_confirmed_at || user.deleted_at || user.is_anonymous) return null;
  if (user.banned_until && Date.parse(user.banned_until) > now) return null;
  return user.email;
}

export function createEmailStore(db: SupabaseClient): EmailStore {
  const push = createPushStore(db);
  return {
    matchParticipants: push.matchParticipants,
    copy: push.copy,
    registration: push.registration,
    event: push.event,
    eventAttendees: push.eventAttendees,
    async recipients(userIds) {
      const out = new Map<string, EmailRecipient>();
      if (userIds.length === 0) return out;
      // Profil absent = compte supprimé (cascade) ; profil banni = jamais d'email.
      const { data, error } = await db.from("profiles").select("id, display_name, status").in("id", userIds);
      if (error) throw new Error(`profiles: ${error.message}`);
      for (const p of data ?? []) {
        if (p.status === "banned") continue;
        const { data: auth, error: authError } = await db.auth.admin.getUserById(p.id as string);
        if (authError || !auth?.user) {
          if (authError?.status !== 404) console.warn("email : compte illisible", p.id, authError?.message);
          continue;
        }
        const email = deliverableAddress(auth.user);
        if (email) out.set(p.id as string, { email, name: (p.display_name as string | null)?.trim() || null });
      }
      return out;
    },
  };
}

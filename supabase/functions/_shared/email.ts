// Emails transactionnels via l'API HTTP de Resend : verdict et nouveau match (docs/EMAILS.md).
// Complément du push, absent de l'app web : canal facultatif, jamais bloquant. Toute erreur est
// journalisée puis absorbée. Pas d'email pour les messages (le badge de l'app suffit).
import type { SupabaseClient, User } from "./deps.ts";
import { cleanText, type EmailContent, renderHtml, renderText } from "./email_template.ts";
import { createPushStore, fill, type PushStore } from "./push.ts";
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
export type EmailCopyKey = (typeof EMAIL_COPY_KEYS)[number];

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
};
/** `{name}` sans prénom affiché : « Bonjour, … ». */
const FALLBACK_NAME = "Bonjour";
const FALLBACK_VERDICT = "Verdict rendu.";

export type EmailKind = "verdict" | "match";

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

export interface EmailStore extends Pick<PushStore, "matchParticipants" | "copy"> {
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

function compose(
  kind: EmailKind,
  userId: string,
  recipient: EmailRecipient,
  copy: Map<string, string>,
  vars: Record<string, string>,
  url: string | null,
  idempotencyKey?: string,
): OutgoingEmail {
  const t = (key: EmailCopyKey) => text(copy, key, FALLBACK_COPY[key], vars);
  const content: EmailContent = {
    label: kind === "verdict" ? "Sapios · Verdict" : "Sapios · Match",
    subject: cleanText(t(`email.${kind}.subject`)),
    title: t(`email.${kind}.title`),
    body: t(`email.${kind}.body`),
    cta: url ? { label: t(`email.${kind}.cta`), url } : undefined,
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
 * Emails d'un événement (sans les envoyer). Données exposées : prénom du destinataire et, pour le
 * verdict, son propre verdict. Jamais le prénom de l'autre personne d'un match : avec le genre du
 * destinataire, il suffirait à deviner une orientation (donnée sensible, brief §9).
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
    return [compose("verdict", req.user_id, person, copy, vars, config.appUrl ? `${config.appUrl}/` : null)];
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
      return [compose("match", userId, person, copy, vars, url, `match-${req.match_id}-${userId}`)];
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

// Emails transactionnels via l'API HTTP de Resend : avertissement d'inactivité (docs/EMAILS.md) et
// envoi des emails de Sapios Emploi (composés par `emploi_notify.ts`).
// Complément du push : canal facultatif, jamais bloquant. Toute erreur est journalisée puis absorbée.
import type { SupabaseClient, User } from "./deps.ts";
import { cleanText, type EmailContent, renderHtml, renderText } from "./email_template.ts";
import { fill } from "./push.ts";
import type { NotifyRequest } from "./shared.ts";

export const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;
/** Plusieurs envois d'affilée : la limite de débit de Resend tombe vite. */
const RESEND_MAX_ATTEMPTS = 3;

/** Clés `app_copy` de l'email d'inactivité (migration 20261026090300_conformite_copy.sql). */
export const INACTIVITY_EMAIL_COPY_KEYS = [
  "email.inactivity.subject",
  "email.inactivity.title",
  "email.inactivity.body",
  "email.inactivity.cta",
] as const;
export type EmailCopyKey = (typeof INACTIVITY_EMAIL_COPY_KEYS)[number] | "email.footer";

/** Repli si une clé manque ou est vide dans `app_copy` : un email n'est jamais vide. */
const FALLBACK_COPY: Record<EmailCopyKey, string> = {
  "email.footer": "Vous recevez cet email parce que vous avez un compte Sapios.",
  "email.inactivity.subject": "Votre compte Sapios sera supprimé le {date}",
  "email.inactivity.title": "Vous nous manquez. Un peu.",
  "email.inactivity.body":
    "{name}, vous ne vous êtes pas connecté·e depuis longtemps. Sans connexion d'ici le {date}, votre compte et toutes vos données seront supprimés. Pour le garder, il suffit d'ouvrir l'application.",
  "email.inactivity.cta": "Garder mon compte",
};
/** `{name}` sans prénom connu : « Bonjour, … ». */
const FALLBACK_NAME = "Bonjour";

export type EmailKind = "inactivity" | "emploi";

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

export interface EmailStore {
  copy(keys: string[]): Promise<Map<string, string>>;
  /** Adresses lues côté serveur ; les comptes supprimés ou sans adresse confirmée sont absents. */
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

const INACTIVITY_KEYS: EmailKeys = {
  subject: "email.inactivity.subject",
  title: "email.inactivity.title",
  body: "email.inactivity.body",
  cta: "email.inactivity.cta",
};
const LABELS: Record<EmailKind, string> = {
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

/** Email d'avertissement d'inactivité (sans l'envoyer) : prénom du destinataire et date de suppression. */
export async function buildEmails(store: EmailStore, config: EmailConfig, req: NotifyRequest): Promise<OutgoingEmail[]> {
  if (req.type !== "inactivity") return [];
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

/** Envoie les emails d'une notification ; renvoie le nombre acceptés par Resend. Ne rejette jamais. */
export async function sendEmails(deps: EmailDeps, req: NotifyRequest): Promise<number> {
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
  return {
    async copy(keys) {
      const { data, error } = await db.from("app_copy").select("key, text").eq("locale", "fr").in("key", keys);
      if (error) throw new Error(`app_copy: ${error.message}`);
      return new Map((data ?? []).map((r) => [r.key as string, r.text as string]));
    },
    async recipients(userIds) {
      const out = new Map<string, EmailRecipient>();
      if (userIds.length === 0) return out;
      // Prénom : celui du candidat, sinon celui du recruteur.
      const [candidates, members] = await Promise.all([
        db.from("candidate_identities").select("user_id, first_name").in("user_id", userIds),
        db.from("company_members").select("user_id, first_name").in("user_id", userIds),
      ]);
      if (candidates.error) throw new Error(`candidate_identities: ${candidates.error.message}`);
      if (members.error) throw new Error(`company_members: ${members.error.message}`);
      const names = new Map<string, string>();
      for (const r of [...(members.data ?? []), ...(candidates.data ?? [])]) {
        const name = (r.first_name as string | null)?.trim();
        if (name) names.set(r.user_id as string, name);
      }
      for (const userId of userIds) {
        // Compte absent (supprimé) : jamais d'email.
        const { data: auth, error: authError } = await db.auth.admin.getUserById(userId);
        if (authError || !auth?.user) {
          if (authError?.status !== 404) console.warn("email : compte illisible", userId, authError?.message);
          continue;
        }
        const email = deliverableAddress(auth.user);
        if (email) out.set(userId, { email, name: names.get(userId) ?? null });
      }
      return out;
    },
  };
}

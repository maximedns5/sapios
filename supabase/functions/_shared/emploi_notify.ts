// Notifications de Sapios Emploi (docs/EMPLOI_CONTRACT.md §8, docs/EMAILS.md « Emploi ») : la base dit qui
// prévenir et avec quelles valeurs (RPC server_emploi_notification, qui renvoie null pour une notification
// périmée) ; ce module écrit les textes. Candidats : push et email. Recruteurs (espace web, sans push) :
// email. Jamais le nom d'un candidat avant le match : la base ne le transmet qu'après.
import type { SupabaseClient } from "./deps.ts";
import { type EmailDeps, type EmailRecipient, type OutgoingEmail, sendResend } from "./email.ts";
import { cleanText, renderHtml, renderText } from "./email_template.ts";
import type { EmploiNotifyEvent } from "./emploi.ts";
import { fill, formatEventDate, isExpoToken, type PushDeps, type PushMessage, sendExpo } from "./push.ts";
import { levelLabel } from "./shared.ts";

export interface EmploiNotification {
  event: EmploiNotifyEvent | "diploma_verdict";
  variant: string | null;
  audience: "candidate" | "recruiter";
  recipients: { user_id: string; name: string | null }[];
  vars: Record<string, string | number | null>;
  /** Chemin du lien des emails (app candidat ou espace recruteur). */
  path: string;
  /** Ce que l'app ouvre depuis le push (PushData `{ type: "emploi", event, id }`). */
  target_id: string;
}

export interface EmploiStore {
  notification(event: string, id: string): Promise<EmploiNotification | null>;
  tokens(userIds: string[]): Promise<{ user_id: string; token: string }[]>;
  recipients(userIds: string[]): Promise<Map<string, EmailRecipient>>;
}

export interface EmploiNotifyDeps {
  store: EmploiStore;
  push: PushDeps;
  email: EmailDeps;
  /** Adresse du site (espace recruteur), sans « / » final ; null : emails recruteurs sans lien. */
  webUrl: string | null;
}

interface Texts {
  push?: string;
  email?: { subject: string; title: string; body: string; cta: string };
}

const FOOTER = "Vous recevez cet email parce que vous avez un compte Sapios Emploi. Inutile de répondre à cette adresse.";

/** Textes par événement (ou `événement.variante`). Variables : {name}, {offer}, {company}, {candidate}, {date}, {count}, {reason}, {level}. */
export const EMPLOI_TEXTS: Record<string, Texts> = {
  application_interested: {
    push: "{company} veut vous rencontrer : c’est un match pour « {offer} ».",
    email: {
      subject: "C’est un match : {company} veut vous rencontrer",
      title: "C’est un match.",
      body: "Bonjour {name},\n\n{company} est intéressé·e par votre candidature au poste de « {offer} ». Votre prénom et votre nom leur sont maintenant visibles, et la conversation est ouverte dans l’application.",
      cta: "Ouvrir la conversation",
    },
  },
  application_rejected: {
    push: "Réponse de {company} pour « {offer} ».",
    email: {
      subject: "Réponse de {company} pour le poste de {offer}",
      title: "Une réponse, comme promis.",
      body: "Bonjour {name},\n\n{company} ne donne pas suite à votre candidature au poste de « {offer} ». Leur message vous attend dans l’application.\n\nVotre CV est resté anonyme : l’entreprise n’a jamais vu votre nom.",
      cta: "Lire la réponse",
    },
  },
  application_closed: {
    push: "{company} n’a pas répondu à temps : votre candidature à « {offer} » est close.",
    email: {
      subject: "{company} n’a pas répondu dans le délai promis",
      title: "Pas de réponse, pas de refus.",
      body: "Bonjour {name},\n\n{company} n’a pas répondu à votre candidature au poste de « {offer} » dans le délai promis. Ce n’est pas un refus : votre candidature est close, et ce retard compte dans le délai de réponse affiché de l’entreprise.\n\nVotre CV est resté anonyme.",
      cta: "Voir des offres proches",
    },
  },
  interview_proposed: {
    push: "{company} vous propose des créneaux d’entretien.",
    email: {
      subject: "{company} vous propose un entretien",
      title: "Choisissez votre créneau.",
      body: "Bonjour {name},\n\n{company} vous propose des créneaux d’entretien pour le poste de « {offer} ». Choisissez celui qui vous convient dans l’application.",
      cta: "Choisir un créneau",
    },
  },
  invitation_received: {
    push: "{company} vous invite à postuler : « {offer} ».",
    email: {
      subject: "{company} vous invite à postuler",
      title: "Une invitation à postuler.",
      body: "Bonjour {name},\n\n{company} a vu votre profil anonyme et vous invite à postuler au poste de « {offer} ». Vous restez anonyme tant que vous ne postulez pas, et rien ne vous y oblige.",
      cta: "Voir l’offre",
    },
  },
  "message.to_candidate": {
    push: "Nouveau message de {company}.",
  },
  "message.to_recruiter": {
    email: {
      subject: "Nouveau message de {candidate} ({offer})",
      title: "Nouveau message.",
      body: "Bonjour {name},\n\n{candidate} vous a écrit au sujet du poste de « {offer} ».",
      cta: "Répondre",
    },
  },
  interview_accepted: {
    email: {
      subject: "Entretien confirmé avec {candidate}",
      title: "Entretien confirmé.",
      body: "Bonjour {name},\n\n{candidate} a choisi le créneau du {date} pour le poste de « {offer} ».",
      cta: "Voir la candidature",
    },
  },
  "company_decided.verified": {
    email: {
      subject: "{company} est vérifiée",
      title: "Entreprise vérifiée.",
      body: "Bonjour {name},\n\n{company} est vérifiée : vos offres peuvent maintenant être publiées après relecture.",
      cta: "Ouvrir l’espace recruteur",
    },
  },
  "company_decided.rejected": {
    email: {
      subject: "Vérification de {company}",
      title: "Vérification refusée.",
      body: "Bonjour {name},\n\nNous n’avons pas pu vérifier {company}.\n\n{reason}",
      cta: "Ouvrir l’espace recruteur",
    },
  },
  "company_decided.suspended": {
    email: {
      subject: "{company} est suspendue",
      title: "Entreprise suspendue.",
      body: "Bonjour {name},\n\nLes offres de {company} ne sont plus visibles.\n\n{reason}",
      cta: "Ouvrir l’espace recruteur",
    },
  },
  "offer_decided.published": {
    email: {
      subject: "Votre offre est en ligne : {offer}",
      title: "Offre publiée.",
      body: "Bonjour {name},\n\n« {offer} » est en ligne. Les candidatures arriveront dans votre pile, anonymes, dans leur ordre d’arrivée.",
      cta: "Voir l’offre",
    },
  },
  "offer_decided.rejected": {
    email: {
      subject: "Votre offre n’a pas été publiée : {offer}",
      title: "Offre à reprendre.",
      body: "Bonjour {name},\n\n« {offer} » n’a pas été publiée.\n\n{reason}\n\nCorrigez-la puis renvoyez-la en vérification.",
      cta: "Modifier l’offre",
    },
  },
  deadline_reminder: {
    email: {
      subject: "{count} candidature(s) attendent votre réponse",
      title: "Réponse attendue.",
      body: "Bonjour {name},\n\n{count} candidature(s) arrivent à échéance d’ici le {date}. Passé ce délai, elles seront closes sans réponse et comptées dans votre délai de réponse moyen, affiché aux candidats.",
      cta: "Répondre",
    },
  },
  "diploma_verdict.approved": {
    push: "Diplôme vérifié : le badge {level} apparaît sur votre CV.",
    email: {
      subject: "Votre diplôme est vérifié",
      title: "Diplôme vérifié.",
      body: "Bonjour {name},\n\nVotre diplôme a été vérifié par notre équipe : le badge {level} apparaît maintenant sur votre CV, anonyme comme le reste.",
      cta: "Voir mon CV",
    },
  },
  "diploma_verdict.rejected": {
    push: "Nous n’avons pas pu vérifier votre diplôme.",
    email: {
      subject: "Vérification de votre diplôme",
      title: "Diplôme non vérifié.",
      body: "Bonjour {name},\n\nNous n’avons pas pu vérifier votre diplôme. Le motif est dans l’application. Vous pouvez postuler sans badge, ou envoyer un autre document.",
      cta: "Voir le motif",
    },
  },
  "diploma_verdict.needs_more": {
    push: "Il nous manque une information pour vérifier votre diplôme.",
    email: {
      subject: "Votre diplôme : une information manque",
      title: "Une information manque.",
      body: "Bonjour {name},\n\nIl nous manque une information pour vérifier votre diplôme. Le détail est dans l’application.",
      cta: "Compléter",
    },
  },
};

/** Variante du verdict d'après la clé de texte du dating transmise par review-diploma. */
export function verdictVariant(copyKey: string): "approved" | "rejected" | "needs_more" {
  if (copyKey === "verdict.rejected") return "rejected";
  if (copyKey === "verdict.needs_more") return "needs_more";
  return "approved";
}

function textKey(n: EmploiNotification): string {
  return n.variant ? `${n.event}.${n.variant}` : n.event;
}

/** Valeurs prêtes à remplir : dates lisibles, niveau européen en « Bac+N » (levelLabel). */
export function emploiVars(n: EmploiNotification, name: string | null): Record<string, string> {
  const out: Record<string, string> = { name: name?.trim() ?? "" };
  for (const [k, v] of Object.entries(n.vars)) {
    if (v === null || v === undefined) out[k] = "";
    else if (k === "date" && typeof v === "string") out[k] = formatEventDate(v);
    else if (k === "level") out[k] = levelLabel(Number(v));
    else out[k] = String(v);
  }
  return out;
}

/** Sans prénom connu, « Bonjour {name}, » devient « Bonjour, ». */
function greet(body: string, vars: Record<string, string>): string {
  const text = fill(body, vars);
  return vars.name ? text : text.replace(/^Bonjour\s*,/, "Bonjour,");
}

export function buildEmploiPush(n: EmploiNotification, tokens: { user_id: string; token: string }[]): PushMessage[] {
  const texts = EMPLOI_TEXTS[textKey(n)];
  if (!texts?.push || n.audience !== "candidate") return [];
  return n.recipients.flatMap((r) => {
    const body = fill(texts.push!, emploiVars(n, r.name));
    return tokens
      .filter((t) => t.user_id === r.user_id && isExpoToken(t.token))
      .map((t): PushMessage => ({ to: t.token, body, data: { type: "emploi", event: n.event, id: n.target_id }, sound: "default" }));
  });
}

export function buildEmploiEmails(
  n: EmploiNotification,
  people: Map<string, EmailRecipient>,
  urls: { appUrl: string | null; webUrl: string | null },
  idempotency: string,
): OutgoingEmail[] {
  const texts = EMPLOI_TEXTS[textKey(n)]?.email;
  if (!texts) return [];
  const base = n.audience === "candidate" ? urls.appUrl : urls.webUrl;
  const url = base ? base + n.path : null;
  return n.recipients.flatMap((r) => {
    const person = people.get(r.user_id);
    if (!person) return [];
    const vars = emploiVars(n, r.name);
    const content = {
      label: "Sapios Emploi",
      subject: cleanText(fill(texts.subject, vars)),
      title: fill(texts.title, vars),
      body: greet(texts.body, vars),
      cta: url ? { label: texts.cta, url } : undefined,
      footer: FOOTER,
    };
    return [{
      userId: r.user_id,
      kind: "emploi" as const,
      to: person.email,
      subject: content.subject,
      html: renderHtml(content),
      text: renderText(content),
      idempotencyKey: `emploi-${idempotency}-${r.user_id}`,
    }];
  });
}

/**
 * Envoie push et emails d'une notification ; renvoie { sent, emailed }, ou null si la base n'a rien à
 * notifier (notification périmée, ou verdict d'un compte qui n'est pas de l'emploi).
 */
export async function dispatchEmploi(
  deps: EmploiNotifyDeps,
  event: string,
  id: string,
  override?: { variant?: string },
): Promise<{ sent: number; emailed: number } | null> {
  const found = await deps.store.notification(event, id);
  if (!found) return null;
  const n = override?.variant ? { ...found, variant: override.variant } : found;
  const userIds = n.recipients.map((r) => r.user_id);
  if (userIds.length === 0) return { sent: 0, emailed: 0 };

  let sent = 0;
  if (n.audience === "candidate" && EMPLOI_TEXTS[textKey(n)]?.push) {
    const messages = buildEmploiPush(n, await deps.store.tokens(userIds));
    if (messages.length > 0) sent = await sendExpo(deps.push, messages);
  }

  let emailed = 0;
  const config = deps.email.config;
  if (config && EMPLOI_TEXTS[textKey(n)]?.email) {
    try {
      const people = await deps.store.recipients(userIds);
      const key = `${event}-${n.variant ?? ""}-${String(n.vars.message_id ?? id)}`;
      for (const email of buildEmploiEmails(n, people, { appUrl: config.appUrl, webUrl: deps.webUrl }, key)) {
        if (await sendResend({ ...deps.email, config }, email)) emailed++;
      }
    } catch (err) {
      console.error(`email emploi ${event} : préparation impossible`, err);
    }
  }
  return { sent, emailed };
}

function urlFromEnv(name: string): string | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

export function createEmploiStore(db: SupabaseClient, push: PushDeps, email: EmailDeps): EmploiStore {
  return {
    async notification(event, id) {
      const { data, error } = await db.rpc("server_emploi_notification", { p_event: event, p_id: id });
      if (error) throw new Error(`server_emploi_notification: ${error.message}`);
      return (data ?? null) as EmploiNotification | null;
    },
    tokens: (userIds) => push.store.tokens(userIds),
    recipients: (userIds) => email.store.recipients(userIds),
  };
}

export function emploiDepsFromEnv(db: SupabaseClient, push: PushDeps, email: EmailDeps): EmploiNotifyDeps {
  return { store: createEmploiStore(db, push, email), push, email, webUrl: urlFromEnv("SAPIOS_WEB_URL") };
}

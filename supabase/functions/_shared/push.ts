// Notifications push via Expo (brief §7.3 « Push »). Utilisé par `notify` et `review-diploma`.
import type { SupabaseClient } from "./deps.ts";
import type { EventNotifyKind, NotifyRequest, PushData } from "./shared.ts";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;
const LOCALE = "fr";

/** Repli si une clé manque dans `app_copy` : une notification n'est jamais vide. */
const FALLBACK_COPY: Record<string, string> = {
  "push.match": "Nouveau match.",
  "push.message": "Nouveau message.",
  "push.verdict": "Votre verdict est tombé.",
  "push.event.registered": "Place confirmée : {title}, {date}.",
  "push.event.promoted": "Une place s'est libérée : vous êtes inscrit·e à {title}.",
  "push.event.cancelled": "{title} est annulé.",
  "push.event.reminder": "C'est demain : {title}, {date}.",
};

export interface PushMessage {
  to: string;
  title?: string;
  body: string;
  data: PushData;
  sound: "default";
}

/** Événement vu par les notifications (jamais le lieu exact : il reste dans l'application). */
export interface EventInfo {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  cancel_reason: string | null;
}

export interface PushStore {
  matchParticipants(matchId: string): Promise<[string, string] | null>;
  message(messageId: string): Promise<{ match_id: string; sender_id: string } | null>;
  displayNames(userIds: string[]): Promise<Map<string, string>>;
  copy(keys: string[]): Promise<Map<string, string>>;
  tokens(userIds: string[]): Promise<{ user_id: string; token: string }[]>;
  deleteTokens(tokens: string[]): Promise<void>;
  /** Inscription à un événement : membre, événement, statut actuel. */
  registration(registrationId: string): Promise<{ user_id: string; event_id: string; status: string } | null>;
  event(eventId: string): Promise<EventInfo | null>;
  /** Places confirmées (statut `registered`) : destinataires du rappel de la veille. */
  eventAttendees(eventId: string): Promise<string[]>;
}

export type EventMoment = EventNotifyKind | "reminder";

/**
 * Événement et destinataires d'une notification d'événement ; null s'il n'y a rien à envoyer.
 * Une notification périmée ne part pas : désinscrit entre-temps, événement annulé depuis.
 */
export async function eventTargets(
  store: Pick<PushStore, "registration" | "event" | "eventAttendees">,
  req: NotifyRequest,
): Promise<{ event: EventInfo; moment: EventMoment; userIds: string[] } | null> {
  if (req.type === "event") {
    const reg = await store.registration(req.registration_id);
    if (!reg || reg.status !== (req.kind === "cancelled" ? "cancelled" : "registered")) return null;
    const event = await store.event(reg.event_id);
    if (!event || event.status !== (req.kind === "cancelled" ? "cancelled" : "published")) return null;
    return { event, moment: req.kind, userIds: [reg.user_id] };
  }
  if (req.type === "event_reminder") {
    const event = await store.event(req.event_id);
    if (!event || event.status !== "published") return null;
    const userIds = await store.eventAttendees(event.id);
    return userIds.length > 0 ? { event, moment: "reminder", userIds } : null;
  }
  return null;
}

/** « samedi 14 novembre à 19 h 30 », heure de Paris. */
export function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${day} à ${hour} h ${minute}`;
}

/** Variables des textes d'événement : {title}, {date}, {reason}. */
export function eventVars(event: EventInfo): Record<string, string> {
  return { title: event.title, date: formatEventDate(event.starts_at), reason: event.cancel_reason ?? "" };
}

export interface PushDeps {
  store: PushStore;
  fetch?: typeof fetch;
  accessToken?: string;
}

/** Remplace `{nom}` par `vars.nom` ; une variable inconnue reste telle quelle. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all).trim();
}

export function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/** Construit les notifications d'un événement (sans les envoyer). */
export async function buildMessages(store: PushStore, req: NotifyRequest): Promise<PushMessage[]> {
  type Target = { userId: string; title?: string; body: string; data: PushData };
  let targets: Target[] = [];

  if (req.type === "match") {
    const pair = await store.matchParticipants(req.match_id);
    if (!pair) return [];
    const [names, copy] = await Promise.all([store.displayNames(pair), store.copy(["push.match"])]);
    const text = copy.get("push.match") ?? FALLBACK_COPY["push.match"];
    // Les deux personnes sont prévenues ; {name} désigne l'autre.
    targets = pair.map((userId, i) => ({
      userId,
      body: fill(text, { name: names.get(pair[1 - i]) ?? "" }),
      data: { type: "match", match_id: req.match_id },
    }));
  } else if (req.type === "message") {
    const msg = await store.message(req.message_id);
    if (!msg) return [];
    const pair = await store.matchParticipants(msg.match_id);
    if (!pair) return [];
    const recipients = pair.filter((id) => id !== msg.sender_id); // jamais l'expéditeur
    const [names, copy] = await Promise.all([store.displayNames([msg.sender_id]), store.copy(["push.message"])]);
    const text = copy.get("push.message") ?? FALLBACK_COPY["push.message"];
    targets = recipients.map((userId) => ({
      userId,
      body: fill(text, { name: names.get(msg.sender_id) ?? "" }),
      data: { type: "message", match_id: msg.match_id, message_id: req.message_id },
    }));
  } else if (req.type === "event" || req.type === "event_reminder") {
    const found = await eventTargets(store, req);
    if (!found) return [];
    const key = `push.event.${found.moment}`;
    const raw = (await store.copy([key])).get(key);
    const body = fill(raw?.trim() ? raw : FALLBACK_COPY[key], eventVars(found.event));
    targets = found.userIds.map((userId) => ({ userId, body, data: { type: "event", event_id: found.event.id } }));
  } else {
    const copy = await store.copy(["push.verdict", req.copy_key]);
    const verdict = copy.get(req.copy_key);
    const head = copy.get("push.verdict") ?? FALLBACK_COPY["push.verdict"];
    targets = [{
      userId: req.user_id,
      title: verdict ? head : undefined,
      body: verdict ?? head,
      data: { type: "verdict", copy_key: req.copy_key },
    }];
  }

  if (targets.length === 0) return [];
  const tokens = await store.tokens(targets.map((t) => t.userId));
  return targets.flatMap((t) =>
    tokens
      .filter((tk) => tk.user_id === t.userId && isExpoToken(tk.token))
      .map((tk): PushMessage => ({
        to: tk.token,
        ...(t.title ? { title: t.title } : {}),
        body: t.body,
        data: t.data,
        sound: "default",
      }))
  );
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Envoie par lots ; supprime les jetons que Expo déclare `DeviceNotRegistered`. Renvoie le nombre accepté. */
export async function sendExpo(deps: PushDeps, messages: PushMessage[]): Promise<number> {
  const doFetch = deps.fetch ?? fetch;
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH);
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (deps.accessToken) headers.Authorization = `Bearer ${deps.accessToken}`;
    let res: Response;
    try {
      res = await doFetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) });
    } catch (err) {
      // Un lot perdu ne bloque pas les suivants ; le push est un complément, pas une garantie.
      console.error("Expo push injoignable", err);
      continue;
    }
    const body = await res.json().catch(() => null) as { data?: ExpoTicket[]; errors?: unknown } | null;
    if (!res.ok || !Array.isArray(body?.data)) {
      console.error("Expo push", res.status, body?.errors ?? body);
      continue;
    }
    body.data.forEach((ticket, j) => {
      if (ticket.status === "ok") sent++;
      else if (ticket.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
      else console.warn("Expo push ticket", ticket.message ?? ticket.details);
    });
  }
  if (dead.length > 0) await deps.store.deleteTokens(dead);
  return sent;
}

export async function notify(deps: PushDeps, req: NotifyRequest): Promise<number> {
  const messages = await buildMessages(deps.store, req);
  return messages.length === 0 ? 0 : await sendExpo(deps, messages);
}

export function createPushStore(db: SupabaseClient): PushStore {
  const fail = (op: string, error: { message: string }): never => {
    throw new Error(`${op}: ${error.message}`);
  };
  return {
    async matchParticipants(matchId) {
      const { data, error } = await db.from("matches").select("user_a, user_b").eq("id", matchId).maybeSingle();
      if (error) fail("matches", error);
      return data ? [data.user_a as string, data.user_b as string] : null;
    },
    async message(messageId) {
      const { data, error } = await db.from("messages").select("match_id, sender_id").eq("id", messageId).maybeSingle();
      if (error) fail("messages", error);
      return data as { match_id: string; sender_id: string } | null;
    },
    async displayNames(userIds) {
      const { data, error } = await db.from("profiles").select("id, display_name").in("id", userIds);
      if (error) fail("profiles", error);
      return new Map((data ?? []).filter((r) => r.display_name).map((r) => [r.id as string, r.display_name as string]));
    },
    async copy(keys) {
      const { data, error } = await db.from("app_copy").select("key, text").eq("locale", LOCALE).in("key", keys);
      if (error) fail("app_copy", error);
      return new Map((data ?? []).map((r) => [r.key as string, r.text as string]));
    },
    async tokens(userIds) {
      const { data, error } = await db.from("push_tokens").select("user_id, token").in("user_id", userIds);
      if (error) fail("push_tokens", error);
      return (data ?? []) as { user_id: string; token: string }[];
    },
    async deleteTokens(tokens) {
      const { error } = await db.from("push_tokens").delete().in("token", tokens);
      if (error) fail("push_tokens delete", error);
    },
    async registration(registrationId) {
      const { data, error } = await db.from("event_registrations").select("user_id, event_id, status")
        .eq("id", registrationId).maybeSingle();
      if (error) fail("event_registrations", error);
      return data as { user_id: string; event_id: string; status: string } | null;
    },
    async event(eventId) {
      const { data, error } = await db.from("events").select("id, title, starts_at, status, cancel_reason")
        .eq("id", eventId).maybeSingle();
      if (error) fail("events", error);
      return data as EventInfo | null;
    },
    async eventAttendees(eventId) {
      const { data, error } = await db.from("event_registrations").select("user_id")
        .eq("event_id", eventId).eq("status", "registered");
      if (error) fail("event_registrations", error);
      return (data ?? []).map((r) => r.user_id as string);
    },
  };
}

export function pushDepsFromEnv(db: SupabaseClient): PushDeps {
  return { store: createPushStore(db), accessToken: Deno.env.get("EXPO_ACCESS_TOKEN") || undefined };
}

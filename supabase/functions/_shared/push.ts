// Notifications push via Expo : envoi par lots, purge des jetons que Expo déclare morts. Les messages
// sont composés par `emploi_notify.ts` (Sapios Emploi).
import type { SupabaseClient } from "./deps.ts";
import type { PushData } from "./shared.ts";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;

export interface PushMessage {
  to: string;
  title?: string;
  body: string;
  data: PushData;
  sound: "default";
}

export interface PushStore {
  tokens(userIds: string[]): Promise<{ user_id: string; token: string }[]>;
  deleteTokens(tokens: string[]): Promise<void>;
}

/** « samedi 14 novembre à 19 h 30 », heure de Paris (dates d'entretien). */
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

export function createPushStore(db: SupabaseClient): PushStore {
  const fail = (op: string, error: { message: string }): never => {
    throw new Error(`${op}: ${error.message}`);
  };
  return {
    async tokens(userIds) {
      const { data, error } = await db.from("push_tokens").select("user_id, token").in("user_id", userIds);
      if (error) fail("push_tokens", error);
      return (data ?? []) as { user_id: string; token: string }[];
    },
    async deleteTokens(tokens) {
      const { error } = await db.from("push_tokens").delete().in("token", tokens);
      if (error) fail("push_tokens delete", error);
    },
  };
}

export function pushDepsFromEnv(db: SupabaseClient): PushDeps {
  return { store: createPushStore(db), accessToken: Deno.env.get("EXPO_ACCESS_TOKEN") || undefined };
}

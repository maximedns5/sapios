// Point d'entrée des notifications, utilisé par `notify` et `review-diploma` : push Expo et email,
// deux canaux indépendants. Un échec de l'email ne touche jamais le push.
import type { SupabaseClient } from "./deps.ts";
import { createEmailStore, type EmailDeps, emailConfigFromEnv, sendEmails } from "./email.ts";
import { dispatchEmploi, emploiDepsFromEnv, type EmploiNotifyDeps, verdictVariant } from "./emploi_notify.ts";
import { notify as sendPush, type PushDeps, pushDepsFromEnv } from "./push.ts";
import type { NotifyRequest, NotifyResponse } from "./shared.ts";

export interface NotifyDeps {
  push: PushDeps;
  email: EmailDeps;
  /** Sapios Emploi : le verdict d'un compte emploi part avec les textes de l'emploi. */
  emploi?: EmploiNotifyDeps;
}

export async function dispatch(deps: NotifyDeps, req: NotifyRequest): Promise<NotifyResponse> {
  if (req.type === "verdict" && deps.emploi) {
    const emploi = await dispatchEmploi(deps.emploi, "diploma_verdict", req.user_id, { variant: verdictVariant(req.copy_key) });
    if (emploi) return emploi;
  }
  const [push, email] = await Promise.allSettled([sendPush(deps.push, req), sendEmails(deps.email, req)]);
  // Une erreur du push (base illisible…) reste une erreur, comme avant l'ajout des emails.
  if (push.status === "rejected") throw push.reason;
  return { sent: push.value, emailed: email.status === "fulfilled" ? email.value : 0 };
}

export function notifyDepsFromEnv(db: SupabaseClient): NotifyDeps {
  const push = pushDepsFromEnv(db);
  const email: EmailDeps = { store: createEmailStore(db), config: emailConfigFromEnv() };
  return { push, email, emploi: emploiDepsFromEnv(db, push, email) };
}

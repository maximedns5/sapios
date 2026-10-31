// Point d'entrée des notifications de la plateforme, utilisé par `notify` et `review-diploma` :
// verdict d'un diplôme (textes de Sapios Emploi, push et email) et avertissement d'inactivité (email).
import type { SupabaseClient } from "./deps.ts";
import { createEmailStore, type EmailDeps, emailConfigFromEnv, sendEmails } from "./email.ts";
import { dispatchEmploi, emploiDepsFromEnv, type EmploiNotifyDeps, verdictVariant } from "./emploi_notify.ts";
import { type PushDeps, pushDepsFromEnv } from "./push.ts";
import type { NotifyRequest, NotifyResponse } from "./shared.ts";

export interface NotifyDeps {
  push: PushDeps;
  email: EmailDeps;
  emploi: EmploiNotifyDeps;
}

export async function dispatch(deps: NotifyDeps, req: NotifyRequest): Promise<NotifyResponse> {
  if (req.type === "verdict") {
    // Null : rien à notifier (compte supprimé entre-temps, ou sans compte emploi).
    return (await dispatchEmploi(deps.emploi, "diploma_verdict", req.user_id, { variant: verdictVariant(req.copy_key) })) ??
      { sent: 0, emailed: 0 };
  }
  // Inactivité : email seulement, jamais de push (avis dans l'app).
  return { sent: 0, emailed: await sendEmails(deps.email, req) };
}

export function notifyDepsFromEnv(db: SupabaseClient): NotifyDeps {
  const push = pushDepsFromEnv(db);
  const email: EmailDeps = { store: createEmailStore(db), config: emailConfigFromEnv() };
  return { push, email, emploi: emploiDepsFromEnv(db, push, email) };
}

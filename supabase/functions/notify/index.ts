// Notifications, appelées avec l'en-tête x-sapios-secret :
// - Sapios Emploi : { type: "emploi", event, id } (candidatures, entretiens, entreprises, offres), par les
//   RPC et les tâches pg_cron de l'emploi ;
// - verdict d'un diplôme : passe directement par `_shared/notify.ts` depuis `review-diploma`, mais reste
//   accepté ici ;
// - avertissement d'inactivité (pg_cron, conformité) : email seulement.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { EMPLOI_NOTIFY_EVENTS } from "../_shared/emploi.ts";
import { dispatchEmploi } from "../_shared/emploi_notify.ts";
import { asString, handle, HttpError, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { dispatch, notifyDepsFromEnv } from "../_shared/notify.ts";
import type { NotifyRequest, NotifyResponse } from "../_shared/shared.ts";

function parseRequest(body: Record<string, unknown>): NotifyRequest {
  switch (body.type) {
    case "verdict": {
      const copyKey = asString(body.copy_key);
      if (isUuid(body.user_id) && copyKey) return { type: "verdict", user_id: body.user_id, copy_key: copyKey };
      break;
    }
    case "inactivity": {
      const deleteAfter = asString(body.delete_after);
      if (isUuid(body.user_id) && deleteAfter && /^\d{4}-\d{2}-\d{2}$/.test(deleteAfter)) {
        return { type: "inactivity", user_id: body.user_id, delete_after: deleteAfter };
      }
      break;
    }
  }
  throw new HttpError(400, "invalid_body");
}

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const body = await readJsonObject(req);
  const deps = notifyDepsFromEnv(adminClient());
  // Sapios Emploi (docs/EMPLOI_CONTRACT.md §8) : { type: "emploi", event, id }.
  if (body.type === "emploi") {
    if (!(EMPLOI_NOTIFY_EVENTS as readonly unknown[]).includes(body.event) || !isUuid(body.id)) {
      throw new HttpError(400, "invalid_body");
    }
    return json((await dispatchEmploi(deps.emploi, body.event as string, body.id)) ?? { sent: 0, emailed: 0 });
  }
  return json(await dispatch(deps, parseRequest(body)) satisfies NotifyResponse);
}));

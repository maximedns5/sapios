// Appelée par trigger (pg_net) au match et au message, avec l'en-tête x-sapios-secret ; par les RPC
// d'événements (inscription, place libérée, annulation) et par le rappel de la veille (pg_cron).
// Le verdict passe directement par `_shared/notify.ts` depuis `review-diploma`, mais reste accepté ici.
// Push Expo pour tout ; email (Resend) pour le verdict, le match et les événements, jamais les messages.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { asString, handle, HttpError, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { dispatch, notifyDepsFromEnv } from "../_shared/notify.ts";
import { EVENT_NOTIFY_KINDS, type EventNotifyKind, type NotifyRequest, type NotifyResponse } from "../_shared/shared.ts";

function parseRequest(body: Record<string, unknown>): NotifyRequest {
  switch (body.type) {
    case "match":
      if (isUuid(body.match_id)) return { type: "match", match_id: body.match_id };
      break;
    case "message":
      if (isUuid(body.message_id)) return { type: "message", message_id: body.message_id };
      break;
    case "verdict": {
      const copyKey = asString(body.copy_key);
      if (isUuid(body.user_id) && copyKey) return { type: "verdict", user_id: body.user_id, copy_key: copyKey };
      break;
    }
    case "event":
      if (isUuid(body.registration_id) && (EVENT_NOTIFY_KINDS as readonly unknown[]).includes(body.kind)) {
        return { type: "event", kind: body.kind as EventNotifyKind, registration_id: body.registration_id };
      }
      break;
    case "event_reminder":
      if (isUuid(body.event_id)) return { type: "event_reminder", event_id: body.event_id };
      break;
  }
  throw new HttpError(400, "invalid_body");
}

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const request = parseRequest(await readJsonObject(req));
  return json(await dispatch(notifyDepsFromEnv(adminClient()), request) satisfies NotifyResponse);
}));

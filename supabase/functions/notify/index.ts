// Appelée par trigger (pg_net) au match et au message, avec l'en-tête x-sapios-secret.
// Le verdict passe directement par `_shared/notify.ts` depuis `review-diploma`, mais reste accepté ici.
// Push Expo pour tout ; email (Resend) pour le verdict et le match seulement.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { asString, handle, HttpError, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { dispatch, notifyDepsFromEnv } from "../_shared/notify.ts";
import type { NotifyRequest, NotifyResponse } from "../_shared/shared.ts";

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
  }
  throw new HttpError(400, "invalid_body");
}

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const request = parseRequest(await readJsonObject(req));
  return json(await dispatch(notifyDepsFromEnv(adminClient()), request) satisfies NotifyResponse);
}));

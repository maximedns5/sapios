// Revue humaine (brief §4.1 étapes 5-6), réservée aux admins (`is_admin()` évalué avec leur JWT).
// La décision passe par `apply_diploma_review` (une transaction : soumission, user_access, audit_log),
// appelée avec la clé service_role, puis le verdict est notifié.
import { adminClient, requireAdmin } from "../_shared/auth.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { asString, handle, HttpError, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { notify, pushDepsFromEnv } from "../_shared/push.ts";
import {
  type AccessTier,
  DIPLOMA_BUCKET,
  isValidLevel,
  REVIEW_DECISIONS,
  type ReviewDecideResponse,
  type ReviewDecision,
  type ReviewSignedUrlResponse,
  SIGNED_URL_TTL_SECONDS,
} from "../_shared/shared.ts";

/** En local, SUPABASE_URL vaut l'adresse interne (kong:8000) : l'URL signée doit viser l'adresse publique. */
function publicUrl(url: string): string {
  const base = Deno.env.get("SAPIOS_PUBLIC_SUPABASE_URL");
  if (!base) return url;
  const u = new URL(url);
  const pub = new URL(base);
  u.protocol = pub.protocol;
  u.host = pub.host;
  return u.toString();
}

async function signedUrl(db: SupabaseClient, submissionId: string): Promise<ReviewSignedUrlResponse> {
  const { data, error } = await db.from("degree_submissions")
    .select("storage_path, file_deleted_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "not_found");
  if (data.file_deleted_at) throw new HttpError(410, "file_purged");
  const signed = await db.storage.from(DIPLOMA_BUCKET).createSignedUrl(data.storage_path as string, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) throw new HttpError(404, "not_found");
  return { url: publicUrl(signed.data.signedUrl) };
}

const BUSINESS_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  invalid_decision: 400,
  invalid_level: 400,
  already_decided: 409,
};

async function decide(
  db: SupabaseClient,
  reviewerId: string,
  submissionId: string,
  body: Record<string, unknown>,
): Promise<ReviewDecideResponse> {
  const decision = body.decision as ReviewDecision;
  if (!REVIEW_DECISIONS.includes(decision)) throw new HttpError(400, "invalid_decision");
  const level = body.level ?? null;
  if (decision === "approve" && !isValidLevel(level)) throw new HttpError(400, "invalid_level");
  if (level !== null && !isValidLevel(level)) throw new HttpError(400, "invalid_level");
  const reason = asString(body.reason)?.trim() || null;

  const { data, error } = await db.rpc("apply_diploma_review", {
    p_submission: submissionId,
    p_reviewer: reviewerId,
    p_decision: decision,
    p_level: decision === "approve" ? level : null,
    p_reason: reason,
  });
  if (error) {
    // Erreur métier : `raise exception '<code>' using errcode = 'P0001'`.
    if (error.code === "P0001") throw new HttpError(BUSINESS_ERROR_STATUS[error.message] ?? 409, error.message);
    throw error;
  }
  const result = (data ?? {}) as { user_id?: string; tier?: AccessTier | null; level?: number | null; copy_key?: string | null };

  if (result.user_id && result.copy_key) {
    // Notification au mieux : la décision est déjà enregistrée et auditée.
    try {
      await notify(pushDepsFromEnv(db), { type: "verdict", user_id: result.user_id, copy_key: result.copy_key });
    } catch (err) {
      console.error("review-diploma: notification du verdict impossible", err);
    }
  }
  return { tier: result.tier ?? null, level: result.level ?? null, copy_key: result.copy_key ?? null };
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireAdmin(req, db);
  const body = await readJsonObject(req);
  if (!isUuid(body.submission_id)) throw new HttpError(400, "invalid_body");

  switch (body.action) {
    case "signed_url":
      return json(await signedUrl(db, body.submission_id));
    case "decide":
      return json(await decide(db, user.id, body.submission_id, body));
    default:
      throw new HttpError(400, "invalid_action");
  }
}, { cors: true }));

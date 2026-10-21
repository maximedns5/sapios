// Soumission d'un diplôme déjà déposé dans `diplomas/{uid}/{uuid}.{ext}` (brief §4.1 étapes 1-2).
// L'insertion `pending` déclenche la mise en file (trigger SQL) ; aucune extraction ici.
import { adminClient, requireUser } from "../_shared/auth.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { checkDiplomaPath, sha256Hex, sniffMime } from "../_shared/files.ts";
import { handle, HttpError, json, readJsonObject } from "../_shared/http.ts";
import {
  DIPLOMA_BUCKET,
  MAX_DIPLOMA_BYTES,
  MAX_LEVEL,
  MAX_SUBMISSIONS_PER_WINDOW,
  SUBMISSION_WINDOW_DAYS,
  type SubmitDiplomaErrorCode,
  type SubmitDiplomaResponse,
} from "../_shared/shared.ts";

const reject = (status: number, code: SubmitDiplomaErrorCode) => new HttpError(status, code);

/**
 * Un fichier refusé n'a rien à faire dans le stockage (minimisation) ; l'utilisateur ne peut pas le
 * supprimer lui-même. On ne touche jamais à un fichier déjà rattaché à une soumission (double envoi).
 */
async function discard(db: SupabaseClient, path: string): Promise<void> {
  const used = await db.from("degree_submissions").select("id").eq("storage_path", path).limit(1);
  if (used.error || (used.data ?? []).length > 0) return;
  const { error } = await db.storage.from(DIPLOMA_BUCKET).remove([path]);
  if (error) console.warn("submit-diploma: suppression du fichier refusé impossible", error.message);
}

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);
  const body = await readJsonObject(req);

  // Requête mal formée : le fichier, lui, n'est pas jugé (le client peut corriger et renvoyer).
  const checked = checkDiplomaPath(body.storage_path, body.mime, user.id);
  if (!checked.ok) throw reject(400, checked.error);
  const { path, mime } = checked;

  const bucket = db.storage.from(DIPLOMA_BUCKET);
  const info = await bucket.info(path);
  if (info.error || !info.data) throw reject(404, "not_found");

  const fail = async (status: number, code: SubmitDiplomaErrorCode): Promise<never> => {
    await discard(db, path);
    throw reject(status, code);
  };

  if ((info.data.size ?? 0) > MAX_DIPLOMA_BYTES) await fail(413, "too_large");

  const access = await db.from("user_access").select("level").eq("user_id", user.id).maybeSingle();
  if (access.error) throw access.error;
  if ((access.data?.level ?? 0) >= MAX_LEVEL) await fail(409, "already_verified_higher");

  const since = new Date(Date.now() - SUBMISSION_WINDOW_DAYS * 86_400_000).toISOString();
  const recent = await db.from("degree_submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (recent.error) throw recent.error;
  if ((recent.count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) await fail(429, "rate_limited");

  const download = await bucket.download(path);
  if (download.error || !download.data) throw reject(404, "not_found");
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  if (bytes.length > MAX_DIPLOMA_BYTES) await fail(413, "too_large");
  // Le contenu doit être du type déclaré (un HEIC renommé en .jpg est refusé ici).
  if (sniffMime(bytes) !== mime) await fail(400, "invalid_type");

  const hash = await sha256Hex(bytes);
  const dup = await db.from("degree_submissions").select("id").eq("doc_sha256", hash).limit(1);
  if (dup.error) throw dup.error;
  if ((dup.data ?? []).length > 0) await fail(409, "duplicate_document");

  const inserted = await db.from("degree_submissions")
    .insert({ user_id: user.id, storage_path: path, mime, doc_sha256: hash, status: "pending" })
    .select("id")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") await fail(409, "duplicate_document");
    throw inserted.error;
  }

  const response: SubmitDiplomaResponse = { submission_id: inserted.data.id as string, status: "pending" };
  return json(response, 201);
}, { cors: true }));

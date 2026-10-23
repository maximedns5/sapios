// Implémentation Supabase du magasin de `process-diploma` (clé service_role).
import type { SupabaseClient } from "../_shared/deps.ts";
import { DIPLOMA_BUCKET, Extraction } from "../_shared/shared.ts";
import type { ProcessStore, QueueMessage, ReviewPayload, SubmissionRow } from "./process.ts";

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`${op}: ${error?.message ?? "erreur inconnue"}`);
}

export function createProcessStore(db: SupabaseClient): ProcessStore {
  const submissions = () => db.from("degree_submissions");

  return {
    async readQueue(qty, visibilitySeconds) {
      const { data, error } = await db.rpc("diploma_queue_read", { p_qty: qty, p_vt: visibilitySeconds });
      if (error) fail("diploma_queue_read", error);
      return ((data ?? []) as Record<string, unknown>[]).map((row): QueueMessage => ({
        msg_id: Number(row.msg_id),
        read_ct: Number(row.read_ct ?? 1),
        message: row.message,
      }));
    },

    async deleteMessage(msgId) {
      const { error } = await db.rpc("diploma_queue_delete", { p_msg_id: msgId });
      if (error) fail("diploma_queue_delete", error);
    },

    async loadSubmission(id) {
      const { data, error } = await submissions()
        .select("id, user_id, storage_path, mime, status, attempts")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("loadSubmission", error);
      return (data as SubmissionRow | null) ?? null;
    },

    async startAttempt(id, attempts) {
      const { data, error } = await submissions()
        .update({ status: "processing", attempts })
        .eq("id", id)
        .in("status", ["pending", "processing"])
        .select("id");
      if (error) fail("startAttempt", error);
      return (data ?? []).length > 0;
    },

    async downloadFile(storagePath) {
      const { data, error } = await db.storage.from(DIPLOMA_BUCKET).download(storagePath);
      if (error || !data) {
        // Objet absent : définitif. Toute autre erreur est transitoire.
        const status = (error as { statusCode?: string | number; status?: number } | null);
        const code = Number(status?.statusCode ?? status?.status ?? 0);
        if (code === 400 || code === 404) return null;
        fail("download", error);
      }
      return new Uint8Array(await data.arrayBuffer());
    },

    async loadIdentity(userId) {
      // Identité chiffrée en base : la RPC serveur la renvoie déchiffrée (clé de service seulement).
      const { data, error } = await db.rpc("server_get_identity", { p_user: userId });
      if (error) fail("loadIdentity", error);
      const row = (data as Array<{ legal_name: string | null; birthdate: string | null }> | null)?.[0];
      return { legal_name: row?.legal_name ?? null, birthdate: row?.birthdate ?? null };
    },

    async otherExtractions(userId, year) {
      const { data, error } = await submissions()
        .select("extracted")
        .neq("user_id", userId)
        .not("extracted", "is", null)
        .eq("extracted->>year_awarded", String(year))
        .limit(500);
      if (error) fail("otherExtractions", error);
      return (data ?? []).flatMap((row) => {
        const parsed = Extraction.safeParse(row.extracted);
        return parsed.success ? [parsed.data] : [];
      });
    },

    async sendToReview(id, payload: ReviewPayload) {
      const { error } = await submissions()
        .update({
          status: "needs_review",
          extracted: payload.extracted,
          confidence: payload.confidence,
          signals: payload.signals,
        })
        .eq("id", id)
        .in("status", ["pending", "processing"]);
      if (error) fail("sendToReview", error);
    },
  };
}

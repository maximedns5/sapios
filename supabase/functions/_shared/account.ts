// Suppression complète d'un compte, partagée par `delete-account` (à la demande du membre) et
// `purge-inactive` (compte inactif averti, conformité) : fichiers par l'API Storage, trace dans
// `audit_log` (sans clé étrangère : elle survit), puis l'utilisateur d'authentification. La cascade
// SQL efface le reste ; les signalements gardent un pseudonyme (migration conformité).
import type { SupabaseClient } from "./deps.ts";
import type { PurgeInactiveResponse } from "./shared.ts";
import { DIPLOMA_BUCKET, PHOTO_BUCKET } from "./shared.ts";
import { listObjects, removeObjects } from "./storage.ts";

/** Sapios Emploi : photos des offres, dans le dossier de l'entreprise. */
export const OFFER_PHOTO_BUCKET = "offer-photos";

export async function deleteAccount(
  db: SupabaseClient,
  userId: string,
  audit: { actorId: string | null; action: string },
): Promise<void> {
  const files: Record<string, number> = {};
  for (const bucket of [PHOTO_BUCKET, DIPLOMA_BUCKET]) {
    const paths = await listObjects(db, bucket, userId);
    files[bucket] = await removeObjects(db, bucket, paths);
  }

  // Sapios Emploi : recruteur seul membre de son entreprise → offres archivées, photos effacées.
  const prepared = await db.rpc("server_prepare_account_deletion", { p_user: userId });
  if (prepared.error) throw prepared.error;
  const offerPhotos = ((prepared.data as { photo_paths?: string[] } | null)?.photo_paths ?? []).filter(Boolean);
  if (offerPhotos.length > 0) files[OFFER_PHOTO_BUCKET] = await removeObjects(db, OFFER_PHOTO_BUCKET, offerPhotos);

  const logged = await db.from("audit_log").insert({
    actor_id: audit.actorId,
    action: audit.action,
    entity: "user",
    entity_id: userId,
    payload: { files },
  });
  if (logged.error) throw logged.error;

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export interface PurgeInactiveDeps {
  /** Comptes avertis dont le délai de grâce est écoulé (RPC `inactive_accounts_to_purge`). */
  listDue(): Promise<string[]>;
  /** Revérification juste avant la suppression (RPC `inactive_purge_eligible`). */
  stillEligible(userId: string): Promise<boolean>;
  deleteAccount(userId: string): Promise<void>;
}

/** Supprime un par un ; un échec ou un membre revenu entre-temps n'arrête pas les suivants. */
export async function purgeInactive(deps: PurgeInactiveDeps): Promise<PurgeInactiveResponse> {
  let purged = 0;
  let skipped = 0;
  for (const userId of await deps.listDue()) {
    try {
      if (!(await deps.stillEligible(userId))) {
        skipped++;
        continue;
      }
      await deps.deleteAccount(userId);
      purged++;
    } catch (err) {
      // Journaux : identifiant du compte, jamais son email.
      console.error("purge-inactive : suppression impossible", userId, err instanceof Error ? err.message : err);
      skipped++;
    }
  }
  return { purged, skipped };
}

export function purgeInactiveDeps(db: SupabaseClient): PurgeInactiveDeps {
  return {
    async listDue() {
      const { data, error } = await db.rpc("inactive_accounts_to_purge", { p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
    async stillEligible(userId) {
      const { data, error } = await db.rpc("inactive_purge_eligible", { p_user: userId });
      if (error) throw error;
      return data === true;
    },
    deleteAccount: (userId) => deleteAccount(db, userId, { actorId: null, action: "account.purge_inactive" }),
  };
}

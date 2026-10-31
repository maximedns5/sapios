// Retrait du dating (migration 20261031090000_nettoyage_dating) : le bucket `photos` des profils est
// vidé par l'API Storage (Supabase bloque le `delete` SQL), puis supprimé. Appelée toutes les 10 minutes
// par la tâche `purge-dating-photos` tant que le bucket existe ; un passage supprime au plus `budget`
// fichiers pour rester sous le délai de la fonction.
import type { SupabaseClient } from "./deps.ts";
import { listObjects, removeObjects } from "./storage.ts";

export const DATING_PHOTO_BUCKET = "photos";
const DEFAULT_BUDGET = 2000;

export interface DatingPhotoStore {
  bucketExists(): Promise<boolean>;
  /** Dossiers de premier niveau (un par compte) et fichiers posés à la racine. */
  listRoot(): Promise<{ folders: string[]; files: string[] }>;
  listFolder(folder: string): Promise<string[]>;
  remove(paths: string[]): Promise<number>;
  deleteBucket(): Promise<void>;
}

export interface PurgeDatingPhotosResponse {
  removed: number;
  bucket_deleted: boolean;
}

export async function purgeDatingPhotos(store: DatingPhotoStore, budget = DEFAULT_BUDGET): Promise<PurgeDatingPhotosResponse> {
  if (!(await store.bucketExists())) return { removed: 0, bucket_deleted: true };
  let removed = 0;
  const root = await store.listRoot();
  if (root.files.length > 0) removed += await store.remove(root.files);
  for (const folder of root.folders) {
    if (removed >= budget) return { removed, bucket_deleted: false };
    const paths = await store.listFolder(folder);
    if (paths.length > 0) removed += await store.remove(paths);
  }
  // Rien ne reste : on vérifie avant de supprimer le bucket (l'API refuse un bucket non vide).
  const after = await store.listRoot();
  if (after.files.length > 0 || after.folders.length > 0) return { removed, bucket_deleted: false };
  await store.deleteBucket();
  return { removed, bucket_deleted: true };
}

export function datingPhotoStore(db: SupabaseClient): DatingPhotoStore {
  const bucket = db.storage.from(DATING_PHOTO_BUCKET);
  return {
    async bucketExists() {
      const { data, error } = await db.storage.getBucket(DATING_PHOTO_BUCKET);
      if (error) {
        // Bucket absent : déjà supprimé. Toute autre erreur remonte.
        if (/not.?found/i.test(error.message)) return false;
        throw new Error(`getBucket ${DATING_PHOTO_BUCKET}: ${error.message}`);
      }
      return data !== null;
    },
    async listRoot() {
      const { data, error } = await bucket.list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`list ${DATING_PHOTO_BUCKET}: ${error.message}`);
      const folders: string[] = [];
      const files: string[] = [];
      // Un dossier n'a pas d'id.
      for (const item of data ?? []) (item.id === null || item.id === undefined ? folders : files).push(item.name);
      return { folders, files };
    },
    listFolder: (folder) => listObjects(db, DATING_PHOTO_BUCKET, folder),
    remove: (paths) => removeObjects(db, DATING_PHOTO_BUCKET, paths),
    async deleteBucket() {
      const { error } = await db.storage.deleteBucket(DATING_PHOTO_BUCKET);
      if (error) throw new Error(`deleteBucket ${DATING_PHOTO_BUCKET}: ${error.message}`);
    },
  };
}

import type { SupabaseClient } from "./deps.ts";

const PAGE = 1000;

/** Tous les chemins d'objets sous `prefix` (récursif), via l'API Storage. */
export async function listObjects(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0;; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Un dossier n'a pas d'id.
      if (item.id === null || item.id === undefined) paths.push(...await listObjects(db, bucket, path));
      else paths.push(path);
    }
    if ((data ?? []).length < PAGE) return paths;
  }
}

/** Supprime les objets par l'API Storage (jamais par un `delete` SQL). Renvoie le nombre supprimé. */
export async function removeObjects(db: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += PAGE) {
    const { data, error } = await db.storage.from(bucket).remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
    removed += (data ?? []).length;
  }
  return removed;
}

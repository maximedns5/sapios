// Tâche quotidienne (pg_cron → pg_net, en-tête x-sapios-secret) : minimisation (brief §4.1 étape 7).
// On garde la ligne (niveau, établissement, année, hash) et l'audit ; seul le fichier brut part.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { handle, json } from "../_shared/http.ts";
import { DIPLOMA_BUCKET, type PurgeDiplomasResponse } from "../_shared/shared.ts";

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const db = adminClient();

  // null : la durée vient de app_settings.diploma_retention_days (défaut SQL : 30 jours).
  const { data, error } = await db.rpc("diplomas_to_purge", { p_days: null });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; storage_path: string }[];

  let purged = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    // Un objet déjà absent n'est pas une erreur : il est simplement purgé.
    const removed = await db.storage.from(DIPLOMA_BUCKET).remove(batch.map((r) => r.storage_path));
    if (removed.error) {
      console.error("purge-diplomas: suppression impossible", removed.error.message);
      continue;
    }
    for (const row of batch) {
      const marked = await db.rpc("mark_diploma_purged", { p_id: row.id });
      if (marked.error) console.error("purge-diplomas: mark_diploma_purged", row.id, marked.error.message);
      else purged++;
    }
  }
  return json({ purged } satisfies PurgeDiplomasResponse);
}));

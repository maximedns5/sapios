// Suppression réelle du compte (brief §9) : fichiers par l'API Storage, puis l'utilisateur
// d'authentification ; la cascade SQL efface profil, photos, soumissions, jetons push…
// `audit_log` n'a pas de clé étrangère : la trace survit.
import { adminClient, requireUser } from "../_shared/auth.ts";
import { handle, json } from "../_shared/http.ts";
import { DIPLOMA_BUCKET, type DeleteAccountResponse, PHOTO_BUCKET } from "../_shared/shared.ts";
import { listObjects, removeObjects } from "../_shared/storage.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);

  const files: Record<string, number> = {};
  for (const bucket of [PHOTO_BUCKET, DIPLOMA_BUCKET]) {
    const paths = await listObjects(db, bucket, user.id);
    files[bucket] = await removeObjects(db, bucket, paths);
  }

  const audit = await db.from("audit_log").insert({
    actor_id: user.id,
    action: "account.delete",
    entity: "user",
    entity_id: user.id,
    payload: { files },
  });
  if (audit.error) throw audit.error;

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw error;

  return json({ deleted: true } satisfies DeleteAccountResponse);
}, { cors: true }));

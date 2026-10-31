// Tâche transitoire (pg_cron → pg_net, en-tête x-sapios-secret) : vide puis supprime le bucket `photos`
// du dating retiré (migration 20261031090000_nettoyage_dating). À retirer, avec sa tâche, une fois le
// bucket supprimé sur chaque projet.
import { adminClient, requireInternalSecret } from "../_shared/auth.ts";
import { datingPhotoStore, purgeDatingPhotos } from "../_shared/dating_photos.ts";
import { handle, json } from "../_shared/http.ts";

Deno.serve(handle(async (req) => {
  requireInternalSecret(req);
  const result = await purgeDatingPhotos(datingPhotoStore(adminClient()));
  console.info("purge-dating-photos", JSON.stringify(result));
  return json(result);
}));

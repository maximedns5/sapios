// Suppression réelle du compte (brief §9) : fichiers par l'API Storage, puis l'utilisateur
// d'authentification ; la cascade SQL efface profil, photos, soumissions, jetons push…
// `audit_log` n'a pas de clé étrangère : la trace survit. Logique partagée avec purge-inactive.
import { deleteAccount } from "../_shared/account.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { handle, json } from "../_shared/http.ts";
import type { DeleteAccountResponse } from "../_shared/shared.ts";

Deno.serve(handle(async (req) => {
  const db = adminClient();
  const { user } = await requireUser(req, db);
  await deleteAccount(db, user.id, { actorId: user.id, action: "account.delete" });
  return json({ deleted: true } satisfies DeleteAccountResponse);
}, { cors: true }));

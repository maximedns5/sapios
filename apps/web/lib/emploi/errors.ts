import { errorCode } from "@/lib/admin/errors";

// Codes d'erreur métier de l'emploi (docs/EMPLOI_CONTRACT.md §3 et §5) → message affiché au recruteur
// ou à l'admin.
const MESSAGES: Record<string, string> = {
  not_candidate: "Action réservée aux comptes candidats.",
  not_recruiter: "Ce compte n’est pas un compte recruteur.",
  not_member: "Vous n’êtes pas membre de cette entreprise.",
  forbidden: "Action non autorisée.",
  unauthorized: "Session expirée. Reconnectez-vous.",
  invalid_input: "Certaines valeurs sont invalides. Vérifiez le formulaire.",
  not_found: "Élément introuvable ou plus accessible.",
  terms_required: "Acceptez d’abord les conditions recruteurs.",
  kind_already_set: "Le type de ce compte est déjà choisi.",
  kind_required: "Choisissez d’abord le type de compte.",
  terms_version_mismatch: "Les conditions ont changé entre-temps : relisez la nouvelle version.",
  rate_limited: "Trop de demandes d’un coup. Réessayez dans une minute.",
  invalid_siren: "Ce numéro SIREN n’est pas valide : 9 chiffres, vérifiés par une clé de contrôle.",
  invalid_query: "Recherche trop courte ou trop longue.",
  upstream_unavailable: "Le service public de recherche ne répond pas. Réessayez dans un instant.",
  already_member: "Ce compte appartient déjà à une entreprise.",
  company_exists:
    "Cette entreprise a déjà un espace sur Sapios. Demandez à la personne qui l’a créé de vous ajouter, ou écrivez-nous.",
  not_editable: "Cette offre ne se modifie plus dans son état actuel.",
  invalid_status: "Ce n’est plus possible : le statut a changé entre-temps.",
  reason_required: "Un motif est obligatoire.",
  message_required: "Le message au candidat est obligatoire (20 caractères au moins).",
  invalid_transition: "Cette étape ne suit pas l’étape actuelle.",
  not_matched: "Disponible seulement après votre « Intéressé ».",
  offer_not_published: "L’offre doit être publiée pour inviter des candidats.",
  already_invited: "Ce candidat est déjà invité sur cette offre.",
  already_applied: "Ce candidat a déjà postulé à cette offre : retrouvez sa candidature dans le suivi.",
  quota_exceeded: "Quota d’invitations atteint pour cette semaine.",
  company_not_verified: "L’entreprise n’est pas encore vérifiée.",
  photos_pending: "Des photos attendent encore une décision.",
  photo_required: "Il faut au moins une photo du lieu de travail approuvée.",
  invalid_decision: "Décision invalide.",
  already_handled: "Déjà traité.",
  invalid_value: "Valeur hors des bornes autorisées.",
  unknown_setting: "Réglage inconnu de la base (migration non appliquée ?).",
  "23505": "Cette valeur existe déjà.",
  "42501": "Droits insuffisants pour cette opération.",
  PGRST202: "Fonction absente de la base : la migration emploi n’est pas encore appliquée.",
  internal_error: "Erreur serveur.",
};

export function emploiErrorMessage(code: string): string {
  return MESSAGES[code] ?? `Erreur : ${code}`;
}

export async function describeEmploiError(error: unknown): Promise<string> {
  return emploiErrorMessage(await errorCode(error));
}

export { errorCode };

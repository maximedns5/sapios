// Codes d'erreur métier (contrat §3 et §5) → message affiché.
const MESSAGES: Record<string, string> = {
  forbidden: "Action réservée aux admins.",
  unauthorized: "Session expirée. Reconnectez-vous.",
  not_found: "Élément introuvable.",
  already_decided: "Cette soumission a déjà été tranchée.",
  invalid_level: "Niveau invalide : choisissez un niveau de 1 à 8.",
  invalid_decision: "Décision invalide.",
  invalid_action: "Action invalide.",
  invalid_body: "Requête invalide.",
  file_purged: "Le fichier a été purgé après la décision. Seules les données extraites restent.",
  policy_missing: "Aucune ligne de la politique d’accès ne couvre ce niveau.",
  invalid_tier: "Ce palier ne peut pas être attribué par une admission.",
  misconfigured: "Fonction serveur mal configurée.",
  internal_error: "Erreur serveur.",
  invalid_institution: "Établissement trop long (200 caractères au plus).",
  invalid_field: "Domaine d’études inconnu.",
  reason_required: "Un motif est obligatoire pour retirer un texte : il est envoyé au membre.",
  already_handled: "Cette entrée a déjà été traitée.",
  invalid_value: "Valeur hors des bornes autorisées.",
  unknown_setting: "Réglage inconnu.",
  invalid_input: "Requête invalide.",
  event_cancelled: "Cet événement est annulé : il ne se modifie plus.",
  event_full: "Plus de place libre : augmentez la capacité ou attendez un désistement.",
  event_not_started: "L’événement n’a pas encore commencé : les absents se marquent après le début.",
  not_registered: "Ce billet ne correspond pas à une place confirmée (liste d’attente ou annulé).",
  "23505": "Cette valeur existe déjà (contrainte d’unicité).",
  "23514": "Valeur refusée par une contrainte de la base.",
  "42501": "Droits insuffisants pour cette opération.",
  PGRST202: "Fonction absente de la base (migration non appliquée ?).",
};

type ErrorLike = { code?: string; message?: string; name?: string; context?: unknown } | null | undefined;

/** Extrait un code d'erreur d'une réponse PostgREST ou d'une Edge Function. */
export async function errorCode(error: unknown): Promise<string> {
  const e = error as ErrorLike;
  if (!e) return "internal_error";
  // FunctionsHttpError : le corps JSON porte { error: "<code>" }.
  const ctx = e.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: unknown };
      if (typeof body?.error === "string") return body.error;
    } catch {
      // corps non JSON
    }
    const status = (ctx as Response).status;
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    if (status === 404) return "not_found";
  }
  if (e.code === "P0001" && e.message) return e.message;
  if (e.code && MESSAGES[e.code]) return e.code;
  if (e.message && MESSAGES[e.message]) return e.message;
  return e.code || e.message || "internal_error";
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? `Erreur : ${code}`;
}

export async function describeError(error: unknown): Promise<string> {
  return errorMessage(await errorCode(error));
}

export function isMissingFunction(error: unknown): boolean {
  const code = (error as ErrorLike)?.code;
  return code === "PGRST202" || code === "42883";
}

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

/** Erreur applicative portant un code du contrat (RPC §3, Edge Functions §5) ou un code local. */
export class AppError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'AppError';
  }
}

const CODE = /^[a-z][a-z0-9_]*$/;

/** Erreur PostgREST : le message vaut exactement le code métier (errcode P0001). */
export function fromPostgrest(error: { message?: string; code?: string; details?: string | null } | null): AppError {
  const message = error?.message ?? '';
  if (error?.code === 'P0001' && CODE.test(message)) return new AppError(message);
  if (CODE.test(message)) return new AppError(message);
  if (error?.code === '42501') return new AppError('forbidden', message);
  if (/fetch|network|Failed to fetch/i.test(message)) return new AppError('network', message);
  return new AppError('unknown', message);
}

/** Erreur d'Edge Function : corps `{ "error": "<code>" }`. */
export async function fromFunction(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await (error.context as Response).json();
      if (body && typeof body.error === 'string') return new AppError(body.error);
    } catch {
      // corps illisible
    }
    return new AppError('unknown');
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return new AppError('network');
  return new AppError('unknown', String(error));
}

const MESSAGES: Record<string, string> = {
  // Compte et inscription
  kind_already_set: 'Ce compte est déjà configuré.',
  kind_required: 'Compte incomplet. Reconnectez-vous.',
  not_candidate: 'Ce compte n’est pas un compte candidat.',
  identity_already_set: 'Votre identité est déjà enregistrée.',
  profile_incomplete: 'Complétez d’abord votre profil : poste, zone, salaire, expérience et trois compétences.',
  terms_required: 'Acceptez d’abord les conditions d’utilisation.',
  terms_version_mismatch: 'Les conditions viennent de changer. Relisez la nouvelle version.',
  invalid_status: 'Action impossible dans l’état actuel.',
  invalid_input: 'Informations incomplètes ou invalides.',
  not_authenticated: 'Session expirée. Reconnectez-vous.',
  unauthorized: 'Session expirée. Reconnectez-vous.',
  invalid_body: 'Requête invalide. Réessayez.',
  misconfigured: 'Service indisponible pour le moment.',
  internal_error: 'Erreur du serveur. Réessayez dans un instant.',
  // Offres et candidatures
  not_found: 'Introuvable : l’offre a peut-être été retirée.',
  forbidden: 'Action non autorisée.',
  already_applied: 'Vous avez déjà postulé à cette offre.',
  note_too_long: '140 caractères maximum.',
  invalid_target: 'Ce point n’est plus dans l’offre. Choisissez-en un autre.',
  not_matched: 'La conversation s’ouvre dès que le recruteur se dit intéressé.',
  rate_limited: 'Trop de demandes d’un coup. Réessayez un peu plus tard.',
  // Recherche de ville
  invalid_query: 'Tapez au moins deux lettres.',
  upstream_unavailable: 'La recherche de ville ne répond pas. Réessayez dans un instant.',
  // Diplôme
  invalid_path: 'Chemin de fichier refusé. Recommencez l’envoi.',
  invalid_type: 'Format refusé : PDF, JPEG, PNG ou WEBP uniquement.',
  too_large: 'Fichier trop lourd : 15 Mo maximum.',
  duplicate_document: 'Ce document a déjà été utilisé. Un diplôme, un compte.',
  already_verified_higher: 'Vous avez déjà un niveau validé égal ou supérieur.',
  upload_failed: 'L’envoi du fichier a échoué. Réessayez.',
  file_unreadable: 'Fichier illisible. Choisissez-en un autre.',
  heic_unsupported: 'Ce navigateur ne lit pas le format HEIC (iPhone). Envoyez votre diplôme en JPEG, PNG ou PDF.',
  photo_type: 'Format refusé : choisissez une image JPEG, PNG ou WEBP.',
  // Messages
  message_too_long: '2000 caractères maximum.',
  // Authentification
  invalid_credentials: 'Email ou mot de passe incorrect.',
  otp_invalid: 'Code invalide ou expiré.',
  email_invalid: 'Adresse email invalide.',
  over_email_send_rate_limit: 'Trop de demandes. Patientez une minute.',
  provider_unavailable: 'Ce mode de connexion n’est pas configuré.',
  cancelled: 'Opération annulée.',
  // Génériques
  permission_denied: 'Permission refusée. Vous pouvez la modifier dans les réglages.',
  unavailable_on_web: 'Indisponible sur le web.',
  network: 'Connexion impossible. Vérifiez le réseau et réessayez.',
  unknown: 'Une erreur est survenue. Réessayez.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return MESSAGES[error.code] ?? MESSAGES.unknown;
  return MESSAGES.unknown;
}

export function errorCode(error: unknown): string {
  return error instanceof AppError ? error.code : 'unknown';
}

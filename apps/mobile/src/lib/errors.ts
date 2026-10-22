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
  // Identité et onboarding
  identity_already_set: 'Votre identité est déjà enregistrée. Elle n’est plus modifiable.',
  underage: 'Sapios est réservé aux personnes majeures.',
  identity_missing: 'Renseignez d’abord votre identité légale.',
  profile_incomplete: 'Votre profil est incomplet.',
  photos_missing: 'Ajoutez au moins deux photos.',
  consent_missing: 'Le consentement sur la donnée sensible est requis.',
  invalid_status: 'Action impossible dans l’état actuel du compte.',
  invalid_input: 'Informations incomplètes ou invalides.',
  invalid_location: 'Position invalide.',
  photos_limit: 'Six photos maximum. La modestie a ses limites, nous aussi.',
  status_forbidden: 'Action non autorisée.',
  not_authenticated: 'Session expirée. Reconnectez-vous.',
  unauthorized: 'Session expirée. Reconnectez-vous.',
  invalid_body: 'Requête invalide. Réessayez.',
  misconfigured: 'Service indisponible pour le moment.',
  internal_error: 'Erreur du serveur. Réessayez dans un instant.',
  // Découverte
  not_eligible: 'Votre palier ne donne pas accès aux profils.',
  quota_exceeded: 'Quota de likes atteint pour aujourd’hui. Revenez demain.',
  target_unavailable: 'Ce profil n’est plus disponible.',
  self_swipe: 'Vous vous aimez déjà assez comme ça.',
  not_allowed: 'Réservé à l’accès illimité.',
  not_found: 'Introuvable.',
  forbidden: 'Action non autorisée.',
  invalid_item: 'Cet élément n’est plus sur son profil.',
  comment_too_long: '140 caractères maximum. L’esprit de synthèse est aussi une qualité.',
  // Profil intellectuel
  prompt_taken: 'Vous avez déjà répondu à cette question.',
  prompt_inactive: 'Cette question n’est plus proposée. Choisissez-en une autre.',
  books_limit: 'Cinq livres maximum. Les autres resteront sur la table de nuit.',
  // Diplôme
  invalid_path: 'Chemin de fichier refusé. Recommencez l’envoi.',
  invalid_type: 'Format refusé : PDF, JPEG, PNG ou WEBP uniquement.',
  too_large: 'Fichier trop lourd : 15 Mo maximum.',
  rate_limited: 'Trois tentatives par 30 jours. La persévérance n’est pas un diplôme.',
  duplicate_document: 'Ce document a déjà été utilisé. Un diplôme, un compte.',
  already_verified_higher: 'Vous avez déjà un niveau validé égal ou supérieur.',
  upload_failed: 'L’envoi du fichier a échoué. Réessayez.',
  file_unreadable: 'Fichier illisible. Choisissez-en un autre.',
  heic_unsupported: 'Ce navigateur ne lit pas le format HEIC (iPhone). Envoyez votre diplôme en JPEG, PNG ou PDF.',
  heic_unsupported_photo: 'Ce navigateur ne lit pas le format HEIC (iPhone). Choisissez une photo JPEG ou PNG.',
  photo_type: 'Format refusé : choisissez une photo JPEG, PNG ou WEBP.',
  // Messages
  message_too_long: '2000 caractères maximum. Soyez brillant, pas bavard.',
  chat_closed: 'Cette conversation est fermée.',
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

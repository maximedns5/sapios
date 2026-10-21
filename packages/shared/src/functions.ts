// Corps et réponses des Edge Functions (contrat §5). Erreurs : `{ error: "<code>" }`.
// Seuls des imports de type sont permis ici (effacés à la compilation) : les Edge Functions
// importent aussi ce fichier.
import type { AccessTier, SubmissionStatus } from "./tiers.ts";

export const EDGE_FUNCTIONS = {
  submitDiploma: "submit-diploma",
  processDiploma: "process-diploma",
  reviewDiploma: "review-diploma",
  notify: "notify",
  deleteAccount: "delete-account",
  purgeDiplomas: "purge-diplomas",
} as const;

/** En-tête du secret partagé des fonctions appelées par la base. */
export const INTERNAL_SECRET_HEADER = "x-sapios-secret";

export interface FunctionError<Code extends string = string> {
  error: Code;
}

/** Codes communs à toutes les fonctions. */
export type CommonErrorCode =
  | "unauthorized"
  | "invalid_body"
  | "method_not_allowed"
  | "misconfigured"
  | "internal_error";

// --- Diplômes : fichiers acceptés (brief §4.1) ------------------------------------------------

export const DIPLOMA_BUCKET = "diplomas";
export const PHOTO_BUCKET = "photos";

export const DIPLOMA_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type DiplomaMime = (typeof DIPLOMA_MIME_TYPES)[number];

/** Extension → type MIME. Le HEIC n'y est pas : il doit être converti en JPEG côté client. */
export const DIPLOMA_EXTENSIONS: Readonly<Record<string, DiplomaMime>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 15 Mo. */
export const MAX_DIPLOMA_BYTES = 15 * 1024 * 1024;
export const MAX_SUBMISSIONS_PER_WINDOW = 3;
export const SUBMISSION_WINDOW_DAYS = 30;
export const SIGNED_URL_TTL_SECONDS = 300;
export const DIPLOMA_RETENTION_DAYS = 30;

// --- submit-diploma (JWT utilisateur) ---------------------------------------------------------

export interface SubmitDiplomaRequest {
  /** Chemin de l'objet dans le bucket `diplomas` : `{user_id}/{uuid}.{ext}` (sans le nom du bucket). */
  storage_path: string;
  mime: DiplomaMime;
}
export interface SubmitDiplomaResponse {
  submission_id: string;
  status: Extract<SubmissionStatus, "pending">;
}
/**
 * `invalid_type` couvre aussi le HEIC et un contenu qui ne correspond pas au type déclaré.
 * `already_verified_higher` : le compte a déjà le niveau maximal (8), une nouvelle soumission
 * ne peut rien lui apporter.
 */
export type SubmitDiplomaErrorCode =
  | CommonErrorCode
  | "invalid_path"
  | "invalid_type"
  | "too_large"
  | "not_found"
  | "rate_limited"
  | "duplicate_document"
  | "already_verified_higher";

// --- process-diploma (secret interne) ---------------------------------------------------------

export type ProcessDiplomaRequest = Record<string, never>;
export interface ProcessDiplomaResponse {
  processed: number;
}

// --- review-diploma (JWT admin) ---------------------------------------------------------------

export const REVIEW_DECISIONS = ["approve", "reject", "needs_more"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewSignedUrlRequest {
  action: "signed_url";
  submission_id: string;
}
export interface ReviewSignedUrlResponse {
  /** URL signée valable 5 minutes. */
  url: string;
}
export interface ReviewDecideRequest {
  action: "decide";
  submission_id: string;
  decision: ReviewDecision;
  /** Obligatoire pour `approve`, entier de 1 à 8. */
  level?: number;
  reason?: string;
}
/** Valeurs renvoyées par `apply_diploma_review` ; `tier`/`level` restent nuls si le compte n'a pas encore de palier. */
export interface ReviewDecideResponse {
  tier: AccessTier | null;
  level: number | null;
  copy_key: string | null;
}
export type ReviewDiplomaRequest = ReviewSignedUrlRequest | ReviewDecideRequest;
export type ReviewDiplomaErrorCode =
  | CommonErrorCode
  | "forbidden"
  | "invalid_action"
  | "invalid_decision"
  | "invalid_level"
  | "not_found"
  | "file_purged"
  /** Toute autre erreur métier levée par `apply_diploma_review` est renvoyée telle quelle. */
  | (string & {});

// --- notify (secret interne) ------------------------------------------------------------------

export type NotifyRequest =
  | { type: "match"; match_id: string }
  | { type: "message"; message_id: string }
  | { type: "verdict"; user_id: string; copy_key: string };
export interface NotifyResponse {
  sent: number;
}
/** Champ `data` des notifications Expo reçues par l'app. */
export type PushData =
  | { type: "match"; match_id: string }
  | { type: "message"; match_id: string; message_id: string }
  | { type: "verdict"; copy_key: string };

// --- delete-account (JWT utilisateur) ---------------------------------------------------------

export type DeleteAccountRequest = Record<string, never>;
export interface DeleteAccountResponse {
  deleted: true;
}

// --- purge-diplomas (secret interne) ----------------------------------------------------------

export type PurgeDiplomasRequest = Record<string, never>;
export interface PurgeDiplomasResponse {
  purged: number;
}

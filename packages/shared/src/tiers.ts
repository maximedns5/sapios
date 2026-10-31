// Enums Postgres du contrat (§1). Source unique pour le web, le mobile et les Edge Functions.
// Ce fichier ne doit rien importer : les Edge Functions (Deno) l'importent directement.

export const ACCESS_TIERS = ["unlimited", "standard", "waitlist", "refused"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

export const SUBMISSION_STATUSES = ["pending", "processing", "needs_review", "approved", "rejected", "needs_more"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const PHOTO_MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type PhotoModeration = (typeof PHOTO_MODERATION_STATUSES)[number];

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ADMIN_ROLES = ["moderator", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PUSH_PLATFORMS = ["ios", "android", "web"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Niveau normalisé (brief §2.1). */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 8;

export function isValidLevel(level: unknown): level is number {
  return typeof level === "number" && Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL;
}

/** Libellé UI d'un niveau normalisé (brief §2.1). */
export function levelLabel(level: number): string {
  if (level >= 8) return "Bac+8";
  if (level === 7) return "Bac+5";
  if (level === 6) return "Bac+3";
  if (level === 5) return "Bac+2";
  if (level === 4) return "Bac";
  return "Brevet";
}

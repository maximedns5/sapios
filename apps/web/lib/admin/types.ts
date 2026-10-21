import type { AccessTier, Extraction, SubmissionStatus } from "@sapios/shared";

export type ReportStatus = "open" | "actioned" | "dismissed";
export type ProfileStatus = "onboarding" | "active" | "paused" | "banned";

/** Ligne renvoyée par `admin_list_submissions` (contrat §3). */
export interface SubmissionRow {
  id: string;
  user_id: string;
  storage_path: string;
  mime: string;
  doc_sha256: string | null;
  status: SubmissionStatus;
  extracted: Partial<Extraction> | null;
  confidence: number | string | null;
  signals: string[] | null;
  level_verified: number | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  moderator_note: string | null;
  attempts: number;
  file_deleted_at: string | null;
  created_at: string;
  legal_name: string | null;
  birthdate: string | null;
  display_name: string | null;
  email?: string | null;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

export interface PolicyRow {
  id: string;
  min_level: number;
  tier: AccessTier;
  daily_like_quota: number | null;
  can_browse: boolean;
  sees_likers: boolean;
  copy_key: string;
}

export interface CopyRow {
  key: string;
  locale: string;
  text: string;
  updated_at?: string | null;
}

export interface WaitlistMember {
  user_id: string;
  level: number | null;
  tier: AccessTier;
  granted_at: string;
  display_name: string | null;
  city: string | null;
  status: ProfileStatus | null;
  legal_name: string | null;
  email: string | null;
}

export interface WaitlistSignup {
  id: string;
  email: string;
  source: string | null;
  created_at: string;
}

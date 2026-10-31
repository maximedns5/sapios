import type { AccessTier, Extraction, StudyField, SubmissionStatus } from "@sapios/shared";

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
  institution_verified?: string | null;
  field_verified?: StudyField | null;
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

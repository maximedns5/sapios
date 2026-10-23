import type {
  AccessTier,
  ContentFlagStatus,
  EventKind,
  EventStatus,
  RegistrationStatus,
  ContentKind,
  Extraction,
  PhotoModeration,
  StudyField,
  SubmissionStatus,
  ThesisVisibility,
} from "@sapios/shared";

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
  institution_verified?: string | null;
  field_verified?: StudyField | null;
  /** Lot 2 : la personne a utilisé une lettre de recommandation (file prioritaire). */
  referred?: boolean;
  /** Prénom affiché du parrain ; nul s'il a supprimé son compte. */
  referred_by?: string | null;
}

export interface ReportRow {
  id: string;
  /** Nul quand l'auteur a supprimé son compte (signalement conservé, pseudonymisé). */
  reporter_id: string | null;
  /** Nul quand la personne visée a supprimé son compte (signalement conservé, pseudonymisé). */
  target_id: string | null;
  /** Empreinte stable qui remplace l'identifiant après suppression du compte. */
  target_pseudonym?: string | null;
  reporter_pseudonym?: string | null;
  target_deleted_at?: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  content_kind?: ContentKind | null;
  content_item_id?: string | null;
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
  referred: boolean;
  referred_by: string | null;
}

export interface WaitlistSignup {
  id: string;
  email: string;
  source: string | null;
  level: number | null;
  city: string | null;
  created_at: string;
}

/** Ligne de `admin_list_flagged_content` (file des textes à modérer). */
export interface FlaggedContentRow {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  kind: ContentKind;
  item_id: string | null;
  prompt_key: string | null;
  /** Texte actuel ; nul si le membre l'a supprimé depuis. */
  current_text: string | null;
  item_status: PhotoModeration | null;
  /** Texte au moment où il a été repéré. */
  excerpt: string;
  reasons: string[];
  source: "auto" | "report";
  report_id: string | null;
  report_reason: string | null;
  report_details: string | null;
  status: ContentFlagStatus;
  decision_reason: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

export interface PromptRow {
  key: string;
  active: boolean;
  position: number;
  created_at?: string;
}

/** `admin_get_report_context` : de quoi décider sans changer d'écran (audit n° 23). */
export interface ReportContext {
  target: {
    id: string;
    display_name: string | null;
    status: ProfileStatus | null;
    city: string | null;
    bio: string | null;
    study_field: StudyField | null;
    created_at: string;
    last_active_at: string | null;
    age: number | null;
    legal_name: string | null;
    email: string | null;
    tier: AccessTier | null;
    level: number | null;
    institution: string | null;
    source_submission_id: string | null;
  } | null;
  reporter: { id: string; display_name: string | null; status: ProfileStatus | null; reports_filed: number } | null;
  photos: Array<{ id: string; storage_path: string; moderation_status: PhotoModeration }>;
  answers: Array<{ id: string; position: number; prompt_key: string; answer: string; moderation_status: PhotoModeration }>;
  books: Array<{ id: string; title: string; author: string | null; moderation_status: PhotoModeration }>;
  thesis: { line: string; visibility: ThesisVisibility; moderation_status: PhotoModeration } | null;
  content: {
    kind: ContentKind;
    item_id: string | null;
    text: string | null;
    prompt_key: string | null;
    flag_id: string | null;
    flag_status: ContentFlagStatus | null;
  } | null;
  reports_against: { open: number; total: number; actioned: number; reasons: string[] };
  relationship: {
    matched_at: string | null;
    unmatched_at: string | null;
    reporter_blocked: boolean;
    target_blocked: boolean;
  };
}

// --- Lot 2 : événements et lettres de recommandation (contrat §3) ---------------------------------

/** Ligne de `admin_list_events`. */
export interface AdminEventRow {
  id: string;
  title: string;
  kind: EventKind;
  description: string;
  city: string;
  neighbourhood: string | null;
  venue_name: string | null;
  venue_address: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_cents: number;
  allowed_tiers: AccessTier[];
  status: EventStatus;
  cancel_reason: string | null;
  registered_count: number;
  waitlisted_count: number;
  attended_count: number;
  no_show_count: number;
  cancelled_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Ligne de `admin_list_registrations` : de quoi pointer, rien de plus. */
export interface AdminRegistrationRow {
  id: string;
  user_id: string;
  display_name: string | null;
  status: RegistrationStatus;
  ticket_code: string;
  waitlist_rank: number | null;
  checked_in_at: string | null;
  status_changed_at: string;
  created_at: string;
}

/** Une ligne par parrain dans `admin_referral_stats().referrers`. */
export interface ReferrerStatsRow {
  referrer_id: string;
  display_name: string | null;
  email: string | null;
  tier?: AccessTier | null;
  level?: number | null;
  active_code: string | null;
  referral_disabled: boolean;
  referees_total: number;
  letters_used_window: number;
  referees_admitted: number;
  referees_waitlisted: number;
  referees_refused: number;
  referees_pending: number;
  referees_banned: number;
  flagged: boolean;
}

export interface ReferralStats {
  codes_active: number;
  codes_revoked: number;
  referrals_total: number;
  referrals_window: number;
  referrers: ReferrerStatsRow[];
}

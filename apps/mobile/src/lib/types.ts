import type { AccessTier, AffinityReason, Gender, IntellectProgress, MemberNotice, ProfileStatus, StudyField, SubmissionStatus } from '@sapios/shared';

export type { AccessTier, Gender, ProfileStatus, StudyField, SubmissionStatus };

/** Retour de get_my_state() (contrat §3). */
export type MyState = {
  profile_status: ProfileStatus;
  onboarding: {
    identity_set: boolean;
    profile_complete: boolean;
    photos_count: number;
    consent_sensitive: boolean;
  };
  tier: AccessTier | null;
  level: number | null;
  copy_key: string | null;
  can_browse: boolean;
  daily_like_quota: number | null;
  likes_left_today: number | null;
  sees_likers: boolean;
  latest_submission: {
    id: string;
    status: SubmissionStatus;
    created_at: string;
    rejection_reason: string | null;
  } | null;
  submissions_left: number;
  /** Likes reçus en attente, sans identité (tous paliers). */
  likes_received?: number;
  /** Avis non lus (motif d'un retrait de contenu). */
  notices?: MemberNotice[];
  intellect?: IntellectProgress;
};

/** Ligne de get_feed() (les colonnes du lot 1 manquent dans get_likers et dans le cache des fiches). */
export type Candidate = {
  id: string;
  display_name: string;
  age: number | null;
  bio: string | null;
  city: string | null;
  distance_km: number | null;
  photo_paths: string[] | null;
  level?: number | null;
  study_field?: StudyField | null;
  field_verified?: boolean;
  institution?: string | null;
  preview_prompt_key?: string | null;
  preview_answer?: string | null;
  quiz_badge?: boolean;
  affinity_score?: number | null;
  affinity_reasons?: AffinityReason[] | null;
};

/** Ligne de get_likers() : le profil, puis ce qui a été aimé chez moi et le mot joint. */
export type Liker = Candidate & {
  liked_item: string | null;
  comment: string | null;
  liked_prompt_key: string | null;
  liked_text: string | null;
  liked_photo_path: string | null;
  liked_at: string | null;
};

/** Ligne de get_matches(). */
export type MatchRow = {
  match_id: string;
  other_id: string;
  display_name: string;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  /** Message né d'un like : réponse citée (context) et élément aimé. */
  context?: string | null;
  liked_item?: string | null;
  from_like?: boolean;
};

export type Photo = {
  id: string;
  storage_path: string;
  position: number;
  moderation_status?: string;
};

export type OwnProfile = {
  id: string;
  display_name: string | null;
  gender: Gender | null;
  seeking_genders: Gender[];
  age_min: number;
  age_max: number;
  bio: string | null;
  city: string | null;
  status: ProfileStatus;
};

export type VerdictVariant = 'unlimited' | 'standard' | 'waitlist' | 'refused' | 'uninstall' | 'rejected' | 'needs_more';

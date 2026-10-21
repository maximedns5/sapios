import type { AccessTier, Gender, ProfileStatus, SubmissionStatus } from '@sapios/shared';

export type { AccessTier, Gender, ProfileStatus, SubmissionStatus };

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
};

/** Ligne de get_feed() / get_likers(). */
export type Candidate = {
  id: string;
  display_name: string;
  age: number | null;
  bio: string | null;
  city: string | null;
  distance_km: number | null;
  photo_paths: string[] | null;
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

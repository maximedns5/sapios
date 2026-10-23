// Lot 2 : lettres de recommandation et événements gratuits (contrat §2, §3 et §7).
// Ce fichier ne doit rien importer : il peut être importé tel quel par les Edge Functions (Deno).

// --- Lettres de recommandation ------------------------------------------------------------------

/** Code de 10 caractères en base 32 de Crockford (sans I, L, O ni U). */
export const REFERRAL_CODE_LENGTH = 10;
export const REFERRAL_CODE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

/** Saisie tolérante, comme la base : majuscules, sans espaces ni tirets, O lu 0, I et L lus 1. */
export function normalizeReferralCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** Lien à partager : l'app lit le paramètre `ref` à l'ouverture et le garde jusqu'après la connexion. */
export function referralLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, "")}/?ref=${encodeURIComponent(code)}`;
}

/** Repli si `app_settings` est absent : 3 lettres (Bac+5), 5 (Bac+8) par période de 30 jours. */
export const REFERRAL_LETTERS = { standard: 3, unlimited: 5 } as const;
export const REFERRAL_WINDOW_DAYS = 30;

/** `get_my_referral()`. Jamais d'identité ni de verdict des personnes recommandées. */
export interface MyReferral {
  eligible: boolean;
  code: string | null;
  quota: number;
  used: number;
  left: number;
  /** Date à laquelle la prochaine lettre se libère, quand le quota est atteint. */
  next_letter_at: string | null;
}

/** `get_referral_preview(code)` (anon) : le prénom du parrain, ou null si le code est inutilisable. */
export type ReferralPreview = { referrer_first_name: string } | null;

export const CLAIM_REFERRAL_ERRORS = [
  "already_referred",
  "invalid_code",
  "self_referral",
  "too_late",
  "quota_exceeded",
] as const;
export type ClaimReferralError = (typeof CLAIM_REFERRAL_ERRORS)[number];

/** Clé `app_copy` du verdict « liste d'attente » d'une personne recommandée (`get_my_state().referred`). */
export const REFERRED_WAITLIST_COPY_KEY = "verdict.waitlist.referred";

// --- Événements ----------------------------------------------------------------------------------

export const EVENT_KINDS = ["dinner", "debate", "conference", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  dinner: "Dîner",
  debate: "Débat",
  conference: "Conférence",
  other: "Autre",
};

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Readonly<Record<EventStatus, string>> = {
  draft: "Brouillon",
  published: "Publié",
  cancelled: "Annulé",
};

export const REGISTRATION_STATUSES = ["registered", "waitlisted", "cancelled", "attended", "no_show"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Readonly<Record<RegistrationStatus, string>> = {
  registered: "Inscrit·e",
  waitlisted: "Liste d'attente",
  cancelled: "Annulé",
  attended: "Présent·e",
  no_show: "Absent·e",
};

export const EVENT_TITLE_MAX_LENGTH = 120;
export const EVENT_DESCRIPTION_MAX_LENGTH = 4000;
export const EVENT_MAX_CAPACITY = 1000;
export const TICKET_CODE_LENGTH = 12;

/** Ligne de `list_events()` et base de `get_event(id)`. Jamais les inscrits, jamais le lieu exact. */
export interface EventSummary {
  id: string;
  title: string;
  kind: EventKind;
  description: string;
  city: string;
  neighbourhood: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  seats_left: number;
  waitlist_count: number;
  price_cents: number;
  status: EventStatus;
  cancel_reason: string | null;
  my_status: RegistrationStatus | null;
  my_waitlist_rank: number | null;
}

/** `get_event(id)` : le lieu exact seulement pour une place confirmée (ou un membre pointé). */
export interface EventDetail extends EventSummary {
  venue_name: string | null;
  venue_address: string | null;
  can_register: boolean;
}

/** `register_event(id, accept_charter)` et `cancel_registration(id)`. */
export interface RegistrationResult {
  registration_id: string;
  status: RegistrationStatus;
  waitlist_rank?: number | null;
}

/** `get_my_ticket(id)`. */
export interface EventTicket {
  registration_id: string;
  ticket_code: string;
  status: Extract<RegistrationStatus, "registered" | "attended">;
  checked_in_at: string | null;
  event: Pick<EventDetail, "id" | "title" | "kind" | "status" | "starts_at" | "ends_at" | "city" | "neighbourhood" | "venue_name" | "venue_address">;
}

export const REGISTER_EVENT_ERRORS = [
  "charter_required",
  "not_found",
  "event_cancelled",
  "event_started",
  "paid_event_unavailable",
  "not_allowed",
] as const;
export type RegisterEventError = (typeof REGISTER_EVENT_ERRORS)[number];

/**
 * Avis au membre ajoutés par le lot 2. `get_my_state().notices` mélange désormais ces avis et ceux du
 * lot 1 (`MemberNotice`, kind `content_removed`) : filtrer sur `kind`.
 */
export type EventNoticeKind = "event_promoted" | "event_cancelled";
export interface EventNotice {
  id: string;
  kind: EventNoticeKind;
  payload: {
    event_id: string;
    title: string;
    starts_at: string;
    /** Motif, pour une annulation. */
    reason?: string;
  };
  created_at: string;
}

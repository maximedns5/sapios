// Sapios Emploi : formes JSON des RPC et libellés partagés (docs/EMPLOI_CONTRACT.md).
// Une RPC qui renvoie un type de ce fichier renvoie exactement ces champs, avec ces noms.

import type { StudyField } from "./intellect";
import type { PhotoModeration, ReportStatus } from "./tiers";

// Enums -----------------------------------------------------------------------------------------

export const CONTRACT_TYPES = ["cdi", "cdd"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const EXPERIENCE_BANDS = ["y0_1", "y1_3", "y3_5", "y5_plus"] as const;
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number];

export const OFFER_STATUSES = ["draft", "pending_review", "published", "rejected", "filled", "expired", "archived"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_PHOTO_KINDS = ["workplace", "manager", "team", "tools", "area"] as const;
export type OfferPhotoKind = (typeof OFFER_PHOTO_KINDS)[number];

export const APPLICATION_STATUSES = [
  "sent", "seen", "interested", "interview", "offer_made", "hired", "rejected", "closed_no_response", "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Match fait : l'identité du candidat est révélée et la messagerie ouverte. */
export const MATCHED_STATUSES: readonly ApplicationStatus[] = ["interested", "interview", "offer_made", "hired"];
/** En attente d'une réponse du recruteur, avant l'échéance garantie. */
export const OPEN_STATUSES: readonly ApplicationStatus[] = ["sent", "seen"];
/** Candidature terminée. */
export const CLOSED_STATUSES: readonly ApplicationStatus[] = ["hired", "rejected", "closed_no_response", "withdrawn"];

export const REFUSAL_REASONS = ["experience", "skills", "position_filled", "other_profile", "other"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export type CompanyStatus = "pending" | "verified" | "rejected" | "suspended";
export type CompanyRole = "owner" | "recruiter";
export type InterviewMode = "visio" | "onsite";
export type SlotStatus = "proposed" | "accepted" | "declined" | "cancelled";
export type InvitationStatus = "sent" | "applied" | "declined";
export type EmploiAccountKind = "candidate" | "recruiter";

export const LANGUAGE_LEVELS = ["a2", "b1", "b2", "c1", "c2"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const OFFER_REPORT_REASONS = ["fake", "discriminatory", "misleading_salary", "scam", "other"] as const;
export type OfferReportReason = (typeof OFFER_REPORT_REASONS)[number];

export const RESPONSE_DAYS = [3, 7, 10] as const;
export type ResponseDays = (typeof RESPONSE_DAYS)[number];

// Libellés --------------------------------------------------------------------------------------

export const CONTRACT_LABELS: Record<ContractType, string> = { cdi: "CDI", cdd: "CDD" };

export const EXPERIENCE_BAND_LABELS: Record<ExperienceBand, string> = {
  y0_1: "0 à 1 an",
  y1_3: "1 à 3 ans",
  y3_5: "3 à 5 ans",
  y5_plus: "5 ans et plus",
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Brouillon",
  pending_review: "En vérification",
  published: "Publiée",
  rejected: "Refusée",
  filled: "Pourvue",
  expired: "Expirée",
  archived: "Archivée",
};

export const OFFER_PHOTO_KIND_LABELS: Record<OfferPhotoKind, string> = {
  workplace: "Lieu de travail",
  manager: "Manager",
  team: "Équipe",
  tools: "Outils",
  area: "Quartier",
};

/** Kinds qui montrent des personnes : l'accord écrit de chacune est certifié par l'entreprise. */
export const PHOTO_KINDS_WITH_PEOPLE: readonly OfferPhotoKind[] = ["manager", "team"];

/** Libellés vus par le candidat. */
export const APPLICATION_STATUS_LABELS_CANDIDATE: Record<ApplicationStatus, string> = {
  sent: "Envoyée",
  seen: "Vue",
  interested: "Intéressé·e",
  interview: "Entretien",
  offer_made: "Proposition",
  hired: "Embauché·e",
  rejected: "Non retenue",
  closed_no_response: "Close sans réponse de l’entreprise",
  withdrawn: "Retirée",
};

/** Libellés vus par le recruteur (colonnes du suivi). */
export const APPLICATION_STATUS_LABELS_RECRUITER: Record<ApplicationStatus, string> = {
  sent: "À examiner",
  seen: "À examiner",
  interested: "Intéressé·e",
  interview: "Entretien",
  offer_made: "Proposition",
  hired: "Embauché·e",
  rejected: "Close",
  closed_no_response: "Close",
  withdrawn: "Close",
};

export const REFUSAL_REASON_LABELS: Record<RefusalReason, string> = {
  experience: "Expérience insuffisante pour ce poste",
  skills: "Compétences trop éloignées du poste",
  position_filled: "Poste pourvu",
  other_profile: "Un profil plus proche a été retenu",
  other: "Autre raison",
};

/** Messages proposés par défaut (modifiables par le recruteur, 20 à 600 caractères). */
export const REFUSAL_TEMPLATES: Record<RefusalReason, string> = {
  experience:
    "Merci pour votre candidature. Le poste demande davantage d’expérience que votre parcours actuel ; nous avons choisi de poursuivre avec d’autres profils.",
  skills:
    "Merci pour votre candidature. Les compétences attendues pour ce poste sont trop éloignées de votre profil actuel ; nous vous souhaitons de trouver vite le bon poste.",
  position_filled: "Merci pour votre candidature. Le poste vient d’être pourvu ; nous ne pouvons pas donner suite.",
  other_profile:
    "Merci pour votre candidature. Nous avons retenu un profil plus proche de nos besoins actuels ; nous vous souhaitons de trouver très vite le poste qui vous correspond.",
  other: "Merci pour votre candidature. Nous ne pouvons pas y donner suite pour ce poste.",
};

export const LANGUAGE_LEVEL_LABELS: Record<LanguageLevel, string> = {
  a2: "A2 · notions",
  b1: "B1 · intermédiaire",
  b2: "B2 · courant",
  c1: "C1 · avancé",
  c2: "C2 · maîtrise",
};

export const OFFER_REPORT_REASON_LABELS: Record<OfferReportReason, string> = {
  fake: "Offre fictive ou poste inexistant",
  discriminatory: "Critère discriminatoire",
  misleading_salary: "Salaire trompeur",
  scam: "Arnaque ou demande d’argent",
  other: "Autre",
};

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  pending: "En attente de vérification",
  verified: "Entreprise vérifiée",
  rejected: "Refusée",
  suspended: "Suspendue",
};

// Limites -----------------------------------------------------------------------------------------

export const EMPLOI_LIMITS = {
  noteMax: 140,
  lookingForMax: 250,
  experiencesMax: 10,
  skillsMax: 10,
  skillsMinForProfile: 3,
  languagesMax: 6,
  missionsCount: 3,
  mustHaveMax: 3,
  niceToHaveMax: 5,
  requirementMax: 60,
  refusalMessageMin: 20,
  refusalMessageMax: 600,
  invitationMessageMax: 400,
  messageMax: 2000,
  slotsMax: 5,
  salaryMinK: 15,
  salaryMaxK: 300,
  radiusMinKm: 5,
  radiusMaxKm: 100,
  /** Expériences montrées au recruteur avant le match. */
  anonymousExperiences: 2,
} as const;

// Contrôles d'une offre (submit_offer) ---------------------------------------------------------------

export const OFFER_CHECK_KEYS = [
  "company_not_verified",
  "title",
  "location",
  "salary",
  "missions",
  "must_have",
  "workplace_photo",
  "photo_consent",
  "language_justification",
  "banned_words",
] as const;
export type OfferCheckKey = (typeof OFFER_CHECK_KEYS)[number];

export const OFFER_CHECK_LABELS: Record<OfferCheckKey, string> = {
  company_not_verified: "Entreprise en attente de vérification",
  title: "Intitulé du poste",
  location: "Lieu de travail",
  salary: "Fourchette de salaire",
  missions: "Les 3 missions",
  must_have: "Au moins un critère indispensable",
  workplace_photo: "Une photo du lieu de travail",
  photo_consent: "Accord des personnes visibles",
  language_justification: "Justification de la langue exigée",
  banned_words: "Mots à retirer",
};

export interface OfferCheck {
  ok: boolean;
  missing: OfferCheckKey[];
}

/** Langues : un critère indispensable qui en mentionne une exige une justification. */
export const LANGUAGE_PATTERN =
  /\b(anglais|allemand|espagnol|italien|portugais|n[ée]erlandais|chinois|mandarin|japonais|arabe|russe|english|langue|bilingue)\b/i;

/** Mots refusés dans une offre (repli si `app_settings.offer_banned_words` est vide). */
export const DEFAULT_BANNED_OFFER_WORDS = [
  "natif",
  "native",
  "langue maternelle",
  "moins de 30 ans",
  "moins de 35 ans",
  "jeune et dynamique",
  "bonne présentation",
  "nationalité française",
  "sans enfant",
] as const;

/** Domaines d'email génériques : une inscription d'entreprise avec l'un d'eux demande un Kbis. */
export const DEFAULT_GENERIC_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr",
  "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "gmx.fr", "protonmail.com", "proton.me",
] as const;

// Aides -----------------------------------------------------------------------------------------

/** `n° 0427`. */
export function formatCandidateNumber(n: number): string {
  return `n° ${String(n).padStart(4, "0")}`;
}

/** `42–48 k€ brut/an` (ou `45 k€ brut/an` si les deux bornes sont égales). */
export function formatSalaryRange(minK: number, maxK: number, suffix = " brut/an"): string {
  return (minK === maxK ? `${minK} k€` : `${minK}–${maxK} k€`) + suffix;
}

/** Minuscules, sans accents ni espaces superflus : la normalisation des correspondances (§6). */
export function normalizeForMatch(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function findBannedWord(texts: readonly string[], words: readonly string[] = DEFAULT_BANNED_OFFER_WORDS): string | null {
  const hay = texts.map(normalizeForMatch).join(" \n ");
  for (const w of words) {
    const n = normalizeForMatch(w);
    if (n && new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(hay)) return w;
  }
  return null;
}

export function requiresLanguageJustification(mustHave: readonly string[]): boolean {
  return mustHave.some((m) => LANGUAGE_PATTERN.test(m));
}

/** Clé de Luhn d'un SIREN (9 chiffres). */
export function isValidSiren(siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(siren[8 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Formes renvoyées par les RPC -----------------------------------------------------------------------

export interface DiplomaBadge {
  /** Niveau européen : 5 = Bac+2, 6 = Bac+3, 7 = Bac+5, 8 = Bac+8 (levelLabel dans tiers.ts). */
  level: number;
  study_field: StudyField | null;
  /** null si le candidat masque son établissement (vue recruteur) ou s'il est inconnu. */
  institution: string | null;
  verified_at: string;
}

export interface RequirementMatch {
  label: string;
  kind: "must" | "nice";
  met: boolean;
}

export interface EmploiNoticeBase<K extends string, P> {
  id: string;
  kind: K;
  payload: P;
  created_at: string;
}

export type EmploiNotice =
  | EmploiNoticeBase<"application_interested", { application_id: string; offer_title: string; company_name: string }>
  | EmploiNoticeBase<"application_rejected", { application_id: string; offer_title: string; company_name: string }>
  | EmploiNoticeBase<"application_closed", { application_id: string; offer_title: string; company_name: string }>
  | EmploiNoticeBase<"interview_proposed", { application_id: string; offer_title: string; company_name: string }>
  | EmploiNoticeBase<"invitation_received", { invitation_id: string; offer_id: string; offer_title: string; company_name: string }>
  | EmploiNoticeBase<"company_verified" | "company_rejected" | "company_suspended", { company_id: string; reason: string | null }>
  | EmploiNoticeBase<"offer_published" | "offer_rejected", { offer_id: string; offer_title: string; reason: string | null }>;

export interface EmploiState {
  kind: EmploiAccountKind | null;
  is_admin_account: boolean;
  terms: { required_version: string | null; accepted: boolean; accepted_at: string | null };
  identity_set: boolean;
  candidate: {
    number: number;
    /** Profil assez rempli pour voir des offres et postuler (poste, zone, contrats, salaire, expérience, 3 compétences). */
    complete: boolean;
    paused: boolean;
    open_to_opportunities: boolean;
  } | null;
  diploma: DiplomaBadge | null;
  latest_submission: { id: string; status: string; created_at: string; rejection_reason: string | null } | null;
  submissions_left: number;
  recruiter: {
    company_id: string;
    company_name: string;
    company_status: CompanyStatus;
    role: CompanyRole;
  } | null;
  counts: { applications_open: number; unread_messages: number; invitations_pending: number };
  notices: EmploiNotice[];
}

export interface CandidateProfile {
  number: number;
  target_role: string;
  search_city: string;
  search_postcode: string | null;
  search_lat: number;
  search_lng: number;
  search_radius_km: number;
  contract_types: ContractType[];
  salary_min_k: number;
  salary_max_k: number;
  remote_days_min: number;
  available_from: string | null;
  experience_band: ExperienceBand;
  work_authorization: boolean;
  looking_for: string | null;
  open_to_opportunities: boolean;
  show_institution: boolean;
  paused: boolean;
}

export interface CvExperience {
  id?: string;
  title: string;
  employer: string;
  employer_hidden: boolean;
  /** AAAA-MM-01 */
  start_month: string;
  /** AAAA-MM-01, null = en cours. */
  end_month: string | null;
  summary: string | null;
}

export interface CvLanguage {
  language: string;
  level: LanguageLevel;
}

export interface CandidateCv {
  identity: { first_name: string; last_name: string } | null;
  profile: CandidateProfile | null;
  experiences: CvExperience[];
  skills: string[];
  languages: CvLanguage[];
  diploma: DiplomaBadge | null;
}

export interface AnonymousCv {
  number: number;
  target_role: string;
  experience_band: ExperienceBand;
  diploma: DiplomaBadge | null;
  /** Les 2 plus récentes ; durée en mois, jamais les dates. */
  experiences: { title: string; employer: string | null; months: number; current: boolean }[];
  skills: string[];
  languages: CvLanguage[];
  salary_min_k: number;
  salary_max_k: number;
  available_from: string | null;
  search_city: string;
  search_radius_km: number;
  remote_days_min: number;
  work_authorization: boolean;
  looking_for: string | null;
}

export interface OfferPhoto {
  id: string;
  kind: OfferPhotoKind;
  /** Chemin dans le bucket `offer-photos` ; l'URL signée est créée par le client. */
  storage_path: string;
  position: number;
}

export interface CompanySummary {
  id: string;
  display_name: string;
  city: string | null;
  naf_label: string | null;
  headcount_band: string | null;
  verified: boolean;
}

export interface OfferCard {
  id: string;
  title: string;
  company: CompanySummary;
  contract: ContractType;
  city: string;
  /** null si la zone de recherche du lecteur est inconnue (profil incomplet, recruteur). */
  distance_km: number | null;
  remote_days: number;
  salary_min_k: number;
  salary_max_k: number;
  start_label: string | null;
  experience_band: ExperienceBand;
  photos: OfferPhoto[];
  matches: RequirementMatch[];
  published_at: string;
  response_days: ResponseDays;
}

export interface OfferDetail extends OfferCard {
  missions: string[];
  must_have: string[];
  nice_to_have: string[];
  language_justification: string | null;
  team_description: string | null;
  manager_name: string | null;
  manager_title: string | null;
  interviews_count: number;
  address_label: string | null;
  expires_at: string;
  my_application: { id: string; status: ApplicationStatus } | null;
  can_apply: boolean;
}

export interface CompanyPage extends CompanySummary {
  description: string | null;
  website: string | null;
  /** Délai moyen de réponse sur 90 jours, en jours (null si moins de 3 réponses). */
  avg_response_days: number | null;
  photos: OfferPhoto[];
  offers: Pick<OfferCard, "id" | "title" | "contract" | "city" | "salary_min_k" | "salary_max_k" | "published_at">[];
}

export interface CompanyHit {
  id: string;
  display_name: string;
  city: string | null;
}

export interface InterviewSlot {
  id: string;
  starts_at: string;
  duration_min: number;
  mode: "visio" | "onsite";
  location: string | null;
  with_whom: string | null;
  status: SlotStatus;
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  offer: { id: string; title: string; city: string; salary_min_k: number; salary_max_k: number };
  company: { id: string; display_name: string };
  created_at: string;
  seen_at: string | null;
  due_at: string;
  closed_at: string | null;
  refusal_reason: RefusalReason | null;
  refusal_message: string | null;
  /** Prochain créneau accepté, sinon null. */
  interview: InterviewSlot | null;
  slots_to_answer: number;
  unread_messages: number;
}

export interface MyApplicationDetail extends MyApplication {
  note: string | null;
  note_target_label: string | null;
  slots: InterviewSlot[];
  /** Interlocuteur côté entreprise (prénom et fonction), visible après le match. */
  recruiter: { first_name: string | null; job_title: string } | null;
}

export interface ApplicationMessage {
  id: string;
  application_id: string;
  mine: boolean;
  body: string;
  context: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ConversationSummary {
  application_id: string;
  status: ApplicationStatus;
  offer_title: string;
  /** Côté candidat : nom de l'entreprise ; côté recruteur : prénom et nom du candidat. */
  counterpart: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface Invitation {
  id: string;
  status: InvitationStatus;
  message: string;
  created_at: string;
  offer: Pick<OfferCard, "id" | "title" | "city" | "salary_min_k" | "salary_max_k" | "contract">;
  company: CompanyHit;
}

// Recruteur --------------------------------------------------------------------------------------

export interface CompanyLookup {
  siren: string;
  legal_name: string;
  naf_code: string | null;
  naf_label: string | null;
  headcount_band: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  created_on: string | null;
  active: boolean;
  /** `P` : diffusion partielle (entrepreneur individuel) ; vérification à la main. */
  diffusion: "O" | "P";
}

export interface GeoResult {
  label: string;
  city: string;
  postcode: string | null;
  lat: number;
  lng: number;
}

export interface MyCompany {
  company: CompanySummary & {
    siren: string;
    legal_name: string;
    status: CompanyStatus;
    status_reason: string | null;
    description: string | null;
    website: string | null;
    email_domain: string | null;
  };
  me: { role: CompanyRole; job_title: string; first_name: string | null };
  members: { user_id: string; role: CompanyRole; job_title: string }[];
  stats: {
    avg_response_days: number | null;
    closed_no_response_90d: number;
    offers_published: number;
    applications_to_review: number;
  };
}

export interface OfferDraft {
  id: string;
  status: OfferStatus;
  status_reason: string | null;
  title: string;
  contract: ContractType;
  city: string;
  postcode: string | null;
  address_label: string | null;
  lat: number | null;
  lng: number | null;
  remote_days: number;
  salary_min_k: number | null;
  salary_max_k: number | null;
  start_label: string | null;
  experience_band: ExperienceBand;
  missions: string[];
  must_have: string[];
  nice_to_have: string[];
  language_justification: string | null;
  team_description: string | null;
  manager_name: string | null;
  manager_title: string | null;
  interviews_count: number;
  response_days: ResponseDays;
  photos: (OfferPhoto & { consent_certified: boolean; moderation: PhotoModeration; moderation_reason: string | null })[];
}

export interface RecruiterOfferRow {
  id: string;
  title: string;
  status: OfferStatus;
  status_reason: string | null;
  contract: ContractType;
  city: string;
  salary_min_k: number | null;
  salary_max_k: number | null;
  published_at: string | null;
  expires_at: string | null;
  counts: {
    total: number;
    to_review: number;
    interested: number;
    interview: number;
    offer_made: number;
    hired: number;
    closed: number;
  };
  /** Échéance la plus proche parmi les candidatures à examiner. */
  next_due_at: string | null;
  /** Candidatures à examiner dont l'échéance tombe dans les 48 h. */
  urgent_count: number;
}

export interface PipelineCard {
  application_id: string;
  status: ApplicationStatus;
  number: number;
  /** null avant le match. */
  name: string | null;
  diploma: Pick<DiplomaBadge, "level" | "study_field"> | null;
  experience_band: ExperienceBand;
  must_met: number;
  must_total: number;
  created_at: string;
  due_at: string;
  next_slot: InterviewSlot | null;
}

export interface PileCard {
  application_id: string;
  status: ApplicationStatus;
  created_at: string;
  due_at: string;
  note: string | null;
  note_target_label: string | null;
  invited: boolean;
  cv: AnonymousCv;
  matches: RequirementMatch[];
}

export interface RecruiterApplication {
  application: PileCard & { decided_at: string | null; refusal_reason: RefusalReason | null; refusal_message: string | null };
  offer: { id: string; title: string };
  identity: { first_name: string; last_name: string } | null;
  notes: { id: string; body: string; author_job_title: string | null; created_at: string }[];
  slots: InterviewSlot[];
  unread_messages: number;
}

export interface OpenCandidate {
  number: number;
  cv: AnonymousCv;
  matches: RequirementMatch[];
  already_invited: boolean;
}

// Admin ------------------------------------------------------------------------------------------

export interface AdminCompany {
  id: string;
  siren: string;
  legal_name: string;
  display_name: string;
  status: CompanyStatus;
  status_reason: string | null;
  naf_code: string | null;
  naf_label: string | null;
  headcount_band: string | null;
  city: string | null;
  postcode: string | null;
  sirene: CompanyLookup | null;
  email_domain: string | null;
  email_domain_generic: boolean;
  created_at: string;
  owner: { user_id: string; email: string | null; job_title: string } | null;
  offers_count: number;
}

export interface AdminOfferReview {
  offer: OfferDraft & { submitted_at: string | null };
  company: { id: string; display_name: string; status: CompanyStatus };
  /** Mot interdit trouvé par le contrôle automatique, à confirmer par la modération. */
  banned_word: string | null;
}

export interface AdminOfferReport {
  id: string;
  reason: OfferReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  offer: { id: string; title: string; status: OfferStatus };
  company: { id: string; display_name: string };
  reports_on_offer: number;
}

export interface AdminEmploiStats {
  candidates_total: number;
  candidates_complete: number;
  candidates_open: number;
  recruiters_total: number;
  companies_by_status: Record<CompanyStatus, number>;
  offers_by_status: Record<OfferStatus, number>;
  applications_by_status: Record<ApplicationStatus, number>;
  avg_response_days: number | null;
  offer_reports_open: number;
}

// Notifications ----------------------------------------------------------------------------------

export const EMPLOI_NOTIFY_EVENTS = [
  "application_interested",
  "application_rejected",
  "application_closed",
  "interview_proposed",
  "invitation_received",
  "interview_accepted",
  "company_decided",
  "offer_decided",
  "deadline_reminder",
  "message",
] as const;
export type EmploiNotifyEvent = (typeof EMPLOI_NOTIFY_EVENTS)[number];

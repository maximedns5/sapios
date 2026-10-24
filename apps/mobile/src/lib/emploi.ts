import type {
  AnonymousCv,
  ApplicationMessage,
  CandidateCv,
  CandidateProfile,
  CompanyHit,
  CompanyPage,
  ContractType,
  ConversationSummary,
  CvExperience,
  CvLanguage,
  EmploiState,
  ExperienceBand,
  GeoResult,
  Invitation,
  MyApplication,
  MyApplicationDetail,
  OfferCard,
  OfferDetail,
  OfferReportReason,
} from '@sapios/shared';

import { call, invoke } from './api';

/** Champs de `save_candidate_profile` (tous facultatifs après la création de la ligne). */
export type ProfileInput = Partial<{
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
}>;

export type ApplyResult = { application_id: string; due_at: string };

/**
 * Appels de l'app candidat (docs/EMPLOI_CONTRACT.md §3). Formes de retour : packages/shared/src/emploi.ts.
 * Les erreurs portent le code du contrat (AppError.code).
 */
export const emploi = {
  state: () => call<EmploiState>('get_emploi_state'),
  setAccountKind: (kind: 'candidate' | 'recruiter') => call<void>('set_account_kind', { p_kind: kind }),
  acceptTerms: (version: string) => call<void>('accept_emploi_terms', { p_version: version }),

  setIdentity: (firstName: string, lastName: string) => call<void>('set_candidate_identity', { p_first_name: firstName, p_last_name: lastName }),
  myIdentity: () => call<{ first_name: string; last_name: string } | null>('get_my_candidate_identity'),
  saveProfile: (p: ProfileInput) => call<CandidateProfile>('save_candidate_profile', { p }),
  saveCv: (experiences: CvExperience[], skills: string[], languages: CvLanguage[]) =>
    call<CandidateCv>('save_cv', {
      p_experiences: experiences.map((e) => ({
        title: e.title,
        employer: e.employer,
        employer_hidden: e.employer_hidden,
        start_month: e.start_month,
        end_month: e.end_month,
        summary: e.summary,
      })),
      p_skills: skills,
      p_languages: languages,
    }),
  myCv: () => call<CandidateCv>('get_my_cv'),
  myCvPreview: () => call<AnonymousCv>('get_my_cv_preview'),

  feed: (limit = 20) => call<OfferCard[] | null>('get_offer_feed', { p_limit: limit }).then((rows) => rows ?? []),
  offer: (id: string) => call<OfferDetail>('get_offer', { p_id: id }),
  company: (id: string) => call<CompanyPage>('get_company', { p_id: id }),
  searchCompanies: (q: string) => call<CompanyHit[] | null>('search_companies', { p_q: q }).then((rows) => rows ?? []),
  pass: (id: string) => call<void>('pass_offer', { p_id: id }),
  apply: (id: string, note?: string | null, target?: string | null) =>
    call<ApplyResult>('apply_offer', {
      p_id: id,
      ...(note?.trim() ? { p_note: note.trim() } : {}),
      ...(target ? { p_note_target: target } : {}),
    }),
  withdraw: (id: string) => call<void>('withdraw_application', { p_id: id }),

  applications: () => call<MyApplication[] | null>('get_my_applications').then((rows) => rows ?? []),
  application: (id: string) => call<MyApplicationDetail>('get_my_application', { p_id: id }),
  messages: (applicationId: string) => call<ApplicationMessage[] | null>('get_application_messages', { p_id: applicationId }).then((rows) => rows ?? []),
  sendMessage: (applicationId: string, body: string, context?: string | null) =>
    call<string>('send_application_message', { p_id: applicationId, p_body: body, ...(context ? { p_context: context } : {}) }),
  conversations: () => call<ConversationSummary[] | null>('get_my_conversations').then((rows) => rows ?? []),
  acceptSlot: (slotId: string) => call<void>('accept_interview_slot', { p_slot_id: slotId }),

  invitations: () => call<Invitation[] | null>('get_my_invitations').then((rows) => rows ?? []),
  respondInvitation: (id: string, accept: boolean) => call<{ offer_id: string }>('respond_invitation', { p_id: id, p_accept: accept }),

  blockCompany: (companyId: string) => call<void>('block_company', { p_company_id: companyId }),
  unblockCompany: (companyId: string) => call<void>('unblock_company', { p_company_id: companyId }),
  blocks: () => call<CompanyHit[] | null>('list_my_company_blocks').then((rows) => rows ?? []),

  reportOffer: (offerId: string, reason: OfferReportReason, details?: string | null) =>
    call<string>('report_offer', { p_offer_id: offerId, p_reason: reason, ...(details?.trim() ? { p_details: details.trim() } : {}) }),
  exportData: () => call<unknown>('export_my_emploi_data'),

  /** Recherche de ville (ou d'adresse) relayée par le serveur : le service ne voit pas l'adresse IP du membre. */
  geocode: (q: string, kind: 'city' | 'address' = 'city') => invoke<{ results: GeoResult[] }>('geocode', { q, kind }).then((r) => r.results ?? []),
};

// Candidature envoyée depuis la feuille « Postuler » : la pile d'offres fait partir la carte vers la droite.
const appliedListeners = new Set<(offerId: string) => void>();

export function onApplied(listener: (offerId: string) => void): () => void {
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
}

export function notifyApplied(offerId: string) {
  appliedListeners.forEach((l) => l(offerId));
}

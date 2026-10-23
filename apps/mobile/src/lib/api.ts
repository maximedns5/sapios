import {
  EDGE_FUNCTIONS,
  type Database,
  type DeleteAccountResponse,
  type DiscoveryCounts,
  type DiscoveryPrefs,
  type DiscoverySort,
  type EventDetail,
  type EventSummary,
  type EventTicket,
  type LikedItem,
  type MyReferral,
  type ReferralPreview,
  type RegistrationResult,
  type ContentKind,
  type ProfileView,
  type SearchBooksResponse,
  type StudyField,
  type SubmitDiplomaResponse,
  type TermsState,
} from '@sapios/shared';

import { supabase } from './supabase';
import { AppError, fromFunction, fromPostgrest } from './errors';
import type { Candidate, Liker, MatchRow, MyState } from './types';

/** Critères de découverte modifiables (null ou absent = inchangé). */
export type DiscoveryCriteria = {
  maxDistanceKm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  levels?: number[] | null;
  strictLevels?: boolean | null;
  fields?: StudyField[] | null;
  strictFields?: boolean | null;
};

function criteriaArgs(c: DiscoveryCriteria) {
  const args: Record<string, unknown> = {};
  if (c.maxDistanceKm != null) args.p_max_distance_km = c.maxDistanceKm;
  if (c.ageMin != null) args.p_age_min = c.ageMin;
  if (c.ageMax != null) args.p_age_max = c.ageMax;
  if (c.levels != null) args.p_levels = c.levels;
  if (c.strictLevels != null) args.p_strict_levels = c.strictLevels;
  if (c.fields != null) args.p_fields = c.fields;
  if (c.strictFields != null) args.p_strict_fields = c.strictFields;
  return args;
}

type Fns = Database['public']['Functions'];

/** Appel RPC typé par database.types.ts ; erreurs converties en AppError (code du contrat). */
export async function rpc<F extends keyof Fns, T = Fns[F]['Returns']>(fn: F, args?: Fns[F]['Args']): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (f: F, a?: Fns[F]['Args']) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrest>[0] }>)(fn, args);
  if (error) throw fromPostgrest(error);
  return data as T;
}

export async function invoke<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await fromFunction(error);
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new AppError((data as { error: string }).error);
  }
  return data as T;
}

export const api = {
  myState: () => rpc<'get_my_state', MyState>('get_my_state'),
  setIdentity: (legalName: string, birthdate: string) => rpc('set_identity', { p_legal_name: legalName, p_birthdate: birthdate }),
  setConsent: (granted: boolean, version: string) => rpc('set_sensitive_consent', { p_granted: granted, p_version: version }),
  activate: () => rpc('activate_profile'),
  setPaused: (paused: boolean) => rpc('set_paused', { p_paused: paused }),
  setLocation: (lat: number, lng: number) => rpc('set_location', { p_lat: lat, p_lng: lng }),
  // Les colonnes nullables (âge, bio, distance) sont typées non nulles par le générateur : on garde nos types.
  feed: (limit = 20) => rpc<'get_feed', Candidate[]>('get_feed', { p_limit: limit }),
  /** Like ciblé (photo, réponse) et mot facultatif ; sans élément, le like porte sur tout le profil. */
  swipe: (target: string, direction: 'like' | 'pass', item?: LikedItem | null, comment?: string | null) =>
    rpc<'swipe', { matched: boolean; match_id: string | null }>('swipe', {
      p_target: target,
      p_direction: direction,
      ...(direction === 'like' && item ? { p_liked_item: item } : {}),
      ...(direction === 'like' && comment?.trim() ? { p_comment: comment.trim() } : {}),
    }),
  likers: () => rpc<'get_likers', Liker[]>('get_likers'),
  likesCount: () => rpc<'get_likes_count', number>('get_likes_count'),
  profile: (target: string) => rpc<'get_profile', ProfileView>('get_profile', { p_target: target }),
  discoveryPrefs: () => rpc<'get_discovery_prefs', DiscoveryPrefs>('get_discovery_prefs'),
  setDiscoveryPrefs: (c: DiscoveryCriteria & { sort?: DiscoverySort | null }) =>
    rpc<'set_discovery_prefs', DiscoveryPrefs>('set_discovery_prefs', { ...criteriaArgs(c), ...(c.sort ? { p_sort: c.sort } : {}) } as Fns['set_discovery_prefs']['Args']),
  countDiscovery: (c: DiscoveryCriteria = {}) => rpc<'count_discovery', DiscoveryCounts>('count_discovery', criteriaArgs(c) as Fns['count_discovery']['Args']),
  ackNotice: (id: string) => rpc('ack_notice', { p_id: id }),
  acceptTerms: (version: string) => rpc<'accept_terms', TermsState>('accept_terms', { p_version: version }),
  matches: () => rpc<'get_matches', MatchRow[]>('get_matches'),
  unmatch: (matchId: string) => rpc('unmatch', { p_match_id: matchId }),
  block: (target: string) => rpc('block_user', { p_target: target }),
  /** Signalement d'une personne, ou d'un de ses textes (`content` : type et identifiant ; nul pour la thèse). */
  report: (target: string, reason: string, details: string, content?: { kind: ContentKind; item: string | null } | null) =>
    rpc('report_user', {
      p_target: target,
      p_reason: reason,
      p_details: details,
      ...(content ? { p_content_kind: content.kind, ...(content.item ? { p_content_item: content.item } : {}) } : {}),
    }),
  exportData: () => rpc('export_my_data'),
  submitDiploma: (storagePath: string, mime: string) =>
    invoke<SubmitDiplomaResponse>(EDGE_FUNCTIONS.submitDiploma, { storage_path: storagePath, mime }),
  deleteAccount: () => invoke<DeleteAccountResponse>(EDGE_FUNCTIONS.deleteAccount),
  /** Recherche de livres, relayée par le serveur : Open Library ne voit jamais l'adresse du membre. */
  searchBooks: (q: string) => invoke<SearchBooksResponse>(EDGE_FUNCTIONS.searchBooks, { q }),

  // Lettres de recommandation (lot 2) : le parrain ne voit qu'un compteur, jamais un nom ni un verdict.
  myReferral: () => rpc<'get_my_referral', MyReferral>('get_my_referral'),
  /** Ouvert sans connexion : le prénom du parrain, ou null si le code est inutilisable. */
  referralPreview: (code: string) => rpc<'get_referral_preview', ReferralPreview>('get_referral_preview', { p_code: code }),
  claimReferral: (code: string) => rpc<'claim_referral', { referrer_first_name: string | null }>('claim_referral', { p_code: code }),

  // Événements gratuits (lot 2) : jamais la liste des inscrits ; le lieu exact seulement pour une place confirmée.
  events: () => rpc<'list_events', EventSummary[]>('list_events'),
  event: (id: string) => rpc<'get_event', EventDetail>('get_event', { p_id: id }),
  registerEvent: (id: string) => rpc<'register_event', RegistrationResult>('register_event', { p_id: id, p_accept_charter: true }),
  cancelRegistration: (id: string) => rpc<'cancel_registration', RegistrationResult>('cancel_registration', { p_id: id }),
  ticket: (id: string) => rpc<'get_my_ticket', EventTicket>('get_my_ticket', { p_id: id }),
};

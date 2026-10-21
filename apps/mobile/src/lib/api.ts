import { EDGE_FUNCTIONS, type Database, type DeleteAccountResponse, type SubmitDiplomaResponse } from '@sapios/shared';

import { supabase } from './supabase';
import { AppError, fromFunction, fromPostgrest } from './errors';
import type { Candidate, MatchRow, MyState } from './types';

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
  swipe: (target: string, direction: 'like' | 'pass') =>
    rpc<'swipe', { matched: boolean; match_id: string | null }>('swipe', { p_target: target, p_direction: direction }),
  likers: () => rpc<'get_likers', Candidate[]>('get_likers'),
  matches: () => rpc<'get_matches', MatchRow[]>('get_matches'),
  unmatch: (matchId: string) => rpc('unmatch', { p_match_id: matchId }),
  block: (target: string) => rpc('block_user', { p_target: target }),
  report: (target: string, reason: string, details: string) => rpc('report_user', { p_target: target, p_reason: reason, p_details: details }),
  exportData: () => rpc('export_my_data'),
  submitDiploma: (storagePath: string, mime: string) =>
    invoke<SubmitDiplomaResponse>(EDGE_FUNCTIONS.submitDiploma, { storage_path: storagePath, mime }),
  deleteAccount: () => invoke<DeleteAccountResponse>(EDGE_FUNCTIONS.deleteAccount),
};

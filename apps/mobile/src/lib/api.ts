import { EDGE_FUNCTIONS, type DeleteAccountResponse, type SubmitDiplomaResponse } from '@sapios/shared';

import { supabase } from './supabase';
import { AppError, fromFunction, fromPostgrest } from './errors';

type RpcResult = { data: unknown; error: Parameters<typeof fromPostgrest>[0] };

/**
 * Appel RPC ; erreurs converties en AppError (code du contrat). Les RPC emploi ne figurent pas encore dans
 * database.types.ts : leurs formes font foi dans packages/shared/src/emploi.ts.
 */
export async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<RpcResult>)(fn, args);
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

/** Socle commun (diplôme, avis, compte) ; les appels propres à l'emploi sont dans `emploi.ts`. */
export const api = {
  ackNotice: (id: string) => call<void>('ack_notice', { p_id: id }),
  submitDiploma: (storagePath: string, mime: string) =>
    invoke<SubmitDiplomaResponse>(EDGE_FUNCTIONS.submitDiploma, { storage_path: storagePath, mime }),
  deleteAccount: () => invoke<DeleteAccountResponse>(EDGE_FUNCTIONS.deleteAccount),
};

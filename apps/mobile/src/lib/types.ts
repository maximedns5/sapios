import type { EmploiNotice, EmploiState, InactivityNotice } from '@sapios/shared';

/** Avis non lus de get_emploi_state() : ceux de l'emploi, plus l'avertissement d'inactivité (conformité). */
export type AnyNotice = EmploiNotice | InactivityNotice;

export type AppState = Omit<EmploiState, 'notices'> & { notices: AnyNotice[] };

export const IN_REVIEW = ['pending', 'processing', 'needs_review'] as const;

export function isInReview(status: string | null | undefined): boolean {
  return !!status && (IN_REVIEW as readonly string[]).includes(status);
}

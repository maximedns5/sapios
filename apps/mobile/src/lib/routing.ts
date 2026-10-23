import type { MyState, VerdictVariant } from './types';

/** Écran cible et chemins autorisés pour un état donné (routage piloté par get_my_state). */
export type Route = { target: string; allowed: string[] };

const APP_PATHS = ['/feed', '/likes', '/messages', '/account', '/criteria', '/chat', '/match', '/profile', '/report', '/settings', '/events'];
const DIPLOMA_FLOW = ['/diploma', '/diploma/analysis', '/diploma/review'];

export const IN_REVIEW = ['pending', 'processing', 'needs_review'] as const;

export function onboardingStep(state: MyState): string {
  const o = state.onboarding;
  if (!o.identity_set) return '/onboarding/identity';
  if (!o.consent_sensitive) return '/onboarding/consent';
  if (!o.profile_complete) return '/onboarding/profile';
  return '/onboarding/photos';
}

export function variantFromCopyKey(copyKey: string | null): VerdictVariant | null {
  if (!copyKey) return null;
  const v = copyKey.replace(/^verdict\./, '');
  const known: VerdictVariant[] = ['unlimited', 'standard', 'waitlist', 'refused', 'uninstall', 'rejected', 'needs_more'];
  return (known as string[]).includes(v) ? (v as VerdictVariant) : null;
}

export function tierVerdictKey(state: MyState): string | null {
  return state.copy_key ? `tier:${state.copy_key}:${state.level ?? ''}` : null;
}

export function submissionVerdictKey(state: MyState): string | null {
  const s = state.latest_submission;
  return s && (s.status === 'rejected' || s.status === 'needs_more') ? `sub:${s.id}:${s.status}` : null;
}

/** Variante de verdict à afficher pour l'état courant (null : rien à montrer). */
export function currentVerdict(state: MyState, seen: Set<string>): VerdictVariant | null {
  const subKey = submissionVerdictKey(state);
  const tierKey = tierVerdictKey(state);
  const tierVariant = variantFromCopyKey(state.copy_key);
  const sub = state.latest_submission;
  if (state.can_browse) {
    if (tierKey && !seen.has(tierKey)) return tierVariant;
    if (subKey && !seen.has(subKey)) return sub!.status as VerdictVariant;
    return null;
  }
  if (subKey && (!tierKey || !seen.has(subKey))) return sub!.status as VerdictVariant;
  return tierVariant;
}

export function decide(state: MyState, seen: Set<string>): Route {
  if (state.profile_status === 'banned') return { target: '/banned', allowed: ['/banned', '/settings'] };
  if (state.profile_status === 'onboarding') {
    const step = onboardingStep(state);
    return { target: step, allowed: [step, '/settings'] };
  }
  const sub = state.latest_submission;
  const inReview = !!sub && (IN_REVIEW as readonly string[]).includes(sub.status);
  const verdict = currentVerdict(state, seen);

  if (state.can_browse) {
    if (verdict) return { target: `/verdict?v=${verdict}`, allowed: ['/verdict', '/settings'] };
    return { target: '/feed', allowed: [...APP_PATHS, '/verdict', ...DIPLOMA_FLOW] };
  }
  if (inReview) return { target: '/diploma/review', allowed: [...DIPLOMA_FLOW, '/settings'] };
  if (verdict) return { target: `/verdict?v=${verdict}`, allowed: ['/verdict', '/diploma', '/diploma/analysis', '/settings'] };
  return { target: '/diploma', allowed: ['/diploma', '/diploma/analysis', '/settings'] };
}

export const SIGNED_OUT: Route = { target: '/sign-in', allowed: ['/sign-in', '/verify', '/auth/callback'] };

/** Correspondance exacte, ou préfixe pour les zones à sous-routes dynamiques. */
export function isAllowed(pathname: string, allowed: string[]): boolean {
  const prefixed = ['/chat', '/match', '/profile', '/report', '/settings', '/onboarding', '/events'];
  return allowed.some((p) => pathname === p || (prefixed.includes(p) && pathname.startsWith(`${p}/`)));
}

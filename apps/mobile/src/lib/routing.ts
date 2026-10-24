import type { AppState } from './types';

/** Écran cible et chemins autorisés pour un état donné (routage piloté par get_emploi_state). */
export type Route = { target: string; allowed: string[] };

/** Espace candidat : onglets, fiches, conversations, réglages, diplôme. */
export const APP_PATHS = [
  '/offers',
  '/applications',
  '/messages',
  '/profile',
  '/offer',
  '/apply',
  '/chat',
  '/match',
  '/interview',
  '/company',
  '/report',
  '/settings',
  '/diploma',
  '/diploma/analysis',
  '/diploma/review',
];

/** Zones à sous-routes dynamiques (correspondance par préfixe). */
const PREFIXED = ['/offer', '/apply', '/applications', '/chat', '/match', '/interview', '/company', '/report', '/settings', '/onboarding', '/diploma'];

/** Clé locale : l'invitation « Vérifions votre diplôme » a été vue (passée ou suivie). */
export const DIPLOMA_INTRO_KEY = 'diploma-intro';

export function decide(state: AppState, seen: Set<string>): Route | null {
  // Compte sans type : l'app le déclare candidat, puis relit l'état (écran d'attente en attendant).
  if (!state.kind) return null;
  if (state.kind === 'recruiter') return { target: '/recruiter', allowed: ['/recruiter', '/settings'] };

  if (!state.terms.accepted) {
    // Jamais inscrit : étape « Conditions » de l'inscription ; sinon écran bloquant « Nos conditions évoluent ».
    if (!state.candidate) return { target: '/onboarding/terms', allowed: ['/onboarding/terms', '/settings'] };
    return { target: '/terms', allowed: ['/terms', '/settings'] };
  }
  if (!state.identity_set) return { target: '/onboarding/identity', allowed: ['/onboarding/identity', '/settings'] };
  if (!state.candidate || !state.candidate.complete) return { target: '/onboarding/profile', allowed: ['/onboarding/profile', '/settings'] };

  // Diplôme facultatif : proposé une fois après l'inscription, jamais imposé.
  const noDiploma = !state.diploma && !state.latest_submission;
  if (noDiploma && !seen.has(DIPLOMA_INTRO_KEY)) return { target: '/diploma?intro=1', allowed: [...APP_PATHS] };
  return { target: '/offers', allowed: [...APP_PATHS] };
}

export const SIGNED_OUT: Route = { target: '/sign-in', allowed: ['/sign-in', '/verify', '/auth/callback'] };

/** Correspondance exacte, ou préfixe pour les zones à sous-routes dynamiques. */
export function isAllowed(pathname: string, allowed: string[]): boolean {
  return allowed.some((p) => {
    const base = p.split('?')[0];
    if (pathname === base) return true;
    if (PREFIXED.includes(base) && pathname.startsWith(`${base}/`)) return true;
    // `/applications/<id>` (lien des emails) appartient à l'espace candidat.
    return base === '/applications' && pathname.startsWith('/applications/');
  });
}

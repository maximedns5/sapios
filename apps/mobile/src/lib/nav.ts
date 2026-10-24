import { router } from 'expo-router';

export type TabPath = '/offers' | '/applications' | '/messages' | '/profile';

/**
 * Revient à l'espace candidat (onglets) puis ouvre l'onglet voulu, sans empiler une seconde instance
 * des onglets au-dessus d'une fiche ou d'une conversation.
 */
export function goToTab(path: TabPath) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(path);
}

/** Ouvre la conversation d'une candidature appariée. */
export function openChat(applicationId: string, opts?: { replace?: boolean }) {
  const href = { pathname: '/chat/[id]' as const, params: { id: applicationId } };
  if (opts?.replace) router.replace(href);
  else router.push(href);
}

export function openOffer(offerId: string) {
  router.push({ pathname: '/offer/[id]', params: { id: offerId } });
}

/** Retour arrière, ou onglet de repli si la page a été ouverte directement (lien d'email). */
export function back(fallback: TabPath = '/offers') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

import { router } from 'expo-router';

import { isWideNow } from './layout';

/**
 * Revient à l'espace membre (onglets) puis ouvre l'onglet voulu, sans empiler une seconde instance
 * des onglets au-dessus du chat ou de la fiche.
 */
export function goToTab(path: '/feed' | '/likes' | '/messages' | '/account') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(path);
}

/**
 * Ouvre une conversation : plein écran sur téléphone, colonne de droite de « Messages » sur grand écran
 * (`/messages?m=<id>`, rechargeable).
 */
export function openChat(matchId: string, opts?: { replace?: boolean }) {
  if (isWideNow()) {
    if (router.canDismiss()) router.dismissAll();
    router.navigate({ pathname: '/messages', params: { m: matchId } });
    return;
  }
  const href = { pathname: '/chat/[matchId]' as const, params: { matchId } };
  if (opts?.replace) router.replace(href);
  else router.push(href);
}

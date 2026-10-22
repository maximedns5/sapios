import { router } from 'expo-router';

/**
 * Revient à l'espace membre (onglets) puis ouvre l'onglet voulu, sans empiler une seconde instance
 * des onglets au-dessus du chat ou de la fiche.
 */
export function goToTab(path: '/feed' | '/likes' | '/messages' | '/account') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(path);
}

/** Ouvre une conversation en plein écran (la colonne de l'app a la largeur d'un téléphone). */
export function openChat(matchId: string, opts?: { replace?: boolean }) {
  const href = { pathname: '/chat/[matchId]' as const, params: { matchId } };
  if (opts?.replace) router.replace(href);
  else router.push(href);
}

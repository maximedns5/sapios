import type { ContentKind } from '@sapios/shared';
import { router } from 'expo-router';

import { api } from './api';
import { dropCandidate } from './candidates';
import { goToTab } from './nav';
import { errorMessage } from './errors';

type Overlay = {
  confirm: (o: { label?: string; title: string; message?: string; confirm?: string }) => Promise<boolean>;
  toast: (m: string) => void;
};

/**
 * Bloquer : effet symétrique (feed et chat) et dé-match automatique côté serveur.
 * `onDone` remplace la navigation vers `after` (conversation ouverte dans la colonne de « Messages »).
 */
export async function blockUser(overlay: Overlay, userId: string, name: string, after: '/feed' | '/likes' | '/messages', onDone?: () => void) {
  const ok = await overlay.confirm({
    label: 'Sécurité',
    title: `Bloquer ${name} ?`,
    message: 'Vous ne vous verrez plus, nulle part. La conversation éventuelle est fermée.',
    confirm: 'Bloquer',
  });
  if (!ok) return false;
  try {
    await api.block(userId);
    dropCandidate(userId);
    overlay.toast(`${name} est bloqué·e.`);
    if (onDone) onDone();
    else goToTab(after);
    return true;
  } catch (e) {
    overlay.toast(errorMessage(e));
    return false;
  }
}

export async function unmatchUser(overlay: Overlay, matchId: string, name: string, onDone?: () => void) {
  const ok = await overlay.confirm({
    label: 'Sécurité',
    title: `Se dé-matcher de ${name} ?`,
    message: 'La conversation disparaît pour vous deux. Irréversible.',
    confirm: 'Se dé-matcher',
  });
  if (!ok) return false;
  try {
    await api.unmatch(matchId);
    overlay.toast('Match supprimé.');
    if (onDone) onDone();
    else goToTab('/messages');
    return true;
  } catch (e) {
    overlay.toast(errorMessage(e));
    return false;
  }
}

/** Texte signalé : réponse ou livre (identifiant), phrase de thèse (pas d'identifiant : une par membre). */
export type ReportTarget = { kind: ContentKind; item: string | null; label: string; text: string };

/** Signaler une personne, ou l'un de ses textes : le formulaire cite alors le texte visé. */
export function openReport(userId: string, name: string, matchId?: string, content?: ReportTarget) {
  router.push({
    pathname: '/report/[userId]',
    params: {
      userId,
      name,
      ...(matchId ? { matchId } : {}),
      ...(content
        ? { contentKind: content.kind, ...(content.item ? { contentItem: content.item } : {}), quote: content.text.slice(0, 300), quoteLabel: content.label }
        : {}),
    },
  });
}

import { router } from 'expo-router';

import { api } from './api';
import { dropCandidate } from './candidates';
import { goToTab } from './nav';
import { errorMessage } from './errors';

type Overlay = {
  confirm: (o: { label?: string; title: string; message?: string; confirm?: string }) => Promise<boolean>;
  toast: (m: string) => void;
};

/** Bloquer : effet symétrique (feed et chat) et dé-match automatique côté serveur. */
export async function blockUser(overlay: Overlay, userId: string, name: string, after: '/feed' | '/likes' | '/messages') {
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
    goToTab(after);
    return true;
  } catch (e) {
    overlay.toast(errorMessage(e));
    return false;
  }
}

export async function unmatchUser(overlay: Overlay, matchId: string, name: string) {
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
    goToTab('/messages');
    return true;
  } catch (e) {
    overlay.toast(errorMessage(e));
    return false;
  }
}

export function openReport(userId: string, name: string, matchId?: string) {
  router.push({ pathname: '/report/[userId]', params: { userId, name, ...(matchId ? { matchId } : {}) } });
}

import { QUIZ } from '@sapios/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { SITE_URL } from './env';

export type ShareFormat = 'story' | 'carre';

/** Image du résultat, générée par le site public (mêmes visuels que la landing). */
export function quizImageUrl(format: ShareFormat): string {
  return `${SITE_URL}/test/partage/${format}`;
}

const text = () => `${QUIZ.copy.share.text} ${SITE_URL}/test`;

/**
 * Partage du résultat du test. Téléphone : l'image en story, par la feuille de partage (repli : le
 * texte seul). Web : le partage du navigateur s'il existe ; sinon `fallback`, et l'écran propose de
 * télécharger l'image. Rien n'est enregistré.
 */
export async function shareQuizResult(): Promise<'shared' | 'fallback' | 'cancelled'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : null;
    if (!nav?.share) return 'fallback';
    try {
      await nav.share({ title: QUIZ.copy.share.title, text: QUIZ.copy.share.text, url: `${SITE_URL}/test` });
      return 'shared';
    } catch (e) {
      return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'fallback';
    }
  }
  try {
    const target = new File(Paths.cache, 'sapios-test-admission-story.png');
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(quizImageUrl('story'), target);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: QUIZ.copy.share.title, UTI: 'public.png' });
      return 'shared';
    }
  } catch {
    // Image indisponible (hors ligne, site sans URL) : on partage le texte.
  }
  const res = await Share.share({ message: text(), title: QUIZ.copy.share.title });
  return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

/** Web sans partage natif : ouvre l'image dans un onglet pour l'enregistrer. */
export function openQuizImage(format: ShareFormat) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(quizImageUrl(format), '_blank', 'noopener');
}

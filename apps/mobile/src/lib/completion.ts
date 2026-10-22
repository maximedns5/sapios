import { MAX_PHOTOS } from './profile';

/**
 * Complétude du profil, d'après les seules données existantes (photos, bio). Les réponses aux questions
 * et la bibliothèque du profil intellectuel s'y ajouteront.
 */
export function profileCompletion({ photos, bio }: { photos: number; bio: string | null | undefined }) {
  const items = [
    { key: 'photos', done: photos >= 4, weight: 0.5, part: Math.min(photos, 4) / 4, hint: `Ajoutez ${Math.max(0, 4 - photos)} photo${4 - photos > 1 ? 's' : ''}` },
    { key: 'bio', done: !!bio?.trim(), weight: 0.35, part: bio?.trim() ? 1 : 0, hint: 'Écrivez quelques mots sur vous' },
    { key: 'more', done: photos >= MAX_PHOTOS, weight: 0.15, part: Math.min(photos, MAX_PHOTOS) / MAX_PHOTOS, hint: 'Jusqu’à six photos' },
  ];
  const value = items.reduce((sum, item) => sum + item.weight * item.part, 0);
  const next = items.find((item) => !item.done);
  return { value: Math.round(value * 100) / 100, next: next?.hint ?? null };
}

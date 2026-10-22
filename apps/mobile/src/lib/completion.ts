import { MAX_ANSWERS } from '@sapios/shared';

import { MAX_PHOTOS } from './profile';

type Input = {
  photos: number;
  bio: string | null | undefined;
  /** Réponses aux questions (0 à 3). */
  answers?: number;
  books?: number;
  field?: boolean;
  thesis?: boolean;
};

/**
 * Complétude du profil : photos et réponses d'abord (ce qu'on voit sur la carte), puis domaine,
 * bibliothèque, bio et phrase de thèse. `next` dit quoi faire ensuite, dans cet ordre.
 */
export function profileCompletion({ photos, bio, answers = 0, books = 0, field = false, thesis = false }: Input) {
  const left = MAX_ANSWERS - Math.min(answers, MAX_ANSWERS);
  const items = [
    { weight: 0.25, part: Math.min(photos, 4) / 4, hint: `Ajoutez ${Math.max(0, 4 - photos)} photo${4 - photos > 1 ? 's' : ''}` },
    { weight: 0.3, part: (MAX_ANSWERS - left) / MAX_ANSWERS, hint: left === 1 ? 'Plus qu’une question pour vos réponses' : `Répondez à ${left} questions` },
    { weight: 0.1, part: field ? 1 : 0, hint: 'Indiquez votre domaine' },
    { weight: 0.1, part: books > 0 ? 1 : 0, hint: 'Ajoutez un livre à votre bibliothèque' },
    { weight: 0.1, part: bio?.trim() ? 1 : 0, hint: 'Écrivez quelques mots sur vous' },
    { weight: 0.1, part: thesis ? 1 : 0, hint: 'Résumez votre thèse ou votre mémoire' },
    { weight: 0.05, part: Math.min(photos, MAX_PHOTOS) / MAX_PHOTOS, hint: 'Jusqu’à six photos' },
  ];
  const value = items.reduce((sum, item) => sum + item.weight * item.part, 0);
  const next = items.find((item) => item.part < 1);
  return { value: Math.round(value * 100) / 100, next: next?.hint ?? null };
}

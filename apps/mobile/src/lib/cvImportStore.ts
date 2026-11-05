// Passage de relais entre l'écran qui lance l'import (inscription, Mon CV) et l'écran de relecture.
// En mémoire seulement : rien n'est écrit sur l'appareil, et un rechargement de page vide le relais.

import type { CvExperience, CvLanguage, ExperienceBand } from '@sapios/shared';
import type { CvImportResult, CvParts } from '@sapios/shared/cv-import';

export type CvImportReader = typeof import('@sapios/shared/cv-import');

export type CvImportApply = {
  parts: CvParts;
  profile: { target_role?: string; experience_band?: ExperienceBand };
};

export type PendingImport = {
  result: CvImportResult;
  reader: CvImportReader;
  current: { skills: string[]; languages: CvLanguage[]; experiences: CvExperience[] };
  currentRole: string | null;
  currentBand: ExperienceBand | null;
  /** Lien « Faire vérifier mon diplôme » sous la formation détectée (pas pendant l'inscription). */
  showDiplomaLink: boolean;
  onApply: (apply: CvImportApply) => void;
};

let pending: PendingImport | null = null;

export const cvImportStore = {
  set(p: PendingImport) {
    pending = p;
  },
  get(): PendingImport | null {
    return pending;
  },
  clear() {
    pending = null;
  },
};

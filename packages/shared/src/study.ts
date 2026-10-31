// Domaines d'études du diplôme vérifié (enum Postgres `study_field`, user_access.study_field).
// Ce fichier ne doit rien importer : les Edge Functions (Deno) l'importent directement.

/** Domaines d'études : grands domaines de la CITE/ISCED-F 2013, au vocabulaire français. */
export const STUDY_FIELDS = [
  "education",
  "arts",
  "letters",
  "philosophy",
  "history",
  "social_sciences",
  "economics",
  "law",
  "sciences",
  "mathematics",
  "computing",
  "engineering",
  "agronomy",
  "health",
] as const;
export type StudyField = (typeof STUDY_FIELDS)[number];

export const STUDY_FIELD_LABELS: Readonly<Record<StudyField, string>> = {
  education: "Sciences de l'éducation",
  arts: "Arts et design",
  letters: "Lettres et langues",
  philosophy: "Philosophie",
  history: "Histoire et archéologie",
  social_sciences: "Sciences sociales et psychologie",
  economics: "Économie et gestion",
  law: "Droit et science politique",
  sciences: "Sciences de la nature",
  mathematics: "Mathématiques",
  computing: "Informatique",
  engineering: "Ingénierie et architecture",
  agronomy: "Agronomie et environnement",
  health: "Médecine et santé",
};

export function isStudyField(value: unknown): value is StudyField {
  return typeof value === "string" && (STUDY_FIELDS as readonly string[]).includes(value);
}

export function studyFieldLabel(field: StudyField | null | undefined): string | null {
  return field ? STUDY_FIELD_LABELS[field] : null;
}

/** Longueur maximale d'un établissement vérifié (apply_diploma_review, admin_set_member_institution). */
export const INSTITUTION_MAX_LENGTH = 200;

// Import de CV : formes d'entrée et de sortie du lecteur déterministe (docs/EMPLOI_CONTRACT.md §10).
// Aucune dépendance au DOM ni au réseau : le client extrait les lignes (pdf.js, DOCX dézippé, XML),
// ce module les lit par règles et dictionnaires. Même entrée et même date de référence : même sortie.

import type { ExperienceBand, LanguageLevel } from "../emploi";

/** Une ligne de texte extraite, dans l'ordre de lecture. */
export interface CvLine {
  text: string;
  /** Taille de police en points (PDF) ou en demi-points convertis (DOCX), si connue. */
  size?: number;
  bold?: boolean;
  /** Style de paragraphe DOCX (`Heading1`, `Titre1`, `ListParagraph`…), si connu. */
  style?: string;
  /** Puce ou numérotation détectée à l'extraction (liste DOCX, glyphe de puce). */
  bullet?: boolean;
  page?: number;
  /** Première ligne d'une nouvelle colonne (PDF en deux colonnes) : les rubriques ne la traversent pas. */
  columnBreak?: boolean;
}

/** Morceau de texte positionné, tel que pdf.js le donne (une page à la fois). */
export interface PdfTextItem {
  str: string;
  /** Abscisse et ordonnée de la ligne de base, en points, origine en bas à gauche. */
  x: number;
  y: number;
  width: number;
  /** Hauteur de police en points. */
  size: number;
  bold?: boolean;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

export type CvImportSource =
  | { kind: "lines"; lines: CvLine[]; hasImages?: boolean }
  | { kind: "europass"; xml: string; hasImages?: boolean };

export interface CvImportOptions {
  /** Date de référence (AAAA-MM-JJ) pour « présent », « aujourd'hui » et le calcul de l'expérience. */
  referenceDate: string;
}

export type CvImportFormat = "europass" | "linkedin" | "generic";

/** Catégories jamais lues ni gardées ; signalées quand le fichier en contenait. */
export const CV_IGNORED_CATEGORIES = [
  "photo",
  "birth_date",
  "age",
  "address",
  "nationality",
  "marital_status",
  "gender",
  "email",
  "phone",
  "name",
] as const;
export type CvIgnoredCategory = (typeof CV_IGNORED_CATEGORIES)[number];

export const CV_IGNORED_LABELS: Record<CvIgnoredCategory, string> = {
  photo: "photo",
  birth_date: "date de naissance",
  age: "âge",
  address: "adresse",
  nationality: "nationalité",
  marital_status: "situation familiale",
  gender: "genre",
  email: "email",
  phone: "téléphone",
  name: "nom et prénom",
};

export interface ImportedExperience {
  title: string;
  employer: string;
  /** AAAA-MM-01 */
  start_month: string;
  /** AAAA-MM-01, null = en cours. */
  end_month: string | null;
  summary: string | null;
  /** Mois déduits d'une année seule (« 2021 – 2023 ») : à préciser. */
  approximate: boolean;
}

export interface ImportedLanguage {
  language: string;
  /** null : niveau absent du CV, à choisir. */
  level: LanguageLevel | null;
}

export interface ImportedSkill {
  label: string;
  /** `dictionary` : reconnu par le dictionnaire ; `listed` : écrit tel quel dans une liste de compétences. */
  source: "dictionary" | "listed";
}

export interface EducationHint {
  school: string | null;
  degree: string | null;
  years: string | null;
}

export type CvImportWarning =
  | "no_text"
  | "no_experience_section"
  | "experience_without_employer"
  | "experience_without_title"
  | "approximate_dates"
  | "language_without_level"
  | "columns_reordered"
  | "too_many_skills"
  | "summary_truncated"
  | "europass_partial";

export const CV_WARNING_LABELS: Record<CvImportWarning, string> = {
  no_text: "Aucun texte lisible : le PDF est sans doute une image scannée. Remplissez votre CV à la main.",
  no_experience_section: "Nous n’avons pas trouvé de rubrique « Expérience ».",
  experience_without_employer: "Une ou plusieurs expériences n’ont pas d’employeur : complétez-les.",
  experience_without_title: "Une ou plusieurs expériences n’ont pas d’intitulé : complétez-les.",
  approximate_dates: "Certaines dates n’ont que l’année : précisez les mois.",
  language_without_level: "Le niveau de certaines langues n’est pas indiqué : choisissez-le.",
  columns_reordered: "Votre CV est en colonnes : nous avons reconstitué l’ordre de lecture.",
  too_many_skills: "Plus de 10 compétences trouvées : les 10 premières sont cochées.",
  summary_truncated: "Certaines descriptions ont été raccourcies à 300 caractères.",
  europass_partial: "Le fichier Europass est incomplet : vérifiez chaque rubrique.",
};

export interface CvImportResult {
  /** Version des règles : change quand le lecteur change, pour rejouer un import à l'identique. */
  rules_version: string;
  format: CvImportFormat;
  target_role: string | null;
  experiences: ImportedExperience[];
  skills: ImportedSkill[];
  languages: ImportedLanguage[];
  experience_band: ExperienceBand | null;
  education_hints: EducationHint[];
  warnings: CvImportWarning[];
  ignored: CvIgnoredCategory[];
}

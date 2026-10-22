// Lot 1 : profil intellectuel, likes ciblés, découverte par critères (contrat §1 à §3).
// Ce fichier ne doit rien importer : les Edge Functions (Deno) l'importent directement.

// --- Enums Postgres -----------------------------------------------------------------------------

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

export const THESIS_VISIBILITIES = ["everyone", "matches"] as const;
export type ThesisVisibility = (typeof THESIS_VISIBILITIES)[number];

export const DISCOVERY_SORTS = ["activity", "affinity"] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export const CONTENT_KINDS = ["answer", "book", "thesis"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_FLAG_STATUSES = ["open", "kept", "removed", "withdrawn"] as const;
export type ContentFlagStatus = (typeof CONTENT_FLAG_STATUSES)[number];

// --- Limites (vérifiées aussi par la base) ------------------------------------------------------

export const MAX_ANSWERS = 3;
export const ANSWER_MAX_LENGTH = 250;
export const MAX_BOOKS = 5;
export const BOOK_TITLE_MAX_LENGTH = 200;
export const BOOK_AUTHOR_MAX_LENGTH = 120;
export const THESIS_MAX_LENGTH = 160;
export const LIKE_COMMENT_MAX_LENGTH = 140;
export const INSTITUTION_MAX_LENGTH = 200;
export const DISCOVERY_MIN_DISTANCE_KM = 5;
export const DISCOVERY_MAX_DISTANCE_KM = 200;
/** Repli si `app_settings.feed_radius_km` est absent ; `get_discovery_prefs` renvoie la valeur réelle. */
export const DISCOVERY_DEFAULT_DISTANCE_KM = 50;

/** Libellé du champ de thèse selon le niveau : « Ma thèse » (Bac+8), sinon « Mon mémoire ». */
export function thesisLabel(level: number | null | undefined): string {
  return (level ?? 0) >= 8 ? "Ma thèse" : "Mon mémoire";
}

// --- Questions du profil ------------------------------------------------------------------------

/**
 * Catalogue livré par la migration. Le texte de référence est `app_copy` (`prompt.<key>`), éditable
 * dans le back-office ; ces textes ne servent que de repli. Le catalogue peut grandir : une clé
 * inconnue d'ici reste valide (lire `profile_prompts`).
 */
export const DEFAULT_PROMPTS = {
  three_hours: "Je pourrais en parler 3 h",
  winning_debate: "Le débat que je gagne toujours",
  secret_reread: "Le livre que je relis en cachette",
  useless_fact: "Le fait inutile que je connais par cœur",
  changed_my_mind: "Le livre qui m'a fait changer d'avis",
  explain_with_passion: "Ce que j'explique mal, mais avec passion",
  favorite_footnote: "Ma note de bas de page préférée",
  dinner_guest: "L'invité idéal à ma table, d'hier ou d'aujourd'hui",
  first_date: "Pour un premier rendez-vous, je propose…",
  teach_me: "Apprenez-moi quelque chose sur…",
  rabbit_hole: "Ma dernière nuit perdue sur Wikipédia",
  word_comeback: "Le mot que j'aimerais remettre à la mode",
  typo_peeve: "La faute qui me fait tiquer",
  overrated_classic: "Un classique que je trouve surcoté",
  underrated_classic: "Un classique que tout le monde devrait lire",
  procrastination: "Ma meilleure excuse pour procrastiner",
  library_city: "La ville où je vivrais pour ses bibliothèques",
  conversation_crush: "Ce qui me fait craquer dans une conversation",
  ideal_sunday: "Mon dimanche idéal, en une phrase",
  lifelong_question: "La question qui m'occupe depuis toujours",
} as const satisfies Record<string, string>;
export type DefaultPromptKey = keyof typeof DEFAULT_PROMPTS;

/** Clé `app_copy` du texte d'une question. */
export function promptCopyKey(key: string): string {
  return `prompt.${key}`;
}

// --- Likes ciblés -------------------------------------------------------------------------------

/** `null` = tout le profil ; `photo:<uuid>` ; `answer:<position 0..2>`. */
export type LikedItem = `photo:${string}` | `answer:${0 | 1 | 2}`;

export function likedPhoto(photoId: string): LikedItem {
  return `photo:${photoId}`;
}

export function likedAnswer(position: number): LikedItem {
  if (!Number.isInteger(position) || position < 0 || position >= MAX_ANSWERS) {
    throw new RangeError(`position de réponse invalide : ${position}`);
  }
  return `answer:${position as 0 | 1 | 2}`;
}

export type ParsedLikedItem =
  | { kind: "profile" }
  | { kind: "photo"; photoId: string }
  | { kind: "answer"; position: number };

export function parseLikedItem(item: string | null | undefined): ParsedLikedItem {
  if (!item) return { kind: "profile" };
  const photoId = /^photo:([0-9a-f-]{36})$/.exec(item)?.[1];
  if (photoId) return { kind: "photo", photoId };
  const position = /^answer:([0-2])$/.exec(item)?.[1];
  if (position) return { kind: "answer", position: Number(position) };
  return { kind: "profile" };
}

// --- Affinités (get_feed.affinity_reasons, get_profile.affinity.reasons) ------------------------

export type AffinityReason =
  | { kind: "same_field"; field: StudyField }
  | { kind: "shared_books"; count: number; titles: string[] }
  | { kind: "shared_prompts"; count: number; prompt_keys: string[] }
  | { kind: "same_institution"; institution: string };

export interface Affinity {
  score: number;
  reasons: AffinityReason[];
}

// --- Formes jsonb des RPC -----------------------------------------------------------------------

/** `get_profile(p_target)`. `thesis.visibility` n'est renvoyé que pour soi. */
export interface ProfileView {
  id: string;
  is_self: boolean;
  display_name: string | null;
  age: number | null;
  city: string | null;
  bio: string | null;
  distance_km: number | null;
  level: number | null;
  study_field: StudyField | null;
  field_verified: boolean;
  institution: string | null;
  quiz_badge: boolean;
  thesis: { line: string; visibility?: ThesisVisibility } | null;
  photos: { id: string; path: string; position: number }[];
  /** `id` : cible d'un signalement précis (`report_user`, `p_content_item`). */
  answers: { id: string; position: number; prompt_key: string; answer: string }[];
  books: { id: string; position: number; title: string; author: string | null }[];
  affinity: Affinity | null;
  match_id: string | null;
  my_swipe: "like" | "pass" | null;
}

/** `get_discovery_prefs()` et retour de `set_discovery_prefs(...)` : valeurs effectives. */
export interface DiscoveryPrefs {
  max_distance_km: number;
  default_distance_km: number;
  age_min: number;
  age_max: number;
  levels: number[];
  strict_levels: boolean;
  fields: StudyField[];
  strict_fields: boolean;
  sort: DiscoverySort;
  /** Faux tant que le membre n'a rien enregistré. */
  saved: boolean;
}

/**
 * `count_discovery(...)`. `matching` = 0 et `total` > 0 : critères trop stricts (proposer
 * « Élargir ») ; `total` = 0 : plus personne pour l'instant.
 */
export interface DiscoveryCounts {
  matching: number;
  total: number;
}

/** Élément de `get_my_state().notices` (avis non lus). */
export interface MemberNotice {
  id: string;
  kind: "content_removed";
  payload: {
    content_kind: ContentKind;
    item_id: string | null;
    prompt_key: string | null;
    excerpt: string;
    reason: string;
  };
  created_at: string;
}

/** `get_my_state().intellect`. */
export interface IntellectProgress {
  answers: number;
  books: number;
  thesis: boolean;
  study_field: StudyField | null;
}

// --- Modération (back-office) -------------------------------------------------------------------

/** Motifs posés par le filtre automatique ; `report:<motif>` vient d'un signalement. */
export const CONTENT_FLAG_REASONS = {
  phone: "Numéro de téléphone",
  email: "Adresse email",
  handle: "Pseudo de réseau social (@)",
  url: "Lien",
  word: "Mot de la liste de modération",
  edited_after_removal: "Texte modifié après un retrait",
} as const;

export function contentFlagReasonLabel(reason: string): string {
  if (reason.startsWith("report:")) return `Signalé : ${reason.slice("report:".length)}`;
  return (CONTENT_FLAG_REASONS as Record<string, string>)[reason] ?? reason;
}

export const MODERATION_DECISIONS = ["keep", "remove"] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

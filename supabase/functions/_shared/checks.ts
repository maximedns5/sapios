// Contrôles automatiques (brief §4.1 étape 4) : ils ne décident rien, ils produisent des signaux.
// Module pur : aucune entrée/sortie, testable sans base ni réseau.
import { levenshtein, normalizeText, tokens } from "./text.ts";
import { type DegreeType, type DiplomaSignal, type Extraction, MODEL_SIGNAL_PREFIX } from "./shared.ts";

// --- Noms -----------------------------------------------------------------------------------

/** Civilités et mentions d'état civil, sans valeur pour la comparaison. */
const NAME_NOISE = new Set([
  "epouse", "ep", "nee", "ne", "veuve", "vve", "dit", "dite", "mr", "mme", "mlle", "monsieur", "madame",
  "mademoiselle", "dr", "docteur", "pr", "professeur",
]);
/** Particules : tolérées en plus ou en moins. */
const PARTICLES = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "van", "von", "der", "den", "di", "da", "del", "dos", "das", "y"]);

function nameTokens(name: string): string[] {
  return tokens(name).filter((t) => !NAME_NOISE.has(t));
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0]; // initiale
  return Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= 1; // coquille d'OCR
}

/**
 * Comparaison souple : accents, casse, ordre des mots, initiales, noms composés (avec ou sans
 * trait d'union, accolés), particules, nom d'usage en plus ou en moins.
 */
export function namesMatch(legalName: string, extractedName: string): boolean {
  const a = nameTokens(legalName);
  const b = nameTokens(extractedName);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join("") === b.join("") || [...a].sort().join("") === [...b].sort().join("")) return true;

  const coreA = a.filter((t) => !PARTICLES.has(t));
  const coreB = b.filter((t) => !PARTICLES.has(t));
  const [short, long] = coreA.length <= coreB.length ? [coreA, coreB] : [coreB, coreA];
  if (short.length === 0) return false;
  // Un seul mot face à un nom complet ne suffit pas à identifier la personne.
  if (short.length === 1 && long.length > 1) return false;

  const used = new Set<number>();
  let fullWords = 0;
  for (const t of short) {
    const idx = long.findIndex((u, i) => !used.has(i) && tokenMatch(t, u));
    if (idx < 0) return false;
    used.add(idx);
    if (t.length > 1 && long[idx].length > 1) fullWords++;
  }
  return fullWords >= 1;
}

// --- Doublon du triplet (titulaire, établissement, année) ------------------------------------

const INSTITUTION_NOISE = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "et", "en", "the", "of", "and"]);

export function tripletKey(
  holder: string | null | undefined,
  institution: string | null | undefined,
  year: number | null | undefined,
): string | null {
  if (!holder || !institution || year == null) return null;
  const h = nameTokens(holder).filter((t) => !PARTICLES.has(t)).sort().join(" ");
  const i = tokens(institution).filter((t) => !INSTITUTION_NOISE.has(t)).join(" ");
  if (h === "" || i === "") return null;
  return `${h}|${i}|${year}`;
}

// --- Année / âge ----------------------------------------------------------------------------

/** Âge minimal vraisemblable à l'obtention (au-dessous, l'année est suspecte). */
const MIN_AGE_AT_AWARD: Record<DegreeType, number> = {
  bac: 15,
  bac_plus_2: 17,
  licence: 18,
  master: 20,
  ingenieur: 20,
  ecole_commerce: 20,
  doctorat: 23,
  autre: 12,
};
const MAX_AGE_AT_AWARD = 90;

export function checkYear(
  year: number | null,
  degreeType: DegreeType,
  birthdate: string | null,
  now: Date,
): "year_missing" | "year_implausible" | null {
  if (year == null) return "year_missing";
  if (year > now.getUTCFullYear()) return "year_implausible";
  if (!birthdate) return null;
  const birthYear = Number.parseInt(birthdate.slice(0, 4), 10);
  if (!Number.isFinite(birthYear)) return null;
  const age = year - birthYear;
  if (age < MIN_AGE_AT_AWARD[degreeType] || age > MAX_AGE_AT_AWARD) return "year_implausible";
  return null;
}

// --- Injection de consignes -----------------------------------------------------------------

// Appliqués au texte normalisé (minuscules, sans accents, ponctuation → espaces).
const INJECTION_PATTERNS: RegExp[] = [
  /\bignor(e|es|ez|er|ing)\b/,
  /\b(disregard|override|jailbreak|bypass)\b/,
  /\bvalid(e|ez|er|ate)\s+(moi|nous|me|it|this|mon|ma|mes|ce diplome|ce document|ce dossier|ce titre|cette candidature)\b/,
  /\bvalidez\b/,
  /\bapprouv(e|ez|er)\s+(moi|nous|mon|ma|ce diplome|ce document|ce dossier|cette candidature)\b/,
  /\bapprove\b/,
  /\b(accept|accepte|acceptez)\s+(moi|me|this|ce diplome)\b/,
  /\b(attribue|attribuez|donne|donnez|accorde|accordez|mets|mettez|give|grant|assign)\s+(moi|me|nous|us)\b/,
  /\b(tes|vos|les|ces|toutes|your|previous|all|prior)\s+(consignes|instructions)\b/,
  /\b(consignes|instructions)\s+(precedentes|anterieures|systeme|previous|above)\b/,
  /\b(system\s+)?prompt\b/,
  /\b(tu es|vous etes|you are)\s+(un|une|a|an|the)?\s*(ia|ai|assistant|modele|model|llm|chatbot)\b/,
  /\b(en tant qu|as an?)\s+(ia|ai|assistant|modele|model|llm)\b/,
  /\b(chatgpt|openai|anthropic|llm)\b/,
  /\b(niveau|level)\s+(maximum|maximal|max)\b/,
];

function extractionTexts(ex: Extraction): string[] {
  return [
    ex.holder_full_name,
    ex.institution,
    ex.country,
    ex.degree_title,
    ex.field_of_study,
    ex.honors,
    ...ex.fraud_signals,
  ].filter((s): s is string => typeof s === "string" && s.trim() !== "");
}

/** Vrai si le texte extrait contient des formulations d'instruction (« ignore », « valide-moi », « approve »…). */
export function detectInjection(ex: Extraction): boolean {
  return extractionTexts(ex).some((text) => {
    const n = normalizeText(text);
    return INJECTION_PATTERNS.some((re) => re.test(n));
  });
}

// --- Assemblage -----------------------------------------------------------------------------

export const LOW_CONFIDENCE_THRESHOLD = 0.5;
const MAX_MODEL_SIGNALS = 10;
const MAX_MODEL_SIGNAL_LENGTH = 200;

export interface CheckInput {
  extraction: Extraction;
  legalName: string | null;
  /** `YYYY-MM-DD` */
  birthdate: string | null;
  /** `tripletKey` des soumissions d'autres comptes. */
  otherTriplets: Iterable<string>;
  now: Date;
}

export function computeSignals(input: CheckInput): string[] {
  const ex = input.extraction;
  const out = new Set<string>();
  const add = (s: DiplomaSignal) => out.add(s);

  if (!ex.is_diploma) add("not_a_diploma");
  if (ex.confidence < LOW_CONFIDENCE_THRESHOLD) add("low_confidence");
  if (ex.level_estimate == null) add("level_unknown");

  if (!input.legalName || !input.birthdate) add("identity_missing");
  if (!ex.holder_full_name || ex.holder_full_name.trim() === "") add("name_missing");
  else if (input.legalName && !namesMatch(input.legalName, ex.holder_full_name)) add("name_mismatch");

  const year = checkYear(ex.year_awarded, ex.degree_type, input.birthdate, input.now);
  if (year) add(year);

  const key = tripletKey(ex.holder_full_name, ex.institution, ex.year_awarded);
  if (key && new Set(input.otherTriplets).has(key)) add("duplicate_triplet");

  if (detectInjection(ex)) add("injection_suspected");

  for (const raw of ex.fraud_signals.slice(0, MAX_MODEL_SIGNALS)) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_MODEL_SIGNAL_LENGTH);
    if (text) out.add(`${MODEL_SIGNAL_PREFIX}${text}`);
  }
  return [...out];
}

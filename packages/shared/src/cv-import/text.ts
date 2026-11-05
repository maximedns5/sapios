// Lignes de CV : nettoyage, rubriques, données personnelles à écarter.

import type { CvIgnoredCategory, CvLine } from "./types";
import { normalizeSkillText } from "./skills";

export type SectionKind = "experience" | "education" | "skills" | "languages" | "summary" | "ignored" | "other";

/** Titres de rubrique (normalisés, sans ponctuation finale). */
const HEADINGS: [SectionKind, string[]][] = [
  ["experience", [
    "experience", "experiences", "experience professionnelle", "experiences professionnelles", "parcours professionnel",
    "parcours", "emplois", "postes occupes", "historique professionnel", "carriere", "stages", "stages et emplois",
    "experiences et stages", "stages et experiences", "alternance", "experience en alternance",
    "professional experience", "work experience", "experience professional", "employment", "employment history",
    "work history", "career history", "career", "internships", "relevant experience",
  ]],
  ["education", [
    "formation", "formations", "etudes", "diplomes", "diplomes et formations", "formation academique", "cursus",
    "parcours academique", "parcours scolaire", "scolarite", "education", "academic background", "qualifications",
    "education and training", "formation et diplomes", "enseignement",
  ]],
  ["skills", [
    "competences", "competence", "competences techniques", "competences cles", "competences professionnelles",
    "savoir-faire", "savoir faire", "outils", "outils maitrises", "logiciels", "informatique", "competences informatiques",
    "outils et technologies", "technologies", "stack technique", "environnement technique", "expertise", "expertises",
    "skills", "technical skills", "core skills", "key skills", "hard skills", "top skills", "principales competences",
    "it skills", "computer skills", "tools", "software", "certifications", "certification", "licences et certifications",
    "licenses certifications", "licenses & certifications",
  ]],
  ["languages", [
    "langues", "langue", "langues etrangeres", "competences linguistiques", "languages", "language skills", "language",
  ]],
  ["summary", [
    "profil", "profil professionnel", "a propos", "a propos de moi", "resume", "summary", "about", "about me", "objectif",
    "objectif professionnel", "presentation", "accroche", "profile", "professional summary", "career objective",
  ]],
  ["ignored", [
    "centres d'interet", "centres d interet", "centre d'interet", "loisirs", "interets", "hobbies", "interests",
    "activites extra-professionnelles", "activites extra professionnelles", "vie associative", "benevolat", "volunteering",
    "volunteer experience", "references", "reference", "coordonnees", "contact", "informations personnelles",
    "personal information", "personal details", "etat civil", "infos", "honors-awards", "honors & awards", "honneurs et recompenses",
    "publications", "projets", "projects", "realisations",
  ]],
];

const HEADING_MAP = new Map<string, SectionKind>();
for (const [kind, list] of HEADINGS) for (const h of list) HEADING_MAP.set(h, kind);

/** Rubrique d'une ligne-titre (« EXPÉRIENCES PROFESSIONNELLES : » → experience), sinon null. */
export function headingKind(line: CvLine): SectionKind | null {
  const raw = line.text.trim();
  if (!raw || raw.length > 48) return null;
  const n = normalizeSkillText(raw).replace(/[:.\-–—•|_*]+$/g, "").replace(/^[\d.)\s\-–—•]+/, "").trim();
  const exact = HEADING_MAP.get(n);
  if (exact) return exact;
  // Titre suivi d'un complément court : « Compétences techniques et outils ».
  const words = n.split(" ");
  if (words.length <= 5) {
    for (let k = Math.min(words.length - 1, 3); k >= 1; k--) {
      const head = words.slice(0, k).join(" ");
      const kind = HEADING_MAP.get(head);
      if (kind && (line.style?.toLowerCase().includes("heading") || line.style?.toLowerCase().includes("titre") || isUpper(raw))) return kind;
    }
  }
  return null;
}

function isUpper(s: string): boolean {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

const BULLET_RE = /^[\s]*([•·▪▫◦●○■□►▸▹➢➤✓✔\-–—*]|\d{1,2}[.)])\s+/u;

/** Retire la puce de tête ; renvoie le texte et si c'était une puce. */
export function stripBullet(text: string): { text: string; bullet: boolean } {
  const m = text.match(BULLET_RE);
  if (!m) return { text: text.trim(), bullet: false };
  return { text: text.slice(m[0].length).trim(), bullet: true };
}

/** Espaces, tabulations et caractères de contrôle normalisés. */
export function cleanText(text: string): string {
  return text
    // deno-lint-ignore no-control-regex -- caractères de contrôle et espaces sans largeur, retirés volontairement
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200d\ufeff]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EMAIL_RE = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[a-z]{2,}/iu;
const PHONE_RE = /(?:\+|00)\s?\d{1,3}[\s.\-]?(?:\(0\)\s?)?\d(?:[\s.\-]?\d){7,11}|\b0[1-9](?:[\s.\-]?\d{2}){4}\b/;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com)\/\S*/i;
const BIRTH_RE = /\b(nee? le|nee? en|date de naissance|naissance|birth ?date|date of birth|dob|born on|born in)\b/;
const AGE_RE = /(^|[^\d])(1[6-9]|[2-6]\d) ?ans\b(?! d['e ]| et| de| dans| chez| au| en)|\bage ?: ?\d{2}\b|\b\d{2} years old\b/;
const ADDRESS_RE = /\b\d{1,4}(?: ?(?:bis|ter))?,? (?:rue|avenue|av\.?|boulevard|bd|place|chemin|allee|impasse|quai|route|cours|square|street|st\.?|road|rd\.?|lane|drive)\b|\b(?:adresse|address)\b|\b\d{5} [a-z][a-z\- ']+$/;
const NATIONALITY_RE = /\b(nationalite|nationality|citoyennete|citizenship)\b/;
const MARITAL_RE = /\b(celibataire|pacsee?|divorcee?|veuf|veuve|situation familiale|etat civil|married|divorced|marital status|\d+ enfants?|sans enfant)\b|^(?:mariee?|single)(?:\s*[,.;]|\s+(?:avec|et)\b|$)/;
const GENDER_RE = /\b(sexe|genre|gender)\s*:|^(homme|femme|male|female|masculin|feminin)$/;
const LICENSE_RE = /\bpermis (?:b|de conduire)\b|\bdriving licen[cs]e\b/;

/**
 * Catégorie personnelle d'une ligne, ou null. Une ligne reconnue est retirée entièrement du texte lu :
 * elle n'alimente ni intitulé, ni description, ni compétence.
 */
export function personalCategories(text: string): CvIgnoredCategory[] {
  const out: CvIgnoredCategory[] = [];
  if (EMAIL_RE.test(text)) out.push("email");
  if (PHONE_RE.test(text)) out.push("phone");
  const n = normalizeSkillText(text);
  if (BIRTH_RE.test(n)) out.push("birth_date");
  if (NATIONALITY_RE.test(n)) out.push("nationality");
  if (MARITAL_RE.test(n)) out.push("marital_status");
  if (GENDER_RE.test(n)) out.push("gender");
  if (AGE_RE.test(n) && n.length < 60) out.push("age");
  if (ADDRESS_RE.test(n) && n.length < 90) out.push("address");
  return out;
}

/** Lien (profil LinkedIn, GitHub, site) : jamais repris. */
export function isUrlLine(text: string): boolean {
  return URL_RE.test(text) && text.replace(URL_RE, "").replace(/[()\s|·•,;-]/g, "").length < 12;
}

/** Permis de conduire : ce n'est pas une compétence du CV ; ignoré sans être signalé. */
export function isLicenseLine(text: string): boolean {
  return LICENSE_RE.test(normalizeSkillText(text));
}

/** Coupe une liste de compétences : virgules, points-virgules, puces, barres, « / » entre mots. */
export function splitList(text: string): string[] {
  return text
    .split(/\s*(?:[,;|•·▪●]|\s\/\s|\s-\s|\s–\s|\t)\s*/u)
    .map((s) => s.replace(/^[\s:–—-]+|[\s:.–—-]+$/g, "").trim())
    .filter(Boolean);
}

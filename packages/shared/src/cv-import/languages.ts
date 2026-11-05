// Langues et niveaux : noms français et anglais, codes ISO 639 (Europass), niveaux CECRL et mots courants.

import type { LanguageLevel } from "../emploi";
import { normalizeSkillText } from "./skills";

/** Libellé français → formes reconnues (noms FR/EN, codes ISO 639-1 et 639-3). */
const LANGS: [string, string[]][] = [
  ["Français", ["francais", "french", "fr", "fra", "fre"]],
  ["Anglais", ["anglais", "english", "en", "eng"]],
  ["Espagnol", ["espagnol", "spanish", "castillan", "es", "spa"]],
  ["Allemand", ["allemand", "german", "deutsch", "de", "deu", "ger"]],
  ["Italien", ["italien", "italian", "it", "ita"]],
  ["Portugais", ["portugais", "portuguese", "pt", "por"]],
  ["Néerlandais", ["neerlandais", "dutch", "flamand", "nl", "nld", "dut"]],
  ["Chinois", ["chinois", "mandarin", "chinese", "cantonais", "cantonese", "zh", "zho", "chi", "cmn"]],
  ["Japonais", ["japonais", "japanese", "ja", "jpn"]],
  ["Coréen", ["coreen", "korean", "ko", "kor"]],
  ["Arabe", ["arabe", "arabic", "ar", "ara"]],
  ["Russe", ["russe", "russian", "ru", "rus"]],
  ["Polonais", ["polonais", "polish", "pl", "pol"]],
  ["Turc", ["turc", "turkish", "tr", "tur"]],
  ["Grec", ["grec", "greek", "el", "ell", "gre"]],
  ["Suédois", ["suedois", "swedish", "sv", "swe"]],
  ["Danois", ["danois", "danish", "da", "dan"]],
  ["Norvégien", ["norvegien", "norwegian", "no", "nor", "nob"]],
  ["Finnois", ["finnois", "finlandais", "finnish", "fi", "fin"]],
  ["Hébreu", ["hebreu", "hebrew", "he", "heb"]],
  ["Hindi", ["hindi", "hi", "hin"]],
  ["Ourdou", ["ourdou", "urdu", "ur", "urd"]],
  ["Bengali", ["bengali", "bn", "ben"]],
  ["Vietnamien", ["vietnamien", "vietnamese", "vi", "vie"]],
  ["Thaï", ["thai", "th", "tha"]],
  ["Indonésien", ["indonesien", "indonesian", "id", "ind"]],
  ["Persan", ["persan", "farsi", "persian", "fa", "fas", "per"]],
  ["Roumain", ["roumain", "romanian", "ro", "ron", "rum"]],
  ["Ukrainien", ["ukrainien", "ukrainian", "uk", "ukr"]],
  ["Tchèque", ["tcheque", "czech", "cs", "ces", "cze"]],
  ["Hongrois", ["hongrois", "hungarian", "hu", "hun"]],
  ["Bulgare", ["bulgare", "bulgarian", "bg", "bul"]],
  ["Croate", ["croate", "croatian", "hr", "hrv"]],
  ["Serbe", ["serbe", "serbian", "sr", "srp"]],
  ["Catalan", ["catalan", "ca", "cat"]],
  ["Basque", ["basque", "euskara", "eu", "eus", "baq"]],
  ["Breton", ["breton", "br", "bre"]],
  ["Corse", ["corse", "corsican", "co", "cos"]],
  ["Occitan", ["occitan", "oc", "oci"]],
  ["Wolof", ["wolof", "wo", "wol"]],
  ["Swahili", ["swahili", "sw", "swa"]],
  ["Berbère", ["berbere", "amazigh", "tamazight", "kabyle", "berber", "ber", "kab", "tzm"]],
  ["Langue des signes française", ["langue des signes francaise", "lsf"]],
  ["Latin", ["latin", "la", "lat"]],
  ["Grec ancien", ["grec ancien", "ancient greek", "grc"]],
];

const NAME_FORMS = new Map<string, string>();
const CODE_FORMS = new Map<string, string>();
for (const [label, forms] of LANGS) {
  for (const f of forms) {
    if (f.length <= 3 && !f.includes(" ")) CODE_FORMS.set(f, label);
    else NAME_FORMS.set(f, label);
  }
}
const NAMES_SORTED = Array.from(NAME_FORMS.keys()).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));

/** Code ISO 639 (Europass) → libellé, ou null. */
export function languageFromCode(code: string): string | null {
  return CODE_FORMS.get(normalizeSkillText(code).split(/[-_]/)[0] ?? "") ?? null;
}

/** Première langue nommée dans le texte (nom en toutes lettres), avec sa position. */
export function findLanguageName(text: string): { label: string; index: number; length: number } | null {
  const hay = normalizeSkillText(text);
  let best: { label: string; index: number; length: number } | null = null;
  for (const form of NAMES_SORTED) {
    const re = new RegExp(`(^|[^\\p{L}])${form}(?=$|[^\\p{L}])`, "u");
    const m = re.exec(hay);
    if (!m) continue;
    const index = m.index + (m[1] ?? "").length;
    if (!best || index < best.index) best = { label: NAME_FORMS.get(form) as string, index, length: form.length };
  }
  return best;
}

const ORDER: LanguageLevel[] = ["a2", "b1", "b2", "c1", "c2"];

/** Niveau CECRL A1 à C2 ramené à l'échelle de l'app (A1 → A2, le plus bas proposé). */
export function cefrToLevel(code: string): LanguageLevel | null {
  const m = code.trim().toLowerCase().match(/^([abc])([12])$/);
  if (!m) return null;
  const c = `${m[1]}${m[2]}`;
  return c === "a1" ? "a2" : (ORDER.includes(c as LanguageLevel) ? (c as LanguageLevel) : null);
}

// Mots de niveau, du plus précis au plus vague. Les mots « natif » et « maternelle » ne ressortent jamais :
// ils donnent seulement C2.
const LEVEL_WORDS: [RegExp, LanguageLevel][] = [
  [/\b(langue maternelle|maternelle|natif|native|natale|mother tongue|native or bilingual|bilingue ou langue natale|bilingue|bilingual)\b/, "c2"],
  [/\b(full professional|capacite professionnelle complete|competence professionnelle complete|courant avance|avance|advanced|excellent|maitrise|expert)\b/, "c1"],
  [/\b(professional working|capacite professionnelle(?! limitee)|competence professionnelle(?! limitee)|courant|fluent|professionnel|operationnel|bon niveau|good command|upper intermediate)\b/, "b2"],
  [/\b(limited working|competence professionnelle limitee|capacite professionnelle limitee|intermediaire|intermediate|conversationnel|conversational|pre-intermediate)\b/, "b1"],
  [/\b(elementary|notions?|debutant|beginner|basique|basic|scolaire|elementaire|connaissances de base|limited)\b/, "a2"],
];

/** Niveau lu dans un texte : code CECRL, score TOEIC/IELTS, ou mot courant. null si rien. */
export function levelFromText(text: string): LanguageLevel | null {
  const hay = normalizeSkillText(text);
  const codes = Array.from(hay.matchAll(/(?:^|[^a-z0-9])([abc][12])(?![a-z0-9])/g)).map((m) => cefrToLevel(m[1] as string)).filter(Boolean) as LanguageLevel[];
  if (codes.length) return codes.reduce((best, c) => (ORDER.indexOf(c) > ORDER.indexOf(best) ? c : best));
  const toeic = hay.match(/\btoeic\D{0,12}(\d{3})\b/);
  if (toeic) {
    const s = Number(toeic[1]);
    if (s >= 945) return "c1";
    if (s >= 785) return "b2";
    if (s >= 550) return "b1";
    return "a2";
  }
  const ielts = hay.match(/\bielts\D{0,12}(\d(?:[.,]\d)?)\b/);
  if (ielts) {
    const s = Number((ielts[1] as string).replace(",", "."));
    if (s >= 8) return "c2";
    if (s >= 7) return "c1";
    if (s >= 5.5) return "b2";
    if (s >= 4) return "b1";
    return "a2";
  }
  for (const [re, level] of LEVEL_WORDS) if (re.test(hay)) return level;
  return null;
}

/** Médiane de niveaux (grille Europass : écouter, lire, parler, écrire) ; valeur basse si nombre pair. */
export function medianLevel(levels: LanguageLevel[]): LanguageLevel | null {
  if (!levels.length) return null;
  const sorted = [...levels].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return sorted[Math.floor((sorted.length - 1) / 2)] as LanguageLevel;
}

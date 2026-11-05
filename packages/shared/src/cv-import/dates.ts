// Dates de CV : mois français et anglais, MM/AAAA, AAAA, plages « 2021 – 2023 », « depuis », « présent ».

import { normalizeForMatch } from "../emploi";

/** Mois (texte normalisé, sans accents ni point final) → numéro. Les abréviations courantes comptent. */
const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};

const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .join("|");

/** Un repère de date : mois facultatif. */
export interface DatePoint {
  year: number;
  month: number | null;
}

/** Plage lue dans une ligne ; `end` null = en cours. */
export interface DateRange {
  start: DatePoint;
  end: DatePoint | null;
  /** Texte exact de la plage dans la ligne d'origine (pour l'en retirer). */
  match: string;
}

const PRESENT = "present|aujourd'hui|aujourd hui|a ce jour|ce jour|maintenant|actuellement|actuel|en cours|now|current|currently|today|to date|ongoing";
// Un point de date : « janv. 2023 », « janvier 2023 », « 01/2023 », « 1.2023 », « 2023-01 », « 2023 ».
const POINT = `(?:(?:${MONTH_ALT})\\.?\\s+(?:de\\s+)?(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])\\s*[/.\\-]\\s*(?:19|20)\\d{2}|(?:19|20)\\d{2}\\s*[/.\\-]\\s*(?:0?[1-9]|1[0-2])(?!\\d)|(?:19|20)\\d{2})`;
const SEP = "\\s*(?:-|–|—|‐|−|→|>|à|au|a|to|until|jusqu'a|jusqu'en|jusqu a)\\s*";
const RANGE_RE = new RegExp(`(?:\\bde(?:puis)?\\s+|\\bfrom\\s+)?(${POINT})${SEP}(${POINT}|${PRESENT})(?![\\p{L}\\p{N}])`, "iu");
const SINCE_RE = new RegExp(`\\b(?:depuis|since|des)\\s+(?:le\\s+)?(${POINT})(?![\\p{L}\\p{N}])`, "iu");

/**
 * Minuscules sans accents, caractère pour caractère : la sortie a la même longueur que l'entrée, ce qui
 * permet de retrouver la plage dans le texte d'origine (accents et majuscules compris).
 */
export function normSameLength(s: string): string {
  let out = "";
  for (const ch of s) {
    let d = ch.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (ch === "’" || ch === "`") d = "'";
    if (d.length !== ch.length) d = ch.length === 1 ? (ch.toLowerCase().length === 1 ? ch.toLowerCase() : "?") : ch;
    out += d;
  }
  return out;
}

function norm(s: string): string {
  return normalizeForMatch(s).replace(/[’`]/g, "'");
}

export function parsePoint(raw: string): DatePoint | null {
  const s = norm(raw).replace(/\bde\s+/, "");
  let m = s.match(new RegExp(`^(${MONTH_ALT})\\.?\\s+((?:19|20)\\d{2})$`));
  if (m) return { year: Number(m[2]), month: MONTHS[m[1] as string] ?? null };
  m = s.match(/^(\d{1,2})\s*[/.\-]\s*((?:19|20)\d{2})$/);
  if (m) {
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? { year: Number(m[2]), month } : null;
  }
  m = s.match(/^((?:19|20)\d{2})\s*[/.\-]\s*(\d{1,2})$/);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
  }
  m = s.match(/^((?:19|20)\d{2})$/);
  if (m) return { year: Number(m[1]), month: null };
  return null;
}

/** Première plage de dates d'une ligne, ou null. `match` est le texte exact de la ligne d'origine. */
export function findRange(line: string): DateRange | null {
  const s = normSameLength(line);
  const r = RANGE_RE.exec(s);
  if (r && r[1] && r[2]) {
    const start = parsePoint(r[1]);
    if (start) {
      const endRaw = r[2];
      const isPresent = new RegExp(`^(?:${PRESENT})$`, "i").test(endRaw.trim());
      const end = isPresent ? null : parsePoint(endRaw);
      if (isPresent || end) return { start, end, match: line.slice(r.index, r.index + r[0].length) };
    }
  }
  const since = SINCE_RE.exec(s);
  if (since && since[1]) {
    const start = parsePoint(since[1]);
    if (start) return { start, end: null, match: line.slice(since.index, since.index + since[0].length) };
  }
  return null;
}

/** Ligne faite uniquement de dates (et d'une durée entre parenthèses ou d'un lieu après un séparateur). */
export function isDateOnlyLine(line: string): boolean {
  const range = findRange(line);
  if (!range) return false;
  const rest = norm(line.replace(range.match, " "))
    .replace(/\([^)]*\)/g, " ")
    .replace(/[|·•,;:\-–—]/g, " ")
    .trim();
  return rest.length === 0 || /^\d+\s*(ans?|mois|years?|months?|yrs?|mos?)\b/.test(rest);
}

/** Durée seule à la LinkedIn : « 3 ans 2 mois », « 1 year 4 months », « 11 mois ». */
export function isDurationLine(line: string): boolean {
  const s = norm(line).replace(/[()]/g, "").trim();
  return /^(\d+\s*(ans?|annees?|years?|yrs?)\s*)?(\d+\s*(mois|months?|mos?))?$/.test(s) && /\d/.test(s);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Plage → mois AAAA-MM-01 ; une année seule devient janvier (début) ou décembre (fin), marquée approximative. */
export function rangeToMonths(range: DateRange): { start_month: string; end_month: string | null; approximate: boolean } {
  const approximate = range.start.month == null || (range.end != null && range.end.month == null);
  const start_month = `${range.start.year}-${pad(range.start.month ?? 1)}-01`;
  const end_month = range.end ? `${range.end.year}-${pad(range.end.month ?? 12)}-01` : null;
  return { start_month, end_month, approximate };
}

/** Index de mois (année × 12 + mois - 1) d'une date AAAA-MM-JJ. */
export function monthIndex(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  return y * 12 + (m - 1);
}

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(5, 7)) >= 1 && Number(s.slice(5, 7)) <= 12;
}

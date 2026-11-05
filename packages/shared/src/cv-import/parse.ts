// Lecture d'un CV en lignes (PDF ou DOCX) : formats LinkedIn et générique. Règles fixes, aucune IA.

import { findRange, isDateOnlyLine, isDurationLine, rangeToMonths } from "./dates";
import { findLanguageName, levelFromText } from "./languages";
import { exactSkill, findSkills, normalizeSkillText } from "./skills";
import { cleanText, headingKind, isLicenseLine, isUrlLine, personalCategories, splitList, stripBullet, type SectionKind } from "./text";
import type {
  CvIgnoredCategory,
  CvImportFormat,
  CvImportWarning,
  CvLine,
  EducationHint,
  ImportedExperience,
  ImportedLanguage,
  ImportedSkill,
} from "./types";
import { companyScore, isDegreeLine, isLocationLine, isSchoolLine, jobScore, looksLikeName, stripLocation } from "./words";

/** Ligne prête à lire : texte nettoyé, puce retirée. */
export interface Line {
  text: string;
  size?: number;
  bold?: boolean;
  bullet: boolean;
  style?: string;
  columnBreak?: boolean;
}

interface Section {
  kind: SectionKind | "header";
  title: string | null;
  lines: Line[];
}

export interface PartialResult {
  format: CvImportFormat;
  target_role: string | null;
  experiences: ImportedExperience[];
  skills: ImportedSkill[];
  languages: ImportedLanguage[];
  education_hints: EducationHint[];
  warnings: CvImportWarning[];
  ignored: CvIgnoredCategory[];
}

const SUMMARY_MAX = 300;
const TITLE_MAX = 80;
const EMPLOYER_MAX = 80;

/** Étape 1 : nettoyage, retrait des données personnelles et des liens. */
export function prepare(raw: CvLine[]): { lines: Line[]; ignored: Set<CvIgnoredCategory>; rawText: string } {
  const ignored = new Set<CvIgnoredCategory>();
  const lines: Line[] = [];
  const rawParts: string[] = [];
  for (const r of raw) {
    const cleaned = cleanText(r.text);
    if (!cleaned) continue;
    rawParts.push(cleaned);
    // Une rangée « a | b | c » se lit morceau par morceau : un email n'emporte pas le titre voisin.
    const pieces = cleaned.includes(" | ") ? cleaned.split(" | ") : [cleaned];
    const kept: string[] = [];
    for (const piece of pieces) {
      const cats = personalCategories(piece);
      if (cats.length) {
        for (const c of cats) ignored.add(c);
        continue;
      }
      if (isUrlLine(piece) || isLicenseLine(piece) || /^(page \d+( (of|sur|\/) \d+)?|\d+ ?\/ ?\d+)$/i.test(piece.trim())) continue;
      kept.push(piece);
    }
    if (!kept.length) continue;
    const joined = kept.join(" | ");
    const { text, bullet } = stripBullet(joined);
    if (!text) continue;
    lines.push({ text, size: r.size, bold: r.bold, bullet: bullet || !!r.bullet, style: r.style, ...(r.columnBreak ? { columnBreak: true } : {}) });
  }
  return { lines, ignored, rawText: rawParts.join("\n") };
}

/** Étape 2 : découpage en rubriques. */
export function sectionize(lines: Line[]): Section[] {
  const sections: Section[] = [{ kind: "header", title: null, lines: [] }];
  for (const l of lines) {
    // Nouvelle colonne : la rubrique de la colonne précédente s'arrête (barre latérale puis colonne principale).
    if (l.columnBreak) sections.push({ kind: "header", title: null, lines: [] });
    const kind = l.bullet ? null : headingKind({ text: l.text, style: l.style });
    if (kind) sections.push({ kind, title: l.text, lines: [] });
    else (sections[sections.length - 1] as Section).lines.push(l);
  }
  return sections;
}

function truncate(s: string, max: number): { text: string; cut: boolean } {
  const t = s.trim();
  if (t.length <= max) return { text: t, cut: false };
  const slice = t.slice(0, max - 1);
  const at = slice.lastIndexOf(" ");
  return { text: `${(at > max * 0.6 ? slice.slice(0, at) : slice).replace(/[\s,;:·–-]+$/, "")}…`, cut: true };
}

/** Description : puces jointes par « · », 300 caractères au plus. */
function summaryOf(lines: Line[], warnings: Set<CvImportWarning>): string | null {
  const parts = lines.map((l) => l.text.replace(/\s*\|\s*/g, " ").trim()).filter((t) => t && !isLocationLine(t) && !isDurationLine(t));
  if (!parts.length) return null;
  const joined = parts.map((p) => p.replace(/[.;]+$/, "")).join(" · ");
  const { text, cut } = truncate(joined, SUMMARY_MAX);
  if (cut) warnings.add("summary_truncated");
  return text;
}

const SPLIT_RE = /\s+(?:—|–|-|\||@|·)\s+|\s*,\s+|\s+(?:chez|at|pour|for)\s+/i;

/** « Data Analyst – Carrefour », « Carrefour | Data Analyst » → intitulé et employeur. */
function splitHead(text: string, defaultTitleFirst = true): { title: string; employer: string } {
  const parts = text
    .split(SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p && !isLocationLine(p) && !isDateOnlyLine(p));
  if (parts.length === 0) return { title: "", employer: "" };
  if (parts.length === 1) {
    const only = parts[0] as string;
    return jobScore(only) > 0 || defaultTitleFirst ? { title: only, employer: "" } : { title: "", employer: only };
  }
  // Le morceau le plus « poste » devient l'intitulé ; le reste, l'employeur.
  let titleIdx = defaultTitleFirst ? 0 : 1;
  let best = -1;
  parts.forEach((p, i) => {
    const score = jobScore(p) * 2 - companyScore(p);
    if (score > best) {
      best = score;
      titleIdx = i;
    }
  });
  if (best <= 0) titleIdx = defaultTitleFirst ? 0 : Math.min(1, parts.length - 1);
  const title = parts[titleIdx] as string;
  const employer = parts.filter((_, i) => i !== titleIdx).slice(0, 1).join(", ");
  return { title, employer };
}

function finishExperience(
  title: string,
  employer: string,
  months: { start_month: string; end_month: string | null; approximate: boolean },
  desc: Line[],
  warnings: Set<CvImportWarning>,
): ImportedExperience {
  const t = truncate(stripLocation(title).replace(/[|,;:–-]+$/, "").trim(), TITLE_MAX).text;
  const e = truncate(stripLocation(employer).replace(/[|,;:–-]+$/, "").trim(), EMPLOYER_MAX).text;
  if (!e) warnings.add("experience_without_employer");
  if (!t) warnings.add("experience_without_title");
  if (months.approximate) warnings.add("approximate_dates");
  return { title: t, employer: e, ...months, summary: summaryOf(desc, warnings), approximate: months.approximate };
}

function isHeadCandidate(l: Line): boolean {
  if (l.bullet) return false;
  const t = l.text;
  if (t.length > 90 || isLocationLine(t) || isDurationLine(t)) return false;
  if (/[.!?]$/.test(t) && t.split(/\s+/).length > 6) return false;
  return t.split(/\s+/).length <= 12;
}

/** Expériences d'un CV générique : une plage de dates par expérience, intitulé et employeur autour. */
function genericExperiences(lines: Line[], warnings: Set<CvImportWarning>): ImportedExperience[] {
  const anchors: { i: number; rest: string }[] = [];
  lines.forEach((l, i) => {
    const r = findRange(l.text);
    if (!r) return;
    const rest = l.text
      .replace(new RegExp(r.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/^[\s|·•,;:–—-]+|[\s|·•,;:–—-]+$/g, "")
      .trim();
    // Une plage citée au milieu d'une phrase de description n'ouvre pas une expérience.
    if (l.bullet && rest.split(/\s+/).length > 8) return;
    anchors.push({ i, rest: normalizeRest(l.text, r.match, rest) });
  });
  if (!anchors.length) return [];

  // Sens du document : intitulé avant la date (le plus courant) ou après.
  let before = 0;
  let after = 0;
  anchors.forEach((a, k) => {
    if (a.rest) return;
    const prevLimit = k > 0 ? (anchors[k - 1] as { i: number }).i : -1;
    const p = lines[a.i - 1];
    const n = lines[a.i + 1];
    if (a.i - 1 > prevLimit && p && isHeadCandidate(p)) before++;
    if (n && isHeadCandidate(n) && !findRange(n.text)) after++;
  });
  const titleBefore = before >= after;

  const out: ImportedExperience[] = [];
  anchors.forEach((a, k) => {
    const prev = anchors[k - 1];
    const next = anchors[k + 1];
    const months = rangeToMonths(findRange((lines[a.i] as Line).text) as NonNullable<ReturnType<typeof findRange>>);
    const heads: string[] = [];
    if (a.rest) heads.push(a.rest);
    let descFrom = a.i + 1;
    let descTo = next ? next.i : lines.length;
    if (!a.rest || heads.join(" ").split(SPLIT_RE).length < 2) {
      if (titleBefore) {
        const floor = prev ? prev.i + 1 : 0;
        const take: string[] = [];
        for (let j = a.i - 1; j >= floor && take.length < 2; j--) {
          const l = lines[j] as Line;
          if (!isHeadCandidate(l) || findRange(l.text)) break;
          take.unshift(l.text);
        }
        if (!a.rest) heads.push(...take);
        else if (take.length) heads.unshift(take[take.length - 1] as string);
      } else if (!a.rest) {
        let j = a.i + 1;
        while (j < descTo && heads.length < 2) {
          const l = lines[j] as Line;
          if (!isHeadCandidate(l) || findRange(l.text)) break;
          heads.push(l.text);
          j++;
        }
        descFrom = j;
      }
    }
    // Avec l'intitulé avant la date, la description s'arrête là où commencent les lignes de tête suivantes.
    if (titleBefore && next && !next.rest) {
      let j = next.i - 1;
      let taken = 0;
      while (j >= descFrom && taken < 2 && isHeadCandidate(lines[j] as Line) && !findRange((lines[j] as Line).text)) {
        j--;
        taken++;
      }
      descTo = j + 1;
    } else if (titleBefore && next && next.rest) {
      // L'intitulé suivant est sur la ligne de date : seule une ligne isolée juste avant peut lui appartenir.
      descTo = next.i;
    }
    let title = "";
    let employer = "";
    if (heads.length >= 2) {
      const [h1, h2] = heads as [string, string];
      const s1 = splitHead(h1);
      if (s1.title && s1.employer) {
        title = s1.title;
        employer = s1.employer;
      } else {
        const j1 = jobScore(h1) * 2 - companyScore(h1);
        const j2 = jobScore(h2) * 2 - companyScore(h2);
        if (j2 > j1) {
          title = h2;
          employer = h1;
        } else {
          title = h1;
          employer = h2;
        }
      }
    } else if (heads.length === 1) {
      const s = splitHead(heads[0] as string);
      title = s.title;
      employer = s.employer;
    }
    const desc = lines.slice(descFrom, descTo).filter((l) => !isLocationLine(l.text));
    out.push(finishExperience(title, employer, months, desc, warnings));
  });
  return out;
}

function normalizeRest(_line: string, _match: string, rest: string): string {
  return rest.replace(/^(de|du|from|depuis|since)\s+$/i, "").trim();
}

/** Expériences d'un export LinkedIn : entreprise, [durée totale], intitulé, dates, [lieu], description. */
function linkedinExperiences(lines: Line[], warnings: Set<CvImportWarning>): ImportedExperience[] {
  const anchors: number[] = [];
  lines.forEach((l, i) => {
    if (isDateOnlyLine(l.text)) anchors.push(i);
  });
  const out: ImportedExperience[] = [];
  let currentEmployer = "";
  anchors.forEach((i, k) => {
    const range = findRange((lines[i] as Line).text);
    if (!range) return;
    const prevAnchor = k > 0 ? (anchors[k - 1] as number) : -1;
    const title = (lines[i - 1]?.text ?? "").trim();
    const l2 = lines[i - 2];
    const l3 = lines[i - 3];
    const titleLine = lines[i - 1];
    if (l2 && i - 2 > prevAnchor && isDurationLine(l2.text) && l3) {
      currentEmployer = l3.text;
    } else if (l2 && i - 2 > prevAnchor) {
      const afterPrev = i - 2 === prevAnchor + 1 && isLocationLine(l2.text);
      const bySize = l2.size != null && titleLine?.size != null ? l2.size >= titleLine.size - 0.01 : null;
      const looksDesc = l2.bullet || /[.;:]$/.test(l2.text) || l2.text.length > 60;
      const isCompany = !afterPrev && (k === 0 || (bySize ?? !looksDesc));
      if (isCompany) currentEmployer = l2.text;
    } else if (k === 0) {
      currentEmployer = "";
    }
    // Description : après la date (et le lieu), jusqu'aux lignes de tête du poste suivant.
    let from = i + 1;
    if (lines[from] && isLocationLine((lines[from] as Line).text)) from++;
    let to = k + 1 < anchors.length ? (anchors[k + 1] as number) - 1 : lines.length;
    if (k + 1 < anchors.length) {
      const nextAnchor = anchors[k + 1] as number;
      const n2 = lines[nextAnchor - 2];
      const n3 = lines[nextAnchor - 3];
      if (n2 && isDurationLine(n2.text) && n3) to = nextAnchor - 3;
      else if (n2 && nextAnchor - 2 >= from) {
        const nt = lines[nextAnchor - 1];
        const bySize = n2.size != null && nt?.size != null ? n2.size >= nt.size - 0.01 : null;
        const looksDesc = n2.bullet || /[.;:]$/.test(n2.text) || n2.text.length > 60;
        if (bySize ?? !looksDesc) to = nextAnchor - 2;
      }
    }
    const desc = lines.slice(from, Math.max(from, to));
    out.push(finishExperience(title, currentEmployer, rangeToMonths(range), desc, warnings));
  });
  return out;
}

/** Compétences d'une rubrique « Compétences » : dictionnaire, puis libellés courts écrits tels quels. */
function listedSkills(lines: Line[]): ImportedSkill[] {
  const out: ImportedSkill[] = [];
  const seen = new Set<string>();
  const add = (label: string, source: ImportedSkill["source"]) => {
    const key = normalizeSkillText(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ label, source });
  };
  for (const l of lines) {
    // « Outils : Excel, Power BI » → après les deux-points.
    const body = l.text.includes(":") && l.text.indexOf(":") < 40 ? l.text.slice(l.text.indexOf(":") + 1) : l.text;
    if (findLanguageName(body) && levelFromText(body)) continue;
    for (const token of splitList(body)) {
      const exact = exactSkill(token);
      if (exact) {
        add(exact.label, "dictionary");
        continue;
      }
      // Dans un libellé plus long, seules les formes précises comptent : « Stakeholder management » reste tel quel.
      const inside = findSkills(token, false);
      if (inside.length) {
        for (const s of inside) add(s.label, "dictionary");
        continue;
      }
      const words = token.split(/\s+/).length;
      if (token.length >= 2 && token.length <= 40 && words <= 4 && /\p{L}/u.test(token) && !/[.!?]$/.test(token) && !findLanguageName(token)) {
        add(token.replace(/^\p{Ll}/u, (c) => c.toUpperCase()), "listed");
      }
    }
  }
  return out;
}

/** Langues d'une rubrique « Langues » (ou de lignes « Anglais : C1 » ailleurs). */
function languagesOf(lines: Line[]): ImportedLanguage[] {
  const out: ImportedLanguage[] = [];
  const byLabel = new Map<string, ImportedLanguage>();
  let pending: ImportedLanguage | null = null;
  for (const l of lines) {
    const fragments = l.text.split(/\s*(?:[,;|•·]|\s\/\s)\s*(?=[^)]*(?:\(|$))/u).filter(Boolean);
    for (const frag of fragments) {
      const name = findLanguageName(frag);
      if (name) {
        const rest = normalizeSkillText(frag).slice(0, name.index) + " " + normalizeSkillText(frag).slice(name.index + name.length);
        const level = levelFromText(rest);
        const existing = byLabel.get(name.label);
        if (existing) {
          if (!existing.level && level) existing.level = level;
          pending = existing.level ? null : existing;
        } else {
          const item: ImportedLanguage = { language: name.label, level };
          byLabel.set(name.label, item);
          out.push(item);
          pending = level ? null : item;
        }
      } else if (pending) {
        const level = levelFromText(frag);
        if (level) {
          pending.level = level;
          pending = null;
        }
      }
    }
  }
  return out;
}

function educationHints(lines: Line[]): EducationHint[] {
  const hints: EducationHint[] = [];
  let cur: EducationHint | null = null;
  const flush = () => {
    if (cur && (cur.school || cur.degree)) hints.push(cur);
    cur = null;
  };
  for (const l of lines) {
    const t = l.text.replace(/\s*\|\s*/g, " · ");
    const range = findRange(t);
    const year = range ? null : t.match(/\b(?:19|20)\d{2}\b/);
    const years = range ? range.match.replace(/^(de|depuis|from)\s+/i, "") : year ? year[0] : null;
    const textNoDate = range ? t.replace(new RegExp(range.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/[()·\s,–-]+$/, "").trim() : t;
    const degree = isDegreeLine(textNoDate);
    const school = isSchoolLine(textNoDate);
    if (!degree && !school && !years) continue;
    if (!cur || (degree && cur.degree) || (school && cur.school && !degree)) {
      flush();
      cur = { school: null, degree: null, years: null };
    }
    const c = cur as EducationHint;
    if (degree && !c.degree) c.degree = truncate(textNoDate, 120).text;
    else if (school && !c.school) c.school = truncate(textNoDate, 120).text;
    if (years && !c.years) c.years = years;
  }
  flush();
  return hints.slice(0, 6);
}

/** Poste visé : titre sous le nom (LinkedIn : le « titre » du profil, avant « chez » ou « | »). */
function roleFromHeader(lines: Line[], ignored: Set<CvIgnoredCategory>): string | null {
  if (!lines.length) return null;
  const sizes = lines.map((l) => l.size ?? 0);
  const maxSize = Math.max(...sizes);
  let skip = -1;
  if (maxSize > 0) skip = sizes.indexOf(maxSize);
  else if (lines[0] && looksLikeName((lines[0] as Line).text)) skip = 0;
  if (skip >= 0 && lines[skip] && looksLikeName((lines[skip] as Line).text)) ignored.add("name");
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (i === skip) continue;
    const t = (lines[i] as Line).text;
    if (looksLikeName(t) && i < 2) {
      ignored.add("name");
      continue;
    }
    if (isLocationLine(t) || t.length > 120) continue;
    if (jobScore(t) === 0) continue;
    const head = (t.split(/\s+(?:chez|at|@)\s+|\s+[|–—]\s+|\s+-\s+/i)[0] ?? "").trim();
    if (head.length >= 2) return truncate(head, 80).text;
  }
  return null;
}

/** Export LinkedIn reconnu à ses rubriques propres ou au lien de profil. */
export function isLinkedinExport(rawText: string, sections: Section[]): boolean {
  const titles = new Set(sections.map((s) => normalizeSkillText(s.title ?? "")));
  const hasLinkedinUrl = /linkedin\.com\/in\//i.test(rawText);
  const hasTopSkills = titles.has("principales competences") || titles.has("top skills");
  const hasExperience = sections.some((s) => s.kind === "experience");
  return (hasTopSkills && hasExperience) || (hasLinkedinUrl && hasExperience && (titles.has("resume") || titles.has("summary") || titles.has("languages") || titles.has("langues")));
}

/** Lecture complète d'un CV en lignes. */
export function parseLines(raw: CvLine[]): PartialResult {
  const warnings = new Set<CvImportWarning>();
  const { lines, ignored, rawText } = prepare(raw);
  const sections = sectionize(lines);
  const linkedin = isLinkedinExport(rawText, sections);
  const format: CvImportFormat = linkedin ? "linkedin" : "generic";

  const experiences: ImportedExperience[] = [];
  const skillLines: Line[] = [];
  const languageLines: Line[] = [];
  const educationLines: Line[] = [];
  const freeText: string[] = [];
  for (const s of sections) {
    if (s.kind === "experience") {
      experiences.push(...(linkedin ? linkedinExperiences(s.lines, warnings) : genericExperiences(s.lines, warnings)));
      freeText.push(...s.lines.map((l) => l.text));
    } else if (s.kind === "skills") skillLines.push(...s.lines);
    else if (s.kind === "languages") languageLines.push(...s.lines);
    else if (s.kind === "education") educationLines.push(...s.lines);
    else if (s.kind === "summary" || s.kind === "header") freeText.push(...s.lines.map((l) => l.text));
  }
  if (!sections.some((s) => s.kind === "experience")) {
    warnings.add("no_experience_section");
    // Sans rubrique, on tente les plages de dates du document entier (hors formation).
    const pool = sections.filter((s) => s.kind === "header" || s.kind === "other" || s.kind === "summary").flatMap((s) => s.lines);
    experiences.push(...genericExperiences(pool, warnings));
  }

  // Compétences : rubrique d'abord (ordre du CV), puis dictionnaire dans le texte libre.
  const skills = listedSkills(skillLines);
  const seen = new Set(skills.map((s) => normalizeSkillText(s.label)));
  for (const s of findSkills(freeText.join("\n"), false)) {
    const key = normalizeSkillText(s.label);
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({ label: s.label, source: "dictionary" });
  }
  // Langues citées avec un niveau dans la rubrique compétences.
  const languageCandidates = [...languageLines, ...skillLines.filter((l) => findLanguageName(l.text) && levelFromText(l.text))];
  const languages = languagesOf(languageCandidates);
  if (languages.some((l) => !l.level)) warnings.add("language_without_level");

  // En-têtes (début du document, début de chaque colonne) : celui qui porte la plus grande police d'abord.
  const headers = sections.filter((s) => s.kind === "header" && s.lines.length);
  const maxOf = (s: Section) => Math.max(0, ...s.lines.map((l) => l.size ?? 0));
  headers.sort((a, b) => maxOf(b) - maxOf(a));
  let target_role: string | null = null;
  for (const h of headers) {
    target_role = roleFromHeader(h.lines, ignored);
    if (target_role) break;
  }

  return {
    format,
    target_role,
    experiences,
    skills,
    languages,
    education_hints: educationHints(educationLines),
    warnings: Array.from(warnings),
    ignored: Array.from(ignored),
  };
}

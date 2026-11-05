// Import de CV déterministe : point d'entrée. Aucune IA, aucun réseau, aucune horloge : la date de
// référence est un paramètre. Même fichier et même date : même résultat, au caractère près.

import type { ExperienceBand } from "../emploi";
import { isValidIsoDate, monthIndex } from "./dates";
import { looksLikeEuropass, parseEuropass } from "./europass";
import { parseLines, type PartialResult } from "./parse";
import { CV_IGNORED_CATEGORIES, type CvImportOptions, type CvImportResult, type CvImportSource, type CvImportWarning, type ImportedExperience } from "./types";

export * from "./types";
export { layoutPdf } from "./layout";
export { docxToLines } from "./docx";
export { looksLikeEuropass } from "./europass";
export { SKILL_COUNT } from "./skills";
export { mergeCv, type CvParts } from "./merge";

/** Version des règles : à changer à chaque évolution du lecteur. */
export const CV_IMPORT_RULES_VERSION = "2026-11-05.1";

const WARNING_ORDER: CvImportWarning[] = [
  "no_text",
  "europass_partial",
  "columns_reordered",
  "no_experience_section",
  "experience_without_title",
  "experience_without_employer",
  "approximate_dates",
  "summary_truncated",
  "language_without_level",
  "too_many_skills",
];

/** Mois d'expérience cumulés, périodes qui se chevauchent comptées une fois. */
export function experienceMonths(experiences: Pick<ImportedExperience, "start_month" | "end_month">[], referenceDate: string): number {
  const ref = monthIndex(referenceDate);
  const spans = experiences
    .map((e) => {
      const a = monthIndex(e.start_month);
      const b = e.end_month ? monthIndex(e.end_month) : ref;
      return [Math.min(a, ref), Math.min(b, ref)] as [number, number];
    })
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (!cur) cur = [s[0], s[1]];
    else if (s[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], s[1]);
    else {
      total += cur[1] - cur[0] + 1;
      cur = [s[0], s[1]];
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

export function bandFromMonths(months: number): ExperienceBand {
  if (months < 12) return "y0_1";
  if (months < 36) return "y1_3";
  if (months < 60) return "y3_5";
  return "y5_plus";
}

/** Lit un CV. `referenceDate` (AAAA-MM-JJ) sert pour « présent » et l'expérience cumulée. */
export function parseCv(source: CvImportSource & { columns?: boolean }, options: CvImportOptions): CvImportResult {
  if (!isValidIsoDate(options.referenceDate)) throw new Error("invalid_reference_date");
  let partial: PartialResult;
  const extraWarnings: CvImportWarning[] = [];
  if (source.kind === "europass") {
    partial = parseEuropass(source.xml);
  } else {
    const chars = source.lines.reduce((n, l) => n + l.text.replace(/\s/g, "").length, 0);
    if (chars < 40) {
      return {
        rules_version: CV_IMPORT_RULES_VERSION,
        format: "generic",
        target_role: null,
        experiences: [],
        skills: [],
        languages: [],
        experience_band: null,
        education_hints: [],
        warnings: ["no_text"],
        ignored: source.hasImages ? ["photo"] : [],
      };
    }
    partial = parseLines(source.lines);
    if (source.columns) extraWarnings.push("columns_reordered");
  }
  const warnings = new Set<CvImportWarning>([...partial.warnings, ...extraWarnings]);
  if (partial.skills.length > 10) warnings.add("too_many_skills");
  const ignored = new Set(partial.ignored);
  if (source.hasImages) ignored.add("photo");
  const dated = partial.experiences.filter((e) => e.start_month);
  const months = experienceMonths(dated, options.referenceDate);
  return {
    rules_version: CV_IMPORT_RULES_VERSION,
    format: partial.format,
    target_role: partial.target_role,
    experiences: partial.experiences,
    skills: partial.skills,
    languages: partial.languages,
    experience_band: dated.length ? bandFromMonths(months) : null,
    education_hints: partial.education_hints,
    warnings: WARNING_ORDER.filter((w) => warnings.has(w)),
    ignored: CV_IGNORED_CATEGORIES.filter((c) => ignored.has(c)),
  };
}

/** Choisit la lecture : XML Europass si présent, sinon les lignes. */
export function parseCvFile(
  input: { lines: import("./types").CvLine[]; europassXml?: string | null; hasImages?: boolean; columns?: boolean },
  options: CvImportOptions,
): CvImportResult {
  if (input.europassXml && looksLikeEuropass(input.europassXml)) {
    try {
      return parseCv({ kind: "europass", xml: input.europassXml, hasImages: input.hasImages }, options);
    } catch {
      // XML illisible : on retombe sur le texte du PDF.
    }
  }
  return parseCv({ kind: "lines", lines: input.lines, hasImages: input.hasImages, columns: input.columns }, options);
}

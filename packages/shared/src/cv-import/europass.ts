// Europass : lecture exacte du XML (CV Europass 3.x « SkillsPassport » et Europass 2020 « Candidate »),
// fourni seul ou joint au PDF Europass. Les balises sont lues par nom local, préfixes d'espace de noms ignorés.

import { cefrToLevel, languageFromCode, levelFromText, medianLevel } from "./languages";
import { exactSkill, findSkills, normalizeSkillText } from "./skills";
import type { CvIgnoredCategory, CvImportWarning, EducationHint, ImportedExperience, ImportedLanguage, ImportedSkill } from "./types";
import type { LanguageLevel } from "../emploi";
import { child, childrenNamed, descendants, firstDescendant, parseXml, stripHtml, textOf, type XmlNode } from "./xml";
import type { PartialResult } from "./parse";
import { splitList } from "./text";

const SUMMARY_MAX = 300;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function truncate(s: string, max: number): { text: string; cut: boolean } {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return { text: t, cut: false };
  const slice = t.slice(0, max - 1);
  const at = slice.lastIndexOf(" ");
  return { text: `${(at > max * 0.6 ? slice.slice(0, at) : slice).replace(/[\s,;:·–-]+$/, "")}…`, cut: true };
}

function summaryFrom(html: string, warnings: Set<CvImportWarning>): string | null {
  const parts = stripHtml(html)
    .split(/\n+/)
    .map((p) => p.replace(/^[\s•·\-–]+/, "").replace(/[.;]+\s*$/, "").trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const { text, cut } = truncate(parts.join(" · "), SUMMARY_MAX);
  if (cut) warnings.add("summary_truncated");
  return text;
}

/** `<From year="2019" month="--09"/>` (3.x) → AAAA-MM-01. */
function dateFromAttrs(node: XmlNode | null): { iso: string; approximate: boolean } | null {
  if (!node) return null;
  const year = node.attrs.year;
  if (!year || !/^\d{4}$/.test(year)) return null;
  const m = (node.attrs.month ?? "").match(/(\d{1,2})/);
  const month = m ? Number(m[1]) : null;
  return { iso: `${year}-${pad(month && month >= 1 && month <= 12 ? month : 1)}-01`, approximate: !month };
}

/** `2019-09-01`, `2019-09`, `2019` (2020) → AAAA-MM-01. */
function dateFromText(s: string, end: boolean): { iso: string; approximate: boolean } | null {
  const m = s.trim().match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : null;
  return { iso: `${m[1]}-${pad(month ?? (end ? 12 : 1))}-01`, approximate: !month };
}

function addSkill(out: ImportedSkill[], seen: Set<string>, label: string, source: ImportedSkill["source"]) {
  const key = normalizeSkillText(label);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push({ label, source });
}

function skillsFromText(text: string, out: ImportedSkill[], seen: Set<string>) {
  for (const token of splitList(stripHtml(text).replace(/\n+/g, ", "))) {
    const exact = exactSkill(token);
    if (exact) addSkill(out, seen, exact.label, "dictionary");
    else for (const s of findSkills(token, true)) addSkill(out, seen, s.label, "dictionary");
  }
}

function ignoredOf(root: XmlNode): CvIgnoredCategory[] {
  const out: CvIgnoredCategory[] = [];
  const has = (...locals: string[]) => locals.some((l) => !!firstDescendant(root, l));
  if (has("PersonName", "FirstName", "Surname", "GivenName", "FamilyName")) out.push("name");
  if (has("Email", "ContactEmail") || descendants(root, "ChannelCode").some((c) => /email/i.test(textOf(c)))) out.push("email");
  if (has("Telephone", "TelephoneList") || descendants(root, "ChannelCode").some((c) => /phone|telephone|mobile/i.test(textOf(c)))) out.push("phone");
  if (has("Address", "AddressLine", "PostalCode", "Municipality")) out.push("address");
  if (has("Birthdate", "BirthDate", "DateOfBirth")) out.push("birth_date");
  if (has("Gender", "GenderCode")) out.push("gender");
  if (has("Nationality", "NationalityList", "NationalityCode", "CitizenshipCountry")) out.push("nationality");
  if (has("Photo", "Attachment", "AttachmentReference")) out.push("photo");
  return out;
}

/** Europass 3.x : `SkillsPassport/LearnerInfo`. */
function readV3(root: XmlNode, warnings: Set<CvImportWarning>): Omit<PartialResult, "format" | "ignored"> {
  const learner = firstDescendant(root, "LearnerInfo") ?? root;
  const headline = textOf(child(child(firstDescendant(learner, "Headline"), "Description"), "Label"));
  const experiences: ImportedExperience[] = [];
  for (const we of descendants(learner, "WorkExperience")) {
    const period = child(we, "Period");
    const from = dateFromAttrs(child(period, "From"));
    if (!from) continue;
    const current = /true/i.test(textOf(child(period, "Current")));
    const to = current ? null : dateFromAttrs(child(period, "To"));
    const title = truncate(textOf(child(child(we, "Position"), "Label")), 80).text;
    const employer = truncate(textOf(child(child(we, "Employer"), "Name")), 80).text;
    const approximate = from.approximate || !!to?.approximate;
    if (approximate) warnings.add("approximate_dates");
    if (!employer) warnings.add("experience_without_employer");
    if (!title) warnings.add("experience_without_title");
    experiences.push({
      title,
      employer,
      start_month: from.iso,
      end_month: to ? to.iso : null,
      summary: summaryFrom(rawText(child(we, "Activities")), warnings),
      approximate,
    });
  }
  const languages: ImportedLanguage[] = [];
  const seenLang = new Set<string>();
  for (const mt of descendants(learner, "MotherTongue")) {
    const desc = child(mt, "Description");
    const label = languageFromCode(textOf(child(desc, "Code"))) ?? labelFromName(textOf(child(desc, "Label")));
    if (label && !seenLang.has(label)) {
      seenLang.add(label);
      languages.push({ language: label, level: "c2" });
    }
  }
  for (const fl of descendants(learner, "ForeignLanguage")) {
    const desc = child(fl, "Description");
    const label = languageFromCode(textOf(child(desc, "Code"))) ?? labelFromName(textOf(child(desc, "Label")));
    if (!label || seenLang.has(label)) continue;
    seenLang.add(label);
    const prof = child(fl, "ProficiencyLevel");
    const levels = prof ? (childrenElements(prof).map((c) => cefrToLevel(textOf(c))).filter(Boolean) as LanguageLevel[]) : [];
    languages.push({ language: label, level: medianLevel(levels) });
  }
  const skills: ImportedSkill[] = [];
  const seen = new Set<string>();
  const skillsNode = firstDescendant(learner, "Skills");
  for (const local of ["Computer", "JobRelated", "Organisational", "Other"]) {
    for (const n of skillsNode ? descendants(skillsNode, local) : []) skillsFromText(rawText(child(n, "Description")), skills, seen);
  }
  const education_hints: EducationHint[] = descendants(learner, "Education").slice(0, 6).map((ed) => {
    const period = child(ed, "Period");
    const from = child(period, "From")?.attrs.year ?? null;
    const to = child(period, "To")?.attrs.year ?? null;
    return {
      school: truncate(textOf(child(child(ed, "Organisation"), "Name")), 120).text || null,
      degree: truncate(textOf(child(ed, "Title")), 120).text || null,
      years: from || to ? [from, to].filter(Boolean).join(" – ") : null,
    };
  });
  return { target_role: headline ? truncate(headline, 80).text : null, experiences, skills, languages, education_hints, warnings: [] };
}

/** Europass 2020 : `Candidate/CandidateProfile`. */
function readV2020(root: XmlNode, warnings: Set<CvImportWarning>): Omit<PartialResult, "format" | "ignored"> {
  const profile = firstDescendant(root, "CandidateProfile") ?? root;
  const experiences: ImportedExperience[] = [];
  for (const emp of descendants(profile, "EmployerHistory")) {
    const employer = truncate(textOf(child(emp, "OrganizationName")), 80).text;
    const positions = childrenNamed(emp, "PositionHistory");
    for (const pos of positions.length ? positions : [emp]) {
      const period = firstDescendant(pos, "EmploymentPeriod");
      const start = dateFromText(textOf(firstDescendant(firstDescendant(period, "StartDate"), "FormattedDateTime")) || textOf(firstDescendant(period, "StartDate")), false);
      if (!start) continue;
      const current = /true/i.test(textOf(firstDescendant(period, "CurrentIndicator")));
      const endNode = firstDescendant(period, "EndDate");
      const end = current || !endNode ? null : dateFromText(textOf(firstDescendant(endNode, "FormattedDateTime")) || textOf(endNode), true);
      const title = truncate(textOf(child(pos, "PositionTitle")), 80).text;
      const approximate = start.approximate || !!end?.approximate;
      if (approximate) warnings.add("approximate_dates");
      if (!employer) warnings.add("experience_without_employer");
      if (!title) warnings.add("experience_without_title");
      experiences.push({
        title,
        employer,
        start_month: start.iso,
        end_month: end ? end.iso : null,
        summary: summaryFrom(rawText(child(pos, "Description")), warnings),
        approximate,
      });
    }
  }
  const languages: ImportedLanguage[] = [];
  const skills: ImportedSkill[] = [];
  const seenLang = new Set<string>();
  const seen = new Set<string>();
  for (const comp of descendants(profile, "PersonCompetency")) {
    const taxonomy = textOf(firstDescendant(comp, "TaxonomyID")).toLowerCase();
    const id = textOf(child(comp, "CompetencyID"));
    const name = textOf(child(comp, "CompetencyName"));
    if (taxonomy === "language" || (!taxonomy && languageFromCode(id))) {
      const label = languageFromCode(id) ?? labelFromName(name);
      if (!label || seenLang.has(label)) continue;
      seenLang.add(label);
      const levels: LanguageLevel[] = [];
      for (const n of [...descendants(comp, "ProficiencyLevel"), ...descendants(comp, "Score"), ...descendants(comp, "ScoreText")]) {
        const lv = cefrToLevel(textOf(n));
        if (lv) levels.push(lv);
      }
      const mother = /mother|maternelle|native/i.test(textOf(comp));
      languages.push({ language: label, level: mother ? "c2" : medianLevel(levels) ?? levelFromText(textOf(comp)) });
    } else if (name || id) {
      const text = name || id;
      const exact = exactSkill(text);
      if (exact) addSkill(skills, seen, exact.label, "dictionary");
      else {
        const inside = findSkills(text, true);
        if (inside.length) for (const s of inside) addSkill(skills, seen, s.label, "dictionary");
        else if (text.length <= 40 && text.split(/\s+/).length <= 4) addSkill(skills, seen, text, "listed");
      }
    }
  }
  const education_hints: EducationHint[] = descendants(profile, "EducationOrganizationAttendance").slice(0, 6).map((ed) => {
    const start = textOf(firstDescendant(firstDescendant(ed, "StartDate"), "FormattedDateTime")).slice(0, 4);
    const end = textOf(firstDescendant(firstDescendant(ed, "EndDate"), "FormattedDateTime")).slice(0, 4);
    return {
      school: truncate(textOf(child(ed, "OrganizationName")), 120).text || null,
      degree: truncate(textOf(firstDescendant(ed, "DegreeName")) || textOf(firstDescendant(ed, "ProgramName")), 120).text || null,
      years: start || end ? [start, end].filter(Boolean).join(" – ") : null,
    };
  });
  const headline = textOf(firstDescendant(profile, "Headline")) || textOf(firstDescendant(profile, "PositionTitle"));
  return { target_role: headline ? truncate(headline, 80).text : null, experiences, skills, languages, education_hints, warnings: [] };
}

function childrenElements(n: XmlNode): XmlNode[] {
  return n.children.filter((c): c is XmlNode => typeof c !== "string");
}

/** Texte brut d'un champ riche (HTML échappé dans le XML Europass), retours à la ligne gardés. */
function rawText(n: XmlNode | null): string {
  if (!n) return "";
  const parts: string[] = [];
  const walk = (x: XmlNode) => {
    for (const c of x.children) {
      if (typeof c === "string") parts.push(c);
      else {
        if (/^(p|li|br|div)$/i.test(c.local)) parts.push("\n");
        walk(c);
      }
    }
  };
  walk(n);
  return parts.join("");
}

function labelFromName(name: string): string | null {
  const n = normalizeSkillText(name);
  if (!n) return null;
  return languageFromCode(n) ?? (n.length > 2 ? name.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : null);
}

/** XML Europass → résultat partiel ; erreur `not_europass` si le document n'en est pas un. */
export function parseEuropass(xml: string): PartialResult {
  const warnings = new Set<CvImportWarning>();
  const root = parseXml(xml);
  const top = childrenElements(root)[0];
  if (!top) throw new Error("not_europass");
  let base: Omit<PartialResult, "format" | "ignored">;
  if (top.local === "SkillsPassport" || firstDescendant(root, "LearnerInfo")) base = readV3(root, warnings);
  else if (top.local === "Candidate" || firstDescendant(root, "CandidateProfile")) base = readV2020(root, warnings);
  else throw new Error("not_europass");
  if (!base.experiences.length && !base.skills.length && !base.languages.length) warnings.add("europass_partial");
  if (base.languages.some((l) => !l.level)) warnings.add("language_without_level");
  return { ...base, format: "europass", warnings: Array.from(warnings), ignored: ignoredOf(root) };
}

/** Le texte ressemble-t-il à un XML Europass ? (pièce jointe d'un PDF, fichier .xml) */
export function looksLikeEuropass(xml: string): boolean {
  const head = xml.slice(0, 4000);
  return /<\s*([\w-]+:)?(SkillsPassport|Candidate)\b/.test(head) || /europass/i.test(head);
}

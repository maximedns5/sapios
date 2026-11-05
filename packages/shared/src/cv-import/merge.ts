// Fusion d'un import relu avec le CV existant : ajouter (par défaut) ou remplacer. Règles fixes et
// limites du CV (10 compétences, 6 langues, 10 expériences). Rien n'est enregistré ici.

import { EMPLOI_LIMITS, type CvExperience, type CvLanguage } from "../emploi";
import { normalizeSkillText } from "./skills";

export interface CvParts {
  skills: string[];
  languages: CvLanguage[];
  experiences: CvExperience[];
}

const key = (s: string) => normalizeSkillText(s);
const expKey = (e: Pick<CvExperience, "title" | "employer" | "start_month">) => `${key(e.title)}|${key(e.employer)}|${e.start_month.slice(0, 7)}`;

/**
 * `add` : on garde tout l'existant et on ajoute ce qui manque (sans doublon, dans la limite du CV).
 * `replace` : seules les rubriques où l'import apporte quelque chose sont remplacées.
 */
export function mergeCv(current: CvParts, imported: CvParts, mode: "add" | "replace"): CvParts {
  if (mode === "replace") {
    return {
      skills: imported.skills.length ? dedupeSkills(imported.skills).slice(0, EMPLOI_LIMITS.skillsMax) : current.skills,
      languages: imported.languages.length ? dedupeLanguages(imported.languages).slice(0, EMPLOI_LIMITS.languagesMax) : current.languages,
      experiences: imported.experiences.length ? dedupeExperiences(imported.experiences).slice(0, EMPLOI_LIMITS.experiencesMax) : current.experiences,
    };
  }
  return {
    skills: dedupeSkills([...current.skills, ...imported.skills]).slice(0, Math.max(EMPLOI_LIMITS.skillsMax, current.skills.length)),
    languages: dedupeLanguages([...current.languages, ...imported.languages]).slice(0, Math.max(EMPLOI_LIMITS.languagesMax, current.languages.length)),
    experiences: dedupeExperiences([...current.experiences, ...imported.experiences]).slice(
      0,
      Math.max(EMPLOI_LIMITS.experiencesMax, current.experiences.length),
    ),
  };
}

function dedupeSkills(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = key(s);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Une langue déjà présente garde son niveau : l'import ne l'écrase pas en mode « ajouter ». */
function dedupeLanguages(list: CvLanguage[]): CvLanguage[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    const k = key(l.language);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeExperiences(list: CvExperience[]): CvExperience[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = expKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Tests du lecteur de CV (Deno) : `deno test --unstable-sloppy-imports packages/shared/src/cv-import`.
// Résultats attendus figés (tests « golden »), déterminisme, et données personnelles jamais reprises.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1.0.13";
import { bandFromMonths, docxToLines, experienceMonths, layoutPdf, mergeCv, parseCv, parseCvFile, SKILL_COUNT } from "./index";
import type { CvImportResult } from "./types";
import { findRange } from "./dates";
import { levelFromText } from "./languages";
import { findSkills } from "./skills";
import * as F from "./fixtures";

const OPT = { referenceDate: "2026-11-05" };

/** Vue compacte d'un résultat pour les comparaisons. */
function digest(r: CvImportResult) {
  return {
    format: r.format,
    target_role: r.target_role,
    experiences: r.experiences.map((e) => [e.title, e.employer, e.start_month, e.end_month, e.approximate]),
    skills: r.skills.map((s) => (s.source === "listed" ? `${s.label}*` : s.label)),
    languages: r.languages.map((l) => `${l.language}:${l.level}`),
    experience_band: r.experience_band,
    warnings: r.warnings,
    ignored: r.ignored,
  };
}

/** Rien de personnel dans la sortie : ni email, ni téléphone, ni adresse, ni date de naissance, ni nom. */
function assertNoPersonalData(r: CvImportResult, forbidden: string[]) {
  const json = JSON.stringify(r).toLowerCase();
  for (const f of forbidden) assertFalse(json.includes(f.toLowerCase()), `« ${f} » ne doit pas sortir du lecteur`);
  assertFalse(/natif|native|maternelle/.test(JSON.stringify(r.languages)), "jamais « natif » ni « maternelle »");
}

Deno.test("CV générique français : expériences, compétences, langues, formation", () => {
  const r = parseCv({ kind: "lines", lines: F.GENERIC_FR }, OPT);
  assertEquals(digest(r), {
    format: "generic",
    target_role: "Data analyst junior",
    experiences: [
      ["Data analyst (alternance)", "Groupe Distrib SA", "2024-09-01", "2025-08-01", false],
      ["Stagiaire chargée d'études", "Institut Opinion", "2023-04-01", "2023-07-01", false],
    ],
    skills: ["Python", "SQL", "Power BI", "Excel avancé", "dbt", "Looker Studio", "Statistiques", "Économétrie", "Gestion de projet", "A/B tests"],
    languages: ["Anglais:c1", "Espagnol:b1", "Français:c2"],
    experience_band: "y1_3",
    warnings: [],
    ignored: ["birth_date", "age", "address", "nationality", "marital_status", "email", "phone", "name"],
  });
  assertEquals(r.experiences[0]?.summary, "Construction de tableaux de bord Power BI pour 40 magasins · Automatisation des reportings en Python et SQL");
  assertEquals(r.education_hints, [{ school: "Université Paris-Dauphine", degree: "Master Économétrie et statistique appliquée", years: "2023 – 2025" }]);
  assertNoPersonalData(r, ["camille.laurent@example.org", "06 12 34 56 78", "Roquette", "75011", "2001", "Laurent", "Permis"]);
});

Deno.test("CV générique anglais, date avant l'intitulé, poste en cours", () => {
  const r = parseCv({ kind: "lines", lines: F.GENERIC_EN_DATE_FIRST }, OPT);
  assertEquals(digest(r), {
    format: "generic",
    target_role: "Pricing analyst",
    experiences: [
      ["Pricing Analyst", "Rail Example Ltd", "2022-03-01", null, false],
      ["Business Analyst", "Northwind Consulting", "2019-01-01", "2021-12-01", true],
    ],
    skills: ["SQL", "Python", "Tableau", "Stakeholder management*", "A/B tests", "Recueil des besoins"],
    languages: ["Anglais:c2", "Français:b2"],
    experience_band: "y5_plus",
    warnings: ["approximate_dates"],
    ignored: ["email", "name"],
  });
});

Deno.test("Rangées « poste, employeur, lieu | dates » ; mots courants ignorés hors rubrique", () => {
  const r = parseCv({ kind: "lines", lines: F.GENERIC_ROWS }, OPT);
  assertEquals(digest(r).experiences, [
    ["Head of Data", "Maison Exemple", "2021-01-01", null, false],
    ["Data scientist", "Énergie Exemple", "2017-01-01", "2020-12-01", true],
  ]);
  // « Énergie » (nom d'employeur) et « prévision » (texte libre) ne deviennent pas des compétences.
  assertEquals(digest(r).skills, ["Snowflake", "dbt", "Apache Airflow", "Power BI", "Python", "scikit-learn"]);
});

Deno.test("Export LinkedIn français en deux colonnes (mise en page pdf.js comprise)", () => {
  const layout = layoutPdf(F.LINKEDIN_FR_PAGES);
  assert(layout.columns, "deux colonnes détectées");
  const r = parseCv({ kind: "lines", lines: layout.lines, columns: layout.columns }, OPT);
  assertEquals(digest(r), {
    format: "linkedin",
    target_role: "Data Analyst",
    experiences: [
      ["Data analyst en alternance", "Groupe Distrib", "2024-09-01", "2025-08-01", false],
      ["Chargée d'études junior", "Institut Opinion", "2024-01-01", "2024-08-01", false],
      ["Stagiaire chargée d'études", "Institut Opinion", "2023-04-01", "2023-07-01", false],
    ],
    skills: ["Python", "SQL", "Power BI", "Google Analytics", "Statistiques"],
    languages: ["Anglais:c1", "Espagnol:b1", "Français:c2"],
    experience_band: "y1_3",
    warnings: ["columns_reordered"],
    ignored: ["email", "name"],
  });
  assertEquals(r.experiences[0]?.summary, "Construction de tableaux de bord Power BI pour 40 magasins · Automatisation des reportings en Python");
  assertNoPersonalData(r, ["camille.exemple@example.org", "linkedin.com", "Camille Laurent", "Page 1"]);
});

Deno.test("Export LinkedIn anglais : poste en cours, niveaux LinkedIn", () => {
  const r = parseCv({ kind: "lines", lines: F.LINKEDIN_EN_LINES }, OPT);
  assertEquals(digest(r).experiences, [
    ["Associate", "Example Capital", "2023-09-01", null, false],
    ["Analyst", "Example Bank", "2021-07-01", "2023-08-01", false],
  ]);
  assertEquals(digest(r).languages, ["Anglais:c2", "Allemand:a2"]);
  assertEquals(r.target_role, "Corporate Finance Associate");
  assertEquals(r.format, "linkedin");
});

Deno.test("CV Word : titres stylés, puces, tabulation, tableau date | poste, photo signalée", () => {
  const lines = docxToLines(F.DOCX_DOCUMENT_XML);
  const r = parseCv({ kind: "lines", lines, hasImages: true }, OPT);
  assertEquals(digest(r), {
    format: "generic",
    target_role: "Analyste BI",
    experiences: [
      ["Analyste BI", "Rail & Co", "2022-03-01", null, false],
      ["Assistant contrôleur de gestion", "Atelier Exemple", "2019-01-01", "2022-12-01", true],
    ],
    skills: ["SQL", "BigQuery", "Looker", "Power BI", "Excel", "VBA"],
    languages: ["Anglais:b2", "Italien:a2"],
    experience_band: "y5_plus",
    warnings: ["approximate_dates"],
    ignored: ["photo", "address", "email", "phone", "name"],
  });
  assertNoPersonalData(r, ["nathan.morel@example.net", "07 11 22 33 44", "Fleurs", "69002", "MOREL"]);
});

Deno.test("Europass 3.x : lecture exacte du XML, identité écartée", () => {
  const r = parseCv({ kind: "europass", xml: F.EUROPASS_V3_XML }, OPT);
  assertEquals(digest(r), {
    format: "europass",
    target_role: "Chargée d'études marketing",
    experiences: [
      ["Chargée d'études marketing", "Atelier Lumière", "2023-01-01", null, false],
      ["Assistante marketing", "Cosmétiques Exemple", "2021-06-01", "2022-12-01", false],
    ],
    skills: ["SPSS", "Excel", "Canva", "Google Analytics", "Études de marché", "Emailing"],
    languages: ["Français:c2", "Anglais:c1"],
    experience_band: "y5_plus",
    warnings: [],
    ignored: ["photo", "birth_date", "address", "nationality", "gender", "email", "phone", "name"],
  });
  assertEquals(r.experiences[0]?.summary, "Études de marché et enquêtes clients · Analyse sous SPSS et Excel");
  assertNoPersonalData(r, ["Lucie", "Fabre", "lucie.fabre@example.org", "13001", "1999"]);
});

Deno.test("Europass 2020 (Candidate) : niveaux CECRL par médiane", () => {
  const r = parseCv({ kind: "europass", xml: F.EUROPASS_2020_XML }, OPT);
  assertEquals(digest(r).experiences, [["Data engineer", "Énergie Exemple", "2022-09-01", null, false]]);
  assertEquals(digest(r).languages, ["Anglais:b2"]);
  assertEquals(digest(r).skills, ["Python", "Apache Airflow"]);
  assertEquals(r.education_hints, [{ school: "École Exemple", degree: "Diplôme d'ingénieur", years: "2017 – 2020" }]);
  assertNoPersonalData(r, ["Yanis", "Benali", "yanis@example.org", "1998"]);
});

Deno.test("PDF Europass : la pièce jointe XML l'emporte sur le texte", () => {
  const r = parseCvFile({ lines: [{ text: "texte de mise en page sans intérêt " .repeat(3) }], europassXml: F.EUROPASS_V3_XML }, OPT);
  assertEquals(r.format, "europass");
  assertEquals(r.experiences.length, 2);
});

Deno.test("PDF scanné : aucun texte, message clair", () => {
  const r = parseCv({ kind: "lines", lines: [{ text: " " }, { text: "1" }], hasImages: true }, OPT);
  assertEquals(r.warnings, ["no_text"]);
  assertEquals(r.ignored, ["photo"]);
  assertEquals(r.experiences, []);
});

Deno.test("Déterminisme : deux lectures donnent exactement le même résultat", () => {
  const inputs = [
    () => parseCv({ kind: "lines", lines: F.GENERIC_FR }, OPT),
    () => parseCv({ kind: "lines", lines: layoutPdf(F.LINKEDIN_FR_PAGES).lines }, OPT),
    () => parseCv({ kind: "lines", lines: docxToLines(F.DOCX_DOCUMENT_XML) }, OPT),
    () => parseCv({ kind: "europass", xml: F.EUROPASS_V3_XML }, OPT),
    () => parseCv({ kind: "europass", xml: F.EUROPASS_2020_XML }, OPT),
  ];
  for (const run of inputs) assertEquals(JSON.stringify(run()), JSON.stringify(run()));
  // Ordre des morceaux pdf.js mélangé : même mise en page.
  const page = F.LINKEDIN_FR_PAGES[0]!;
  const shuffled = [{ ...page, items: [...page.items].reverse() }];
  assertEquals(JSON.stringify(layoutPdf(shuffled)), JSON.stringify(layoutPdf(F.LINKEDIN_FR_PAGES)));
});

Deno.test("La date de référence est un paramètre : « présent » ne lit jamais l'horloge", () => {
  const lines = [{ text: "Expérience" }, { text: "Analyste — Exemple SA" }, { text: "Janvier 2026 - présent" }, { text: "Compétences" }, { text: "SQL" }];
  assertEquals(parseCv({ kind: "lines", lines }, { referenceDate: "2026-06-30" }).experience_band, "y0_1");
  assertEquals(parseCv({ kind: "lines", lines }, { referenceDate: "2028-06-30" }).experience_band, "y1_3");
});

Deno.test("Dates : formats français, anglais et numériques", () => {
  const cases: [string, string | null][] = [
    ["janv. 2023 - Présent (1 an 10 mois)", "2023-1→now"],
    ["Sept. 2019 – Juin 2021", "2019-9→2021-6"],
    ["01/2020 - 12/2021", "2020-1→2021-12"],
    ["2018 – 2020", "2018-?→2020-?"],
    ["Depuis mars 2022", "2022-3→now"],
    ["September 2023 - Present", "2023-9→now"],
    ["de février 2021 à août 2022", "2021-2→2022-8"],
    ["Analyse de 2 000 commandes", null],
  ];
  for (const [text, expected] of cases) {
    const r = findRange(text);
    const got = r ? `${r.start.year}-${r.start.month ?? "?"}→${r.end ? `${r.end.year}-${r.end.month ?? "?"}` : "now"}` : null;
    assertEquals(got, expected, text);
  }
});

Deno.test("Niveaux de langue : CECRL, scores, mots courants", () => {
  assertEquals(levelFromText("C1"), "c1");
  assertEquals(levelFromText("A1 en cours"), "a2");
  assertEquals(levelFromText("TOEIC 820"), "b2");
  assertEquals(levelFromText("IELTS 7.5"), "c1");
  assertEquals(levelFromText("courant"), "b2");
  assertEquals(levelFromText("bilingue"), "c2");
  assertEquals(levelFromText("(Limited Working)"), "b1");
  assertEquals(levelFromText("(Elementary)"), "a2");
  assertEquals(levelFromText("Professional Working Proficiency"), "b2");
  assertEquals(levelFromText("Capacité professionnelle limitée"), "b1");
  assertEquals(levelFromText(""), null);
});

Deno.test("Compétences : mots entiers, sigles courts réservés à la rubrique", () => {
  assertEquals(findSkills("Maîtrise de C++ et de C#", true).map((s) => s.label), ["C++", "C#"]);
  assertEquals(findSkills("J'ai fait du R et du Go", false).map((s) => s.label), []);
  assertEquals(findSkills("R, Go", true).map((s) => s.label), ["R", "Go"]);
  assertEquals(findSkills("Microsoft Power BI et ms excel", false).map((s) => s.label), ["Power BI", "Excel"]);
  assertEquals(findSkills("JavaScript", false).map((s) => s.label), ["JavaScript"]);
  assert(SKILL_COUNT >= 400 && SKILL_COUNT <= 800, `dictionnaire de ${SKILL_COUNT} entrées`);
});

Deno.test("Expérience cumulée : chevauchements comptés une fois", () => {
  const m = experienceMonths(
    [
      { start_month: "2020-01-01", end_month: "2020-12-01" },
      { start_month: "2020-06-01", end_month: "2021-05-01" },
      { start_month: "2023-01-01", end_month: null },
    ],
    "2023-12-15",
  );
  assertEquals(m, 17 + 12);
  assertEquals(bandFromMonths(11), "y0_1");
  assertEquals(bandFromMonths(12), "y1_3");
  assertEquals(bandFromMonths(36), "y3_5");
  assertEquals(bandFromMonths(60), "y5_plus");
});

Deno.test("Fusion : ajouter sans doublon ni écrasement, remplacer rubrique par rubrique", () => {
  const exp = (title: string, employer: string, start: string) => ({ title, employer, employer_hidden: false, start_month: start, end_month: null, summary: null });
  const current = {
    skills: ["Python", "Excel"],
    languages: [{ language: "Anglais", level: "b2" as const }],
    experiences: [exp("Data analyst", "Groupe Distrib", "2024-09-01")],
  };
  const imported = {
    skills: ["python", "SQL", "Power BI"],
    languages: [{ language: "anglais", level: "c1" as const }, { language: "Espagnol", level: "b1" as const }],
    experiences: [exp("Data Analyst", "Groupe distrib", "2024-09-01"), exp("Stagiaire", "Institut Opinion", "2023-04-01")],
  };
  const added = mergeCv(current, imported, "add");
  assertEquals(added.skills, ["Python", "Excel", "SQL", "Power BI"]);
  assertEquals(added.languages, [{ language: "Anglais", level: "b2" }, { language: "Espagnol", level: "b1" }]);
  assertEquals(added.experiences.map((e) => e.title), ["Data analyst", "Stagiaire"]);
  const replaced = mergeCv(current, { ...imported, languages: [] }, "replace");
  assertEquals(replaced.skills, ["python", "SQL", "Power BI"]);
  assertEquals(replaced.languages, current.languages);
  const many = mergeCv({ skills: Array.from({ length: 9 }, (_, i) => `S${i}`), languages: [], experiences: [] }, { skills: ["A", "B", "C"], languages: [], experiences: [] }, "add");
  assertEquals(many.skills.length, 10);
});

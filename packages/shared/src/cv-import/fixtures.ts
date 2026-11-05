// CV de test synthétiques (personnes et entreprises fictives) pour les tests du lecteur. Certains contiennent
// volontairement une photo, une date de naissance et une adresse pour prouver qu'elles sont écartées.

import type { CvLine, PdfPage, PdfTextItem } from "./types";

const L = (text: string, extra: Partial<CvLine> = {}): CvLine => ({ text, ...extra });

/** CV générique d'une colonne, tel qu'extrait d'un PDF (tailles de police comprises). */
export const GENERIC_FR: CvLine[] = [
  L("Camille LAURENT", { size: 22 }),
  L("Data analyst junior", { size: 13 }),
  L("12 rue de la Roquette, 75011 Paris"),
  L("camille.laurent@example.org | 06 12 34 56 78"),
  L("Née le 3 mars 2001 — 25 ans"),
  L("Nationalité française"),
  L("Célibataire, sans enfant"),
  L("PROFIL", { size: 13 }),
  L("Analyste data passionnée par les tests A/B et la visualisation avec Power BI."),
  L("EXPÉRIENCES PROFESSIONNELLES", { size: 13 }),
  L("Data analyst (alternance) — Groupe Distrib SA"),
  L("Sept. 2024 – Août 2025"),
  L("• Construction de tableaux de bord Power BI pour 40 magasins"),
  L("• Automatisation des reportings en Python et SQL"),
  L("Stagiaire chargée d'études — Institut Opinion"),
  L("Avril 2023 - Juillet 2023"),
  L("• Analyse statistique d'enquêtes avec R"),
  L("FORMATION", { size: 13 }),
  L("Master Économétrie et statistique appliquée"),
  L("Université Paris-Dauphine · 2023 – 2025"),
  L("COMPÉTENCES", { size: 13 }),
  L("Python, SQL, Power BI, Excel avancé, dbt, Looker Studio"),
  L("Statistiques · Économétrie · Gestion de projet"),
  L("Permis B"),
  L("LANGUES", { size: 13 }),
  L("Anglais : C1 (TOEIC 950)"),
  L("Espagnol : intermédiaire"),
  L("Français : langue maternelle"),
  L("CENTRES D'INTÉRÊT", { size: 13 }),
  L("Course à pied, photographie"),
];

/** CV générique « date d'abord, intitulé ensuite », en anglais, dates numériques et poste en cours. */
export const GENERIC_EN_DATE_FIRST: CvLine[] = [
  L("Alex Martin"),
  L("Pricing analyst"),
  L("alex.martin@example.com"),
  L("Work experience"),
  L("03/2022 - present"),
  L("Pricing Analyst"),
  L("Rail Example Ltd"),
  L("- Built pricing models in Python and Excel"),
  L("- Ran A/B testing on fares with Tableau dashboards"),
  L("2019 - 2021"),
  L("Business Analyst"),
  L("Northwind Consulting"),
  L("- Requirements gathering for retail clients"),
  L("Education"),
  L("MSc Statistics, Example University (2017 - 2019)"),
  L("Skills"),
  L("SQL; Python; Tableau; Stakeholder management"),
  L("Languages"),
  L("English - native, French - B2"),
];

/** Rangées de tableau : « poste | dates » sur une ligne, lieu en suffixe. */
export const GENERIC_ROWS: CvLine[] = [
  L("Inès Moreau"),
  L("Expérience"),
  L("Head of Data, Maison Exemple, Paris | Janvier 2021 - aujourd’hui"),
  L("Pilotage d'une équipe de 6 data analysts ; mise en place de Snowflake et dbt."),
  L("Data scientist chez Énergie Exemple (Lyon) | 2017 – 2020"),
  L("Modèles de prévision de production en Python (scikit-learn)."),
  L("Compétences"),
  L("Outils : Snowflake, dbt, Airflow, Power BI"),
];

const at = (str: string, x: number, y: number, size: number, bold = false): PdfTextItem => ({
  str,
  x,
  y,
  width: str.length * size * 0.48,
  size,
  bold,
});

/** Export LinkedIn « Enregistrer au format PDF » simulé : barre latérale à gauche, colonne principale à droite. */
export const LINKEDIN_FR_PAGES: PdfPage[] = [
  {
    width: 612,
    height: 792,
    items: [
      // Barre latérale
      at("Coordonnées", 30, 757, 13, true),
      at("camille.exemple@example.org", 30, 739, 10),
      at("www.linkedin.com/in/camille-exemple", 30, 725, 10),
      at("(LinkedIn)", 30, 711, 10),
      at("Principales compétences", 30, 683, 13, true),
      at("Python", 30, 665, 10.5),
      at("SQL", 30, 651, 10.5),
      at("Power BI", 30, 637, 10.5),
      at("Languages", 30, 609, 13, true),
      at("Anglais (Full Professional)", 30, 591, 10.5),
      at("Espagnol (Limited Working)", 30, 577, 10.5),
      at("Français (Native or Bilingual)", 30, 563, 10.5),
      at("Certifications", 30, 535, 13, true),
      at("Google Analytics Certification", 30, 517, 10.5),
      // Colonne principale
      at("Camille Laurent", 220, 752, 26, true),
      at("Data Analyst chez Groupe Distrib | Python · SQL · Power BI", 220, 728, 12),
      at("Paris, Île-de-France, France", 220, 712, 10.5),
      at("Résumé", 220, 686, 16, true),
      at("Analyste data, j'aime les chiffres qui servent à décider.", 220, 668, 10.5),
      at("Expérience", 220, 642, 16, true),
      at("Groupe Distrib", 220, 622, 12, true),
      at("Data analyst en alternance", 220, 606, 11.5),
      at("septembre 2024 - août 2025 (1 an)", 220, 592, 10.5),
      at("Paris, Île-de-France, France", 220, 578, 10.5),
      at("Construction de tableaux de bord Power BI pour 40 magasins.", 220, 562, 10.5),
      at("Automatisation des reportings en Python.", 220, 548, 10.5),
      at("Institut Opinion", 220, 522, 12, true),
      at("1 an 4 mois", 220, 508, 10.5),
      at("Chargée d'études junior", 220, 492, 11.5),
      at("janvier 2024 - août 2024 (8 mois)", 220, 478, 10.5),
      at("Stagiaire chargée d'études", 220, 456, 11.5),
      at("avril 2023 - juillet 2023 (4 mois)", 220, 442, 10.5),
      at("Lyon, Auvergne-Rhône-Alpes, France", 220, 428, 10.5),
      at("Analyse statistique d'enquêtes avec R.", 220, 412, 10.5),
      at("Formation", 220, 386, 16, true),
      at("Université Paris-Dauphine", 220, 366, 12, true),
      at("Master, Économétrie · (2023 - 2025)", 220, 350, 10.5),
      at("Page 1 of 1", 520, 30, 9),
    ],
  },
];

/** Export LinkedIn anglais, une colonne déjà lue (sans tailles de police) : poste en cours. */
export const LINKEDIN_EN_LINES: CvLine[] = [
  L("Contact"),
  L("www.linkedin.com/in/alex-example (LinkedIn)"),
  L("Top Skills"),
  L("Financial Modeling"),
  L("Excel"),
  L("Valuation"),
  L("Languages"),
  L("English (Native or Bilingual)"),
  L("German (Elementary)"),
  L("Alex Example", { columnBreak: true }),
  L("Corporate Finance Associate at Example Capital"),
  L("London, England, United Kingdom"),
  L("Summary"),
  L("M&A and LBO modelling."),
  L("Experience"),
  L("Example Capital"),
  L("Associate"),
  L("September 2023 - Present (2 years 3 months)"),
  L("London, England, United Kingdom"),
  L("Financial modelling for mid-market LBO transactions."),
  L("Example Bank"),
  L("Analyst"),
  L("July 2021 - August 2023 (2 years 2 months)"),
  L("Education"),
  L("Example Business School"),
  L("Master's degree, Finance · (2019 - 2021)"),
];

/** `word/document.xml` d'un CV Word : titres stylés, puces, tabulation avant les dates, tableau date | poste. */
export const DOCX_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:sz w:val="44"/></w:rPr><w:t>Nathan MOREL</w:t></w:r></w:p>
<w:p><w:r><w:t>Analyste BI</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">nathan.morel@example.net – 07 11 22 33 44 – 8 avenue des Fleurs, 69002 Lyon</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Photo"/></wp:inline></w:drawing></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Expériences</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Analyste BI – Rail &amp; Co</w:t></w:r><w:r><w:tab/><w:t>Depuis mars 2022</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Tableaux de bord Looker et Power BI pour la direction commerciale.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Modélisation SQL sur BigQuery.</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>2019 – 2022</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Assistant contrôleur de gestion, Atelier Exemple</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Clôtures mensuelles et reporting sous Excel et VBA.</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Formation</w:t></w:r></w:p>
<w:p><w:r><w:t>Licence MIASHS – Université Exemple, 2016 – 2019</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Compétences</w:t></w:r></w:p>
<w:p><w:r><w:t>SQL · BigQuery · Looker · Power BI · Excel · VBA</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Langues</w:t></w:r></w:p>
<w:p><w:r><w:t>Anglais (B2), Italien (notions)</w:t></w:r></w:p>
<w:sectPr/>
</w:body>
</w:document>`;

/** CV Europass 3.x (SkillsPassport), tel qu'il est joint à un PDF Europass. */
export const EUROPASS_V3_XML = `<?xml version="1.0" encoding="UTF-8"?>
<SkillsPassport xmlns="http://europass.cedefop.europa.eu/Europass" locale="fr">
  <DocumentInfo><DocumentType>ECV</DocumentType></DocumentInfo>
  <LearnerInfo>
    <Identification>
      <PersonName><FirstName>Lucie</FirstName><Surname>Fabre</Surname></PersonName>
      <ContactInfo>
        <Address><Contact><AddressLine>3 place Exemple</AddressLine><PostalCode>13001</PostalCode><Municipality>Marseille</Municipality></Contact></Address>
        <Email><Contact>lucie.fabre@example.org</Contact></Email>
        <TelephoneList><Telephone><Contact>+33 6 00 00 00 00</Contact></Telephone></TelephoneList>
      </ContactInfo>
      <Demographics><Birthdate year="1999" month="--05" day="---12"/><Gender><Code>F</Code></Gender><NationalityList><Nationality><Code>FR</Code></Nationality></NationalityList></Demographics>
      <Photo><MimeType>image/jpeg</MimeType><Data>AAAA</Data></Photo>
    </Identification>
    <Headline><Type><Code>job_applied_for</Code></Type><Description><Label>Chargée d'études marketing</Label></Description></Headline>
    <WorkExperienceList>
      <WorkExperience>
        <Period><From year="2023" month="--01"/><Current>true</Current></Period>
        <Position><Label>Chargée d'études marketing</Label></Position>
        <Activities>&lt;p&gt;Études de marché et enquêtes clients&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Analyse sous SPSS et Excel&lt;/li&gt;&lt;/ul&gt;</Activities>
        <Employer><Name>Atelier Lumière</Name></Employer>
      </WorkExperience>
      <WorkExperience>
        <Period><From year="2021" month="--06"/><To year="2022" month="--12"/></Period>
        <Position><Label>Assistante marketing</Label></Position>
        <Employer><Name>Cosmétiques Exemple</Name></Employer>
      </WorkExperience>
    </WorkExperienceList>
    <EducationList>
      <Education>
        <Period><From year="2019"/><To year="2021"/></Period>
        <Title>Master Marketing</Title>
        <Organisation><Name>Université Exemple</Name></Organisation>
      </Education>
    </EducationList>
    <Skills>
      <Linguistic>
        <MotherTongueList><MotherTongue><Description><Code>fr</Code><Label>français</Label></Description></MotherTongue></MotherTongueList>
        <ForeignLanguageList>
          <ForeignLanguage>
            <Description><Code>en</Code><Label>anglais</Label></Description>
            <ProficiencyLevel><Listening>C1</Listening><Reading>C1</Reading><SpokenInteraction>B2</SpokenInteraction><SpokenProduction>B2</SpokenProduction><Writing>C1</Writing></ProficiencyLevel>
          </ForeignLanguage>
        </ForeignLanguageList>
      </Linguistic>
      <Computer><Description>&lt;p&gt;SPSS, Excel, Canva, Google Analytics&lt;/p&gt;</Description></Computer>
      <JobRelated><Description>Études de marché, emailing</Description></JobRelated>
    </Skills>
  </LearnerInfo>
</SkillsPassport>`;

/** CV Europass 2020 (« Candidate », HR Open Standards). */
export const EUROPASS_2020_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Candidate xmlns="http://www.europass.eu/1.0" xmlns:oa="http://www.openapplications.org/oagis/9" xmlns:eures="http://www.europass_eures.eu/1.0" xmlns:hr="http://www.hr-xml.org/3">
  <CandidatePerson>
    <PersonName><oa:GivenName>Yanis</oa:GivenName><hr:FamilyName>Benali</hr:FamilyName></PersonName>
    <Communication><ChannelCode>Email</ChannelCode><oa:URI>yanis@example.org</oa:URI></Communication>
    <NationalityCode>FR</NationalityCode>
    <hr:BirthDate>1998-02-01</hr:BirthDate>
    <GenderCode>male</GenderCode>
  </CandidatePerson>
  <CandidateProfile languageCode="fr">
    <EmploymentHistory>
      <EmployerHistory>
        <hr:OrganizationName>Énergie Exemple</hr:OrganizationName>
        <PositionHistory>
          <PositionTitle typeCode="FREETEXT">Data engineer</PositionTitle>
          <eures:EmploymentPeriod>
            <eures:StartDate><hr:FormattedDateTime>2022-09-01</hr:FormattedDateTime></eures:StartDate>
            <hr:CurrentIndicator>true</hr:CurrentIndicator>
          </eures:EmploymentPeriod>
          <oa:Description>&lt;p&gt;Pipelines Airflow et dbt sur Snowflake.&lt;/p&gt;</oa:Description>
        </PositionHistory>
      </EmployerHistory>
    </EmploymentHistory>
    <EducationHistory>
      <EducationOrganizationAttendance>
        <hr:OrganizationName>École Exemple</hr:OrganizationName>
        <EducationDegree><hr:DegreeName>Diplôme d'ingénieur</hr:DegreeName></EducationDegree>
        <AttendancePeriod><StartDate><hr:FormattedDateTime>2017-09-01</hr:FormattedDateTime></StartDate><EndDate><hr:FormattedDateTime>2020-06-30</hr:FormattedDateTime></EndDate></AttendancePeriod>
      </EducationOrganizationAttendance>
    </EducationHistory>
    <PersonQualifications>
      <PersonCompetency><CompetencyID>eng</CompetencyID><hr:TaxonomyID>language</hr:TaxonomyID><eures:CompetencyDimension><hr:CompetencyDimensionTypeCode>CEF-Understanding-Listening</hr:CompetencyDimensionTypeCode><eures:Score><hr:ScoreText>B2</hr:ScoreText></eures:Score></eures:CompetencyDimension><eures:CompetencyDimension><eures:Score><hr:ScoreText>C1</hr:ScoreText></eures:Score></eures:CompetencyDimension><eures:CompetencyDimension><eures:Score><hr:ScoreText>B2</hr:ScoreText></eures:Score></eures:CompetencyDimension></PersonCompetency>
      <PersonCompetency><CompetencyID>Python</CompetencyID><hr:TaxonomyID>other</hr:TaxonomyID></PersonCompetency>
      <PersonCompetency><CompetencyName>Apache Airflow</CompetencyName><hr:TaxonomyID>DIGITAL</hr:TaxonomyID></PersonCompetency>
    </PersonQualifications>
  </CandidateProfile>
</Candidate>`;

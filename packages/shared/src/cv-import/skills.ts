// Dictionnaire de compétences : « Libellé canonique|alias|alias ». Correspondance par mots entiers, après
// normalisation (minuscules, sans accents). Une forme précédée de « ~ » (mot courant : « production »,
// « word ») et toute forme d'une ou deux lettres (R, C, Go, UX) ne sont reconnues que dans une rubrique
// « Compétences », jamais dans le texte libre des expériences.

const ENTRIES = [
  // Données et statistiques
  "Python", "R|langage r|rstudio|r studio", "SQL|langage sql", "PostgreSQL|postgres", "MySQL", "SQL Server|mssql|microsoft sql server",
  "Oracle Database|oracle db|base oracle", "SQLite", "MongoDB", "Redis", "Elasticsearch", "Snowflake", "BigQuery|google bigquery",
  "Redshift|amazon redshift", "Databricks", "Apache Spark|pyspark|~spark", "Hadoop", "Apache Hive|~hive", "Apache Kafka|kafka",
  "Apache Airflow|airflow", "dbt|data build tool", "Talend", "Informatica", "Alteryx", "KNIME", "Dataiku", "SAS|sas base|sas enterprise guide",
  "SPSS|ibm spss", "Stata", "MATLAB", "Julia|~julia", "Scala", "Pandas", "NumPy", "SciPy", "scikit-learn|sklearn|scikit learn",
  "TensorFlow", "PyTorch", "Keras", "XGBoost", "LightGBM", "Statsmodels", "Jupyter|jupyter notebook",
  "Machine learning|apprentissage automatique|ml", "Deep learning|apprentissage profond",
  "Traitement du langage naturel|nlp|natural language processing", "Vision par ordinateur|computer vision",
  "Statistiques|~statistique|~statistiques|~statistics|analyse statistique|statistical analysis",
  "Économétrie|~econometrie|~econometrics", "Séries temporelles|~series temporelles|time series analysis",
  "Data mining|fouille de donnees", "Data visualisation|data visualization|dataviz|visualisation de donnees",
  "Power BI|powerbi|microsoft power bi", "Tableau|tableau software|~tableau", "Looker", "Looker Studio|google data studio|data studio",
  "Qlik|qlikview|qlik sense", "Metabase", "Apache Superset|superset", "Google Analytics|ga4", "A/B tests|ab testing|a/b testing|tests a/b|test a/b|ab tests",
  "ETL", "Data engineering|ingenierie des donnees", "Qualité des données|data quality|qualite des donnees",
  "Gouvernance des données|data governance|gouvernance des donnees", "Modélisation de données|data modeling|data modelling|modelisation des donnees",
  "Big data", "Recherche opérationnelle|operations research|recherche operationnelle", "Optimisation|~optimisation|~optimization",
  "Prévision|~prevision|~previsions|~forecasting", "Analyse de données|data analysis|analyse des donnees|analyse de donnees",
  "Excel avancé|advanced excel|excel avance", "VBA", "Power Query", "DAX", "Power Automate", "Power Apps|powerapps",
  // Développement et systèmes
  "JavaScript|js", "TypeScript|ts", "Java", "C", "C++|cpp", "C#|csharp|c sharp", ".NET|dotnet|asp.net", "Go|golang", "Rust|~rust",
  "PHP", "Ruby|~ruby", "Ruby on Rails|rails", "Kotlin", "Swift|~swift", "Objective-C", "Dart|~dart", "Flutter", "React|react.js|reactjs|~react",
  "React Native", "Next.js|nextjs", "Vue.js|vuejs|~vue", "Nuxt|nuxt.js", "Angular|~angular", "Svelte", "Node.js|nodejs", "Express.js|~express",
  "NestJS", "Django", "Flask|~flask", "FastAPI", "Spring Boot|~spring", "Symfony", "Laravel", "HTML|html5", "CSS|css3", "Sass|scss",
  "Tailwind CSS|tailwind", "Bootstrap|~bootstrap", "jQuery", "GraphQL", "API REST|rest api|~rest|restful", "SOAP|~soap", "gRPC",
  "WebSocket|websockets", "Git", "GitHub", "GitLab", "Bitbucket", "CI/CD|ci cd|integration continue|continuous integration", "Jenkins",
  "GitHub Actions", "GitLab CI", "Docker", "Kubernetes|k8s", "Terraform", "Ansible", "Helm|~helm", "Linux", "Unix", "Bash|~shell", "PowerShell",
  "Windows Server", "AWS|amazon web services", "Azure|microsoft azure|~azure", "Google Cloud|gcp|google cloud platform", "Firebase", "Supabase",
  "Heroku", "Vercel", "Nginx", "Apache HTTP Server|~apache", "Microservices", "Architecture logicielle|software architecture|~architecture",
  "Tests unitaires|unit testing|tests unitaire", "Jest", "Cypress", "Playwright", "Selenium", "JUnit", "pytest", "TDD", "DevOps", "SRE",
  "Cybersécurité|cybersecurite|cybersecurity|securite informatique", "OWASP", "Tests d’intrusion|pentest|tests d'intrusion|penetration testing",
  "SIEM", "ISO 27001", "RGPD|gdpr", "Active Directory", "Réseaux|~reseaux|~networking|reseaux informatiques", "TCP/IP", "Cisco", "VMware",
  "Virtualisation|~virtualisation|~virtualization", "ITIL", "ServiceNow", "Jira", "Confluence", "Trello", "Asana", "Notion|~notion", "Slack|~slack",
  "Figma", "Sketch|~sketch", "Adobe XD", "Photoshop|adobe photoshop", "Illustrator|adobe illustrator", "InDesign|adobe indesign",
  "Premiere Pro|adobe premiere", "After Effects|adobe after effects", "Lightroom", "Canva", "Blender", "Unity|~unity", "Unreal Engine",
  "UX design|ux|experience utilisateur|user experience", "UI design|ui|interface utilisateur", "UX research|recherche utilisateur|user research",
  "Design thinking", "Prototypage|~prototypage|~prototyping", "Wireframes|wireframing", "Accessibilité numérique|accessibilite numerique|rgaa|wcag|~accessibilite|~accessibility",
  "SEO|referencement naturel", "SEA|~sea|referencement payant", "SEM|~sem", "WordPress", "Shopify", "Webflow", "Drupal", "Magento", "PrestaShop",
  "Salesforce", "HubSpot", "Zoho", "Pipedrive", "Dynamics 365|microsoft dynamics", "SAP", "SAP FI-CO|sap fi co|sap fico|sap fi", "SAP MM", "SAP SD",
  "Oracle E-Business Suite|oracle ebs", "Sage|~sage|sage 100|sage x3", "Cegid", "Odoo", "QuickBooks", "Workday", "Zapier", "Make (Integromat)|integromat|make.com",
  "API|~api|~apis", "JSON", "XML", "YAML", "Postman", "OpenAPI|swagger",
  // Bureautique
  "Excel|microsoft excel|ms excel|~excel", "Word|microsoft word|ms word|~word", "PowerPoint|microsoft powerpoint|ms powerpoint|powerpoint",
  "Outlook|~outlook", "Microsoft Office|ms office|pack office|suite office|office 365|microsoft 365", "Google Workspace|g suite|google suite",
  "Google Sheets|~sheets", "Google Docs", "Access|microsoft access|ms access|~access", "Microsoft Teams|~teams", "SharePoint", "OneNote",
  "Visio|microsoft visio", "MS Project|microsoft project", "LaTeX", "Airtable",
  // Finance, comptabilité, audit
  "Comptabilité|~comptabilite|~accounting", "Comptabilité générale|comptabilite generale|general accounting",
  "Comptabilité analytique|comptabilite analytique|cost accounting", "Contrôle de gestion|controle de gestion|management control",
  "Audit financier|financial audit|~audit", "Audit interne|internal audit", "Consolidation|~consolidation|consolidation des comptes", "IFRS",
  "US GAAP|gaap", "Normes comptables françaises|pcg|plan comptable general", "Fiscalité|~fiscalite|~taxation", "TVA|~vat",
  "Trésorerie|~tresorerie|~treasury|gestion de tresorerie", "Finance d’entreprise|finance d'entreprise|corporate finance",
  "Analyse financière|analyse financiere|financial analysis", "Modélisation financière|modelisation financiere|financial modeling|financial modelling",
  "Valorisation d’entreprise|~valorisation|~valuation|evaluation d'entreprise|valorisation d'entreprise",
  "Fusions-acquisitions|fusions acquisitions|m&a|mergers and acquisitions", "Private equity|capital investissement", "LBO",
  "Gestion de portefeuille|portfolio management", "Gestion des risques|risk management|gestion du risque", "Bâle III|bale iii|basel iii",
  "Solvabilité II|solvabilite ii|solvency ii", "Actuariat|~actuariat|~actuarial", "Analyse crédit|analyse credit|credit analysis|~credit",
  "Conformité|~conformite|~compliance", "LCB-FT|lcb ft|aml|kyc|anti-blanchiment|lutte anti-blanchiment",
  "Contrôle budgétaire|~budget|~budgeting|elaboration budgetaire|controle budgetaire|budgetisation", "Reporting|~reporting|~reportings|reporting financier",
  "Clôture comptable|cloture comptable|~closing|cloture mensuelle", "Paie|~paie|~payroll|gestion de la paie", "Recouvrement|~recouvrement|credit management",
  "Bloomberg", "Refinitiv Eikon|refinitiv|eikon|reuters eikon", "FactSet", "Capital IQ", "Marchés financiers|marches financiers|financial markets",
  "Produits dérivés|produits derives|derivatives", "Gestion d’actifs|asset management|gestion d'actifs", "Banque d’investissement|investment banking|banque d'investissement",
  // Marketing, communication, vente, achats
  "Marketing digital|marketing numerique|digital marketing|webmarketing|web marketing", "Marketing produit|product marketing",
  "Marketing opérationnel|marketing operationnel", "Gestion de marque|brand management", "Études de marché|etudes de marche|market research|etude de marche",
  "Growth marketing|growth hacking", "Emailing|email marketing|e-mailing", "Marketing automation|automatisation marketing",
  "Google Ads|adwords|google adwords", "Meta Ads|facebook ads", "LinkedIn Ads", "Community management|community manager|gestion des reseaux sociaux",
  "Réseaux sociaux|reseaux sociaux|social media|~social media", "Content marketing|marketing de contenu", "Rédaction web|redaction web|copywriting",
  "Relations presse|press relations|relations medias", "Communication interne|internal communication", "Communication corporate|corporate communication",
  "Événementiel|~evenementiel|event management", "CRM", "Prospection commerciale|prospection commerciale|~prospection|~prospecting",
  "Négociation|~negociation|~negotiation|negociation commerciale", "Vente B2B|vente b2b|b2b sales|~vente|~sales", "Vente B2C|vente b2c|b2c sales",
  "Développement commercial|business development|developpement commercial|biz dev", "Grands comptes|key account management|gestion grands comptes|kam",
  "Relation client|gestion de la relation client|customer relationship management|~relation client", "Customer success", "Account management",
  "Avant-vente|avant vente|presales|pre-sales", "Merchandising", "Category management", "E-commerce|ecommerce", "Retail|~retail",
  "Pricing|~pricing|tarification", "Revenue management|yield management", "Trade marketing", "Supply chain|chaine logistique|supply chain management",
  "Logistique|~logistique|~logistics", "Achats|~achats|~procurement|~purchasing|acheteur", "Sourcing|~sourcing|~approvisionnement",
  "Gestion des stocks|inventory management", "Transport|~transport", "Lean management|lean|~lean", "Lean Six Sigma|six sigma", "Kaizen",
  "S&OP|sales and operations planning", "Planification de la demande|demand planning",
  // Gestion de projet et méthodes
  "Gestion de projet|project management|conduite de projet|gestion de projets|management de projet", "Méthodes agiles|agile|methodes agiles|agilite|methodologie agile",
  "Scrum", "Kanban", "SAFe", "PMP", "PRINCE2|prince 2", "Product management|gestion de produit", "Product owner|product ownership",
  "Roadmap produit|~roadmap|product roadmap", "Conduite du changement|change management|gestion du changement",
  "Stratégie d’entreprise|~strategie|~strategy|strategie d'entreprise|business strategy", "Business plan", "Analyse fonctionnelle|functional analysis",
  "Recueil des besoins|requirements gathering|expression de besoins|recueil de besoins", "Cahier des charges|redaction de cahier des charges",
  "MOA|maitrise d'ouvrage", "MOE|maitrise d'oeuvre", "AMOA", "PMO", "Amélioration continue|amelioration continue|continuous improvement",
  "Management d’équipe|management d'equipe|team management|~management|encadrement d'equipe", "Leadership|~leadership", "Coaching|~coaching",
  "Animation d’ateliers|animation d'ateliers|facilitation|~facilitation",
  // RH et juridique
  "Recrutement|~recrutement|~recruitment|talent acquisition", "Gestion des talents|talent management", "Marque employeur|employer branding",
  "Droit du travail|labor law|employment law", "Administration du personnel", "GPEC", "SIRH|hris", "Relations sociales",
  "Droit des affaires|business law|corporate law", "Droit des contrats|contract law", "Droit fiscal|tax law", "Droit social",
  "Propriété intellectuelle|propriete intellectuelle|intellectual property", "Contentieux|~contentieux|~litigation",
  "Veille juridique", "Rédaction juridique|redaction juridique|legal drafting|redaction d'actes", "Protection des données|protection des donnees|data protection",
  // Ingénierie, industrie, sciences
  "AutoCAD", "SolidWorks", "CATIA", "Revit", "ArchiCAD", "SketchUp", "Ansys", "Abaqus", "COMSOL", "LabVIEW", "Simulink",
  "Automates programmables|automates programmables|plc|~automates", "Automatisme|~automatisme|~automation", "Électronique|~electronique|~electronics",
  "Électrotechnique|~electrotechnique", "Mécanique|~mecanique|mechanical engineering|genie mecanique", "Génie civil|genie civil|civil engineering",
  "BIM", "Thermique|~thermique|thermal engineering", "Énergie|~energie|~energy", "Énergies renouvelables|energies renouvelables|renewable energy|renewables",
  "Photovoltaïque|photovoltaique|~solaire|solar pv", "Éolien|~eolien|wind energy|energie eolienne", "Hydrogène|~hydrogene|~hydrogen",
  "Qualité|~qualite|~quality|assurance qualite|quality assurance", "ISO 9001", "ISO 14001", "QHSE|hse|qse", "Sécurité industrielle|securite industrielle",
  "Maintenance industrielle|~maintenance|maintenance industrielle", "Méthodes industrielles|~methodes|methodes industrielles",
  "Gestion de production|~production|production management", "GMAO|cmms", "Industrialisation|~industrialisation",
  "Fabrication additive|impression 3d|3d printing|additive manufacturing", "Robotique|~robotique|~robotics", "Systèmes embarqués|systemes embarques|embedded systems",
  "IoT|internet des objets", "Arduino", "Raspberry Pi", "FPGA", "VHDL", "Verilog", "Traitement du signal|signal processing",
  "Télécommunications|~telecommunications|~telecoms", "Chimie|~chimie|~chemistry", "Biologie|~biologie|~biology", "Biotechnologies|~biotechnologies|~biotechnology",
  "Bio-informatique|bioinformatique|bioinformatics", "Pharmacovigilance", "Affaires réglementaires|affaires reglementaires|regulatory affairs",
  "Essais cliniques|clinical trials", "BPF|gmp|bonnes pratiques de fabrication", "HPLC", "PCR", "Microbiologie|~microbiologie|~microbiology",
  "Agronomie|~agronomie|~agronomy", "Environnement|~environnement|~environmental", "RSE|csr|responsabilite societale|responsabilite societale des entreprises",
  "Bilan carbone|carbon footprint|bilan ges|bilan des emissions", "Analyse de cycle de vie|acv|lca|life cycle assessment",
  "SIG|gis|systemes d'information geographique", "QGIS", "ArcGIS",
  // Transverses
  "Rédaction de rapports|redaction de rapports|report writing", "Prise de parole en public|public speaking|prise de parole",
  "Veille concurrentielle|competitive intelligence|~veille", "Gestion budgétaire|gestion budgetaire|budget management",
  "Service client|~service client|customer service", "Support utilisateurs|user support|helpdesk|support technique|~support",
  "Traduction|~traduction|~translation", "Interprétariat|~interpretariat|~interpreting",
];

export interface SkillEntry {
  label: string;
}

interface Form {
  form: string;
  entry: SkillEntry;
  /** Reconnu seulement dans une rubrique « Compétences ». */
  listedOnly: boolean;
}

export function normalizeSkillText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const FORM_LIST: Form[] = [];
const BY_FORM = new Map<string, Form>();
for (const raw of ENTRIES) {
  const parts = raw.split("|");
  const entry: SkillEntry = { label: (parts[0] as string).replace(/^~/, "") };
  // Une forme marquée « ~ » l'est partout, y compris quand elle est aussi le libellé (« Pricing|~pricing »).
  const generic = new Set(parts.filter((p) => p.startsWith("~")).map((p) => normalizeSkillText(p.slice(1))));
  for (const p of parts) {
    const form = normalizeSkillText(p.replace(/^~/, ""));
    if (!form || BY_FORM.has(form)) continue;
    const short = form.replace(/[^a-z0-9]/g, "").length <= 2;
    const f: Form = { form, entry, listedOnly: generic.has(form) || short };
    BY_FORM.set(form, f);
    FORM_LIST.push(f);
  }
}
// La plus longue forme d'abord : « power bi » avant « bi », « excel avance » avant « excel ».
FORM_LIST.sort((a, b) => b.form.length - a.form.length || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0));

/** Nombre d'entrées du dictionnaire (libellés canoniques). */
export const SKILL_COUNT = new Set(FORM_LIST.map((f) => f.entry.label)).size;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bornes de mot : ni lettre, ni chiffre, ni « + » / « # » collés (C ≠ C++, C ≠ C#).
const RE_CACHE = new Map<string, RegExp>();
function formRe(form: string): RegExp {
  let re = RE_CACHE.get(form);
  if (!re) {
    re = new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRe(form)}(?=$|[^\\p{L}\\p{N}+#])`, "u");
    RE_CACHE.set(form, re);
  }
  return re;
}

/** Libellé canonique si le texte entier est une compétence connue (« ms excel » → « Excel »). */
export function exactSkill(text: string): SkillEntry | null {
  return BY_FORM.get(normalizeSkillText(text).replace(/[.;:]+$/, ""))?.entry ?? null;
}

/**
 * Compétences connues présentes dans un texte, dans l'ordre de première apparition. `listed` : le texte vient
 * d'une rubrique « Compétences » (mots courants et sigles courts acceptés).
 */
export function findSkills(text: string, listed: boolean): SkillEntry[] {
  let hay = normalizeSkillText(text);
  const found: { entry: SkillEntry; at: number }[] = [];
  const seen = new Set<string>();
  for (const f of FORM_LIST) {
    if (f.listedOnly && !listed) continue;
    const re = formRe(f.form);
    let m = re.exec(hay);
    while (m) {
      const at = m.index + (m[1] ?? "").length;
      // Forme masquée pour qu'une forme plus courte ne la recompte pas (« power bi » puis « bi »).
      hay = hay.slice(0, at) + " ".repeat(f.form.length) + hay.slice(at + f.form.length);
      if (!seen.has(f.entry.label)) {
        seen.add(f.entry.label);
        found.push({ entry: f.entry, at });
      }
      m = re.exec(hay);
    }
  }
  found.sort((a, b) => a.at - b.at || (a.entry.label < b.entry.label ? -1 : 1));
  return found.map((f) => f.entry);
}

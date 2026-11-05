// Mots repères : intitulés de poste, formes juridiques d'employeur, lieux, diplômes et établissements.

import { normalizeSkillText } from "./skills";

const JOB_WORDS = [
  "analyste", "analyst", "ingenieur", "ingenieure", "engineer", "developpeur", "developpeuse", "developer", "dev", "chef", "cheffe",
  "head", "lead", "manager", "management", "responsable", "directeur", "directrice", "director", "consultant", "consultante",
  "charge", "chargee", "assistant", "assistante", "stagiaire", "stage", "intern", "internship", "apprenti", "apprentie", "alternant",
  "alternante", "alternance", "apprentissage", "auditeur", "auditrice", "auditor", "controleur", "controleuse", "comptable",
  "accountant", "juriste", "avocat", "avocate", "lawyer", "designer", "product", "owner", "technicien", "technicienne", "technician",
  "coordinateur", "coordinatrice", "coordinator", "commercial", "commerciale", "vendeur", "vendeuse", "sales", "acheteur", "acheteuse",
  "buyer", "officer", "specialist", "specialiste", "expert", "experte", "architecte", "architect", "scientist", "data", "researcher",
  "chercheur", "chercheuse", "doctorant", "doctorante", "professeur", "professeure", "teacher", "enseignant", "enseignante",
  "formateur", "formatrice", "trainer", "conseiller", "conseillere", "advisor", "adviser", "associate", "associe", "associee",
  "partner", "trader", "gestionnaire", "administrateur", "administratrice", "administrator", "operateur", "operatrice", "operator",
  "superviseur", "superviseuse", "supervisor", "president", "presidente", "fondateur", "fondatrice", "founder", "cofondateur",
  "co-fondateur", "co-founder", "ceo", "cto", "cfo", "coo", "vp", "business", "marketing", "communication", "recruteur", "recruteuse",
  "recruiter", "rh", "hr", "infirmier", "infirmiere", "nurse", "medecin", "pharmacien", "pharmacienne", "redacteur", "redactrice",
  "editor", "journaliste", "journalist", "planificateur", "planner", "acheteur", "logisticien", "logisticienne", "animateur",
  "animatrice", "agent", "employe", "employee", "serveur", "serveuse", "hote", "hotesse", "caissier", "caissiere", "benevole",
  "volunteer", "fellow", "tuteur", "tutrice", "tutor", "moniteur", "monitrice", "pricing", "growth", "account", "executive",
  "junior", "senior", "confirme", "confirmee", "freelance", "independant", "independante",
];
const JOB_SET = new Set(JOB_WORDS);

const COMPANY_MARKERS = [
  "sa", "sas", "sasu", "sarl", "eurl", "sci", "scop", "gie", "inc", "ltd", "llc", "plc", "gmbh", "ag", "bv", "nv", "spa", "srl",
  "group", "groupe", "holding", "corp", "corporation", "company", "co", "banque", "bank", "assurances", "insurance", "consulting",
  "conseil", "partners", "associes", "laboratoires", "industries", "technologies", "solutions", "services", "systems", "capital",
  "university", "universite", "ecole", "school", "institut", "institute", "hopital", "chu", "mairie", "ministere", "agence",
  "agency", "studio", "foundation", "fondation", "association",
];
const COMPANY_SET = new Set(COMPANY_MARKERS);

const LOCATIONS = [
  "france", "paris", "lyon", "marseille", "lille", "toulouse", "bordeaux", "nantes", "nice", "strasbourg", "rennes", "montpellier",
  "grenoble", "rouen", "toulon", "dijon", "angers", "nancy", "metz", "reims", "tours", "brest", "caen", "orleans", "clermont-ferrand",
  "le havre", "saint-etienne", "amiens", "limoges", "perpignan", "besancon", "poitiers", "pau", "la defense", "boulogne-billancourt",
  "neuilly-sur-seine", "issy-les-moulineaux", "levallois-perret", "puteaux", "courbevoie", "nanterre", "saint-denis", "versailles",
  "ile-de-france", "ile de france", "auvergne-rhone-alpes", "nouvelle-aquitaine", "occitanie", "hauts-de-france", "grand est",
  "bretagne", "normandie", "provence-alpes-cote d'azur", "pays de la loire", "centre-val de loire", "bourgogne-franche-comte",
  "london", "londres", "berlin", "madrid", "barcelona", "barcelone", "milan", "rome", "bruxelles", "brussels", "geneve", "geneva",
  "zurich", "lausanne", "luxembourg", "amsterdam", "new york", "san francisco", "montreal", "quebec", "dublin", "lisbonne", "lisbon",
  "munich", "francfort", "frankfurt", "singapore", "singapour", "tokyo", "hong kong", "dubai", "casablanca", "tunis", "alger",
  "dakar", "abidjan", "belgique", "belgium", "suisse", "switzerland", "allemagne", "germany", "espagne", "spain", "italie", "italy",
  "royaume-uni", "united kingdom", "uk", "etats-unis", "united states", "usa", "canada", "maroc", "morocco", "tunisie", "algerie",
  "senegal", "cote d'ivoire", "england", "scotland", "wales", "ireland", "irlande", "pays-bas", "netherlands", "portugal",
  "remote", "teletravail", "a distance", "hybride", "hybrid", "en ligne", "online",
];
const LOCATION_SET = new Set(LOCATIONS);

const DEGREE_WORDS = /\b(master|mastere|msc|m\.sc|mba|licence|bachelor|bsc|b\.sc|doctorat|phd|ph\.d|these|bts|dut|but|bac|baccalaureat|diplome|ingenieur|cpge|classe preparatoire|prepa|m1|m2|l1|l2|l3|deug|dea|dess|cap|bep|mastere specialise|ms)\b/;
const SCHOOL_WORDS = /\b(universite|university|ecole|school|institut|institute|iut|lycee|college|sciences po|hec|essec|escp|edhec|insead|insa|polytechnique|centrale|mines|ponts|telecom|supelec|dauphine|sorbonne|faculte|faculty|business school|campus|academy|academie|conservatoire)\b/;

function words(s: string): string[] {
  return normalizeSkillText(s).split(/[^a-z0-9'-]+/).filter(Boolean);
}

/** Score « intitulé de poste » : nombre de mots repères. */
export function jobScore(s: string): number {
  return words(s).filter((w) => JOB_SET.has(w)).length;
}

/** Score « employeur » : forme juridique ou mot d'organisation. */
export function companyScore(s: string): number {
  return words(s).filter((w) => COMPANY_SET.has(w)).length;
}

/** Ligne de lieu (« Paris, Île-de-France, France », « Lyon (69) », « Remote »). */
export function isLocationLine(s: string): boolean {
  const n = normalizeSkillText(s).replace(/\(\d{2,3}\)/g, "").replace(/[()]/g, "").trim();
  if (!n || n.length > 70) return false;
  const parts = n.split(/\s*[,·|/–]\s*|\s+-\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((p) => LOCATION_SET.has(p) || /^\d{5}( [a-z' -]+)?$/.test(p) || /^\d{2}$/.test(p));
}

/** Retire un lieu final (« Carrefour, Paris » → « Carrefour », « Thales (Paris) » → « Thales »). */
export function stripLocation(s: string): string {
  let out = s.replace(/\s*\(([^)]*)\)\s*$/, (whole, inner: string) => (isLocationLine(inner) ? "" : whole)).trim();
  const m = out.match(/^(.*\S)\s*(?:,|\s[–-])\s*([^,–]+)$/);
  if (m && isLocationLine(m[2] as string)) out = (m[1] as string).trim();
  return out;
}

export function isDegreeLine(s: string): boolean {
  return DEGREE_WORDS.test(normalizeSkillText(s));
}

export function isSchoolLine(s: string): boolean {
  return SCHOOL_WORDS.test(normalizeSkillText(s));
}

/** Ressemble à un nom de personne : 2 à 4 mots capitalisés, sans mot de poste ni chiffre. */
export function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 50 || /\d|@|\|/.test(t)) return false;
  const parts = t.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  if (jobScore(t) > 0 || companyScore(t) > 0) return false;
  return parts.every((p) => /^[\p{Lu}][\p{L}'’-]*$/u.test(p) || /^[\p{Lu}'’-]{2,}$/u.test(p));
}

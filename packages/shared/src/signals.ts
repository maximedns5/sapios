// Signaux posés par `process-diploma` sur `degree_submissions.signals` (brief §4.1 étape 4).
// Ils ne décident rien : ils orientent la revue humaine. Libellés destinés au back-office.
// Ce fichier ne doit rien importer (importé tel quel par les Edge Functions).

export const DIPLOMA_SIGNALS = {
  name_mismatch: "Nom extrait différent du nom légal",
  name_missing: "Nom du titulaire absent ou illisible",
  identity_missing: "Nom légal ou date de naissance non renseignés",
  duplicate_triplet: "Même titulaire, établissement et année qu'une soumission d'un autre compte",
  year_implausible: "Année d'obtention peu plausible au vu de la date de naissance",
  year_missing: "Année d'obtention absente",
  injection_suspected: "Le document contient des formulations d'instruction (tentative de manipulation)",
  not_a_diploma: "Le modèle ne reconnaît pas un diplôme",
  low_confidence: "Confiance de l'extraction faible",
  level_unknown: "Niveau non estimé par le modèle",
  model_refusal: "Le modèle a refusé d'analyser le document",
  extraction_unavailable: "Extraction IA indisponible (clé API absente ou refusée)",
  extraction_unparseable: "Réponse du modèle inexploitable",
  extraction_impossible: "Extraction impossible après plusieurs essais",
  file_missing: "Fichier introuvable dans le stockage",
  file_too_large_for_extraction: "Fichier trop lourd pour l'extraction IA",
} as const;

export type DiplomaSignal = keyof typeof DIPLOMA_SIGNALS;

/** Les `fraud_signals` du modèle sont repris tels quels, préfixés : `model:<texte>`. */
export const MODEL_SIGNAL_PREFIX = "model:";

export function signalLabel(signal: string): string {
  if (signal.startsWith(MODEL_SIGNAL_PREFIX)) return `Modèle : ${signal.slice(MODEL_SIGNAL_PREFIX.length)}`;
  return (DIPLOMA_SIGNALS as Record<string, string>)[signal] ?? signal;
}

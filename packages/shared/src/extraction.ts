// Schéma de la sortie structurée du modèle d'extraction (brief §4.3). Elle ne fait que proposer.
// `zod/v4` : c'est l'API attendue par les helpers zod du SDK Anthropic ; le sous-chemin existe dans
// zod 3.25+ comme dans zod 4. Ce fichier n'importe que zod : les Edge Functions (Deno) l'importent
// directement, via l'import map de chaque fonction.
import * as z from "zod/v4";

export const DEGREE_TYPES = [
  "bac",
  "bac_plus_2",
  "licence",
  "master",
  "ingenieur",
  "ecole_commerce",
  "doctorat",
  "autre",
] as const;
export type DegreeType = (typeof DEGREE_TYPES)[number];

export const Extraction = z.object({
  is_diploma: z.boolean(),
  holder_full_name: z.string().nullable(),
  institution: z.string().nullable(),
  country: z.string().nullable(),
  degree_title: z.string().nullable(),
  degree_type: z.enum(DEGREE_TYPES),
  field_of_study: z.string().nullable(),
  year_awarded: z.number().int().nullable(),
  honors: z.string().nullable(),
  level_estimate: z.number().int().min(1).max(8).nullable(),
  confidence: z.number().min(0).max(1),
  fraud_signals: z.array(z.string()),
});
export type Extraction = z.infer<typeof Extraction>;

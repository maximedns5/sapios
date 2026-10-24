import type { User } from "@supabase/supabase-js";
import type { EmploiState, MyCompany } from "@sapios/shared";
import { createClient } from "@/lib/supabase/server";
import { errorCode } from "./errors";
import { rpc } from "./rpc";

/** Où en est un compte dans le parcours recruteur : connexion, bienvenue (type et conditions), entreprise, espace. */
export type RecruiterStep = "login" | "welcome" | "company" | "space";

export const STEP_PATH: Record<RecruiterStep, string> = {
  login: "/recruteur/connexion",
  welcome: "/recruteur/bienvenue",
  company: "/recruteur/inscription",
  space: "/recruteur/offres",
};

export interface RecruiterContext {
  user: User | null;
  state: EmploiState | null;
  /** Code d'erreur de `get_emploi_state` (base indisponible, migration absente). */
  error: string | null;
  step: RecruiterStep;
}

export function stepFor(user: User | null, state: EmploiState | null): RecruiterStep {
  if (!user) return "login";
  if (!state || state.kind !== "recruiter" || !state.terms.accepted) return "welcome";
  if (!state.recruiter) return "company";
  return "space";
}

/** Session et état emploi du compte connecté, lus côté serveur avec la clé anon et la session (cookies). */
export async function loadRecruiterContext(): Promise<RecruiterContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, state: null, error: null, step: "login" };
  const { data, error } = await rpc<EmploiState>(supabase, "get_emploi_state");
  if (error) return { user, state: null, error: await errorCode(error), step: "welcome" };
  return { user, state: data, error: null, step: stepFor(user, data) };
}

export async function loadMyCompany(): Promise<{ company: MyCompany | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await rpc<MyCompany>(supabase, "get_my_company");
  if (error) return { company: null, error: await errorCode(error) };
  return { company: data, error: null };
}

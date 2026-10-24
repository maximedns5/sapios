import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RecruiterWelcome from "@/components/recruteur/RecruiterWelcome";
import { CANDIDATE_APP_URL } from "@/lib/emploi/config";
import { loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";

export const metadata: Metadata = { title: "Bienvenue" };

// Premier passage : le compte devient recruteur, puis accepte les conditions recruteurs.
export default async function WelcomePage() {
  const { user, state, error, step } = await loadRecruiterContext();
  if (step === "login") redirect(STEP_PATH.login);
  if (step === "company" || step === "space") redirect(STEP_PATH[step]);
  return (
    <RecruiterWelcome
      email={user?.email ?? ""}
      kind={state?.kind ?? null}
      termsVersion={state?.terms.required_version ?? null}
      unavailable={error}
      appUrl={CANDIDATE_APP_URL}
    />
  );
}

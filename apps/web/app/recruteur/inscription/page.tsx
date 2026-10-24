import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CompanySignup from "@/components/recruteur/CompanySignup";
import { loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";

export const metadata: Metadata = { title: "Inscription de l’entreprise" };

export default async function CompanySignupPage() {
  const { user, step } = await loadRecruiterContext();
  if (step !== "company") redirect(STEP_PATH[step]);
  return <CompanySignup email={user?.email ?? ""} />;
}

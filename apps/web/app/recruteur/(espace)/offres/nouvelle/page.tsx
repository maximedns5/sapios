import type { Metadata } from "next";
import { redirect } from "next/navigation";
import OfferEditor from "@/components/recruteur/OfferEditor";
import { loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";

export const metadata: Metadata = { title: "Nouvelle offre" };

export default async function NewOfferPage() {
  const { state, step } = await loadRecruiterContext();
  if (step !== "space" || !state?.recruiter) redirect(STEP_PATH[step]);
  const r = state.recruiter;
  return <OfferEditor companyId={r.company_id} companyName={r.company_name} companyStatus={r.company_status} initial={null} />;
}

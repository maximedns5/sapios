import { redirect } from "next/navigation";
import RecruiterShell from "@/components/recruteur/RecruiterShell";
import { loadMyCompany, loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";

// Garde serveur de l'espace : session, compte recruteur, conditions acceptées, entreprise inscrite.
// La RLS et les RPC restent le vrai verrou (`not_member`, `not_recruiter`).
export default async function RecruiterSpaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, state, step } = await loadRecruiterContext();
  if (step !== "space" || !state?.recruiter) redirect(STEP_PATH[step]);
  const { company } = await loadMyCompany();
  return (
    <RecruiterShell
      email={user?.email ?? ""}
      companyName={state.recruiter.company_name}
      companyStatus={state.recruiter.company_status}
      statusReason={company?.company.status_reason ?? null}
      jobTitle={company?.me.job_title ?? null}
      firstName={company?.me.first_name ?? null}
      unread={state.counts.unread_messages}
    >
      {children}
    </RecruiterShell>
  );
}

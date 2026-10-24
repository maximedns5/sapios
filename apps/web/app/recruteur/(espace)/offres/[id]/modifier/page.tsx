import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { OfferDraft } from "@sapios/shared";
import OfferEditor from "@/components/recruteur/OfferEditor";
import { emploiErrorMessage, errorCode } from "@/lib/emploi/errors";
import { rpc } from "@/lib/emploi/rpc";
import { loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Modifier l’offre" };

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { state, step } = await loadRecruiterContext();
  if (step !== "space" || !state?.recruiter) redirect(STEP_PATH[step]);
  const { data, error } = await rpc<OfferDraft>(await createClient(), "get_offer_for_edit", { p_id: id });
  if (error) {
    const code = await errorCode(error);
    if (code === "not_found" || code === "not_member" || code === "22P02") notFound();
    return (
      <p className="alert" role="alert">
        {emploiErrorMessage(code)}
      </p>
    );
  }
  if (!data) notFound();
  if (data.status !== "draft" && data.status !== "rejected") {
    return (
      <div className="surface" style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>{data.title}</h1>
        <p>
          Cette offre n’est plus modifiable : elle est{" "}
          {data.status === "pending_review" ? "en vérification" : data.status === "published" ? "publiée" : "close"}. Pour
          changer une offre publiée, archivez-la puis créez-en une nouvelle.
        </p>
        <div className="row">
          <Link className="btn btn--soft" href={`/recruteur/offres/${id}/suivi`}>
            Voir le suivi
          </Link>
          <Link className="btn btn--ghost" href="/recruteur/offres">
            Vos offres
          </Link>
        </div>
      </div>
    );
  }
  const r = state.recruiter;
  return <OfferEditor companyId={r.company_id} companyName={r.company_name} companyStatus={r.company_status} initial={data} />;
}

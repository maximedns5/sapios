import type { Metadata } from "next";
import OffersDashboard from "@/components/recruteur/OffersDashboard";
import { loadMyCompany } from "@/lib/emploi/server";

export const metadata: Metadata = { title: "Vos offres" };

export default async function OffersPage() {
  const { company } = await loadMyCompany();
  return <OffersDashboard company={company} />;
}

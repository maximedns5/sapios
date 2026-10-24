import type { Metadata } from "next";
import CompanyProfile from "@/components/recruteur/CompanyProfile";
import { loadMyCompany } from "@/lib/emploi/server";

export const metadata: Metadata = { title: "Entreprise" };

export default async function CompanyPage() {
  const { company, error } = await loadMyCompany();
  return <CompanyProfile initial={company} error={error} />;
}

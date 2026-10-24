import type { Metadata } from "next";
import type { CompanyStatus } from "@sapios/shared";
import CompaniesQueue from "@/components/admin/CompaniesQueue";
import { COMPANY_FILTERS } from "@/lib/emploi/filters";

export const metadata: Metadata = { title: "Entreprises" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status = (COMPANY_FILTERS as readonly string[]).includes(statut ?? "") ? (statut as CompanyStatus) : "pending";
  return <CompaniesQueue status={status} />;
}

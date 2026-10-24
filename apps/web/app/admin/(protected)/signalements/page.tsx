import type { Metadata } from "next";
import type { ReportStatus } from "@sapios/shared";
import OfferReports from "@/components/admin/OfferReports";
import { REPORT_FILTERS } from "@/lib/emploi/filters";

export const metadata: Metadata = { title: "Signalements d’offres" };

export default async function OfferReportsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status = (REPORT_FILTERS as readonly string[]).includes(statut ?? "") ? (statut as ReportStatus) : "open";
  return <OfferReports status={status} />;
}

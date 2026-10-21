import type { Metadata } from "next";
import ReportsView from "@/components/admin/ReportsView";
import type { ReportStatus } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Signalements" };

const STATUSES: ReportStatus[] = ["open", "actioned", "dismissed"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status = STATUSES.includes(statut as ReportStatus) ? (statut as ReportStatus) : "open";
  return <ReportsView key={status} status={status} />;
}

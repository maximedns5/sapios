import type { Metadata } from "next";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@sapios/shared";
import SubmissionsQueue from "@/components/admin/SubmissionsQueue";

export const metadata: Metadata = { title: "Diplômes" };

export default async function DiplomasPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status: SubmissionStatus = SUBMISSION_STATUSES.includes(statut as SubmissionStatus)
    ? (statut as SubmissionStatus)
    : "needs_review";
  return <SubmissionsQueue key={status} status={status} />;
}

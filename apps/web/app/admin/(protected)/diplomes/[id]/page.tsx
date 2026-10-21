import type { Metadata } from "next";
import SubmissionDetail from "@/components/admin/SubmissionDetail";

export const metadata: Metadata = { title: "Examen d’un diplôme" };

export default async function DiplomaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionDetail id={id} />;
}

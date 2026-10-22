import type { Metadata } from "next";
import { CONTENT_FLAG_STATUSES, type ContentFlagStatus } from "@sapios/shared";
import ContentQueue from "@/components/admin/ContentQueue";

export const metadata: Metadata = { title: "Contenus" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status = CONTENT_FLAG_STATUSES.includes(statut as ContentFlagStatus) ? (statut as ContentFlagStatus) : "open";
  return <ContentQueue key={status} status={status} />;
}

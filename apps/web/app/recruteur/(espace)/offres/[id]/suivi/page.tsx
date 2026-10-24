import type { Metadata } from "next";
import { Suspense } from "react";
import Pipeline from "@/components/recruteur/Pipeline";

export const metadata: Metadata = { title: "Suivi des candidatures" };

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <Pipeline offerId={id} />
    </Suspense>
  );
}

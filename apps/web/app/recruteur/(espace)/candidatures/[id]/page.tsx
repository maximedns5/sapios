import type { Metadata } from "next";
import ApplicationPage from "@/components/recruteur/ApplicationPage";

export const metadata: Metadata = { title: "Candidature" };

export default async function RecruiterApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationPage applicationId={id} />;
}

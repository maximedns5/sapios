import type { Metadata } from "next";
import RegistrationsView from "@/components/admin/RegistrationsView";

export const metadata: Metadata = { title: "Inscrits" };

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistrationsView eventId={id} />;
}

import type { Metadata } from "next";
import EventsView from "@/components/admin/EventsView";

export const metadata: Metadata = { title: "Événements" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ evenement?: string }> }) {
  const { evenement } = await searchParams;
  return <EventsView initialId={evenement || undefined} />;
}

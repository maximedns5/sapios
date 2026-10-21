import type { Metadata } from "next";
import WaitlistView from "@/components/admin/WaitlistView";

export const metadata: Metadata = { title: "Liste d’attente" };

export default function WaitlistPage() {
  return <WaitlistView />;
}

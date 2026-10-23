import type { Metadata } from "next";
import ReferralsView from "@/components/admin/ReferralsView";

export const metadata: Metadata = { title: "Parrainages" };

export default function ReferralsPage() {
  return <ReferralsView />;
}

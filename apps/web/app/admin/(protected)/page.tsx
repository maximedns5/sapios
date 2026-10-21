import type { Metadata } from "next";
import StatsView from "@/components/admin/StatsView";

export const metadata: Metadata = { title: "Vue d’ensemble" };

export default function AdminHomePage() {
  return <StatsView />;
}

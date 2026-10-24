import type { Metadata } from "next";
import EmploiStats from "@/components/admin/EmploiStats";

export const metadata: Metadata = { title: "Vue d’ensemble" };

export default function AdminHomePage() {
  return <EmploiStats />;
}

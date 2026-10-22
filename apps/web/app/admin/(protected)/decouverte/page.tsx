import type { Metadata } from "next";
import DiscoverySettings from "@/components/admin/DiscoverySettings";

export const metadata: Metadata = { title: "Découverte et modération" };

export default function DiscoveryPage() {
  return <DiscoverySettings />;
}

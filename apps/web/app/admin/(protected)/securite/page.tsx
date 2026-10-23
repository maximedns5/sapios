import type { Metadata } from "next";
import SecuritySettings from "@/components/admin/SecuritySettings";

export const metadata: Metadata = { title: "Sécurité" };

export default function SecurityPage() {
  return <SecuritySettings />;
}

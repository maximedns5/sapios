import type { Metadata } from "next";
import ComplianceSettings from "@/components/admin/ComplianceSettings";

export const metadata: Metadata = { title: "Conservation et conformité" };

export default function CompliancePage() {
  return <ComplianceSettings />;
}

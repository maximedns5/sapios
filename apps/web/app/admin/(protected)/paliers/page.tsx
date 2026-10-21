import type { Metadata } from "next";
import PolicyEditor from "@/components/admin/PolicyEditor";

export const metadata: Metadata = { title: "Paliers d’accès" };

export default function PolicyPage() {
  return <PolicyEditor />;
}

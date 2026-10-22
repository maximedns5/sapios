import type { Metadata } from "next";
import PromptsEditor from "@/components/admin/PromptsEditor";

export const metadata: Metadata = { title: "Questions" };

export default function PromptsPage() {
  return <PromptsEditor />;
}

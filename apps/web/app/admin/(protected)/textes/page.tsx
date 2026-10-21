import type { Metadata } from "next";
import CopyEditor from "@/components/admin/CopyEditor";

export const metadata: Metadata = { title: "Textes" };

export default function CopyPage() {
  return <CopyEditor />;
}

import type { Metadata } from "next";
import Conversations from "@/components/recruteur/Conversations";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return <Conversations />;
}

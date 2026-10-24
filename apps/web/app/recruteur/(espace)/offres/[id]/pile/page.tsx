import type { Metadata } from "next";
import Pile from "@/components/recruteur/Pile";

export const metadata: Metadata = { title: "Trier la pile" };

export default async function PilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Pile offerId={id} />;
}

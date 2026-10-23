import type { Metadata } from "next";
import LegalDocument, { readLegal } from "@/components/LegalDocument";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, directeur de la publication, hébergeurs et point de contact de Sapios.",
  robots: SITE.legalPagesReady ? undefined : { index: false, follow: false },
};

export default function MentionsLegalesPage() {
  return (
    <LegalDocument
      label={SITE.legalPagesReady ? "Informations légales" : "Version provisoire"}
      title={
        <>
          Mentions <em>légales</em>
        </>
      }
      source={readLegal("mentions-legales")}
    />
  );
}

import type { Metadata, Viewport } from "next";
import LegalDocument, { readLegal } from "@/components/LegalDocument";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Sapios Emploi traite les données des candidats et des recruteurs : CV anonyme jusqu’au match, finalités, durées de conservation, sous-traitants et droits.",
  robots: SITE.legalPagesReady ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function ConfidentialitePage() {
  return (
    <LegalDocument
      label={SITE.legalPagesReady ? "Données personnelles" : "Version provisoire"}
      title={
        <>
          Politique de <em>confidentialité</em>
        </>
      }
      source={readLegal("confidentialite")}
    />
  );
}

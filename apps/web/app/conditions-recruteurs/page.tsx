import type { Metadata } from "next";
import LegalDocument, { readLegal } from "@/components/LegalDocument";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions générales recruteurs",
  description:
    "Les règles de Sapios Emploi pour les entreprises : vérification, publication des offres et des photos, réponse garantie, données personnelles et facturation.",
  robots: SITE.legalPagesReady ? undefined : { index: false, follow: false },
};

export default function ConditionsRecruteursPage() {
  return (
    <LegalDocument
      label={SITE.legalPagesReady ? "Recruteurs" : "Version provisoire"}
      title={
        <>
          Conditions générales <em>recruteurs</em>
        </>
      }
      source={readLegal("conditions-recruteurs")}
    />
  );
}

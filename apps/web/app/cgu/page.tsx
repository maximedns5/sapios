import type { Metadata } from "next";
import LegalDocument, { readLegal } from "@/components/LegalDocument";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions générales d’utilisation pour les candidats",
  description:
    "Les règles de Sapios Emploi pour les candidats : gratuité, CV anonyme jusqu’au match, réponse garantie, classement sans IA, modération et recours.",
  robots: SITE.legalPagesReady ? undefined : { index: false, follow: false },
};

export default function CguPage() {
  return (
    <LegalDocument
      label={SITE.legalPagesReady ? "Candidats" : "Version provisoire"}
      title={
        <>
          Conditions générales <em>d’utilisation</em>
        </>
      }
      source={readLegal("cgu")}
    />
  );
}

import type { Metadata } from "next";
import LegalDocument, { readLegal } from "@/components/LegalDocument";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Conditions générales d’utilisation",
  description: "Les règles d’utilisation de Sapios : accès, vérification du diplôme, contenus, modération, recours.",
  robots: SITE.legalPagesReady ? undefined : { index: false, follow: false },
};

export default function CguPage() {
  return (
    <LegalDocument
      label={SITE.legalPagesReady ? "Conditions générales" : "Version provisoire"}
      title={
        <>
          Conditions générales <em>d’utilisation</em>
        </>
      }
      source={readLegal("cgu")}
    />
  );
}

import { readFileSync } from "node:fs";
import path from "node:path";
import LegalShell from "@/components/LegalShell";
import { LegalMarkdown } from "@/lib/legal-markdown";
import { SITE } from "@/lib/site";

/** Texte légal lu au build dans content/legal/<file>.md (pages statiques). */
export function readLegal(file: string): string {
  return readFileSync(path.join(process.cwd(), "content", "legal", `${file}.md`), "utf8");
}

export default function LegalDocument({
  title,
  label,
  source,
}: {
  title: React.ReactNode;
  label: string;
  source: string;
}) {
  return (
    <LegalShell
      label={label}
      title={title}
      intro={
        SITE.legalPagesReady ? undefined : (
          <p className="legal-draft" role="note">
            <strong>Version provisoire, en cours de validation juridique.</strong>
            Les passages entre crochets seront complétés avant l’ouverture du service au public.
          </p>
        )
      }
    >
      <LegalMarkdown source={source} />
    </LegalShell>
  );
}

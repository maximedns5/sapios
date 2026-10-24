import { readFileSync } from "node:fs";
import path from "node:path";
import LegalShell from "@/components/LegalShell";
import { LegalMarkdown } from "@/lib/legal-markdown";
import { SITE } from "@/lib/site";

// Valeurs remplacées dans les textes : adresses de contact et date de mise à jour (lib/site.ts).
const TOKENS: Record<string, string> = {
  contactEmail: SITE.contactEmail,
  privacyEmail: SITE.privacyEmail,
  privacyUpdatedAt: SITE.privacyUpdatedAt,
};

/** Texte légal lu dans content/legal/<file>.md, avec les `{{jeton}}` de TOKENS remplacés. */
export function readLegal(file: string): string {
  const source = readFileSync(path.join(process.cwd(), "content", "legal", `${file}.md`), "utf8");
  return source.replace(/\{\{(\w+)\}\}/g, (match, key: string) => TOKENS[key] ?? match);
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

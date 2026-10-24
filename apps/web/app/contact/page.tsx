import type { Metadata, Viewport } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";
import { RECRUITER_PATH, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contacter l’éditeur de Sapios Emploi : questions, données personnelles, signalement d’une offre, entreprises.",
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function ContactPage() {
  return (
    <LegalShell
      label="Éditeur"
      title={
        <>
          Nous <em>contacter</em>
        </>
      }
      intro={<p>Une question, une demande, une offre qui vous semble douteuse : écrivez-nous. Une personne vous répond.</p>}
    >
      <section aria-labelledby="ecrire">
        <h2 id="ecrire">
          <span className="label">01</span>Écrire à l’éditeur
        </h2>
        <div className="legal-contact">
          <p>Questions générales, compte, presse et partenariats.</p>
          <a className="big" href={`mailto:${SITE.contactEmail}`}>
            {SITE.contactEmail}
          </a>
        </div>
        <p>Réponse sous cinq jours ouvrés.</p>
      </section>

      <section aria-labelledby="donnees">
        <h2 id="donnees">
          <span className="label">02</span>Données personnelles
        </h2>
        <div className="legal-contact">
          <p>Accès, y compris aux notes d’un recruteur sur votre candidature, rectification, effacement, portabilité.</p>
          <a className="big" href={`mailto:${SITE.privacyEmail}`}>
            {SITE.privacyEmail}
          </a>
        </div>
        <p>
          Réponse sous un mois. L’export et la suppression du compte sont aussi disponibles directement dans
          l’application. Détails dans la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>

      <section aria-labelledby="signaler">
        <h2 id="signaler">
          <span className="label">03</span>Signaler une offre ou une photo
        </h2>
        <p>
          Dans l’application, chaque offre a un bouton « Signaler » : offre fictive, critère discriminatoire, salaire
          trompeur, demande d’argent. Chaque signalement est examiné par une personne de l’équipe.
        </p>
        <p>
          Une conversation, une invitation, ou une photo sur laquelle vous figurez : écrivez à{" "}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> avec l’offre concernée. Une photo est
          retirée sous 72 heures à la demande d’une personne qui y figure.
        </p>
        <div className="legal-callout">
          <p>Un recruteur ne vous demande jamais d’argent. Si c’est le cas, ne payez pas et signalez-le.</p>
        </div>
      </section>

      <section aria-labelledby="entreprises">
        <h2 id="entreprises">
          <span className="label">04</span>Entreprises
        </h2>
        <p>
          Pour publier des offres pendant le pilote, ouvrez un compte depuis l’
          <Link href={RECRUITER_PATH}>espace recruteur</Link> : la vérification de l’entreprise prend en général
          moins de 24 heures ouvrées. Les règles sont dans les{" "}
          <Link href="/conditions-recruteurs">conditions générales recruteurs</Link>.
        </p>
      </section>
    </LegalShell>
  );
}

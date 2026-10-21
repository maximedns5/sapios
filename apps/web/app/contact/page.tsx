import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contacter l’éditeur de Sapios : questions, données personnelles, signalements, presse.",
};

export default function ContactPage() {
  return (
    <LegalShell
      label="Éditeur"
      title={
        <>
          Nous <em>contacter</em>
        </>
      }
      intro={<p>Une question, une demande, un problème avec un membre : écrivez-nous. Une personne vous répond.</p>}
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
          <p>Accès, rectification, effacement, portabilité, retrait du consentement.</p>
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
          <span className="label">03</span>Signaler un membre ou un contenu
        </h2>
        <p>
          Dans l’application, depuis le profil ou la conversation : bouton « Signaler », ou « Bloquer » pour ne
          plus voir la personne ni recevoir ses messages. Chaque signalement est examiné par l’équipe de
          modération.
        </p>
        <p>
          Vous pouvez aussi écrire à <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> en précisant
          le prénom affiché du membre et la date des faits.
        </p>
        <div className="legal-callout">
          <p>En cas de danger immédiat, appelez le 17 (police) ou le 112.</p>
        </div>
      </section>
    </LegalShell>
  );
}

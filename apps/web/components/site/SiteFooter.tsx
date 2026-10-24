import Link from "next/link";
import { SITE } from "@/lib/site";

export default function SiteFooter({ note }: { note?: React.ReactNode }) {
  return (
    <footer className="s-footer">
      <div className="s-footer-in">
        <div>
          <Link className="s-wordmark" href="/" aria-label="Sapios Emploi, accueil">
            sapios
          </Link>
          <p className="s-small">© 2026 Sapios. Gratuit pour les candidats, réservé aux personnes majeures.</p>
        </div>
        <nav aria-label="Informations">
          <Link href="/comment-nous-classons">Comment nous classons</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          {SITE.legalPagesReady ? <Link href="/cgu">CGU candidats</Link> : null}
          {SITE.legalPagesReady ? <Link href="/conditions-recruteurs">Conditions recruteurs</Link> : null}
          {SITE.legalPagesReady ? <Link href="/mentions-legales">Mentions légales</Link> : null}
          <Link href="/contact">Contact</Link>
        </nav>
        {note ? <p className="s-footer-note">{note}</p> : null}
      </div>
    </footer>
  );
}

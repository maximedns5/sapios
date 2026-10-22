import Link from "next/link";

export default function SiteFooter({ note }: { note?: React.ReactNode }) {
  return (
    <footer className="s-footer">
      <div className="s-footer-in">
        <div>
          <Link className="s-wordmark" href="/" aria-label="Sapios, accueil">
            sapios
          </Link>
          <p className="s-small">© 2026 Sapios. Réservé aux personnes majeures.</p>
        </div>
        <nav aria-label="Informations">
          <Link href="/test">Test d’admission</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        {note ? <p className="s-footer-note">{note}</p> : null}
      </div>
    </footer>
  );
}

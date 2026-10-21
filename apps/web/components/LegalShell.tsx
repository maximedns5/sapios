import Link from "next/link";
import "@/app/legal.css";

export default function LegalShell({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="legal light">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="legal-top">
        <Link href="/" className="legal-logo" aria-label="Sapios, accueil">
          SAPIOS<sup>®</sup>
        </Link>
        <nav aria-label="Pages" className="legal-nav">
          <Link className="label" href="/confidentialite">
            Confidentialité
          </Link>
          <Link className="label" href="/contact">
            Contact
          </Link>
        </nav>
      </header>
      <main id="contenu" className="legal-main">
        <p className="label">{label}</p>
        <h1 className="legal-title">{title}</h1>
        {intro ? <div className="legal-intro">{intro}</div> : null}
        <div className="legal-body">{children}</div>
      </main>
      <footer className="legal-foot">
        <p className="label">© 2026 Sapios — Réservé aux personnes majeures</p>
        <Link className="label" href="/">
          Retour à l’accueil
        </Link>
      </footer>
    </div>
  );
}

import Link from "next/link";

/** En-tête du site public : logo, lien vers le test, accès direct au formulaire. */
export default function SiteHeader({ applyHref = "/#postuler" }: { applyHref?: string }) {
  return (
    <header className="s-header">
      <div className="s-header-in">
        <Link className="s-wordmark" href="/" aria-label="Sapios, accueil">
          sapios
        </Link>
        <nav aria-label="Navigation">
          <Link className="s-header-link" href="/test">
            Le test d’admission
          </Link>
          <a className="s-btn s-btn--sm" href={applyHref}>
            Postuler
          </a>
        </nav>
      </div>
    </header>
  );
}

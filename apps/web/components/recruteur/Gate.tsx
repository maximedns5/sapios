import Link from "next/link";

/** Cadre des pages hors espace (connexion, bienvenue, inscription) : mot-symbole et contenu centré. */
export default function Gate({
  children,
  wide = false,
  aside,
}: {
  children: React.ReactNode;
  wide?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div className="rec-gate">
      <a className="skip-link" href="#rec-main">
        Aller au contenu
      </a>
      <header className="rec-gate-top">
        <Link href="/" className="rec-brand" style={{ padding: 0, textDecoration: "none" }} aria-label="Sapios, accueil">
          <span className="wordmark">sapios</span>
          <span className="wordmark-tag">Emploi · recruteurs</span>
        </Link>
        {aside}
      </header>
      <main id="rec-main" className={wide ? "rec-gate-main rec-gate-main--wide" : "rec-gate-main"}>
        {children}
      </main>
    </div>
  );
}

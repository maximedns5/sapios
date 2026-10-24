import Link from "next/link";
import { RECRUITER_PATH } from "@/lib/site";

/** En-tête du site public : logo, liens vers le fonctionnement et les règles, accès à l'espace recruteur. */
export default function SiteHeader() {
  return (
    <header className="s-header">
      <div className="s-header-in">
        <Link className="s-brand" href="/" aria-label="Sapios Emploi, accueil">
          <span className="s-wordmark">sapios</span>
          <span className="s-brand-tag" aria-hidden="true">
            Emploi
          </span>
        </Link>
        <nav aria-label="Navigation">
          <Link className="s-header-link" href="/#comment">
            Comment ça marche
          </Link>
          <Link className="s-header-link" href="/comment-nous-classons">
            Nos règles
          </Link>
          <Link className="s-btn s-btn--sm s-btn--soft" href={RECRUITER_PATH}>
            Espace recruteur
          </Link>
        </nav>
      </div>
    </header>
  );
}

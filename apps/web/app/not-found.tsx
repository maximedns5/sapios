import Link from "next/link";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import "./site.css";

export default function NotFound() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="nf">
        <p className="s-kicker">Erreur 404</p>
        <h1>
          Page <em>non admise.</em>
        </h1>
        <p>Elle n’a pas le niveau requis. Ou elle n’existe pas.</p>
        <Link className="s-btn" href="/">
          Retour à l’accueil
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

import type { Viewport } from "next";
import Link from "next/link";
import StickyApply from "@/components/landing/StickyApply";
import WaitlistForm from "@/components/landing/WaitlistForm";
import { ArrowRight, Heart, Partial, Refused, Verified, Waiting } from "@/components/site/Icons";
import Reveal from "@/components/site/Reveal";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import "./site.css";

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

const delay = (d: string) => ({ "--d": d }) as React.CSSProperties;

type Row = { level: string; status: string; icon: React.ReactNode; tone?: "wait" | "out" | "last" };

const ROWS: Row[] = [
  { level: "Bac+8", status: "Accès illimité", icon: <Verified /> },
  { level: "Bac+5", status: "Accès toléré", icon: <Partial /> },
  { level: "Bac+3", status: "Liste d’attente", icon: <Waiting size={22} />, tone: "wait" },
  { level: "Bac+2", status: "Refusé", icon: <Refused size={22} />, tone: "out" },
  { level: "Brevet", status: "Désinstallez.", icon: <Refused size={22} />, tone: "last" },
];

export default function Home() {
  return (
    <div className="site">
      <a className="skip-link" href="#postuler">
        Aller au formulaire
      </a>
      <SiteHeader applyHref="#postuler" />

      <main>
        <section className="lp-section lp-hero" aria-labelledby="hero-title">
          <div className="lp-stage" aria-hidden="true">
            <div className="lp-stage-in">
              <span className="lp-card lp-card--left">
                <span style={delay("0.1s")}>
                  <span
                    className="s-photo s-photo--lilac"
                    style={{ "--float": "5.2s", "--float-d": "1s" } as React.CSSProperties}
                  />
                </span>
              </span>
              <span className="lp-card lp-card--right">
                <span style={delay("0.18s")}>
                  <span
                    className="s-photo s-photo--sand"
                    style={{ "--float": "5.8s", "--float-d": "1.4s" } as React.CSSProperties}
                  />
                </span>
              </span>
              <span className="lp-card lp-card--main">
                <span style={delay("0.26s")}>
                  <span className="lp-float" style={{ "--float": "4.6s", "--float-d": "0.8s" } as React.CSSProperties}>
                    <span className="s-photo">
                      <span className="lp-card-tag">
                        <Verified size={16} />
                        Bac+8 · Philo
                      </span>
                    </span>
                    <span className="lp-heart">
                      <Heart size={24} />
                    </span>
                  </span>
                </span>
              </span>
            </div>
          </div>

          <div className="lp-hero-copy">
            <h1 className="s-h1" id="hero-title">
              <span className="s-mask">
                <span style={delay("0.45s")}>Pour les gens</span>
              </span>
              <span className="s-mask">
                <span className="s-serif-accent" style={delay("0.55s")}>
                  vraiment
                </span>
              </span>
              <span className="s-mask">
                <span style={delay("0.65s")}>intelligents.</span>
              </span>
            </h1>
            <p className="s-lead s-rise" style={delay("0.8s")}>
              L’application de rencontre où chaque diplôme est vérifié par un humain. Ouverture prochaine en France.
            </p>
            <div className="lp-hero-actions">
              <a id="hero-cta" className="s-btn s-rise" style={delay("0.92s")} href="#postuler">
                Rejoindre la liste d’attente
                <ArrowRight />
              </a>
              <span className="s-small s-rise" style={delay("1s")}>
                Gratuit. Un seul email, à l’ouverture.
              </span>
            </div>
          </div>
        </section>

        <div className="lp-section lp-block">
          <div className="lp-split">
            <section className="s-reveal" aria-labelledby="grille-title">
              <div className="lp-head">
                <span className="s-kicker">Grille d’admission</span>
                <h2 className="s-h2" id="grille-title">
                  Qui a le droit d’aimer ?
                </h2>
              </div>
              <ul className="lp-grid">
                {ROWS.map((row) => (
                  <li key={row.level} className={row.tone ? `is-${row.tone}` : undefined}>
                    <span className="lv">{row.level}</span>
                    <span className="st">
                      {row.status}
                      {row.icon}
                    </span>
                  </li>
                ))}
              </ul>
              <a className="s-btn s-btn--soft lp-grid-cta" href="#postuler">
                Votre niveau ? Postulez
                <ArrowRight size={18} />
              </a>
            </section>

            <section className="lp-real s-reveal" style={delay("0.08s")} aria-labelledby="vrai-title">
              <span className="s-kicker">Pour de vrai</span>
              <h2 className="s-h2" id="vrai-title">
                Le ton est ironique. La vérification, non.
              </h2>
              <ol className="lp-steps">
                <li>
                  <span className="lp-num" aria-hidden="true">
                    1
                  </span>
                  <span>Un humain vérifie votre diplôme, sous 48 h. Pas de robot, pas de tirage au sort.</span>
                </li>
                <li>
                  <span className="lp-num" aria-hidden="true">
                    2
                  </span>
                  <span>
                    Le document n’est jamais montré aux membres. Il est supprimé 30 jours après la décision.
                  </span>
                </li>
                <li>
                  <span className="lp-num" aria-hidden="true">
                    3
                  </span>
                  <span>Les profils montrent un diplôme vérifié, des photos et ce qui vous passionne.</span>
                </li>
                <li>
                  <span className="lp-num" aria-hidden="true">
                    4
                  </span>
                  <span>À l’ouverture, les inscrits de la liste entrent en premier.</span>
                </li>
              </ol>
            </section>
          </div>
        </div>

        <div className="lp-section lp-block">
          <Link className="lp-test s-reveal" href="/test">
            <span className="lp-test-copy">
              <small>En attendant</small>
              <strong>Passez le test d’admission.</strong>
              <span>3 minutes. Non scientifique. Résultat garanti.</span>
            </span>
            <span className="lp-test-go" aria-hidden="true">
              <ArrowRight />
            </span>
          </Link>
        </div>

        <section id="postuler" className="lp-section lp-block lp-apply" aria-label="Liste d’attente">
          <div className="lp-apply-card s-reveal">
            <WaitlistForm />
          </div>
        </section>
      </main>

      <SiteFooter note="Sapios décline toute responsabilité en cas de coup de foudre pour un titulaire de BTS. Les sentiments ne sont pas vérifiés." />

      <StickyApply heroId="hero-cta" formId="postuler" />
      <Reveal />
    </div>
  );
}

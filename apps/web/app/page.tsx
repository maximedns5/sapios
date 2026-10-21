import Link from "next/link";
import LevelLabel from "@/components/LevelLabel";
import FilmMotion from "@/components/landing/FilmMotion";
import WaitlistForm from "@/components/landing/WaitlistForm";
import "./landing.css";

const CHECK = <path d="M8 24 L19 35 L39 11" />;
const DASH = <path d="M9 23 H37" />;
const CROSS = <path d="M11 11 L35 35 M35 11 L11 35" />;

const ROWS = [
  { level: "Bac+8", status: "Accès illimité", icon: CHECK, struck: false },
  { level: "Bac+5", status: "Accès toléré", icon: CHECK, struck: false },
  { level: "Bac+3", status: "Liste d’attente", icon: DASH, struck: false },
  { level: "Bac", status: "Refusé", icon: CROSS, struck: true },
  { level: "Brevet", status: "Désinstallez.", icon: CROSS, struck: true },
];

export default function Home() {
  return (
    <div className="landing">
      <a className="skip-link" href="#liste">
        Aller à la liste d’attente
      </a>

      <header className="hud">
        <i className="crop tl" aria-hidden="true" />
        <i className="crop tr" aria-hidden="true" />
        <i className="crop bl" aria-hidden="true" />
        <i className="crop br" aria-hidden="true" />
        <a className="hud-logo" href="#top" aria-label="Sapios, retour en haut">
          SAPIOS<sup>®</sup>
        </a>
        <div className="hud-tr">
          <span className="hud-tc hud-dyn" aria-hidden="true">
            00:00:00:00
          </span>
          <a className="hud-cta" href="#liste">
            <span>Liste d’attente</span>
          </a>
        </div>
        <div className="hud-bl hud-dyn" aria-hidden="true">
          QI ≥ 130 — Bac+5 min.
        </div>
        <div className="hud-br hud-dyn" aria-hidden="true">
          01 / Intro
        </div>
        <i className="hud-prog hud-dyn" aria-hidden="true" />
      </header>

      <main id="top">
        <div className="film">
          {/* 01 — intro */}
          <section className="scene dark sA" aria-labelledby="sA-title">
            <div className="scene-in">
              <div className="a-wrap">
                <p className="a-label lmono">
                  <span className="mask">
                    <span>Application de rencontre</span>
                  </span>
                </p>
                <i className="a-rule" aria-hidden="true" />
                <h1 className="logo" id="sA-title">
                  <span className="sr-only">Sapios</span>
                  <span aria-hidden="true" data-split="">
                    SAPIOS
                  </span>
                </h1>
                <p className="a-tag">
                  <span className="mask">
                    <span className="t1">pour les gens</span>
                  </span>{" "}
                  <span className="mask">
                    <span className="t2">
                      vraiment
                      <i className="ul" aria-hidden="true" />
                    </span>
                  </span>{" "}
                  <span className="mask">
                    <span className="t3">intelligents.</span>
                  </span>
                </p>
              </div>
              <p className="a-hint lmono" aria-hidden="true">
                <span>Défilez. On vous évalue.</span>
                <i />
              </p>
            </div>
          </section>

          {/* 02 — vérification du diplôme */}
          <section className="scene light sB" aria-labelledby="sB-title">
            <div className="shake">
              <div className="scene-in">
                <div className="b-grid">
                  <div className="b-head">
                    <p className="b-step lmono">
                      <span>Étape 01 / 01</span>
                      <span>Vérification obligatoire</span>
                    </p>
                    <h2 className="b-title" id="sB-title">
                      <span className="mask">
                        <span>Validez votre</span>
                      </span>
                      <span className="mask">
                        <em>diplôme.</em>
                      </span>
                    </h2>
                  </div>

                  <div className="card-wrap">
                    <div
                      className="card"
                      role="img"
                      aria-label="Exemple de diplôme : licence, spécialité Communication, mention Passable."
                    >
                      <div className="c-top" aria-hidden="true">
                        <span>Université de Quelque Part</span>
                        <span>N° 0042-B</span>
                      </div>
                      <div className="c-mid" aria-hidden="true">
                        <div className="c-kicker">Diplôme national de</div>
                        <div className="c-deg">LICENCE</div>
                        <div className="c-sub">
                          Spécialité « Communication »
                          <br />
                          Mention : <em>Passable</em>
                        </div>
                      </div>
                      <div className="c-bot" aria-hidden="true">
                        <div className="seal">
                          <span>U·Q·P</span>
                        </div>
                        <div className="sign">
                          <svg viewBox="0 0 230 62">
                            <path
                              d="M6 46 C 26 6, 40 64, 62 30 S 96 8, 104 40 S 132 58, 150 22 S 186 34, 200 28 S 218 24, 226 30"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span>Le président du jury</span>
                        </div>
                      </div>
                      <div className="scan" aria-hidden="true" />
                    </div>
                    <p className="stamp">
                      <b>REFUSÉ</b>
                      <i>QI insuffisant</i>
                    </p>
                  </div>

                  <div className="b-analysis">
                    <div className="prog">
                      <div className="p-row">
                        <span className="lmono">Analyse du profil</span>
                        <span className="pct" aria-hidden="true">
                          100%
                        </span>
                      </div>
                      <div className="bar" aria-hidden="true">
                        <i />
                      </div>
                    </div>
                    <ul className="logs">
                      <li className="log">
                        <span>› Authenticité du diplôme</span>
                        <span className="dots" aria-hidden="true" />
                        <b>OK</b>
                      </li>
                      <li className="log">
                        <span>› Niveau (Bac+5 requis)</span>
                        <span className="dots" aria-hidden="true" />
                        <b className="bad">BAC+3</b>
                      </li>
                      <li className="log">
                        <span>› Comparaison avec Einstein</span>
                        <span className="dots" aria-hidden="true" />
                        <b className="bad">ÉCHEC</b>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="verdict dark">
              <div className="v-in">
                <p className="lmono">
                  <span className="mask">
                    <span>Résultat de l’analyse</span>
                  </span>
                </p>
                <p className="v1">
                  <span className="mask">
                    <span>Diplôme non validé =</span>
                  </span>
                </p>
                <p className="v2">
                  <span className="mask">
                    <em>pas assez intelligent.</em>
                  </span>
                </p>
              </div>
            </div>
            <div className="blackout" aria-hidden="true" />
          </section>

          {/* 03 — grille d'admission */}
          <section className="scene dark sC" aria-labelledby="sC-title">
            <div className="scene-in">
              <div className="c-grid">
                <div>
                  <p className="c-head lmono">
                    <span>Grille d’admission</span>
                    <span>Saison 2026</span>
                  </p>
                  <h2 className="c-title" id="sC-title">
                    <span className="mask">
                      <span>Qui a le droit</span>
                    </span>
                    <span className="mask">
                      <em>d’aimer&nbsp;?</em>
                    </span>
                  </h2>
                </div>
                <ol className="rows">
                  {ROWS.map((row, i) => (
                    <li key={row.level} className={i === ROWS.length - 1 ? "rw rw--out" : "rw"}>
                      <i className="ln" aria-hidden="true" />
                      <i className="fill" aria-hidden="true" />
                      <span className="lv">
                        <LevelLabel label={row.level} />
                        {row.struck ? <i className="strike" aria-hidden="true" /> : null}
                      </span>
                      <span className="rt">
                        <span className="st">{row.status}</span>
                        <span className="ic" aria-hidden="true">
                          <svg viewBox="0 0 46 46">{row.icon}</svg>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          {/* 04 — règle n°1 */}
          <section className="scene light sD1" aria-labelledby="sD1-title">
            <div className="scene-in">
              <p className="d-label lmono">
                <span className="mask">
                  <span>Règle n°1</span>
                </span>
              </p>
              <h2 className="d-txt" id="sD1-title">
                <span className="mask">
                  <span>Pas de</span>
                </span>
                <span className="mask">
                  <span>diplôme&nbsp;?</span>
                </span>
              </h2>
            </div>
          </section>

          <section className="scene dark sD2" aria-label="Donc : pas d’amour.">
            <div className="scene-in">
              <div className="d2-wrap">
                <p className="d-label lmono">
                  <span className="mask">
                    <span>Donc</span>
                  </span>
                </p>
                <p className="d2-txt">
                  <span className="mask">
                    <span className="d2-pas">Pas</span>
                  </span>
                  <span className="mask big">
                    <span className="sr-only">d’amour.</span>
                    <span aria-hidden="true" data-split="">
                      d’amour.
                    </span>
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* 05 — carte finale et liste d'attente */}
          <section className="scene dark sE" aria-labelledby="sE-title">
            <div className="scene-in">
              <p className="logo e-logo">
                <span className="sr-only">Sapios</span>
                <span aria-hidden="true" data-split="">
                  SAPIOS
                </span>
              </p>
              <i className="e-rule" aria-hidden="true" />
              <h2 className="e-title" id="sE-title">
                <span className="e-l1">
                  <span className="mask">
                    <span>L’amour est aveugle.</span>
                  </span>
                </span>
                <span className="e-l2">
                  <span className="mask">
                    <em>Nous, non.</em>
                  </span>
                </span>
              </h2>
              <p className="e-cta lmono">
                <span className="mask">
                  <span>Bientôt disponible</span>
                </span>
                <span className="mask">
                  <span>pour 2&nbsp;% de la population</span>
                </span>
              </p>
              <div className="e-form" id="liste">
                <WaitlistForm />
              </div>
              <p className="e-fine">
                * Sapios décline toute responsabilité en cas de coup de foudre pour un titulaire de BTS. Les
                sentiments ne sont pas vérifiés.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer dark">
        <p className="label">© 2026 Sapios — Réservé aux personnes majeures</p>
        <nav aria-label="Informations">
          <Link className="label" href="/confidentialite">
            Confidentialité
          </Link>
          <Link className="label" href="/contact">
            Contact
          </Link>
        </nav>
      </footer>

      <FilmMotion />
    </div>
  );
}

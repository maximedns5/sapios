import type { Metadata, Viewport } from "next";
import Link from "next/link";
import OfferStack from "@/components/landing/OfferStack";
import { ArrowRight, Check, Clock, EyeOff, Lock, Salary, Verified } from "@/components/site/Icons";
import Reveal from "@/components/site/Reveal";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { APP_URL, RECRUITER_PATH } from "@/lib/site";
import "./site.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

const delay = (d: string) => ({ "--d": d }) as React.CSSProperties;

// Suite d'une étape : espace insécable avant « : » (typographie française), espace simple sinon.
const joinRest = (rest: string) => (rest.startsWith(":") ? `\u00a0${rest}` : ` ${rest}`);

// Sans adresse d'application configurée, le bouton candidat mène au fonctionnement.
const candidateHref = APP_URL ?? "#comment";

const PROMISES = [
  {
    icon: <Salary />,
    title: "Salaire affiché",
    body: "Chaque offre donne sa fourchette en brut annuel. Jamais « selon profil ».",
  },
  {
    icon: <EyeOff />,
    title: "CV sans photo",
    body: "Ni nom, ni âge, ni photo avant le match : on vous choisit sur ce que vous savez faire.",
  },
  {
    icon: <Clock />,
    title: "Réponse garantie",
    body: "Chaque offre annonce un délai de réponse. À la date dite, vous savez où vous en êtes. Toujours.",
  },
];

const CANDIDATE_STEPS = [
  ["Votre diplôme est vérifié", "par une personne de l’équipe, une fois pour toutes. C’est un badge, pas une condition."],
  ["Vous swipez des offres", "avec le salaire, le lieu, le télétravail et de vraies photos du lieu de travail."],
  ["Le recruteur voit un CV anonyme", "et dit s’il est intéressé, dans le délai annoncé sur l’offre."],
  ["C’est un match", ": vous vous découvrez, la conversation s’ouvre et l’entretien se cale."],
] as const;

const RECRUITER_STEPS = [
  ["Votre entreprise est vérifiée", "par son numéro SIREN et votre email professionnel, sous 24 h ouvrées."],
  ["Vous publiez une offre", "avec sa fourchette de salaire et au moins une vraie photo du lieu de travail."],
  ["Vous triez des CV anonymes", "sur ordinateur ou en swipe, dans leur ordre d’arrivée, critères affichés."],
  ["Vous répondez dans le délai choisi", ": « Intéressé » révèle le prénom et le nom, puis vous proposez des créneaux."],
] as const;

const FAQ = [
  {
    q: "C’est vraiment gratuit pour les candidats ?",
    a: "Oui, et ça le restera. La loi interdit de faire payer une personne qui cherche un emploi (article L5321-3 du Code du travail). Aucune option payante ne vous rend plus visible, et nous ne vendons pas vos données.",
  },
  {
    q: "Faut-il un diplôme vérifié pour postuler ?",
    a: "Non. Le diplôme vérifié est un badge sur votre CV, pas une porte d’entrée. Une personne de l’équipe examine votre justificatif sous 48 h, et le document est supprimé après la décision.",
  },
  {
    q: "Que voit le recruteur avant le match ?",
    a: "Un numéro, votre poste visé, votre diplôme, vos expériences en durées, vos compétences, vos langues, vos prétentions et votre zone de recherche. Jamais votre prénom, votre nom, votre âge, votre genre, votre adresse ni de photo. Au match, il reçoit votre prénom et votre nom, rien d’autre.",
  },
  {
    q: "Et si l’entreprise ne répond pas ?",
    a: "À la date annoncée, la candidature passe en « Close sans réponse de l’entreprise ». Ce n’est pas un refus, et le retard est compté dans le délai de réponse moyen affiché sur la page de l’entreprise.",
  },
  {
    q: "Une intelligence artificielle trie-t-elle les candidatures ?",
    a: "Non. Trois règles fixes décident de l’ordre d’affichage, et chaque réponse est donnée par une personne. Elles sont publiées sur la page « Comment nous classons ».",
  },
  {
    q: "Comment une entreprise est-elle vérifiée ?",
    a: "Son numéro SIREN doit correspondre à une entreprise active dans la base Sirene de l’Insee, le recruteur doit confirmer une adresse email sur le domaine de l’entreprise, et une personne de l’équipe relit le dossier.",
  },
  {
    q: "Quels postes pendant le pilote ?",
    a: "Des CDI et des CDD pour les diplômés de Bac+3 à Bac+5 en début de parcours, à Paris, dans quelques familles de métiers. Pas de stage, d’alternance ni d’intérim pour l’instant.",
  },
  {
    q: "Où sont mes données ?",
    a: "La base de données et les fichiers sont hébergés dans l’Union européenne, à Francfort. La liste des prestataires et des durées de conservation figure dans la politique de confidentialité.",
  },
];

export default function Home() {
  return (
    <div className="site">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <SiteHeader />

      <main id="contenu">
        <section className="lp-section lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <span className="s-kicker s-rise" style={delay("0.05s")}>
              Pour les diplômés Bac+3 à Bac+5 et ceux qui les recrutent
            </span>
            <h1 className="s-h1" id="hero-title">
              <span className="s-mask">
                <span style={delay("0.12s")}>Recrutement</span>
              </span>
              <span className="s-mask">
                <span style={delay("0.22s")}>à l’aveugle,</span>
              </span>
              <span className="s-mask">
                <span style={delay("0.32s")}>
                  diplôme <span className="lp-accent">vérifié.</span>
                </span>
              </span>
            </h1>
            <p className="s-lead s-rise" style={delay("0.5s")}>
              Vous choisissez des postes, salaire affiché. Les recruteurs choisissent des CV, sans photo ni nom. Vous vous
              découvrez au match, puis l’entretien se cale.
            </p>
            <div className="lp-hero-actions s-rise" style={delay("0.62s")}>
              <a className="s-btn" href={candidateHref}>
                Je cherche un emploi
                <ArrowRight />
              </a>
              <Link className="s-btn s-btn--soft" href={RECRUITER_PATH}>
                Je recrute
              </Link>
            </div>
            <p className="s-small s-rise" style={delay("0.72s")}>
              Gratuit pour les candidats. Pilote à Paris, en CDI et CDD.
            </p>
          </div>
          <OfferStack />
        </section>

        <section className="lp-section lp-block" aria-labelledby="promesses-title">
          <h2 className="s-h2 s-reveal" id="promesses-title">
            Trois promesses, tenues
          </h2>
          <ul className="lp-promises">
            {PROMISES.map((p, i) => (
              <li key={p.title} className="lp-promise s-reveal" style={delay(`${0.06 * i}s`)}>
                <span className="lp-promise-icon" aria-hidden="true">
                  {p.icon}
                </span>
                <span className="lp-promise-copy">
                  <strong>{p.title}</strong>
                  <span>{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="comment" className="lp-section lp-block" aria-labelledby="comment-title">
          <div className="lp-head s-reveal">
            <span className="s-kicker">Comment ça marche</span>
            <h2 className="s-h2" id="comment-title">
              Deux côtés, les mêmes règles
            </h2>
          </div>
          <div className="lp-sides">
            <div className="lp-side s-reveal" id="candidats">
              <h3>Si vous cherchez un emploi</h3>
              <ol className="lp-steps">
                {CANDIDATE_STEPS.map(([title, rest], i) => (
                  <li key={title}>
                    <span className={i === CANDIDATE_STEPS.length - 1 ? "lp-num is-on" : "lp-num"} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>
                      <strong>{title}</strong>
                      {joinRest(rest)}
                    </span>
                  </li>
                ))}
              </ol>
              <a className="s-btn s-btn--block" href={candidateHref}>
                Je cherche un emploi
                <ArrowRight size={18} />
              </a>
            </div>
            <div className="lp-side s-reveal" style={delay("0.08s")}>
              <h3>Si vous recrutez</h3>
              <ol className="lp-steps">
                {RECRUITER_STEPS.map(([title, rest], i) => (
                  <li key={title}>
                    <span className={i === RECRUITER_STEPS.length - 1 ? "lp-num is-on" : "lp-num"} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>
                      <strong>{title}</strong>
                      {joinRest(rest)}
                    </span>
                  </li>
                ))}
              </ol>
              <Link className="s-btn s-btn--soft s-btn--block" href={RECRUITER_PATH}>
                Ouvrir l’espace recruteur
              </Link>
            </div>
          </div>
        </section>

        <section className="lp-section lp-block" aria-labelledby="anonyme-title">
          <div className="lp-split">
            <div className="lp-head s-reveal">
              <span className="s-kicker">Avant le match</span>
              <h2 className="s-h2" id="anonyme-title">
                Ce que voit le recruteur
              </h2>
              <p className="s-lead">
                Un numéro et ce que vous savez faire. Votre prénom et votre nom n’apparaissent qu’après son « Intéressé ».
                Aucune machine ne trie à sa place.
              </p>
              <Link className="lp-text-link" href="/comment-nous-classons">
                Lire nos règles de classement
                <ArrowRight size={18} />
              </Link>
            </div>
            <figure className="lp-cv s-reveal" style={delay("0.08s")} aria-label="Exemple de CV anonyme">
              <div className="lp-cv-head">
                <span className="lp-cv-lock" aria-hidden="true">
                  <Lock size={18} />
                </span>
                <span>
                  <strong>Candidat·e n° 0427</strong>
                  <span>Data analyst · disponible en janvier</span>
                </span>
              </div>
              <p className="lp-cv-badge">
                <Verified size={18} />
                Diplôme vérifié · Bac+5 · Économétrie
              </p>
              <ul className="lp-cv-chips" aria-label="Compétences">
                <li>Python</li>
                <li>SQL</li>
                <li>Power BI</li>
                <li>A/B tests</li>
              </ul>
              <dl className="lp-cv-facts">
                <div>
                  <dt>Expérience</dt>
                  <dd>1 à 3 ans</dd>
                </div>
                <div>
                  <dt>Prétentions</dt>
                  <dd>40–46 k€ brut/an</dd>
                </div>
                <div>
                  <dt>Cherche à</dt>
                  <dd>Paris, 20 km</dd>
                </div>
              </dl>
              <ul className="lp-cv-hidden" aria-label="Caché jusqu’au match">
                <li>Prénom</li>
                <li>Nom</li>
                <li>Âge</li>
                <li>Genre</li>
                <li>Adresse</li>
              </ul>
              <figcaption className="s-small">Exemple fictif. Caché jusqu’au match : prénom, nom, âge, genre, adresse.</figcaption>
            </figure>
          </div>
        </section>

        <section id="recruteurs" className="lp-section lp-block" aria-labelledby="recruteurs-title">
          <div className="lp-recruit s-reveal">
            <span className="s-kicker">Pour les recruteurs</span>
            <h2 className="s-h2" id="recruteurs-title">
              Des diplômes vérifiés, des choix sans biais.
            </h2>
            <ul className="lp-checks">
              <li>
                <Check size={18} />
                Chaque diplôme affiché est contrôlé par une personne avant que le CV ne vous parvienne.
              </li>
              <li>
                <Check size={18} />
                Des candidatures triées par vous, sur ordinateur ou en swipe, sans score ni reclassement.
              </li>
              <li>
                <Check size={18} />
                Votre entreprise est vérifiée : vos offres inspirent confiance, vos délais de réponse se voient.
              </li>
            </ul>
            <Link className="s-btn" href={RECRUITER_PATH}>
              Rejoindre le pilote recruteurs
              <ArrowRight />
            </Link>
            <p className="s-small">Gratuit pendant le pilote, à Paris. Les candidats ne paient jamais.</p>
          </div>
        </section>

        <section className="lp-section lp-block lp-faq-wrap" aria-labelledby="faq-title">
          <h2 className="s-h2 s-reveal" id="faq-title">
            Questions fréquentes
          </h2>
          <div className="lp-faq s-reveal">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <span className="lp-faq-plus" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
      <Reveal />
    </div>
  );
}

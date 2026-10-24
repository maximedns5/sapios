import type { Metadata, Viewport } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Comment nous classons",
  description:
    "Les règles fixes qui décident de l’ordre des offres et des candidatures sur Sapios Emploi, sans intelligence artificielle, et ce que voit un recruteur avant et après le match.",
  alternates: { canonical: "/comment-nous-classons" },
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function CommentNousClassonsPage() {
  return (
    <LegalShell
      label="Transparence"
      title={
        <>
          Comment nous <em>classons</em>
        </>
      }
      intro={
        <p>
          Aucune intelligence artificielle ne trie les offres ni les candidatures. Quelques règles fixes, écrites par
          l’équipe et publiées ici, décident seulement de l’ordre d’affichage. Chaque réponse à une candidature est
          donnée par une personne.
        </p>
      }
    >
      <section aria-labelledby="offres">
        <h2 id="offres">
          <span className="label">01</span>Les offres que vous voyez
        </h2>
        <p>Une offre vous est montrée si toutes ces conditions sont remplies :</p>
        <ul>
          <li>elle est publiée, après relecture par l’équipe, et n’a pas expiré (60 jours au plus) ;</li>
          <li>l’entreprise qui la publie est vérifiée ;</li>
          <li>son lieu est à moins du rayon que vous avez choisi, mesuré à vol d’oiseau depuis le centre de votre ville de recherche ;</li>
          <li>son contrat fait partie de ceux que vous cherchez (CDI, CDD) ;</li>
          <li>vous ne l’avez ni passée, ni déjà postulée.</li>
        </ul>
        <p>Elles sont ensuite rangées dans cet ordre :</p>
        <ol className="rules-list">
          <li>
            <span className="lp-num" aria-hidden="true">
              1
            </span>
            <span>le nombre de correspondances avec votre CV, du plus grand au plus petit ;</span>
          </li>
          <li>
            <span className="lp-num" aria-hidden="true">
              2
            </span>
            <span>puis la date de publication, la plus récente d’abord ;</span>
          </li>
          <li>
            <span className="lp-num" aria-hidden="true">
              3
            </span>
            <span>puis la distance, la plus courte d’abord.</span>
          </li>
        </ol>
      </section>

      <section aria-labelledby="correspondances">
        <h2 id="correspondances">
          <span className="label">02</span>Les correspondances
        </h2>
        <p>
          Chaque offre liste au plus trois critères « indispensables » et quelques critères « appréciés ». Pour chacun,
          nous indiquons s’il est rempli par votre CV, sans calcul caché :
        </p>
        <ul>
          <li>
            un critère du type « Bac+5 » n’est rempli que par un diplôme vérifié de ce niveau ou plus ; une
            compétence citée dans le critère ne suffit pas ;
          </li>
          <li>
            tout autre critère est rempli si l’une de vos compétences ou de vos langues y figure, en mot entier, sans
            tenir compte des majuscules, des accents ni de la ponctuation : « SQL » remplit « Maîtrise de SQL »,
            pas « MySQL » ; le niveau d’une langue n’est pas comparé ;
          </li>
          <li>il n’y a ni note globale, ni pourcentage de compatibilité.</li>
        </ul>
        <p>
          Sur la carte d’une offre, la ligne « Vous avez déjà » montre les critères remplis. Le recruteur voit la même
          liste, critère par critère.
        </p>
      </section>

      <section aria-labelledby="recruteur">
        <h2 id="recruteur">
          <span className="label">03</span>L’ordre chez le recruteur
        </h2>
        <p>
          Les candidatures arrivent chez l’entreprise dans leur ordre d’envoi, la plus ancienne d’abord. Rien d’autre :
          ni score, ni reclassement. Un critère indispensable manquant est signalé au recruteur, mais n’écarte jamais
          une candidature.
        </p>
        <p>
          Chaque offre annonce un délai de réponse de 3, 7 ou 10 jours. Si l’entreprise n’a pas répondu à la date dite,
          la candidature passe en « Close sans réponse de l’entreprise ». Ce n’est pas un refus : aucune décision n’a
          été prise sur votre profil, et le retard est compté dans le délai de réponse moyen affiché de l’entreprise.
        </p>
      </section>

      <section aria-labelledby="approche">
        <h2 id="approche">
          <span className="label">04</span>L’approche directe
        </h2>
        <p>
          Si vous activez « Ouvert·e aux opportunités », désactivé par défaut, une entreprise vérifiée peut voir votre
          CV anonyme et vous inviter à postuler à l’une de ses offres publiées, avec sa fourchette de salaire.
        </p>
        <ul>
          <li>vous apparaissez seulement si votre zone de recherche couvre le lieu de l’offre ;</li>
          <li>le recruteur ne peut filtrer que sur le niveau de diplôme et une compétence ;</li>
          <li>les profils sont rangés par date d’activation de l’option, les plus récents d’abord ;</li>
          <li>vous pouvez masquer votre profil à une entreprise précise, par exemple votre employeur actuel.</li>
        </ul>
      </section>

      <section aria-labelledby="voit">
        <h2 id="voit">
          <span className="label">05</span>Ce que voit le recruteur
        </h2>
        <div className="rules-compare">
          <div>
            <h3>Avant le match</h3>
            <ul>
              <li>un numéro, par exemple « n° 0427 » ;</li>
              <li>le poste visé et la tranche d’expérience ;</li>
              <li>le badge du diplôme : niveau, domaine, et l’établissement si vous l’affichez ;</li>
              <li>les deux expériences les plus récentes, en durée, jamais en dates ;</li>
              <li>compétences, langues, prétentions, disponibilité ;</li>
              <li>zone de recherche, télétravail souhaité, autorisation de travail ;</li>
              <li>votre réponse à « Ce que je cherche » et votre mot.</li>
            </ul>
          </div>
          <div>
            <h3>Après son « Intéressé »</h3>
            <ul>
              <li>votre prénom et votre nom, en plus ;</li>
              <li>la messagerie s’ouvre dans Sapios.</li>
            </ul>
            <h3 style={{ marginTop: 14 }}>Jamais</h3>
            <ul>
              <li>votre âge, votre genre, votre adresse, votre email ;</li>
              <li>une photo de vous : nous n’en demandons pas.</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="jamais">
        <h2 id="jamais">
          <span className="label">06</span>Ce qui ne change jamais l’ordre
        </h2>
        <ul>
          <li>un paiement : pendant le pilote, aucune mise en avant payante n’existe ; si elle venait, l’offre porterait la mention « Mise en avant » ;</li>
          <li>votre âge, votre genre, votre origine ou votre adresse, que nous ne connaissons pas ou ne montrons pas ;</li>
          <li>une analyse de texte, de voix ou d’image : nous n’en faisons aucune.</li>
        </ul>
        <p>
          Toute modification de ces règles est annoncée au moins 15 jours avant son entrée en vigueur, comme le
          prévoient les <Link href="/cgu">CGU candidats</Link> et les{" "}
          <Link href="/conditions-recruteurs">conditions générales recruteurs</Link>.
        </p>
      </section>
    </LegalShell>
  );
}

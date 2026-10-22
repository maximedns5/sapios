import type { Metadata, Viewport } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Données traitées par Sapios, finalités, sous-traitants, durées de conservation et droits.",
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function ConfidentialitePage() {
  return (
    <LegalShell
      label={`Mise à jour : ${SITE.privacyUpdatedAt}`}
      title={
        <>
          Politique de <em>confidentialité</em>
        </>
      }
      intro={
        <p>
          Le ton de Sapios est volontairement excessif. Le traitement de vos données, lui, ne l’est pas. Cette page
          décrit ce que nous collectons, pourquoi, avec qui, pour combien de temps, et comment exercer vos droits.
        </p>
      }
    >
      <section aria-labelledby="qui">
        <h2 id="qui">
          <span className="label">01</span>Responsable du traitement
        </h2>
        <p>
          Sapios, éditeur de l’application mobile et de ce site, est responsable des traitements décrits ici.
          Pour toute question relative à vos données :{" "}
          <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. Pour tout autre sujet, voir la page{" "}
          <Link href="/contact">Contact</Link>.
        </p>
        <p>Le service est réservé aux personnes majeures. L’âge est contrôlé à l’inscription, côté serveur.</p>
      </section>

      <section aria-labelledby="donnees">
        <h2 id="donnees">
          <span className="label">02</span>Données traitées
        </h2>
        <h3>Liste d’attente (ce site)</h3>
        <ul>
          <li>Adresse email, provenance de l’inscription (page d’accueil ou test d’admission) et date.</li>
          <li>
            Si vous les indiquez : niveau de diplôme déclaré et ville. Ils servent seulement à préparer l’ouverture,
            ville par ville ; le niveau n’est pas vérifié à ce stade.
          </li>
        </ul>
        <h3>Test d’admission (ce site)</h3>
        <ul>
          <li>
            Aucune donnée : le test se déroule entièrement dans votre navigateur, vos réponses ne sont ni envoyées
            ni enregistrées.
          </li>
        </ul>
        <h3>Compte et profil (application)</h3>
        <ul>
          <li>Email ou identifiant Apple / Google utilisé pour se connecter.</li>
          <li>Nom légal et date de naissance, saisis une fois, non visibles des autres membres.</li>
          <li>
            Prénom affiché, photos, biographie, ville, genre, genres recherchés, tranche d’âge recherchée.
          </li>
          <li>Position approximative, arrondie à environ 1 km ; les autres membres ne voient qu’une distance.</li>
        </ul>
        <h3>Vérification du diplôme</h3>
        <ul>
          <li>Le document envoyé (photo ou PDF).</li>
          <li>
            Les informations qui en sont extraites : titulaire, établissement, intitulé, année, mention, niveau
            estimé, ainsi qu’une empreinte du fichier servant à détecter les doublons.
          </li>
          <li>Le niveau validé (de 1 à 8) et le palier d’accès qui en découle.</li>
        </ul>
        <h3>Utilisation du service</h3>
        <ul>
          <li>Likes, matchs, messages, blocages, signalements et décisions de modération.</li>
          <li>Jetons de notification de votre appareil.</li>
        </ul>
      </section>

      <section aria-labelledby="sensibles">
        <h2 id="sensibles">
          <span className="label">03</span>Données sensibles
        </h2>
        <p>
          Les genres que vous recherchez peuvent révéler votre orientation sexuelle, une catégorie particulière de
          données au sens de l’article 9 du RGPD. Nous ne les traitons qu’avec votre consentement explicite,
          recueilli séparément dans l’application, et uniquement pour vous proposer des profils compatibles.
        </p>
        <p>
          Vous pouvez retirer ce consentement à tout moment depuis l’application. Sans lui, la mise en relation
          n’est plus possible ; le retrait ne remet pas en cause les traitements effectués auparavant.
        </p>
      </section>

      <section aria-labelledby="finalites">
        <h2 id="finalites">
          <span className="label">04</span>Finalités et bases légales
        </h2>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Finalité</th>
              <th scope="col">Base légale</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vous prévenir du lancement (liste d’attente)</td>
              <td>Consentement</td>
            </tr>
            <tr>
              <td>Créer le compte, afficher le profil, proposer des profils, permettre les échanges</td>
              <td>Exécution du contrat</td>
            </tr>
            <tr>
              <td>Vérifier le diplôme, condition d’accès au service</td>
              <td>Exécution du contrat</td>
            </tr>
            <tr>
              <td>Traiter les genres recherchés</td>
              <td>Consentement explicite (art. 9.2.a RGPD)</td>
            </tr>
            <tr>
              <td>Modération, sécurité, lutte contre la fraude et les abus</td>
              <td>Intérêt légitime et obligations légales</td>
            </tr>
            <tr>
              <td>Notifications push</td>
              <td>Consentement, géré par les réglages de votre appareil</td>
            </tr>
            <tr>
              <td>Emails de service : code de connexion, verdict du diplôme, nouveau match</td>
              <td>Exécution du contrat</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="ia">
        <h2 id="ia">
          <span className="label">05</span>Vérification du diplôme et intelligence artificielle
        </h2>
        <p>
          Le document est déposé dans un espace de stockage privé, inaccessible aux autres membres. Lorsque
          l’extraction automatique est activée, un modèle d’intelligence artificielle en extrait les informations
          utiles et signale d’éventuelles incohérences ; sinon, la vérification est entièrement manuelle. Le modèle
          ne fait que proposer : chaque décision (validation, refus, demande de complément) est prise par un
          modérateur humain. Aucune décision produisant des effets à votre égard n’est fondée exclusivement sur un
          traitement automatisé.
        </p>
        <p>
          Les modérateurs consultent le document par des liens temporaires valables cinq minutes. Chaque décision
          est journalisée.
        </p>
      </section>

      <section aria-labelledby="sous-traitants">
        <h2 id="sous-traitants">
          <span className="label">06</span>Sous-traitants
        </h2>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Prestataire</th>
              <th scope="col">Rôle</th>
              <th scope="col">Données concernées</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Hébergement de la base de données, authentification, stockage des fichiers (région Union européenne)</td>
              <td>Ensemble des données du service</td>
            </tr>
            <tr>
              <td>Anthropic</td>
              <td>Extraction des informations du diplôme par un modèle d’IA, uniquement lorsque l’extraction automatique est activée</td>
              <td>Document du diplôme et informations qu’il contient</td>
            </tr>
            <tr>
              <td>Expo</td>
              <td>Acheminement des notifications push vers Apple (APNs) et Google (FCM)</td>
              <td>Jeton de l’appareil, contenu de la notification</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Envoi des emails de service : code de connexion, verdict, nouveau match (région Union européenne)</td>
              <td>Adresse email, prénom affiché, contenu de l’email</td>
            </tr>
          </tbody>
        </table>
        <p>
          Chaque prestataire est lié par un accord de traitement des données. Lorsque des données sont traitées hors
          de l’Union européenne, le transfert est encadré par les clauses contractuelles types de la Commission
          européenne.
        </p>
      </section>

      <section aria-labelledby="conservation">
        <h2 id="conservation">
          <span className="label">07</span>Durées de conservation
        </h2>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Donnée</th>
              <th scope="col">Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fichier du diplôme</td>
              <td>Supprimé 30 jours après la décision du modérateur</td>
            </tr>
            <tr>
              <td>Niveau validé, établissement, année, empreinte du fichier</td>
              <td>Jusqu’à la suppression du compte</td>
            </tr>
            <tr>
              <td>Compte, profil, photos, messages, jetons de notification</td>
              <td>Jusqu’à la suppression du compte, effective et en cascade sur les fichiers</td>
            </tr>
            <tr>
              <td>Journal des décisions de modération</td>
              <td>Conservé après la suppression du compte, sans le document, pour la traçabilité des décisions</td>
            </tr>
            <tr>
              <td>Liste d’attente</td>
              <td>Jusqu’au lancement du service, ou jusqu’à votre désinscription</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="droits">
        <h2 id="droits">
          <span className="label">08</span>Vos droits
        </h2>
        <p>Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité, ainsi que du droit de retirer votre consentement et de définir des directives sur le sort de vos données après votre décès.</p>
        <ul>
          <li>
            <strong>Export</strong> : l’application fournit une copie de vos données au format JSON.
          </li>
          <li>
            <strong>Suppression</strong> : la suppression du compte depuis l’application efface le profil, les
            photos, les soumissions de diplôme et les jetons de notification.
          </li>
          <li>
            <strong>Nom légal et date de naissance</strong> : ils ne sont modifiables que sur demande, après
            vérification.
          </li>
        </ul>
        <div className="legal-callout">
          <p>
            Pour toute demande : <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. Réponse sous un
            mois. Vous pouvez aussi saisir la CNIL (cnil.fr).
          </p>
        </div>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">
          <span className="label">09</span>Cookies
        </h2>
        <p>
          Ce site ne dépose ni cookie publicitaire ni traceur de mesure d’audience. Seul l’espace de modération
          utilise des cookies de session strictement nécessaires à la connexion.
        </p>
      </section>
    </LegalShell>
  );
}

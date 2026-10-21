import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default function AccessDenied({ email, reason }: { email: string | null; reason: "forbidden" | "unavailable" }) {
  const forbidden = reason === "forbidden";
  return (
    <div className="gate dark">
      <header className="gate-top">
        <Link href="/" className="adm-brand" aria-label="Sapios, accueil">
          <b>
            SAPIOS<sup>®</sup>
          </b>
        </Link>
        <span className="label">{forbidden ? "Erreur 403" : "Erreur 503"}</span>
      </header>
      <main className="gate-main">
        <p className="label">Back-office</p>
        <h1>
          Accès <em>{forbidden ? "refusé." : "suspendu."}</em>
        </h1>
        {forbidden ? (
          <p className="lead">
            Votre diplôme est peut-être excellent. Votre badge, lui, ne mentionne pas la modération. Cet espace est
            réservé à l’équipe Sapios.
          </p>
        ) : (
          <p className="lead">
            Impossible de vérifier vos droits pour l’instant : la base ne répond pas comme prévu. Réessayez dans un
            instant.
          </p>
        )}
        {email ? (
          <p className="notice notice--outline" style={{ marginTop: 24 }}>
            <span className="label">Connecté</span>
            <span>{email}</span>
          </p>
        ) : null}
        <div className="form-actions" style={{ marginTop: 24 }}>
          <SignOutButton className="btn" label="Changer de compte" />
          <Link className="btn btn--ghost" href="/">
            Retour à l’accueil
          </Link>
        </div>
      </main>
      <footer className="gate-foot">
        <p className="label">Aucune dérogation. Même pour un doctorat.</p>
      </footer>
    </div>
  );
}

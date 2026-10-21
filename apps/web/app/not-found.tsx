import Link from "next/link";

export default function NotFound() {
  return (
    <main className="dark" style={{ minHeight: "100svh", display: "grid", placeContent: "center", gap: 20, padding: "48px var(--gutter)", textAlign: "center" }}>
      <p className="label">Erreur 404</p>
      <h1 className="serif" style={{ fontSize: "clamp(48px, 12vw, 120px)", lineHeight: 1 }}>
        Page <em>non admise.</em>
      </h1>
      <p style={{ fontSize: 18 }}>Elle n’a pas le niveau requis. Ou elle n’existe pas.</p>
      <p>
        <Link className="btn" href="/">
          Retour à l’accueil
        </Link>
      </p>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "otp";
type Step = "email" | "code";

export default function LoginForm({ linkError = false }: { linkError?: boolean }) {
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "Lien de connexion invalide ou expiré. Demandez-en un nouveau." : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  // Déjà connecté : on file vers le back-office (la garde serveur tranchera).
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) router.replace("/admin");
      });
  }, [router]);

  function done() {
    router.replace("/admin");
    router.refresh();
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError("Identifiants refusés. Vérifiez l’email et le mot de passe.");
      return;
    }
    done();
  }

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError("Envoi impossible. Ce compte existe-t-il ? Réessayez dans une minute.");
      return;
    }
    setStep("code");
    setInfo(`Email envoyé à ${email.trim()} : saisissez le code, ou suivez le lien qu’il contient. Valable une heure.`);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setError("Code invalide ou expiré.");
      return;
    }
    done();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("email");
    setError(null);
    setInfo(null);
  }

  return (
    <div className="gate dark">
      <header className="gate-top">
        <Link href="/" className="adm-brand" aria-label="Sapios, accueil">
          <b>
            SAPIOS<sup>®</sup>
          </b>
        </Link>
        <span className="label">Back-office</span>
      </header>
      <main className="gate-main">
        <p className="label">Modération</p>
        <h1>
          Identifiez-<em>vous.</em>
        </h1>
        <p className="lead">Espace réservé à l’équipe. Les membres passent par l’application.</p>

        <div className="gate-form">
          <div className="seg" role="group" aria-label="Méthode de connexion">
            <button type="button" aria-pressed={mode === "password"} onClick={() => switchMode("password")}>
              Mot de passe
            </button>
            <button type="button" aria-pressed={mode === "otp"} onClick={() => switchMode("otp")}>
              Code par email
            </button>
          </div>

          {mode === "password" ? (
            <form className="gate-form" style={{ marginTop: 0 }} onSubmit={onPassword}>
              <div className="field">
                <label className="label" htmlFor={`${id}-email`}>
                  Email
                </label>
                <input
                  id={`${id}-email`}
                  className="input"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-pw`}>
                  Mot de passe
                </label>
                <input
                  id={`${id}-pw`}
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Vérification…" : "Entrer"}
              </button>
            </form>
          ) : step === "email" ? (
            <form className="gate-form" style={{ marginTop: 0 }} onSubmit={onSendCode}>
              <div className="field">
                <label className="label" htmlFor={`${id}-otp-email`}>
                  Email
                </label>
                <input
                  id={`${id}-otp-email`}
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Envoi…" : "Recevoir un code"}
              </button>
            </form>
          ) : (
            <form className="gate-form" style={{ marginTop: 0 }} onSubmit={onVerify}>
              <div className="field">
                <label className="label" htmlFor={`${id}-code`}>
                  Code à 6 chiffres (ou suivez le lien de l’email)
                </label>
                <input
                  id={`${id}-code`}
                  className="input otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="form-actions">
                <button className="btn" type="submit" disabled={busy || code.length !== 6}>
                  {busy ? "Vérification…" : "Valider le code"}
                </button>
                <button type="button" className="adm-link" onClick={() => setStep("email")}>
                  Changer d’email
                </button>
              </div>
            </form>
          )}

          <div aria-live="polite">
            {error ? (
              <p className="notice">
                <span className="label">Refusé</span>
                <span>{error}</span>
              </p>
            ) : info ? (
              <p className="notice notice--outline">
                <span className="label">Envoyé</span>
                <span>{info}</span>
              </p>
            ) : null}
          </div>
        </div>
      </main>
      <footer className="gate-foot">
        <Link className="label" href="/">
          ← Retour au site
        </Link>
      </footer>
    </div>
  );
}

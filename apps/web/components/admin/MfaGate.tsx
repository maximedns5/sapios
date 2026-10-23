"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { MFA_MESSAGES, verifiedFactors } from "@/lib/admin/mfa";
import SignOutButton from "./SignOutButton";
import TotpEnroll from "./TotpEnroll";

/**
 * Seconde étape de connexion au back-office. Sans application enregistrée : enrôlement ; sinon,
 * code à 6 chiffres. La session passe alors en aal2, seul niveau accepté par `public.is_admin()`.
 */
export default function MfaGate({ email, mode }: { email: string; mode: "enroll" | "challenge" }) {
  const id = useId();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "challenge") return;
    verifiedFactors(createClient())
      .then((list) => setFactorId(list[0]?.id ?? null))
      .catch(() => setError(MFA_MESSAGES.generic));
  }, [mode]);

  function done() {
    router.replace("/admin");
    router.refresh();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      setError(MFA_MESSAGES.invalid);
      setCode("");
      return;
    }
    done();
  }

  return (
    <div className="gate dark">
      <header className="gate-top">
        <Link href="/" className="adm-brand" aria-label="Sapios, accueil">
          <b>
            SAPIOS<sup>®</sup>
          </b>
        </Link>
        <span className="label">Double authentification</span>
      </header>
      <main className="gate-main">
        <p className="label">Back-office · étape 2 sur 2</p>
        {mode === "enroll" ? (
          <>
            <h1>
              Un second <em>verrou.</em>
            </h1>
            <p className="lead">
              Le back-office donne accès aux diplômes et aux signalements. Il exige désormais un code à 6 chiffres
              généré par votre téléphone, en plus de l’email. À faire une seule fois par appareil.
            </p>
            <div className="gate-form">
              <TotpEnroll onDone={done} />
            </div>
          </>
        ) : (
          <>
            <h1>
              Votre <em>code.</em>
            </h1>
            <p className="lead">Ouvrez votre application d’authentification et saisissez le code affiché pour Sapios.</p>
            <form className="gate-form" onSubmit={verify}>
              <div className="field">
                <label className="label" htmlFor={`${id}-code`}>
                  Code à 6 chiffres
                </label>
                <input
                  id={`${id}-code`}
                  className="input otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <button className="btn" type="submit" disabled={busy || !factorId || code.length !== 6}>
                {busy ? "Vérification…" : "Entrer"}
              </button>
              <div aria-live="polite">
                {error ? (
                  <p className="notice">
                    <span className="label">Refusé</span>
                    <span>{error}</span>
                  </p>
                ) : null}
              </div>
            </form>
            <p className="notice notice--outline" style={{ marginTop: 24 }}>
              <span className="label">Téléphone perdu</span>
              <span>
                Le propriétaire du projet supprime l’application enregistrée dans Supabase (Authentication → Users →
                votre compte → facteurs MFA). Vous pourrez alors en enregistrer une nouvelle.
              </span>
            </p>
          </>
        )}
        <p className="notice notice--outline" style={{ marginTop: 24 }}>
          <span className="label">Connecté</span>
          <span>{email}</span>
        </p>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <SignOutButton className="adm-link" label="Changer de compte" />
        </div>
      </main>
      <footer className="gate-foot">
        <p className="label">Un diplôme se vérifie une fois. Vous, à chaque connexion.</p>
      </footer>
    </div>
  );
}

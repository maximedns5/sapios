"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Gate from "./Gate";

type Step = "email" | "code" | "password";

// Connexion et création de compte recruteur : code à 6 chiffres ou lien reçu par email (comme le back-office).
// Le mot de passe n'existe que pour les comptes de test (NEXT_PUBLIC_RECRUITER_PASSWORD_LOGIN).
export default function RecruiterLogin({ linkError, allowPassword }: { linkError: boolean; allowPassword: boolean }) {
  const id = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "Lien de connexion invalide ou expiré. Demandez-en un nouveau." : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  function done() {
    router.replace("/recruteur");
    router.refresh();
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/recruteur/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError("Envoi impossible pour le moment. Vérifiez l’adresse et réessayez dans une minute.");
      return;
    }
    setStep("code");
    setInfo(`Email envoyé à ${email.trim()} : saisissez le code, ou suivez le lien qu’il contient. Valable une heure.`);
  }

  async function verify(e: FormEvent) {
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

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError("Identifiants refusés.");
      return;
    }
    done();
  }

  return (
    <Gate>
      <div>
        <p className="rec-eyebrow">Espace recruteur</p>
        <h1>Recrutez sur le diplôme et les compétences, pas sur la photo.</h1>
        <p className="rec-lead">
          Utilisez votre adresse email professionnelle, sur le domaine de votre entreprise : elle sert à vérifier
          que vous la représentez.
        </p>
      </div>

      {step === "email" ? (
        <form className="field" onSubmit={sendCode}>
          <label className="field-label" htmlFor={`${id}-email`}>
            Email professionnel
          </label>
          <input
            id={`${id}-email`}
            className="input"
            type="email"
            autoComplete="email"
            placeholder="prenom.nom@entreprise.fr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn--accent btn--lg" type="submit" disabled={busy}>
            {busy ? "Envoi…" : "Recevoir un code"}
          </button>
          {allowPassword ? (
            <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setStep("password")}>
              Compte de test : mot de passe
            </button>
          ) : null}
        </form>
      ) : step === "code" ? (
        <form className="field" onSubmit={verify}>
          <label className="field-label" htmlFor={`${id}-code`}>
            Code à 6 chiffres
          </label>
          <input
            id={`${id}-code`}
            className="input siren-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <div className="row">
            <button className="btn btn--accent btn--lg" type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Vérification…" : "Valider"}
            </button>
            <button type="button" className="link" onClick={() => setStep("email")}>
              Changer d’email
            </button>
          </div>
        </form>
      ) : (
        <form className="field" onSubmit={withPassword}>
          <label className="field-label" htmlFor={`${id}-pemail`}>
            Email
          </label>
          <input
            id={`${id}-pemail`}
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="field-label" htmlFor={`${id}-pw`}>
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
          <div className="row">
            <button className="btn btn--accent btn--lg" type="submit" disabled={busy}>
              {busy ? "Vérification…" : "Entrer"}
            </button>
            <button type="button" className="link" onClick={() => setStep("email")}>
              Code par email
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite">
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : info ? (
          <p className="alert alert--ok">{info}</p>
        ) : null}
      </div>

      <p className="hint">
        Vous cherchez un emploi ? Les candidats passent par l’application. En continuant, vous recevrez les
        conditions recruteurs à accepter. <Link href="/confidentialite">Confidentialité</Link>
      </p>
    </Gate>
  );
}

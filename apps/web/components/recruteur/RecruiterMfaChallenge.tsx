"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { MFA_MESSAGES, verifiedFactors } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/client";
import { SITE } from "@/lib/site";
import Gate from "./Gate";
import SignOutButton from "./SignOutButton";

/** Seconde étape de connexion d'un recruteur qui a activé la double authentification : la session passe en aal2. */
export default function RecruiterMfaChallenge({ email }: { email: string }) {
  const id = useId();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifiedFactors(createClient())
      .then((list) => setFactorId(list[0]?.id ?? null))
      .catch(() => setError(MFA_MESSAGES.generic));
  }, []);

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
    router.replace("/recruteur");
    router.refresh();
  }

  return (
    <Gate aside={<SignOutButton />}>
      <div>
        <p className="rec-eyebrow">Double authentification</p>
        <h1>Votre code.</h1>
        <p className="rec-lead">Ouvrez votre application d’authentification et saisissez le code affiché pour Sapios.</p>
      </div>
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
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <button className="btn btn--accent btn--lg" type="submit" disabled={busy || !factorId || code.length !== 6}>
          {busy ? "Vérification…" : "Valider"}
        </button>
      </form>
      <div aria-live="polite">{error ? <p className="alert">{error}</p> : null}</div>
      <p className="muted small">
        Connecté avec {email}. Téléphone perdu ? Écrivez à <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>{" "}
        depuis cette adresse : après vérification, notre équipe retire la double authentification.
      </p>
    </Gate>
  );
}

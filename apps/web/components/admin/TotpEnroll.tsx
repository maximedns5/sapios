"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { dropUnverifiedFactors, groupSecret, MFA_MESSAGES } from "@/lib/admin/mfa";

/**
 * Enregistre une application d'authentification : QR code + secret, puis vérification d'un premier
 * code. Utilisé à la première connexion (gate) et dans Réglages → Sécurité pour un second appareil.
 */
export default function TotpEnroll({
  onDone,
  tone = "dark",
  submitLabel = "Activer la double authentification",
}: {
  onDone: () => void;
  tone?: "dark" | "light";
  submitLabel?: string;
}) {
  const id = useId();
  const started = useRef(false);
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // En développement, React monte deux fois : on n'enrôle qu'une fois par affichage.
    if (started.current) return;
    started.current = true;
    const supabase = createClient();
    (async () => {
      await dropUnverifiedFactors(supabase);
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Back-office ${stamp}`,
      });
      if (error || !data) {
        setError(MFA_MESSAGES.enroll);
        return;
      }
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factor || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) {
      setError(MFA_MESSAGES.invalid);
      setCode("");
      return;
    }
    onDone();
  }

  return (
    <div className={`totp totp--${tone}`}>
      <ol className="totp-steps">
        <li>
          Installez une application d’authentification sur votre téléphone (Google Authenticator, 1Password,
          Bitwarden, Authy…).
        </li>
        <li>Scannez ce QR code, ou saisissez la clé à la main.</li>
        <li>Saisissez le code à 6 chiffres affiché par l’application.</li>
      </ol>
      <div className="totp-pair">
        <div className="totp-qr" aria-busy={!factor}>
          {factor ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR en data URL SVG fourni par Supabase
            <img src={factor.qr} alt="QR code à scanner avec l’application d’authentification" width={184} height={184} />
          ) : (
            <span className="label">Préparation…</span>
          )}
        </div>
        <div className="totp-secret">
          <p className="label">Clé à saisir à la main</p>
          <code>{factor ? groupSecret(factor.secret) : "…"}</code>
          <p className="totp-note">Ne la partagez pas : elle permet de générer vos codes.</p>
        </div>
      </div>
      <form className="gate-form" style={{ marginTop: 0 }} onSubmit={submit}>
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
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !factor || code.length !== 6}>
          {busy ? "Vérification…" : submitLabel}
        </button>
      </form>
      <div aria-live="polite">
        {error ? (
          <p className="notice">
            <span className="label">Refusé</span>
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

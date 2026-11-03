"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { dropUnverifiedFactors, groupSecret, MFA_MESSAGES } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/client";

/**
 * Enregistre une application d'authentification pour l'espace recruteur : QR code et clé, puis un premier
 * code à 6 chiffres. Même parcours que le back-office (components/admin/TotpEnroll), aux couleurs de l'espace.
 */
export default function RecruiterTotpEnroll({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
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
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Espace recruteur ${stamp}` });
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
    <div style={{ display: "grid", gap: 16 }}>
      <ol className="rec-points" style={{ margin: 0 }}>
        <li>Installez une application d’authentification : Google Authenticator, 1Password, Bitwarden, Authy…</li>
        <li>Scannez ce QR code, ou saisissez la clé à la main.</li>
        <li>Saisissez le code à 6 chiffres affiché par l’application.</li>
      </ol>
      <div className="row" style={{ alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div className="surface" aria-busy={!factor} style={{ width: 200, height: 200, display: "grid", placeItems: "center" }}>
          {factor ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR en data URL SVG fourni par Supabase
            <img src={factor.qr} alt="QR code à scanner avec l’application d’authentification" width={184} height={184} />
          ) : (
            <span className="muted">Préparation…</span>
          )}
        </div>
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <p className="field-label" style={{ margin: 0 }}>
            Clé à saisir à la main
          </p>
          <code data-testid="totp-secret" style={{ fontSize: 15, wordBreak: "break-all" }}>
            {factor ? groupSecret(factor.secret) : "…"}
          </code>
          <p className="muted small" style={{ margin: 0 }}>
            Ne la partagez pas : elle permet de générer vos codes.
          </p>
        </div>
      </div>
      <form className="field" onSubmit={submit}>
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
          <button className="btn btn--accent" type="submit" disabled={busy || !factor || code.length !== 6}>
            {busy ? "Vérification…" : "Activer la double authentification"}
          </button>
          {onCancel ? (
            <button type="button" className="link" onClick={onCancel}>
              Annuler
            </button>
          ) : null}
        </div>
      </form>
      <div aria-live="polite">{error ? <p className="alert">{error}</p> : null}</div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { MFA_MESSAGES, type TotpFactor, verifiedFactors } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/client";
import { SITE } from "@/lib/site";
import { IconLock } from "./Icons";
import RecruiterTotpEnroll from "./RecruiterTotpEnroll";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Double authentification facultative du recruteur : activer (application TOTP), ajouter un second appareil,
 * retirer une application. Une fois activée, chaque connexion demande le code, et la base refuse toute action
 * recruteur sans lui (`mfa_required`).
 */
export default function SecuritySettings({ initialFactors }: { initialFactors: TotpFactor[] }) {
  const id = useId();
  const router = useRouter();
  const [factors, setFactors] = useState(initialFactors);
  const [enrolling, setEnrolling] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setFactors(await verifiedFactors(createClient()));
    } catch {
      setError(MFA_MESSAGES.generic);
    }
    router.refresh();
  }, [router]);

  async function remove(factorId: string) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    setConfirming(null);
    if (error) {
      setError(MFA_MESSAGES.generic);
      return;
    }
    setMessage(factors.length > 1 ? "Application retirée." : "Double authentification désactivée.");
    await reload();
  }

  const active = factors.length > 0;
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">Compte</p>
          <h1>Sécurité</h1>
          <p className="rec-lead">
            Ajoutez un code à 6 chiffres, généré par votre téléphone, à la connexion par email. Vos candidatures,
            notes et messages restent protégés même si quelqu’un accède à votre boîte mail.
          </p>
        </div>
      </header>

      <section className="card" style={{ display: "grid", gap: 14 }} aria-labelledby={`${id}-t`}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <h2 id={`${id}-t`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <IconLock aria-hidden="true" /> Double authentification
          </h2>
          <span className={active ? "badge badge--ok" : "badge"} data-testid="mfa-status">
            {active ? "Activée" : "Désactivée"}
          </span>
        </div>

        {active ? (
          <ul className="hidden-list" style={{ display: "grid", gap: 8, padding: 0, margin: 0, listStyle: "none" }} aria-label="Applications enregistrées">
            {factors.map((f) => (
              <li key={f.id} className="list-row" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  <strong>{f.friendly_name || "Application d’authentification"}</strong>
                  <span className="muted small"> · ajoutée le {fmtDate(f.created_at)}</span>
                </span>
                {confirming === f.id ? (
                  <span className="row">
                    <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => remove(f.id)}>
                      {busy ? "Retrait…" : factors.length > 1 ? "Retirer cette application" : "Désactiver"}
                    </button>
                    <button type="button" className="link" onClick={() => setConfirming(null)}>
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn--sm btn--outline" onClick={() => setConfirming(f.id)}>
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Facultative, et recommandée si plusieurs personnes ont accès à votre boîte mail ou si vous recrutez pour une
            équipe sensible.
          </p>
        )}

        {enrolling ? (
          <RecruiterTotpEnroll
            onCancel={() => setEnrolling(false)}
            onDone={async () => {
              setEnrolling(false);
              setMessage("Double authentification activée : le code vous sera demandé à chaque connexion.");
              await reload();
            }}
          />
        ) : (
          <div className="row">
            <button type="button" className="btn btn--accent" onClick={() => { setMessage(null); setEnrolling(true); }}>
              {active ? "Ajouter un autre appareil" : "Activer la double authentification"}
            </button>
          </div>
        )}

        <div aria-live="polite">
          {message ? <p className="alert alert--ok">{message}</p> : null}
          {error ? <p className="alert">{error}</p> : null}
        </div>
      </section>

      <section className="surface" style={{ display: "grid", gap: 6 }} aria-label="Téléphone perdu">
        <h3 style={{ margin: 0 }}>Téléphone perdu ?</h3>
        <p className="muted" style={{ margin: 0 }}>
          Écrivez à <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> depuis l’adresse de votre compte.
          Après vérification de votre identité, notre équipe retire la double authentification : vous pourrez alors
          enregistrer une nouvelle application. Pour éviter d’en arriver là, ajoutez un second appareil.
        </p>
      </section>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { fmtDateTime } from "@/lib/admin/format";
import { MFA_MESSAGES, verifiedFactors, type TotpFactor } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/client";
import TotpEnroll from "./TotpEnroll";
import { ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

/**
 * Réglages → Sécurité : applications d'authentification du compte connecté. En ajouter une seconde
 * (téléphone de secours) ou en retirer une, après un code frais.
 */
export default function SecuritySettings() {
  const id = useId();
  const router = useRouter();
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TotpFactor | null>(null);
  const [verifyWith, setVerifyWith] = useState<string>("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    verifiedFactors(createClient())
      .then((list) => {
        setError(null);
        setFactors(list);
      })
      .catch(() => setError(MFA_MESSAGES.generic));
  }, []);
  useEffect(load, [load]);

  function startRemove(f: TotpFactor) {
    setRemoving(f);
    setVerifyWith(f.id);
    setCode("");
    setNotice(null);
    setError(null);
  }

  async function confirmRemove(e: FormEvent) {
    e.preventDefault();
    if (!removing || code.length !== 6) return;
    const supabase = createClient();
    setBusy(true);
    setError(null);
    // Re-vérification : un code frais, de cette application ou d'une autre encore enregistrée.
    const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: verifyWith, code });
    if (verified.error) {
      setBusy(false);
      setError(MFA_MESSAGES.invalid);
      setCode("");
      return;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: removing.id });
    setBusy(false);
    if (error) {
      setError(MFA_MESSAGES.generic);
      return;
    }
    const last = (factors ?? []).length <= 1;
    setRemoving(null);
    setNotice(
      last
        ? "Application retirée. Au prochain chargement, le back-office vous demandera d’en enregistrer une nouvelle."
        : "Application retirée.",
    );
    load();
    if (last) router.refresh();
  }

  return (
    <>
      <PageHead
        label="Configuration"
        title={
          <>
            Sécurité <em>du compte</em>
          </>
        }
        lead="Le back-office exige un code à 6 chiffres à chaque connexion. Enregistrez une seconde application (un autre téléphone) pour ne pas perdre l’accès si le premier disparaît."
      />
      {error ? <ErrorNotice message={error} onRetry={removing ? undefined : load} /> : null}
      {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      {!factors && !error ? <Loading /> : null}
      {factors ? (
        <div style={{ display: "grid", gap: 24 }}>
          <section className="panel" aria-labelledby={`${id}-list`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-list`}>
                Applications d’authentification
              </h2>
              <span className="label">{factors.length} enregistrée{factors.length > 1 ? "s" : ""}</span>
            </div>
            <div className="panel-b">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Nom</th>
                    <th scope="col">Enregistrée le</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {factors.map((f) => (
                    <tr key={f.id}>
                      <td>{f.friendly_name || "Application"}</td>
                      <td>{fmtDateTime(f.created_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => startRemove(f)}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {removing ? (
            <section className="panel" aria-labelledby={`${id}-remove`}>
              <div className="panel-h">
                <h2 className="label" id={`${id}-remove`}>
                  Retirer « {removing.friendly_name || "Application"} »
                </h2>
              </div>
              <form className="panel-b" onSubmit={confirmRemove} style={{ display: "grid", gap: 16, maxWidth: 520 }}>
                <p>
                  Confirmez avec un code à 6 chiffres.
                  {factors.length <= 1
                    ? " C’est votre seule application : il faudra en enregistrer une nouvelle au prochain chargement."
                    : null}
                </p>
                {factors.length > 1 ? (
                  <div className="field">
                    <label className="label" htmlFor={`${id}-with`}>
                      Code généré par
                    </label>
                    <select id={`${id}-with`} className="select" value={verifyWith} onChange={(e) => setVerifyWith(e.target.value)}>
                      {factors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.friendly_name || "Application"}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
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
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={busy || code.length !== 6}>
                    {busy ? "Vérification…" : "Retirer cette application"}
                  </button>
                  <button type="button" className="adm-link" onClick={() => setRemoving(null)}>
                    Annuler
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="panel" aria-labelledby={`${id}-add`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-add`}>
                Ajouter une application
              </h2>
            </div>
            <div className="panel-b">
              {adding ? (
                <TotpEnroll
                  tone="light"
                  submitLabel="Enregistrer cette application"
                  onDone={() => {
                    setAdding(false);
                    setNotice("Application enregistrée.");
                    load();
                  }}
                />
              ) : (
                <button type="button" className="btn" onClick={() => setAdding(true)}>
                  Enregistrer un second appareil
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

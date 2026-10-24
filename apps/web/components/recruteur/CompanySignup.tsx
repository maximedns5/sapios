"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_GENERIC_EMAIL_DOMAINS, isValidSiren, type CompanyLookup } from "@sapios/shared";
import { describeEmploiError, emploiErrorMessage, errorCode } from "@/lib/emploi/errors";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import Gate from "./Gate";
import { IconAlert, IconCheckCircle, IconClock } from "./Icons";
import SignOutButton from "./SignOutButton";

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; data: CompanyLookup }
  | { state: "error"; message: string };

const fmtSiren = (s: string) => s.replace(/\D/g, "").replace(/(\d{3})(?=\d)/g, "$1 ").trim();

/** Nom d'usage proposé à partir de la dénomination légale (« MAISON VERTE SAS » → « Maison Verte »). */
function displayFrom(legal: string): string {
  const cleaned = legal.replace(/\b(SAS|SASU|SARL|EURL|SA|SNC|SCOP|SCI)\b\.?/gi, "").replace(/\s+/g, " ").trim();
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export default function CompanySignup({ email }: { email: string }) {
  const id = useId();
  const router = useRouter();
  const [siren, setSiren] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const digits = siren.replace(/\D/g, "");
  const sirenValid = isValidSiren(digits);
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const generic = useMemo(() => (DEFAULT_GENERIC_EMAIL_DOMAINS as readonly string[]).includes(domain), [domain]);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!sirenValid) return;
    setLookup({ state: "loading" });
    setConfirmed(false);
    setError(null);
    const { data, error } = await createClient().functions.invoke<CompanyLookup>("company-lookup", {
      body: { siren: digits },
    });
    if (error || !data) {
      const code = error ? await errorCode(error) : "not_found";
      setLookup({
        state: "error",
        message:
          code === "not_found"
            ? "Aucune entreprise ne porte ce numéro au registre Sirene. Vérifiez-le sur votre Kbis ou sur annuaire-entreprises.data.gouv.fr."
            : emploiErrorMessage(code),
      });
      return;
    }
    setLookup({ state: "found", data });
    setDisplayName(displayFrom(data.legal_name));
  }

  function notMine() {
    setLookup({ state: "idle" });
    setConfirmed(false);
    setSiren("");
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    if (lookup.state !== "found") return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<string>(createClient(), "register_company", {
      p_siren: digits,
      p_display_name: displayName.trim(),
      p_job_title: jobTitle.trim(),
      p_sirene: lookup.data,
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    setDone(true);
  }

  const aside = (
    <span className="row small muted">
      <span title={email}>{email}</span>
      <SignOutButton />
    </span>
  );

  if (done) {
    return (
      <Gate aside={aside}>
        <div className="rec-steps-line" aria-hidden="true">
          <span data-done="true" />
          <span data-done="true" />
          <span data-done="false" />
        </div>
        <span className="pile-done-icon" aria-hidden="true" style={{ animation: "rec-pop .5s var(--spring) both" }}>
          <IconClock size={30} />
        </span>
        <h1>En attente de vérification par Sapios.</h1>
        <p className="rec-lead">
          Notre équipe compare votre déclaration au registre et vérifie le domaine de votre email, en général sous
          24 h. Vous recevrez un email dès que c’est fait. En attendant, vous pouvez préparer vos offres : elles
          partiront en vérification dès que l’entreprise sera validée.
        </p>
        <div className="row">
          <Link
            className="btn btn--accent btn--lg"
            href="/recruteur/offres/nouvelle"
            onClick={() => router.refresh()}
          >
            Préparer une offre
          </Link>
          <Link className="btn btn--soft btn--lg" href="/recruteur/offres" onClick={() => router.refresh()}>
            Tableau de bord
          </Link>
        </div>
      </Gate>
    );
  }

  return (
    <Gate aside={aside}>
      <div className="rec-steps-line" aria-hidden="true">
        <span data-done="true" />
        <span data-done={lookup.state === "found" && confirmed ? "true" : "false"} />
        <span data-done="false" />
      </div>
      <div>
        <p className="rec-eyebrow">Votre entreprise</p>
        <h1>Commençons par votre numéro SIREN.</h1>
        <p className="rec-lead">
          Nous le vérifions dans la base Sirene de l’Insee. Seules les entreprises vérifiées publient des offres sur
          Sapios.
        </p>
      </div>

      <form className="field" onSubmit={search}>
        <label className="field-label" htmlFor={`${id}-siren`}>
          Numéro SIREN (9 chiffres)
        </label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            id={`${id}-siren`}
            className="input siren-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="901 234 567"
            value={fmtSiren(siren)}
            maxLength={11}
            aria-invalid={digits.length === 9 && !sirenValid ? true : undefined}
            aria-describedby={`${id}-siren-help`}
            onChange={(e) => {
              setSiren(e.target.value.replace(/\D/g, "").slice(0, 9));
              if (lookup.state !== "loading") setLookup({ state: "idle" });
            }}
          />
          <button className="btn btn--accent btn--lg" type="submit" disabled={!sirenValid || lookup.state === "loading"}>
            Vérifier
          </button>
        </div>
        <p className="hint" id={`${id}-siren-help`}>
          {digits.length === 9 && !sirenValid
            ? "Ce numéro ne passe pas la clé de contrôle : une erreur de frappe ?"
            : "Sur votre Kbis, vos factures, ou sur annuaire-entreprises.data.gouv.fr."}
        </p>
      </form>

      <div aria-live="polite">
        {lookup.state === "loading" ? (
          <div className="lookup lookup--loading" role="status">
            <span className="sr-only">Recherche au registre…</span>
          </div>
        ) : lookup.state === "error" ? (
          <p className="alert" role="alert">
            {lookup.message}
          </p>
        ) : lookup.state === "found" ? (
          <section className="lookup" aria-label="Fiche trouvée au registre">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 18 }}>{lookup.data.legal_name}</strong>
              {lookup.data.active ? (
                <span className="badge badge--ok">
                  <IconCheckCircle size={14} /> Active au registre
                </span>
              ) : (
                <span className="badge badge--err">Fermée au registre</span>
              )}
            </div>
            <dl>
              <dt>SIREN</dt>
              <dd>{fmtSiren(lookup.data.siren)}</dd>
              <dt>Adresse</dt>
              <dd>{[lookup.data.address, lookup.data.postcode, lookup.data.city].filter(Boolean).join(", ") || "—"}</dd>
              <dt>Activité</dt>
              <dd>
                {[lookup.data.naf_code, lookup.data.naf_label].filter(Boolean).join(" · ") || "—"}
              </dd>
              <dt>Effectif</dt>
              <dd>{lookup.data.headcount_band ?? "Non renseigné"}</dd>
            </dl>
            {lookup.data.diffusion === "P" ? (
              <p className="hint">
                Fiche en diffusion partielle : une partie des informations est masquée au registre. Notre équipe
                vérifiera à la main.
              </p>
            ) : null}
            {!lookup.data.active ? (
              <p className="alert" role="alert">
                Une entreprise fermée ne peut pas recruter sur Sapios.
              </p>
            ) : !confirmed ? (
              <div className="row">
                <button type="button" className="btn btn--accent" onClick={() => setConfirmed(true)}>
                  C’est mon entreprise
                </button>
                <button type="button" className="btn btn--ghost" onClick={notMine}>
                  Ce n’est pas mon entreprise
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {lookup.state === "found" && lookup.data.active && confirmed ? (
        <form className="ed-form" onSubmit={register} style={{ gap: 18 }}>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-name`}>
              Nom affiché aux candidats
            </label>
            <input
              id={`${id}-name`}
              className="input"
              required
              minLength={1}
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-job`}>
              Votre fonction
            </label>
            <input
              id={`${id}-job`}
              className="input"
              required
              minLength={2}
              maxLength={80}
              placeholder="Responsable RH, fondatrice, manager…"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className={generic ? "banner banner--warn" : "banner banner--ok"}>
            {generic ? <IconAlert /> : <IconCheckCircle />}
            <span>
              {generic
                ? `${domain} est une adresse personnelle : nous vous demanderons un Kbis de moins de 3 mois pour vérifier votre lien avec l’entreprise.`
                : `Adresse sur le domaine ${domain} : notre équipe vérifie qu’il appartient bien à l’entreprise.`}
            </span>
          </div>
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="btn btn--accent btn--lg"
            type="submit"
            disabled={busy || displayName.trim().length < 1 || jobTitle.trim().length < 2}
          >
            {busy ? "Envoi…" : "Envoyer pour vérification"}
          </button>
        </form>
      ) : null}
    </Gate>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { COMPANY_STATUS_LABELS, type AdminCompany, type CompanyStatus } from "@sapios/shared";
import { fmtDateTime } from "@/lib/admin/format";
import { describeEmploiError } from "@/lib/emploi/errors";
import { COMPANY_FILTERS } from "@/lib/emploi/filters";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

type Decision = "verify" | "reject" | "suspend";

const fmtSiren = (s: string | null | undefined) => (s ? s.replace(/(\d{3})(?=\d)/g, "$1 ") : "—");
const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function Compare({ label, declared, registry }: { label: string; declared: string | null; registry: string | null }) {
  const same = !declared || !registry ? null : norm(declared) === norm(registry) || norm(registry).includes(norm(declared));
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{declared || <span className="muted">—</span>}</td>
      <td>{registry || <span className="muted">—</span>}</td>
      <td>{same === null ? <span className="muted">—</span> : same ? "✓" : <strong>≠ à vérifier</strong>}</td>
    </tr>
  );
}

export default function CompaniesQueue({ status }: { status: CompanyStatus }) {
  const [rows, setRows] = useState<AdminCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc<AdminCompany[]>(createClient(), "admin_list_companies", { p_status: status }).then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setRows(data ?? []);
    });
  }, [status]);
  useEffect(load, [load]);

  return (
    <>
      <PageHead
        label="Vérification"
        title={
          <>
            Les <em>entreprises</em>
          </>
        }
        lead="Comparez la déclaration au registre Sirene et le domaine de l’email. Une adresse personnelle demande un Kbis de moins de 3 mois, par email. Chaque décision est journalisée et envoyée au recruteur."
        aside={
          <nav className="seg" aria-label="Statut">
            {COMPANY_FILTERS.map((s) => (
              <Link key={s} href={`/admin/entreprises?statut=${s}`} aria-current={s === status ? "true" : undefined}>
                {COMPANY_STATUS_LABELS[s]}
              </Link>
            ))}
          </nav>
        }
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && !rows.length ? <Empty title="Aucune entreprise dans cette file." /> : null}
      <div style={{ display: "grid", gap: 24 }}>
        {(rows ?? []).map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            onDone={(msg) => {
              setNotice(msg);
              load();
            }}
          />
        ))}
      </div>
    </>
  );
}

function CompanyCard({ company: c, onDone }: { company: AdminCompany; onDone: (msg: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = c.sirene;

  async function decide(decision: Decision) {
    if (decision !== "verify" && reason.trim().length < 5) {
      setError("Un motif est obligatoire pour refuser ou suspendre : il est envoyé au recruteur.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "admin_decide_company", {
      p_id: c.id,
      p_decision: decision,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onDone(
      decision === "verify"
        ? `${c.display_name} est vérifiée : ses offres peuvent partir en modération.`
        : decision === "reject"
          ? `${c.display_name} est refusée. Le recruteur a reçu le motif.`
          : `${c.display_name} est suspendue : ses offres ne sont plus visibles.`,
    );
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 id={`${id}-t`} style={{ fontSize: 18, fontWeight: 600 }}>
          {c.display_name} <span className="muted">· SIREN {fmtSiren(c.siren)}</span>
        </h2>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={c.status === "pending" ? "badge badge--solid" : "badge"}>{COMPANY_STATUS_LABELS[c.status]}</span>
          <span className="label">Reçue le {fmtDateTime(c.created_at)}</span>
        </span>
      </div>
      <div className="panel-b" style={{ display: "grid", gap: 18 }}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Champ</th>
                <th scope="col">Déclaré</th>
                <th scope="col">Registre Sirene</th>
                <th scope="col">Écart</th>
              </tr>
            </thead>
            <tbody>
              <Compare label="Dénomination" declared={c.legal_name} registry={s?.legal_name ?? null} />
              <Compare label="Nom affiché" declared={c.display_name} registry={s?.legal_name ?? null} />
              <Compare label="Ville" declared={[c.postcode, c.city].filter(Boolean).join(" ") || null} registry={[s?.postcode, s?.city].filter(Boolean).join(" ") || null} />
              <Compare label="Activité (NAF)" declared={c.naf_code} registry={s?.naf_code ?? null} />
              <Compare label="Effectif" declared={c.headcount_band} registry={s?.headcount_band ?? null} />
            </tbody>
          </table>
        </div>
        <dl className="kv">
          <dt>État au registre</dt>
          <dd>
            {s ? (s.active ? "Active" : "Fermée") : "Fiche absente"}
            {s?.diffusion === "P" ? " · diffusion partielle : vérification à la main" : ""}
            {s?.created_on ? ` · créée le ${s.created_on}` : ""}
          </dd>
          <dt>Adresse au registre</dt>
          <dd className={s?.address ? undefined : "empty"}>{s?.address ?? "non diffusée"}</dd>
          <dt>Recruteur</dt>
          <dd>
            {c.owner ? `${c.owner.job_title} · ${c.owner.email ?? "email inconnu"}` : "Plus de membre"}
          </dd>
          <dt>Domaine de l’email</dt>
          <dd>
            {c.email_domain ?? "—"}
            {c.email_domain_generic ? (
              <strong> · adresse personnelle : demander un Kbis de moins de 3 mois</strong>
            ) : (
              " · vérifier qu’il appartient à l’entreprise (site, mentions légales)"
            )}
          </dd>
          <dt>Offres</dt>
          <dd>{c.offers_count}</dd>
          {c.status_reason ? (
            <>
              <dt>Motif enregistré</dt>
              <dd>{c.status_reason}</dd>
            </>
          ) : null}
        </dl>
        <div className="field">
          <label className="label" htmlFor={`${id}-reason`}>
            Motif (obligatoire pour refuser ou suspendre, envoyé au recruteur)
          </label>
          <textarea id={`${id}-reason`} className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <div className="form-actions">
          {c.status !== "verified" ? (
            <button type="button" className="btn" onClick={() => decide("verify")} disabled={busy || (s ? !s.active : false)}>
              Valider l’entreprise
            </button>
          ) : null}
          {c.status === "pending" ? (
            <button type="button" className="btn btn--ghost" onClick={() => decide("reject")} disabled={busy}>
              Refuser
            </button>
          ) : null}
          {c.status === "verified" ? (
            <button type="button" className="btn btn--ghost" onClick={() => decide("suspend")} disabled={busy}>
              Suspendre
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

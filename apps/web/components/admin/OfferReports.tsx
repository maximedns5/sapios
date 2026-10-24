"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { OFFER_REPORT_REASON_LABELS, OFFER_STATUS_LABELS, type AdminOfferReport, type ReportStatus } from "@sapios/shared";
import { fmtDateTime } from "@/lib/admin/format";
import { describeEmploiError } from "@/lib/emploi/errors";
import { REPORT_FILTERS } from "@/lib/emploi/filters";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const STATUS_LABELS: Record<ReportStatus, string> = { open: "Ouverts", actioned: "Retenus", dismissed: "Classés" };

export default function OfferReports({ status }: { status: ReportStatus }) {
  const [rows, setRows] = useState<AdminOfferReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc<AdminOfferReport[]>(createClient(), "admin_list_offer_reports", { p_status: status }).then(async ({ data, error }) => {
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
        label="Signalements"
        title={
          <>
            Offres <em>signalées</em>
          </>
        }
        lead="Offres fictives, critères discriminatoires, salaires trompeurs, arnaques. Dépublier une offre prévient le recruteur avec le motif ; une fraude avérée justifie de suspendre l’entreprise."
        aside={
          <nav className="seg" aria-label="Statut">
            {REPORT_FILTERS.map((s) => (
              <Link key={s} href={`/admin/signalements?statut=${s}`} aria-current={s === status ? "true" : undefined}>
                {STATUS_LABELS[s]}
              </Link>
            ))}
          </nav>
        }
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && !rows.length ? <Empty title="Aucun signalement dans cette file." /> : null}
      <div style={{ display: "grid", gap: 20 }}>
        {(rows ?? []).map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            onDone={(m) => {
              setNotice(m);
              load();
            }}
          />
        ))}
      </div>
    </>
  );
}

function ReportCard({ report: r, onDone }: { report: AdminOfferReport; onDone: (m: string) => void }) {
  const id = useId();
  const [unpublish, setUnpublish] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(status: ReportStatus) {
    if (status === "actioned" && unpublish && reason.trim().length < 5) {
      setError("Un motif est obligatoire pour dépublier : il est envoyé au recruteur.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "admin_handle_offer_report", {
      p_id: r.id,
      p_status: status,
      p_unpublish: status === "actioned" && unpublish,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onDone(status === "dismissed" ? "Signalement classé." : unpublish ? `Signalement retenu, « ${r.offer.title} » dépubliée.` : "Signalement retenu.");
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 id={`${id}-t`} style={{ fontSize: 17, fontWeight: 600 }}>
          {OFFER_REPORT_REASON_LABELS[r.reason]}
        </h2>
        <span className="label">{fmtDateTime(r.created_at)}</span>
      </div>
      <div className="panel-b" style={{ display: "grid", gap: 14 }}>
        <dl className="kv">
          <dt>Offre</dt>
          <dd>
            {r.offer.title} · {OFFER_STATUS_LABELS[r.offer.status]}
          </dd>
          <dt>Entreprise</dt>
          <dd>
            <Link href="/admin/entreprises?statut=verified">{r.company.display_name}</Link>
          </dd>
          <dt>Signalements sur l’offre</dt>
          <dd>{r.reports_on_offer}</dd>
          <dt>Détails</dt>
          <dd className={r.details ? undefined : "empty"}>{r.details ?? "aucun"}</dd>
        </dl>
        {r.status === "open" ? (
          <>
            <label className="check" htmlFor={`${id}-un`}>
              <input id={`${id}-un`} type="checkbox" checked={unpublish} onChange={(e) => setUnpublish(e.target.checked)} />
              <span>Dépublier l’offre (elle passe « archivée » et disparaît des candidats)</span>
            </label>
            <div className="field">
              <label className="label" htmlFor={`${id}-reason`}>
                Motif {unpublish ? "(obligatoire, envoyé au recruteur)" : "(facultatif)"}
              </label>
              <textarea id={`${id}-reason`} className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error ? <ErrorNotice message={error} /> : null}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => handle("actioned")} disabled={busy}>
                Retenir
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => handle("dismissed")} disabled={busy}>
                Classer sans suite
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

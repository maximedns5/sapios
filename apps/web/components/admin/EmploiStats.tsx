"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  APPLICATION_STATUS_LABELS_CANDIDATE,
  APPLICATION_STATUSES,
  COMPANY_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  OFFER_STATUSES,
  type AdminEmploiStats,
  type CompanyStatus,
} from "@sapios/shared";
import { numberFr } from "@/lib/admin/format";
import { describeEmploiError } from "@/lib/emploi/errors";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead } from "./ui";

const COMPANY_STATUSES: CompanyStatus[] = ["pending", "verified", "rejected", "suspended"];
const n = (v: number | null | undefined) => (v == null ? "—" : numberFr.format(v));

function Breakdown<K extends string>({
  title,
  keys,
  labels,
  values,
}: {
  title: string;
  keys: readonly K[];
  labels: Record<K, string>;
  values: Partial<Record<K, number>> | undefined;
}) {
  const total = keys.reduce((s, k) => s + (values?.[k] ?? 0), 0);
  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="label">{title}</h2>
        <span className="label">{n(total)}</span>
      </div>
      <div className="panel-b">
        <dl className="kv">
          {keys.map((k) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{labels[k]}</dt>
              <dd>{n(values?.[k] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export default function EmploiStats() {
  const [stats, setStats] = useState<AdminEmploiStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc<AdminEmploiStats>(createClient(), "admin_emploi_stats").then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setStats(data);
    });
  }, []);
  useEffect(load, [load]);

  const pending = stats?.companies_by_status?.pending ?? 0;
  const toReview = stats?.offers_by_status?.pending_review ?? 0;

  return (
    <>
      <PageHead
        label="Sapios Emploi"
        title={
          <>
            Vue <em>d’ensemble</em>
          </>
        }
        lead="Candidats, entreprises, offres et candidatures. Les files à traiter sont en tête de la barre."
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!stats && !error ? <Loading /> : null}
      {stats ? (
        <>
          <div className="kpis">
            <div className="kpi kpi--hero">
              <span className="label">Délai de réponse moyen</span>
              <span className="v">
                {stats.avg_response_days == null ? "—" : `${String(Math.round(stats.avg_response_days * 10) / 10).replace(".", ",")} j`}
              </span>
              <span className="s">Toutes entreprises, 90 jours</span>
            </div>
            <div className="kpi">
              <span className="label">Candidats</span>
              <span className="v">{n(stats.candidates_total)}</span>
              <span className="s">
                {n(stats.candidates_complete)} profils complets · {n(stats.candidates_open)} ouverts aux opportunités
              </span>
            </div>
            <div className="kpi">
              <span className="label">Recruteurs</span>
              <span className="v">{n(stats.recruiters_total)}</span>
              <span className="s">
                <Link href="/admin/entreprises">{n(pending)} entreprise{pending > 1 ? "s" : ""} à vérifier</Link>
              </span>
            </div>
            <div className="kpi">
              <span className="label">Offres à modérer</span>
              <span className="v">{n(toReview)}</span>
              <span className="s">
                <Link href="/admin/offres">Ouvrir la file</Link>
              </span>
            </div>
            <div className="kpi">
              <span className="label">Signalements ouverts</span>
              <span className="v">{n(stats.offer_reports_open)}</span>
              <span className="s">
                <Link href="/admin/signalements">Voir les signalements</Link>
              </span>
            </div>
          </div>
          <div className="stat-grid">
            <Breakdown title="Entreprises" keys={COMPANY_STATUSES} labels={COMPANY_STATUS_LABELS} values={stats.companies_by_status} />
            <Breakdown title="Offres" keys={OFFER_STATUSES} labels={OFFER_STATUS_LABELS} values={stats.offers_by_status} />
            <Breakdown
              title="Candidatures"
              keys={APPLICATION_STATUSES}
              labels={APPLICATION_STATUS_LABELS_CANDIDATE}
              values={stats.applications_by_status}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

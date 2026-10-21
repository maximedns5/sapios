"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeError } from "@/lib/admin/errors";
import { fmtAgo, fmtDateTime, PROFILE_STATUS_LABELS, REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from "@/lib/admin/format";
import type { ProfileStatus, ReportRow, ReportStatus } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const FILTERS: ReportStatus[] = ["open", "actioned", "dismissed"];
const FILTER_LABELS: Record<ReportStatus, string> = { open: "Ouverts", actioned: "Sanctionnés", dismissed: "Classés" };

interface Person {
  id: string;
  display_name: string | null;
  status: ProfileStatus | null;
}

interface Loaded {
  reports: ReportRow[];
  people: Record<string, Person>;
  openByTarget: Record<string, number>;
}

async function loadReports(status: ReportStatus): Promise<Loaded> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .limit(200);
  if (error) throw error;
  const reports = (data ?? []) as ReportRow[];
  const ids = Array.from(new Set(reports.flatMap((r) => [r.reporter_id, r.target_id])));
  const targets = Array.from(new Set(reports.map((r) => r.target_id)));
  const [people, open] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, display_name, status").in("id", ids) : Promise.resolve({ data: [] }),
    targets.length
      ? supabase.from("reports").select("target_id").eq("status", "open").in("target_id", targets)
      : Promise.resolve({ data: [] }),
  ]);
  const openByTarget: Record<string, number> = {};
  for (const r of (open.data ?? []) as Array<{ target_id: string }>) {
    openByTarget[r.target_id] = (openByTarget[r.target_id] ?? 0) + 1;
  }
  return {
    reports,
    people: Object.fromEntries(((people.data ?? []) as Person[]).map((p) => [p.id, p])),
    openByTarget,
  };
}

function who(people: Record<string, Person>, id: string): string {
  return people[id]?.display_name ?? `Membre ${id.slice(0, 8)}`;
}

function ReportCard({
  report,
  data,
  onDone,
}: {
  report: ReportRow;
  data: Loaded;
  onDone: (message: string) => void;
}) {
  const [ban, setBan] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = data.people[report.target_id];
  const openCount = data.openByTarget[report.target_id] ?? 0;

  async function act(status: Exclude<ReportStatus, "open">) {
    if (status === "actioned" && ban && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("admin_set_report_status", {
      p_report_id: report.id,
      p_status: status,
      p_ban: status === "actioned" && ban,
    });
    setBusy(false);
    setConfirming(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    onDone(
      status === "dismissed"
        ? "Signalement classé sans suite."
        : ban
          ? `Signalement traité. ${who(data.people, report.target_id)} est banni·e et dé-matché·e.`
          : "Signalement traité.",
    );
  }

  return (
    <article className="panel" aria-labelledby={`r-${report.id}`}>
      <div className="panel-h">
        <h2 className="label" id={`r-${report.id}`}>
          {report.reason === "minor" ? <span className="badge badge--solid">Urgent</span> : null}{" "}
          {REPORT_REASON_LABELS[report.reason] ?? report.reason}
        </h2>
        <span className="label" title={fmtDateTime(report.created_at)}>
          {fmtAgo(report.created_at)}
        </span>
      </div>
      <div className="panel-b" style={{ display: "grid", gap: 14 }}>
        <dl className="kv">
          <dt>Signalé·e</dt>
          <dd>
            {who(data.people, report.target_id)}{" "}
            {target?.status ? (
              <span className={target.status === "banned" ? "badge badge--solid" : "badge"}>
                {PROFILE_STATUS_LABELS[target.status]}
              </span>
            ) : null}{" "}
            {openCount > 1 ? <span className="badge badge--solid">{openCount} signalements ouverts</span> : null}
          </dd>
          <dt>Par</dt>
          <dd>{who(data.people, report.reporter_id)}</dd>
          <dt>Détails</dt>
          <dd className={report.details ? undefined : "empty"}>{report.details || "aucun"}</dd>
          {report.status !== "open" ? (
            <>
              <dt>Traité</dt>
              <dd>
                {REPORT_STATUS_LABELS[report.status]} · {fmtDateTime(report.handled_at)}
              </dd>
            </>
          ) : null}
        </dl>
        {report.status === "open" ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={ban}
                onChange={(e) => {
                  setBan(e.target.checked);
                  setConfirming(false);
                }}
                disabled={target?.status === "banned"}
              />
              <span>
                Bannir le compte signalé (profil masqué, matches rompus)
                {target?.status === "banned" ? " — déjà banni" : ""}
              </span>
            </label>
            {error ? <ErrorNotice message={error} /> : null}
            <div className="form-actions">
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => act("actioned")}>
                {confirming ? "Confirmer : sanctionner et bannir" : ban ? "Sanctionner et bannir" : "Sanctionner"}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => act("dismissed")}>
                Classer sans suite
              </button>
              {confirming ? (
                <button type="button" className="adm-link" onClick={() => setConfirming(false)}>
                  Annuler
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function ReportsView({ status }: { status: ReportStatus }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    loadReports(status)
      .then((d) => {
        setError(null);
        setData(d);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, [status]);

  useEffect(load, [load]);

  return (
    <>
      <PageHead
        label="Modération"
        title={
          <>
            <em>Signalements</em>
          </>
        }
        lead="Les plus anciens d’abord. Bannir masque le profil et rompt les matches ; la décision est journalisée."
      />
      <div className="toolbar">
        <nav className="seg" aria-label="Filtrer par statut">
          {FILTERS.map((s) => (
            <Link key={s} href={`/admin/signalements?statut=${s}`} aria-current={s === status ? "true" : undefined}>
              {FILTER_LABELS[s]}
            </Link>
          ))}
        </nav>
        {data ? <span className="label">{data.reports.length} signalement{data.reports.length > 1 ? "s" : ""}</span> : null}
      </div>
      <div aria-live="polite" style={{ marginBottom: notice ? 20 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!data && !error ? <Loading /> : null}
      {data && data.reports.length === 0 ? (
        <Empty title={status === "open" ? "Aucun signalement ouvert. Tout le monde se tient bien." : "Rien ici."} />
      ) : null}
      {data && data.reports.length > 0 ? (
        <div style={{ display: "grid", gap: 20 }}>
          {data.reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              data={data}
              onDone={(message) => {
                setNotice(message);
                load();
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

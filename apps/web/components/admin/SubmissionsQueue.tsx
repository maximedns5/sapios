"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MANUAL_REVIEW_SIGNAL, type SubmissionStatus } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { ageFrom, confidenceValue, fmtAgo, fmtDateTime, levelText, pct, STATUS_LABELS } from "@/lib/admin/format";
import { compareNames, NAME_MATCH_LABELS } from "@/lib/admin/names";
import type { SubmissionRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, StatusBadge } from "./ui";

const FILTERS: SubmissionStatus[] = ["needs_review", "pending", "processing", "needs_more", "approved", "rejected"];

/** Soumission traitée sans clé API : la vérification se fait à l'œil sur le document. */
export function isManualReview(row: Pick<SubmissionRow, "signals">): boolean {
  return (row.signals ?? []).includes(MANUAL_REVIEW_SIGNAL);
}

// Signaux de fraude seulement : le marqueur de revue manuelle n'en est pas un.
export function allSignals(row: Pick<SubmissionRow, "signals" | "extracted">): string[] {
  const own = (row.signals ?? []).filter((s) => s !== MANUAL_REVIEW_SIGNAL);
  const model = (row.extracted?.fraud_signals ?? []).map((s) => `model:${s}`);
  return Array.from(new Set([...own, ...model]));
}

export default function SubmissionsQueue({ status }: { status: SubmissionStatus }) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Colonnes de l'extraction IA, masquées quand toute la liste est en revue manuelle.
  const ai = !rows || rows.some((r) => !isManualReview(r));

  const load = useCallback(() => {
    createClient()
      .rpc("admin_list_submissions", { p_status: status })
      .then(async ({ data, error }) => {
        if (error) setError(await describeError(error));
        else {
          setError(null);
          setRows((data ?? []) as SubmissionRow[]);
        }
      });
  }, [status]);

  useEffect(load, [load]);

  return (
    <>
      <PageHead
        label="Revue humaine obligatoire"
        title={
          <>
            File des <em>diplômes</em>
          </>
        }
        lead="Un modérateur décide, document à l’appui. Les plus anciennes soumissions d’abord."
      />
      <div className="toolbar">
        <nav className="seg" aria-label="Filtrer par statut">
          {FILTERS.map((s) => (
            <Link key={s} href={`/admin/diplomes?statut=${s}`} aria-current={s === status ? "true" : undefined}>
              {STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
        {rows ? (
          <span className="label" role="status">
            {rows.length} soumission{rows.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? (
        <Empty title={status === "needs_review" ? "La file est vide. Pour l’instant." : "Aucune soumission dans cet état."} />
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="tbl-wrap">
          <table className="tbl tbl--cards">
            <caption className="sr-only">Soumissions au statut {STATUS_LABELS[status]}</caption>
            <thead>
              <tr>
                <th scope="col">Soumis</th>
                <th scope="col">Membre</th>
                <th scope="col">{ai ? "Diplôme extrait" : "Diplôme"}</th>
                {ai ? <th scope="col">Niveau estimé</th> : null}
                {ai ? (
                  <th scope="col" className="num">
                    Confiance
                  </th>
                ) : null}
                <th scope="col">Signaux</th>
                {ai ? <th scope="col">Nom</th> : null}
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ex = row.extracted;
                const signals = allSignals(row);
                const match = compareNames(row.legal_name, ex?.holder_full_name);
                const age = ageFrom(row.birthdate);
                return (
                  <tr key={row.id} className="clickable">
                    <td data-label="Soumis">
                      <span className="strong">{fmtAgo(row.created_at)}</span>
                      <br />
                      <span className="muted">{fmtDateTime(row.created_at)}</span>
                    </td>
                    <td data-label="Membre">
                      <span className="strong">{row.display_name ?? "Sans prénom"}</span>
                      <br />
                      <span className="muted">
                        {row.legal_name ?? "Nom légal absent"}
                        {age != null ? ` · ${age} ans` : ""}
                      </span>
                    </td>
                    <td data-label="Diplôme extrait" className="span">
                      {ex ? (
                        <>
                          <span className="strong">{ex.degree_title ?? "Intitulé illisible"}</span>
                          <br />
                          <span className="muted">
                            {[ex.institution, ex.year_awarded].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </>
                      ) : (
                        <span className="muted">
                          {isManualReview(row)
                            ? "Revue manuelle"
                            : row.status === "pending" || row.status === "processing"
                              ? "Extraction en cours"
                              : "Aucune extraction"}
                        </span>
                      )}
                    </td>
                    {ai ? <td data-label="Niveau estimé">{levelText(ex?.level_estimate)}</td> : null}
                    {ai ? (
                      <td data-label="Confiance" className="num">
                        {pct(confidenceValue(row.confidence))}
                      </td>
                    ) : null}
                    <td data-label="Signaux">
                      {signals.length ? (
                        <span className="badge badge--solid">
                          ! {signals.length} signal{signals.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="badge badge--dashed">Aucun</span>
                      )}
                    </td>
                    {ai ? (
                      <td data-label="Nom">
                        <span
                          className={match === "mismatch" ? "badge badge--solid" : match === "match" ? "badge" : "badge badge--dashed"}
                          title={NAME_MATCH_LABELS[match]}
                        >
                          {match === "match" ? "Concordant" : match === "partial" ? "Partiel" : match === "mismatch" ? "Divergent" : "—"}
                        </span>
                      </td>
                    ) : null}
                    <td className="span">
                      <Link className="row-link" href={`/admin/diplomes/${row.id}`}>
                        Examiner<span className="sr-only"> la soumission de {row.display_name ?? row.legal_name ?? "ce membre"}</span>
                      </Link>{" "}
                      {row.status !== status ? <StatusBadge status={row.status} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

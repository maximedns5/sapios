"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { EVENT_KIND_LABELS, normalizeReferralCode, REGISTRATION_STATUS_LABELS, type RegistrationStatus } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { csvCell, fmtDateTime, fmtEventRange, fmtHour } from "@/lib/admin/format";
import type { AdminEventRow, AdminRegistrationRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { eventPhase, seatsTaken } from "./EventsView";
import { Empty, ErrorNotice, Loading, SuccessNotice } from "./ui";

type Filter = "all" | "to_check" | "waitlisted" | "attended" | "other";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Tous" },
  { key: "to_check", label: "À pointer" },
  { key: "waitlisted", label: "Liste d’attente" },
  { key: "attended", label: "Venus" },
  { key: "other", label: "Absents et annulés" },
];

function matches(filter: Filter, status: RegistrationStatus): boolean {
  switch (filter) {
    case "all":
      return true;
    case "to_check":
      return status === "registered";
    case "waitlisted":
      return status === "waitlisted";
    case "attended":
      return status === "attended";
    default:
      return status === "no_show" || status === "cancelled";
  }
}

function StatusCell({ row }: { row: AdminRegistrationRow }) {
  const label =
    row.status === "waitlisted" && row.waitlist_rank
      ? `${REGISTRATION_STATUS_LABELS.waitlisted} · ${row.waitlist_rank}`
      : REGISTRATION_STATUS_LABELS[row.status];
  const cls =
    row.status === "attended"
      ? "badge badge--solid"
      : row.status === "waitlisted"
        ? "badge badge--dashed"
        : row.status === "registered"
          ? "badge"
          : "badge badge--plain";
  return <span className={cls}>{label}</span>;
}

type ExportRow = {
  display_name: string | null;
  email: string | null;
  status: RegistrationStatus;
  ticket_code: string;
  checked_in_at: string | null;
  waitlist_rank: number | null;
};

export default function RegistrationsView({ eventId }: { eventId: string }) {
  const id = useId();
  const [event, setEvent] = useState<AdminEventRow | null | undefined>(undefined);
  const [rows, setRows] = useState<AdminRegistrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmNoShows, setConfirmNoShows] = useState(false);
  // Heure du dernier chargement : décide si le pointage et les absents sont ouverts.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      supabase.rpc("admin_list_events", { p_include_past: true }),
      supabase.rpc("admin_list_registrations", { p_event_id: eventId }),
    ]).then(async ([ev, regs]) => {
      const err = ev.error ?? regs.error;
      if (err) {
        setError(await describeError(err));
        return;
      }
      setError(null);
      setLoadedAt(Date.now());
      setEvent(((ev.data ?? []) as AdminEventRow[]).find((e) => e.id === eventId) ?? null);
      setRows((regs.data ?? []) as AdminRegistrationRow[]);
    });
  }, [eventId]);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = { registered: 0, waitlisted: 0, attended: 0, no_show: 0, cancelled: 0 } as Record<RegistrationStatus, number>;
    for (const r of rows ?? []) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qCode = normalizeReferralCode(query);
    return (rows ?? []).filter(
      (r) =>
        matches(filter, r.status) &&
        (!q || (r.display_name ?? "").toLowerCase().includes(q) || (qCode.length >= 3 && r.ticket_code.includes(qCode))),
    );
  }, [rows, filter, query]);

  const phase = event ? eventPhase(event, loadedAt) : null;
  const started = event ? new Date(event.starts_at).getTime() <= loadedAt : false;
  const full = event ? seatsTaken(event) >= event.capacity : true;
  const closed = phase === "cancelled";

  async function run(key: string, fn: () => PromiseLike<{ error: unknown; data?: unknown }>, done: (data: unknown) => string) {
    setBusy(key);
    setError(null);
    const { data, error } = await fn();
    setBusy(null);
    if (error) {
      setError(await describeError(error));
      return false;
    }
    setNotice(done(data));
    load();
    return true;
  }

  async function checkInByCode(e: FormEvent) {
    e.preventDefault();
    const value = normalizeReferralCode(code);
    if (!value) return;
    // Le code doit appartenir à cet événement : un billet d'un autre soir n'est jamais pointé ici.
    const row = (rows ?? []).find((r) => r.ticket_code === value);
    if (!row) {
      setNotice(null);
      setError(`Aucun billet ${value} pour cet événement. Vérifiez le code ou la date du billet.`);
      return;
    }
    if (row.status === "waitlisted" || row.status === "cancelled") {
      setNotice(null);
      setError(`${row.display_name ?? "Ce membre"} n’a pas de place confirmée (${REGISTRATION_STATUS_LABELS[row.status].toLowerCase()}).`);
      return;
    }
    const ok = await run(
      "code",
      () => createClient().rpc("admin_check_in", { p_registration_id: row.id }),
      (data) => {
        const d = (data ?? {}) as { already?: boolean };
        const who = row.display_name ?? "Le membre";
        return d.already ? `${who} était déjà pointé·e.` : `${who} est pointé·e. Bonne soirée.`;
      },
    );
    if (ok) setCode("");
  }

  async function exportCsv() {
    setBusy("export");
    setError(null);
    const { data, error } = await createClient().rpc("admin_export_event", { p_event_id: eventId });
    setBusy(null);
    if (error) {
      setError(await describeError(error));
      return;
    }
    const regs = ((data as { registrations?: ExportRow[] } | null)?.registrations ?? []) as ExportRow[];
    const lines = [
      "prenom;email;statut;rang_attente;billet;pointe_le",
      ...regs.map((r) =>
        [
          r.display_name,
          r.email,
          REGISTRATION_STATUS_LABELS[r.status] ?? r.status,
          r.waitlist_rank,
          r.ticket_code,
          r.checked_in_at ? fmtDateTime(r.checked_in_at) : null,
        ]
          .map(csvCell)
          .join(";"),
      ),
    ];
    const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sapios-inscrits-${(event?.starts_at ?? "").slice(0, 10) || eventId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Export de ${regs.length} ligne${regs.length > 1 ? "s" : ""}, emails compris. Ne le partagez pas.`);
  }

  if (event === null) {
    return (
      <>
        <Link className="adm-back label" href="/admin/evenements">
          ← Événements
        </Link>
        <Empty title="Événement introuvable." />
      </>
    );
  }

  const taken = event ? seatsTaken(event) : 0;

  return (
    <>
      <Link className="adm-back label" href={event ? `/admin/evenements?evenement=${event.id}` : "/admin/evenements"}>
        ← Événements
      </Link>
      <div className="adm-head">
        <div>
          <p className="label">
            {event ? `${EVENT_KIND_LABELS[event.kind]} · inscrits` : "Inscrits"}
            {phase === "cancelled" ? " · annulé" : phase === "past" ? " · passé" : started ? " · pointage ouvert" : ""}
          </p>
          <h1>{event ? event.title : "…"}</h1>
          {event ? (
            <p className="lead">
              {fmtEventRange(event.starts_at, event.ends_at)} · {[event.neighbourhood ?? event.city, event.venue_name].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={exportCsv} disabled={busy === "export" || !rows?.length}>
            {busy === "export" ? "Export…" : "Exporter en CSV"}
          </button>
        </div>
      </div>

      {event ? (
        <div className="kpis" style={{ marginBottom: 24 }}>
          <div className="kpi kpi--hero">
            <span className="label">Inscrits</span>
            <span className="v">{taken}</span>
            <span className="s">sur {event.capacity} places</span>
          </div>
          <div className="kpi">
            <span className="label">Capacité</span>
            <span className="v">{event.capacity}</span>
            <span className="s">{full ? "Complet" : `${event.capacity - taken} place${event.capacity - taken > 1 ? "s" : ""} libre${event.capacity - taken > 1 ? "s" : ""}`}</span>
          </div>
          <div className="kpi">
            <span className="label">Liste d’attente</span>
            <span className="v">{counts.waitlisted}</span>
            <span className="s">Dans l’ordre d’arrivée</span>
          </div>
          <div className="kpi">
            <span className="label">Venus</span>
            <span className="v">{counts.attended}</span>
            <span className="s">
              {counts.no_show
                ? `${counts.no_show} absent${counts.no_show > 1 ? "s" : ""}`
                : counts.attended || started
                  ? "Pointage en cours"
                  : "Pointage à l’entrée"}
            </span>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      <div aria-live="assertive">{error ? <ErrorNotice message={error} onRetry={load} /> : null}</div>

      {!closed ? (
        <div className="toolbar">
          <form className="checkin" onSubmit={checkInByCode}>
            <div className="field">
              <label className="label" htmlFor={`${id}-code`}>
                Pointer un billet
              </label>
              <input
                id={`${id}-code`}
                className="input"
                autoComplete="off"
                spellCheck={false}
                placeholder="Code du billet"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--sm" disabled={!code.trim() || busy === "code"}>
              {busy === "code" ? "Pointage…" : "Pointer"}
            </button>
          </form>
          {started && counts.registered > 0 ? (
            <div className="form-actions">
              {confirmNoShows ? (
                <>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    disabled={busy === "noshow"}
                    onClick={async () => {
                      await run(
                        "noshow",
                        () => createClient().rpc("admin_mark_no_shows", { p_event_id: eventId }),
                        (n) => `${Number(n) || 0} inscrit${Number(n) > 1 ? "s" : ""} non pointé${Number(n) > 1 ? "s" : ""} marqué${Number(n) > 1 ? "s" : ""} absent${Number(n) > 1 ? "s" : ""}.`,
                      );
                      setConfirmNoShows(false);
                    }}
                  >
                    {`Confirmer : ${counts.registered} absent${counts.registered > 1 ? "s" : ""}`}
                  </button>
                  <button type="button" className="adm-link" onClick={() => setConfirmNoShows(false)}>
                    Annuler
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirmNoShows(true)}>
                  Marquer les absents
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filtrer les inscrits">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <label className="sr-only" htmlFor={`${id}-q`}>
            Rechercher un inscrit
          </label>
          <input
            id={`${id}-q`}
            className="input"
            style={{ minHeight: 42, borderWidth: 1.5, fontSize: 14, padding: "8px 10px" }}
            placeholder="Rechercher un prénom ou un billet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty title="Personne n’est encore inscrit." /> : null}
      {rows && rows.length > 0 && visible.length === 0 ? <Empty title="Aucun inscrit ne correspond." /> : null}
      {visible.length > 0 ? (
        <div className="tbl-wrap">
          <table className="tbl tbl--cards">
            <caption className="sr-only">Inscriptions à l’événement</caption>
            <thead>
              <tr>
                <th scope="col">Membre</th>
                <th scope="col">Statut</th>
                <th scope="col">Billet</th>
                <th scope="col">Pointé</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const dim = r.status === "cancelled" || r.status === "no_show";
                return (
                  <tr key={r.id} className={dim ? "is-dim" : undefined}>
                    <td data-label="Membre" className="span">
                      <span className="strong">{r.display_name ?? "Membre sans prénom"}</span>
                      <br />
                      <span className="muted">Inscrit·e {fmtDateTime(r.created_at)}</span>
                    </td>
                    <td data-label="Statut">
                      <StatusCell row={r} />
                    </td>
                    <td data-label="Billet">
                      {r.status === "waitlisted" ? <span className="muted">—</span> : <span className="mono-code">{r.ticket_code}</span>}
                    </td>
                    <td data-label="Pointé">{r.checked_in_at ? fmtHour(r.checked_in_at) : <span className="muted">—</span>}</td>
                    <td>
                      {r.status === "registered" && !closed ? (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={busy === r.id}
                          onClick={() =>
                            run(
                              r.id,
                              () => createClient().rpc("admin_check_in", { p_registration_id: r.id }),
                              () => `${r.display_name ?? "Le membre"} est pointé·e.`,
                            )
                          }
                        >
                          Pointer
                        </button>
                      ) : r.status === "waitlisted" && !closed && !started ? (
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          disabled={busy === r.id || full}
                          title={full ? "Complet : aucune place à donner pour l’instant." : undefined}
                          onClick={() =>
                            run(
                              r.id,
                              () => createClient().rpc("admin_promote_registration", { p_registration_id: r.id }),
                              () => `${r.display_name ?? "Le membre"} a une place. Le billet lui est envoyé.`,
                            )
                          }
                        >
                          Promouvoir
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
        Les membres ne voient jamais cette liste, seulement les places restantes. Une personne promue depuis la liste
        d’attente reçoit son billet dans l’application.
      </p>
    </>
  );
}

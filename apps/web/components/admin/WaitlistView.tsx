"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { levelLabel } from "@sapios/shared";
import LevelLabel from "@/components/LevelLabel";
import { describeError, isMissingFunction } from "@/lib/admin/errors";
import { fmtAgo, fmtDateTime, levelText, numberFr, PROFILE_STATUS_LABELS, TIER_LABELS } from "@/lib/admin/format";
import type { ProfileStatus, WaitlistMember, WaitlistSignup } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

type AdmitTier = "standard" | "unlimited";

async function loadMembers(): Promise<WaitlistMember[]> {
  const supabase = createClient();
  let rows: Array<Pick<WaitlistMember, "user_id" | "level" | "granted_at" | "email" | "display_name" | "status">>;

  const rpc = await supabase.rpc("admin_list_waitlist");
  if (!rpc.error) {
    rows = ((rpc.data ?? []) as Array<{
      user_id: string;
      email: string | null;
      display_name: string | null;
      level: number | null;
      granted_at: string;
      profile_status: ProfileStatus | null;
    }>).map((r) => ({ ...r, status: r.profile_status }));
  } else if (isMissingFunction(rpc.error)) {
    // Repli : lecture directe (RLS admin), sans email.
    const { data, error } = await supabase
      .from("user_access")
      .select("user_id, level, granted_at")
      .eq("tier", "waitlist")
      .order("granted_at", { ascending: true })
      .limit(1000);
    if (error) throw error;
    rows = ((data ?? []) as Array<{ user_id: string; level: number | null; granted_at: string }>).map((r) => ({
      ...r,
      email: null,
      display_name: null,
      status: null,
    }));
  } else {
    throw rpc.error;
  }

  const ids = rows.map((r) => r.user_id);
  if (!ids.length) return [];
  const [profiles, privates] = await Promise.all([
    supabase.from("profiles").select("id, display_name, city, status").in("id", ids),
    supabase.from("profile_private").select("user_id, legal_name").in("user_id", ids),
  ]);
  const p = new Map(
    ((profiles.data ?? []) as Array<{ id: string; display_name: string | null; city: string | null; status: ProfileStatus }>).map(
      (x) => [x.id, x],
    ),
  );
  const pp = new Map(((privates.data ?? []) as Array<{ user_id: string; legal_name: string | null }>).map((x) => [x.user_id, x]));
  return rows.map((r) => ({
    ...r,
    tier: "waitlist" as const,
    display_name: r.display_name ?? p.get(r.user_id)?.display_name ?? null,
    city: p.get(r.user_id)?.city ?? null,
    status: r.status ?? p.get(r.user_id)?.status ?? null,
    legal_name: pp.get(r.user_id)?.legal_name ?? null,
  }));
}

async function loadSignups(): Promise<{ rows: WaitlistSignup[]; total: number | null }> {
  const { data, error, count } = await createClient()
    .from("waitlist_signups")
    .select("id, email, source, level, city, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return { rows: (data ?? []) as WaitlistSignup[], total: count };
}

function csvCell(v: string | null): string {
  const s = v ?? "";
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Members() {
  const id = useId();
  const [rows, setRows] = useState<WaitlistMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<AdmitTier>("standard");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const allRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    loadMembers()
      .then((r) => {
        setError(null);
        setRows(r);
        setSelected((prev) => new Set([...prev].filter((x) => r.some((m) => m.user_id === x))));
      })
      .catch(async (e) => setError(await describeError(e)));
  }, []);
  useEffect(load, [load]);

  const all = rows?.length ? selected.size === rows.length : false;
  const some = selected.size > 0 && !all;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some;
  }, [some]);

  function toggle(uid: string) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function admit() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("admin_admit_waitlist", {
      p_user_ids: [...selected],
      p_tier: tier,
    });
    setBusy(false);
    setConfirming(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    const n = typeof data === "number" ? data : 0;
    setNotice(`${n} membre${n > 1 ? "s" : ""} admis au palier ${TIER_LABELS[tier]}. Notification envoyée.`);
    const admitted = selected;
    setRows((rs) => (rs ?? []).filter((r) => !admitted.has(r.user_id)));
    setSelected(new Set());
    load();
  }

  return (
    <section aria-labelledby={`${id}-t`}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h2 className="serif" id={`${id}-t`} style={{ fontSize: 30, lineHeight: 1.1 }}>
          Membres en attente <span className="label">{rows ? `· ${rows.length}` : ""}</span>
        </h2>
        <p style={{ maxWidth: "58ch" }}>Diplôme validé au palier « liste d’attente ». Admission par lot, du plus ancien au plus récent.</p>
      </div>
      <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty title="Personne ne patiente. Pour une fois." /> : null}
      {rows && rows.length > 0 ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">Membres au palier liste d’attente</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 44 }}>
                    <label className="check">
                      <input
                        ref={allRef}
                        type="checkbox"
                        checked={all}
                        onChange={() => {
                          setConfirming(false);
                          setSelected(all ? new Set() : new Set(rows.map((r) => r.user_id)));
                        }}
                        aria-label="Tout sélectionner"
                      />
                    </label>
                  </th>
                  <th scope="col">Membre</th>
                  <th scope="col">Niveau</th>
                  <th scope="col">Ville</th>
                  <th scope="col">Profil</th>
                  <th scope="col">En attente depuis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const on = selected.has(m.user_id);
                  return (
                    <tr key={m.user_id} className={on ? "is-selected" : undefined}>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(m.user_id)}
                            aria-label={`Sélectionner ${m.display_name ?? m.legal_name ?? "ce membre"}`}
                          />
                        </label>
                      </td>
                      <td>
                        <span className="strong">{m.display_name ?? "Sans prénom"}</span>
                        <br />
                        <span className="muted">
                          {[m.legal_name, m.email].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </td>
                      <td>{levelText(m.level)}</td>
                      <td>{m.city ?? "—"}</td>
                      <td>{m.status ? PROFILE_STATUS_LABELS[m.status] : "—"}</td>
                      <td title={fmtDateTime(m.granted_at)}>{fmtAgo(m.granted_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actionbar" role="region" aria-label="Admission par lot">
            <span className="label" aria-live="polite">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""} sur {rows.length}
            </span>
            <div className="form-actions">
              <label className="label" htmlFor={`${id}-tier`}>
                Palier
              </label>
              <select
                id={`${id}-tier`}
                className="select"
                value={tier}
                onChange={(e) => {
                  setTier(e.target.value as AdmitTier);
                  setConfirming(false);
                }}
              >
                <option value="standard">{TIER_LABELS.standard} (standard)</option>
                <option value="unlimited">{TIER_LABELS.unlimited}</option>
              </select>
              <button type="button" className="btn" disabled={!selected.size || busy} onClick={admit}>
                {busy ? "Admission…" : confirming ? `Confirmer l’admission de ${selected.size}` : `Admettre ${selected.size || ""}`.trim()}
              </button>
              {confirming ? (
                <button type="button" className="adm-link" onClick={() => setConfirming(false)}>
                  Annuler
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Signups() {
  const id = useId();
  const [data, setData] = useState<{ rows: WaitlistSignup[]; total: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    loadSignups()
      .then((d) => {
        setError(null);
        setData(d);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, []);
  useEffect(load, [load]);

  const csvHref = useMemo(() => {
    if (!data?.rows.length) return null;
    const lines = [
      "email;niveau;ville;source;created_at",
      ...data.rows.map((r) =>
        [r.email, r.level != null ? levelLabel(r.level) : null, r.city, r.source, r.created_at].map(csvCell).join(";"),
      ),
    ];
    return `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
  }, [data]);

  return (
    <section aria-labelledby={`${id}-t`} style={{ marginTop: 56 }}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h2 className="serif" id={`${id}-t`} style={{ fontSize: 30, lineHeight: 1.1 }}>
          Inscrits depuis le site <span className="label">{data?.total != null ? `· ${numberFr.format(data.total)}` : ""}</span>
        </h2>
        {csvHref ? (
          <a className="btn btn--sm btn--ghost" href={csvHref} download="sapios-liste-attente.csv">
            Exporter en CSV
          </a>
        ) : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!data && !error ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Empty title="Aucune inscription pour l’instant." /> : null}
      {data && data.rows.length > 0 ? (
        <div className="tbl-wrap">
          <table className="tbl tbl--cards">
            <caption className="sr-only">Inscriptions à la liste d’attente de la landing</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Niveau déclaré</th>
                <th scope="col">Ville</th>
                <th scope="col">Source</th>
                <th scope="col">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="span strong" style={{ wordBreak: "break-all" }}>
                    {r.email}
                  </td>
                  <td data-label="Niveau déclaré">
                    {r.level != null ? <LevelLabel label={levelLabel(r.level)} /> : <span className="muted">—</span>}
                  </td>
                  <td data-label="Ville">{r.city ?? <span className="muted">—</span>}</td>
                  <td data-label="Source">{r.source ?? "—"}</td>
                  <td data-label="Inscription">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function WaitlistView() {
  return (
    <>
      <PageHead
        label="Admission"
        title={
          <>
            Liste <em>d’attente</em>
          </>
        }
        lead="On vous rappellera. Peut-être. C’est ici que « peut-être » devient « oui »."
      />
      <Members />
      <Signups />
    </>
  );
}

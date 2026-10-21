"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ACCESS_TIERS, SUBMISSION_STATUSES, type AccessTier, type SubmissionStatus } from "@sapios/shared";
import { describeError, isMissingFunction } from "@/lib/admin/errors";
import { numberFr, PROFILE_STATUS_LABELS, STATUS_LABELS, TIER_LABELS } from "@/lib/admin/format";
import type { ProfileStatus } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead } from "./ui";

const PROFILE_STATUSES: ProfileStatus[] = ["onboarding", "active", "paused", "banned"];

interface Stats {
  users_total: number | null;
  profiles_by_status: Partial<Record<ProfileStatus, number>>;
  submissions_by_status: Partial<Record<SubmissionStatus, number>>;
  members_by_tier: Partial<Record<AccessTier, number>>;
  matches_total: number | null;
  matches_active: number | null;
  messages_total: number | null;
  waitlist_signups: number | null;
  reports_open: number | null;
  source: "rpc" | "fallback";
}

async function loadStats(): Promise<Stats> {
  const supabase = createClient();
  const rpc = await supabase.rpc("admin_stats");
  if (!rpc.error && rpc.data) return { ...(rpc.data as Omit<Stats, "source">), source: "rpc" };
  if (rpc.error && !isMissingFunction(rpc.error)) throw rpc.error;

  // Repli tant que admin_stats() n'existe pas : comptages directs autorisés aux admins par la RLS.
  const head = { count: "exact" as const, head: true };
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    return error ? null : n;
  };
  const [profiles, subs, tiers, waitlist, reports] = await Promise.all([
    Promise.all(PROFILE_STATUSES.map((s) => count(supabase.from("profiles").select("id", head).eq("status", s)))),
    Promise.all(SUBMISSION_STATUSES.map((s) => count(supabase.from("degree_submissions").select("id", head).eq("status", s)))),
    Promise.all(ACCESS_TIERS.map((t) => count(supabase.from("user_access").select("user_id", head).eq("tier", t)))),
    count(supabase.from("waitlist_signups").select("id", head)),
    count(supabase.from("reports").select("id", head).eq("status", "open")),
  ]);
  const zip = <K extends string>(keys: readonly K[], values: Array<number | null>) =>
    Object.fromEntries(keys.map((k, i) => [k, values[i] ?? 0])) as Record<K, number>;
  const usersTotal = profiles.every((n) => n == null) ? null : profiles.reduce<number>((a, n) => a + (n ?? 0), 0);
  return {
    users_total: usersTotal,
    profiles_by_status: zip(PROFILE_STATUSES, profiles),
    submissions_by_status: zip(SUBMISSION_STATUSES, subs),
    members_by_tier: zip(ACCESS_TIERS, tiers),
    matches_total: null,
    matches_active: null,
    messages_total: null,
    waitlist_signups: waitlist,
    reports_open: reports,
    source: "fallback",
  };
}

const n = (v: number | null | undefined) => (v == null ? "—" : numberFr.format(v));
const plural = (v: number | null | undefined, one: string, many: string) => `${n(v)} ${(v ?? 0) > 1 ? many : one}`;

function Bars<K extends string>({
  title,
  keys,
  values,
  labels,
}: {
  title: string;
  keys: readonly K[];
  values: Partial<Record<K, number>>;
  labels: Record<K, string>;
}) {
  const total = keys.reduce((a, k) => a + (values[k] ?? 0), 0);
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-h">
        <h2 className="label">{title}</h2>
        <span className="label">Total {n(total)}</span>
      </div>
      <div className="panel-b">
        <ul className="bars">
          {keys.map((k) => {
            const v = values[k] ?? 0;
            const share = total ? v / total : 0;
            return (
              <li key={k}>
                <span>{labels[k]}</span>
                <span className="n">
                  {n(v)}
                  <small>{total ? `${Math.round(share * 100)} %` : "—"}</small>
                </span>
                <span className="track" aria-hidden="true">
                  <i className={v ? "" : "zero"} style={{ width: `${share * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadStats()
      .then((s) => {
        setError(null);
        setStats(s);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, []);

  useEffect(load, [load]);

  const toReview = stats?.submissions_by_status.needs_review ?? null;
  return (
    <>
      <PageHead
        label="Back-office"
        title={
          <>
            Vue <em>d’ensemble</em>
          </>
        }
        lead="Ce qui attend une décision humaine, puis l’état du club."
        aside={
          <button type="button" className="btn btn--sm btn--ghost" onClick={load}>
            Actualiser
          </button>
        }
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!stats && !error ? <Loading /> : null}
      {stats ? (
        <>
          <div className="kpis">
            <Link href="/admin/diplomes" className="kpi kpi--hero" style={{ textDecoration: "none" }}>
              <span className="label">Diplômes à revoir</span>
              <span className="v">{n(toReview)}</span>
              <span className="s">Ouvrir la file →</span>
            </Link>
            <div className="kpi">
              <span className="label">Inscrits</span>
              <span className="v">{n(stats.users_total)}</span>
              <span className="s">{plural(stats.profiles_by_status.active, "profil actif", "profils actifs")}</span>
            </div>
            <div className="kpi">
              <span className="label">Matches</span>
              <span className="v">{n(stats.matches_total)}</span>
              <span className="s">
                {stats.matches_active == null ? "Non disponible sans admin_stats()" : plural(stats.matches_active, "actif", "actifs")}
              </span>
            </div>
            <Link href="/admin/liste-attente" className="kpi" style={{ textDecoration: "none" }}>
              <span className="label">Inscrits du site</span>
              <span className="v">{n(stats.waitlist_signups)}</span>
              <span className="s">
                {plural(stats.members_by_tier.waitlist, "membre en liste d’attente", "membres en liste d’attente")}
              </span>
            </Link>
            <Link href="/admin/signalements" className="kpi" style={{ textDecoration: "none" }}>
              <span className="label">Signalements ouverts</span>
              <span className="v">{n(stats.reports_open)}</span>
              <span className="s">Traiter →</span>
            </Link>
          </div>

          <div className="stat-grid">
            <Bars title="Soumissions par statut" keys={SUBMISSION_STATUSES} values={stats.submissions_by_status} labels={STATUS_LABELS} />
            <Bars title="Membres par palier" keys={ACCESS_TIERS} values={stats.members_by_tier} labels={TIER_LABELS} />
            <Bars title="Profils par statut" keys={PROFILE_STATUSES} values={stats.profiles_by_status} labels={PROFILE_STATUS_LABELS} />
          </div>
          {stats.source === "fallback" ? (
            <p className="label" style={{ marginTop: 18 }}>
              Comptages directs (RPC admin_stats absente) — matches et messages non comptés.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

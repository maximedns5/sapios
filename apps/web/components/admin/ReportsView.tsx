"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { studyFieldLabel } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import {
  fmtAgo,
  fmtDate,
  fmtDateTime,
  levelText,
  PROFILE_STATUS_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  TIER_LABELS,
} from "@/lib/admin/format";
import { loadPromptTexts, promptText, type PromptTexts } from "@/lib/admin/prompts";
import type { ProfileStatus, ReportContext, ReportRow, ReportStatus } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_KIND_LABELS } from "./ContentQueue";
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

const MODERATION_MARK: Record<string, string> = { pending: " · repéré", rejected: " · retiré" };

/** Contexte du signalement (audit n° 23) : la personne, le texte visé, l'historique, le lien entre eux. */
function ReportContextPanel({ report, prompts }: { report: ReportRow; prompts: PromptTexts }) {
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; rejected: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase
      .rpc("admin_get_report_context", { p_report_id: report.id })
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) {
          setError(await describeError(error));
          return;
        }
        const c = data as unknown as ReportContext;
        setCtx(c);
        if (c.photos.length) {
          // Les admins lisent toutes les photos (politique du bucket) ; liens valables 5 minutes.
          const signed = await supabase.storage.from("photos").createSignedUrls(
            c.photos.map((p) => p.storage_path),
            300,
          );
          if (!alive) return;
          setPhotos(
            (signed.data ?? []).flatMap((s, i) => {
              const photo = c.photos[i];
              return s.signedUrl && photo ? [{ id: photo.id, url: s.signedUrl, rejected: photo.moderation_status === "rejected" }] : [];
            }),
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [report.id]);

  if (error) return <ErrorNotice message={error} />;
  if (!ctx) return <Loading label="Chargement du contexte" />;
  const t = ctx.target;
  const rel = ctx.relationship;
  return (
    <div className="report-ctx">
      <div className="report-person">
        {photos.length ? (
          <ul className="report-photos" aria-label="Photos du profil signalé">
            {photos.map((p, i) => (
              <li key={p.id} className={p.rejected ? "is-off" : undefined}>
                {/* URL signée éphémère : next/image n'apporte rien ici. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}${p.rejected ? " (retirée)" : ""}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune photo.</p>
        )}
        {t ? (
          <dl className="kv">
            <dt>Profil</dt>
            <dd>
              {[t.display_name, t.age != null ? `${t.age} ans` : null, t.city].filter(Boolean).join(" · ") || "—"}
              {t.legal_name ? <span className="muted"> · {t.legal_name}</span> : null}
            </dd>
            <dt>Diplôme</dt>
            <dd>
              {t.level ? levelText(t.level) : "aucun validé"}
              {t.tier ? ` · ${TIER_LABELS[t.tier]}` : ""}
              {t.institution ? ` · ${t.institution}` : ""}
              {t.study_field ? ` · ${studyFieldLabel(t.study_field)}` : ""}{" "}
              {t.source_submission_id ? (
                <Link className="adm-link" href={`/admin/diplomes/${t.source_submission_id}`}>
                  {report.reason === "fake_diploma" ? "Revoir le diplôme validé" : "Voir le diplôme"}
                </Link>
              ) : null}
            </dd>
            <dt>Bio</dt>
            <dd className={t.bio ? undefined : "empty"}>{t.bio || "aucune"}</dd>
            <dt>Compte</dt>
            <dd>
              Inscrit le {fmtDate(t.created_at)} · actif {fmtAgo(t.last_active_at)}
              {t.email ? <span className="muted"> · {t.email}</span> : null}
            </dd>
          </dl>
        ) : (
          <p className="muted">Compte supprimé depuis le signalement.</p>
        )}
      </div>

      {ctx.content ? (
        <div className="report-content">
          <p className="label">
            Texte signalé · {CONTENT_KIND_LABELS[ctx.content.kind]}
            {ctx.content.kind === "answer" ? ` · ${promptText(ctx.content.prompt_key, prompts)}` : ""}
          </p>
          <blockquote>{ctx.content.text ?? "Texte supprimé par le membre depuis le signalement."}</blockquote>
          {ctx.content.flag_id ? (
            <p>
              <Link className="adm-link" href={`/admin/contenus?statut=${ctx.content.flag_status ?? "open"}`}>
                {ctx.content.flag_status === "open" ? "Décider dans Contenus (garder ou retirer le texte)" : "Voir dans Contenus"}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {ctx.answers.length || ctx.books.length || ctx.thesis ? (
        <details className="report-more">
          <summary className="label">
            Profil intellectuel · {ctx.answers.length} réponse{ctx.answers.length > 1 ? "s" : ""}, {ctx.books.length} livre
            {ctx.books.length > 1 ? "s" : ""}
            {ctx.thesis ? ", une thèse" : ""}
          </summary>
          <ul>
            {ctx.answers.map((a) => (
              <li key={a.id}>
                <span className="label">
                  {promptText(a.prompt_key, prompts)}
                  {MODERATION_MARK[a.moderation_status] ?? ""}
                </span>
                {a.answer}
              </li>
            ))}
            {ctx.books.map((b) => (
              <li key={b.id}>
                <span className="label">Livre{MODERATION_MARK[b.moderation_status] ?? ""}</span>
                {b.title}
                {b.author ? `, ${b.author}` : ""}
              </li>
            ))}
            {ctx.thesis ? (
              <li>
                <span className="label">Thèse{MODERATION_MARK[ctx.thesis.moderation_status] ?? ""}</span>
                {ctx.thesis.line}
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}

      <dl className="kv">
        <dt>Historique</dt>
        <dd>
          {ctx.reports_against.total} signalement{ctx.reports_against.total > 1 ? "s" : ""} reçu
          {ctx.reports_against.total > 1 ? "s" : ""}, dont {ctx.reports_against.open} ouvert
          {ctx.reports_against.open > 1 ? "s" : ""} et {ctx.reports_against.actioned} sanctionné
          {ctx.reports_against.actioned > 1 ? "s" : ""}
          {ctx.reports_against.reasons.length > 1 ? (
            <span className="muted">
              {" "}
              · motifs : {ctx.reports_against.reasons.map((r) => REPORT_REASON_LABELS[r] ?? r).join(", ")}
            </span>
          ) : null}
        </dd>
        <dt>Entre eux</dt>
        <dd>
          {rel.matched_at
            ? `Match le ${fmtDate(rel.matched_at)}${rel.unmatched_at ? `, rompu le ${fmtDate(rel.unmatched_at)}` : ", toujours actif"}`
            : "Pas de match"}
          {rel.reporter_blocked ? " · bloqué·e par l’auteur du signalement" : ""}
          {rel.target_blocked ? " · a bloqué l’auteur du signalement" : ""}
          <span className="muted"> · les messages ne sont pas consultables</span>
        </dd>
        {ctx.reporter ? (
          <>
            <dt>Auteur</dt>
            <dd>
              {ctx.reporter.display_name ?? "Membre"} · {ctx.reporter.reports_filed} signalement
              {ctx.reporter.reports_filed > 1 ? "s" : ""} envoyé{ctx.reporter.reports_filed > 1 ? "s" : ""}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function ReportCard({
  report,
  data,
  prompts,
  onDone,
}: {
  report: ReportRow;
  data: Loaded;
  prompts: PromptTexts;
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
          {report.content_kind ? (
            <>
              <dt>Vise</dt>
              <dd>{CONTENT_KIND_LABELS[report.content_kind]}</dd>
            </>
          ) : null}
          {report.status !== "open" ? (
            <>
              <dt>Traité</dt>
              <dd>
                {REPORT_STATUS_LABELS[report.status]} · {fmtDateTime(report.handled_at)}
              </dd>
            </>
          ) : null}
        </dl>
        {report.status === "open" ? <ReportContextPanel report={report} prompts={prompts} /> : null}
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
  const [prompts, setPrompts] = useState<PromptTexts>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([loadReports(status), loadPromptTexts().catch(() => ({}))])
      .then(([d, texts]) => {
        setError(null);
        setPrompts(texts);
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
        lead="Les plus anciens d’abord, avec la personne signalée et son historique. Bannir masque le profil et rompt les matches ; la décision est journalisée."
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
              prompts={prompts}
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

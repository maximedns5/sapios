"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { contentFlagReasonLabel, type ContentFlagStatus, type ContentKind } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { fmtAgo, fmtDateTime, REPORT_REASON_LABELS } from "@/lib/admin/format";
import { loadPromptTexts, promptText, type PromptTexts } from "@/lib/admin/prompts";
import type { FlaggedContentRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const FILTERS: ContentFlagStatus[] = ["open", "removed", "kept", "withdrawn"];
const FILTER_LABELS: Record<ContentFlagStatus, string> = {
  open: "À décider",
  removed: "Retirés",
  kept: "Gardés",
  withdrawn: "Supprimés par le membre",
};

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  answer: "Réponse à une question",
  book: "Livre",
  thesis: "Thèse ou mémoire",
};

// Motifs envoyés tels quels au membre (obligation de motivation du DSA) : une phrase factuelle,
// qui dit ce qui a été constaté et ce qu'il peut faire.
const REMOVE_REASONS: Array<{ label: string; text: string }> = [
  {
    label: "Coordonnées",
    text: "Votre texte contenait des coordonnées (téléphone, email ou réseau social). Elles s’échangent en message, après un match.",
  },
  {
    label: "Propos injurieux",
    text: "Votre texte contenait des propos injurieux, haineux ou discriminatoires, contraires aux règles de Sapios.",
  },
  {
    label: "Contenu sexuel",
    text: "Votre texte contenait un contenu sexuel explicite, contraire aux règles de Sapios.",
  },
  {
    label: "Donnée sur un tiers",
    text: "Votre texte permettait d’identifier une autre personne ou révélait une information sensible la concernant.",
  },
  {
    label: "Publicité",
    text: "Votre texte faisait la promotion d’un service, d’un produit ou d’un site.",
  },
];

/** Motif d'un repérage ; un signalement porte le motif choisi par le membre (`report:<code>`). */
function flagReason(reason: string): string {
  if (reason.startsWith("report:")) {
    const code = reason.slice("report:".length);
    return `Signalé : ${REPORT_REASON_LABELS[code] ?? code}`;
  }
  return contentFlagReasonLabel(reason);
}

function ContentCard({
  row,
  prompts,
  onDone,
}: {
  row: FlaggedContentRow;
  prompts: PromptTexts;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<"idle" | "remove">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = row.current_text != null && row.current_text !== row.excerpt;
  const deleted = row.current_text == null;
  const who = row.display_name ?? `Membre ${row.user_id.slice(0, 8)}`;

  async function decide(decision: "keep" | "remove") {
    if (decision === "remove" && reason.trim().length < 10) {
      setError("Écrivez le motif envoyé au membre (10 caractères au moins), ou choisissez-en un.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("admin_moderate_content", {
      p_flag_id: row.id,
      p_decision: decision,
      p_reason: decision === "remove" ? reason.trim() : undefined,
    });
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    onDone(decision === "remove" ? `Texte de ${who} retiré. Le motif lui est envoyé.` : `Texte de ${who} gardé.`);
  }

  return (
    <article className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 className="label" id={`${id}-t`}>
          {row.source === "report" ? <span className="badge badge--solid">Signalé</span> : null}{" "}
          {CONTENT_KIND_LABELS[row.kind]}
        </h2>
        <span className="label" title={fmtDateTime(row.created_at)}>
          {fmtAgo(row.created_at)}
        </span>
      </div>
      <div className="panel-b content-card">
        <div className="content-text">
          {row.kind === "answer" ? <p className="label">{promptText(row.prompt_key, prompts)}</p> : null}
          <blockquote>{deleted ? row.excerpt : row.current_text}</blockquote>
          {changed ? (
            <p className="muted">
              Modifié depuis le repérage. Texte repéré : « {row.excerpt} »
            </p>
          ) : null}
          {deleted ? <p className="muted">Le membre a supprimé ce texte depuis.</p> : null}
        </div>
        <dl className="kv">
          <dt>Auteur</dt>
          <dd>
            {who}
            {row.email ? <span className="muted"> · {row.email}</span> : null}
          </dd>
          <dt>Pourquoi</dt>
          <dd>
            <span className="chips" style={{ display: "inline-flex" }}>
              {row.reasons.map((r) => (
                <span key={r} className="badge">
                  {flagReason(r)}
                </span>
              ))}
            </span>
          </dd>
          {row.source === "report" ? (
            <>
              <dt>Signalement</dt>
              <dd>
                {row.report_reason ? (REPORT_REASON_LABELS[row.report_reason] ?? row.report_reason) : "—"}
                {row.report_details ? <span className="muted"> · « {row.report_details} »</span> : null}{" "}
                <Link className="adm-link" href="/admin/signalements">
                  Voir les signalements
                </Link>
              </dd>
            </>
          ) : null}
          {row.status !== "open" ? (
            <>
              <dt>Décision</dt>
              <dd>
                {FILTER_LABELS[row.status]} · {fmtDateTime(row.handled_at)}
                {row.decision_reason ? <span className="muted"> · « {row.decision_reason} »</span> : null}
              </dd>
            </>
          ) : null}
        </dl>

        {row.status === "open" ? (
          <>
            {mode === "remove" ? (
              <div className="field">
                <label className="label" htmlFor={`${id}-reason`}>
                  Motif envoyé au membre (obligatoire)
                </label>
                <div className="chips">
                  {REMOVE_REASONS.map((r) => (
                    <button key={r.label} type="button" className="chip" onClick={() => setReason(r.text)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <textarea
                  id={`${id}-reason`}
                  className="textarea"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ce qui a été constaté, en une phrase."
                />
                <span className="label" style={{ textAlign: "right" }}>
                  {reason.length} / 500
                </span>
              </div>
            ) : null}
            <div aria-live="assertive">{error ? <ErrorNotice message={error} /> : null}</div>
            <div className="form-actions">
              {mode === "remove" ? (
                <>
                  <button type="button" className="btn btn--sm" disabled={busy} onClick={() => decide("remove")}>
                    {busy ? "Envoi…" : "Retirer et prévenir le membre"}
                  </button>
                  <button type="button" className="adm-link" onClick={() => setMode("idle")} disabled={busy}>
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => decide("keep")}>
                    Garder
                  </button>
                  <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setMode("remove")}>
                    Retirer…
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function ContentQueue({ status }: { status: ContentFlagStatus }) {
  const [rows, setRows] = useState<FlaggedContentRow[] | null>(null);
  const [prompts, setPrompts] = useState<PromptTexts>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([createClient().rpc("admin_list_flagged_content", { p_status: status }), loadPromptTexts()])
      .then(([list, texts]) => {
        if (list.error) throw list.error;
        setError(null);
        setPrompts(texts);
        setRows((list.data ?? []) as FlaggedContentRow[]);
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
            <em>Contenus</em> à vérifier
          </>
        }
        lead="Réponses, livres et thèses repérés par le filtre automatique ou signalés. Le texte reste publié jusqu’à la décision ; un retrait part au membre avec son motif."
      />
      <div className="toolbar">
        <nav className="seg" aria-label="Filtrer par statut">
          {FILTERS.map((s) => (
            <Link key={s} href={`/admin/contenus?statut=${s}`} aria-current={s === status ? "true" : undefined}>
              {FILTER_LABELS[s]}
            </Link>
          ))}
        </nav>
        {rows ? (
          <span className="label" role="status">
            {rows.length} texte{rows.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <div aria-live="polite" style={{ marginBottom: notice ? 20 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? (
        <Empty title={status === "open" ? "Aucun texte en attente. Tout le monde écrit proprement." : "Rien ici."}>
          {status === "open" ? (
            <p>
              Les mots surveillés se règlent dans{" "}
              <Link className="adm-link" href="/admin/decouverte#moderation">
                Découverte et modération
              </Link>
              .
            </p>
          ) : null}
        </Empty>
      ) : null}
      {rows && rows.length > 0 ? (
        <div style={{ display: "grid", gap: 20 }}>
          {rows.map((row) => (
            <ContentCard
              key={row.id}
              row={row}
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTRACT_LABELS,
  OFFER_STATUS_LABELS,
  type MyCompany,
  type OfferStatus,
  type RecruiterOfferRow,
} from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtDay, fmtSalary, isUrgent, plural } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { IconCheckCircle, IconMore, IconPlus, IconStack } from "./Icons";
import { DeadlineChip, ErrorBox, Loading, Modal, OfferStatusBadge, useToast } from "./ui";

type Filter = "all" | OfferStatus;
const FILTERS: Filter[] = ["all", "published", "pending_review", "draft", "rejected", "filled", "expired", "archived"];
const EDITABLE: OfferStatus[] = ["draft", "rejected"];
const CLOSABLE: OfferStatus[] = ["published", "pending_review", "draft", "rejected"];

export default function OffersDashboard({ company }: { company: MyCompany | null }) {
  const [rows, setRows] = useState<RecruiterOfferRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [menu, setMenu] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ row: RecruiterOfferRow; reason: "filled" | "archived" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    rpc<RecruiterOfferRow[]>(createClient(), "list_company_offers").then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setRows(data ?? []);
    });
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const visible = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  const toReview = (rows ?? []).reduce((n, r) => n + r.counts.to_review, 0);
  const interviews = (rows ?? []).reduce((n, r) => n + r.counts.interview, 0);
  const published = counts.published ?? 0;
  const drafts = (counts.draft ?? 0) + (counts.rejected ?? 0);
  const avg = company?.stats.avg_response_days ?? null;
  const reviewDetail = (rows ?? [])
    .filter((r) => r.counts.to_review > 0)
    .map((r) => `${r.counts.to_review} sur ${r.title}`)
    .join(", ");

  async function confirmClose() {
    if (!closing) return;
    setBusy(true);
    const { data, error } = await rpc<number>(createClient(), "close_offer", {
      p_id: closing.row.id,
      p_reason: closing.reason,
    });
    setBusy(false);
    if (error) {
      showToast(await describeEmploiError(error));
      return;
    }
    const n = data ?? 0;
    showToast(
      closing.reason === "filled"
        ? `Offre marquée pourvue${n ? ` · ${plural(n, "candidat prévenu", "candidats prévenus")}` : ""}`
        : `Offre archivée${n ? ` · ${plural(n, "candidat prévenu", "candidats prévenus")}` : ""}`,
    );
    setClosing(null);
    load();
  }

  return (
    <>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">
            {company ? (
              <>
                {[company.company.display_name, company.company.naf_label, company.company.city].filter(Boolean).join(" · ")}
                {company.company.status === "verified" ? (
                  <span className="badge badge--accent">
                    <IconCheckCircle size={14} /> Entreprise vérifiée
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
          <h1>{company?.me.first_name ? `Bonjour ${company.me.first_name}` : "Vos offres"}</h1>
        </div>
        <Link className="btn btn--accent btn--lg" href="/recruteur/offres/nouvelle">
          <IconPlus /> Nouvelle offre
        </Link>
      </header>

      <section className="kpis" aria-label="En un coup d’œil">
        <div className="kpi">
          <span>Candidatures à examiner</span>
          <strong>{rows ? toReview : "—"}</strong>
          <small>{reviewDetail || "Aucune en attente"}</small>
        </div>
        <div className="kpi" style={{ animationDelay: ".05s" }}>
          <span>Entretiens en cours</span>
          <strong>{rows ? interviews : "—"}</strong>
          <small>Sur l’ensemble de vos offres</small>
        </div>
        <div className="kpi" style={{ animationDelay: ".1s" }}>
          <span>Offres publiées</span>
          <strong>{rows ? published : "—"}</strong>
          <small>{drafts ? plural(drafts, "brouillon à terminer", "brouillons à terminer") : "Aucun brouillon"}</small>
        </div>
        <div className="kpi kpi--accent" style={{ animationDelay: ".15s" }}>
          <span>Votre délai de réponse moyen</span>
          <strong>{avg == null ? "—" : `${String(Math.round(avg * 10) / 10).replace(".", ",")} jour${avg >= 2 ? "s" : ""}`}</strong>
          <small>
            {avg == null ? "Calculé dès 3 réponses" : "Affiché aux candidats sur chaque offre"}
            {company?.stats.closed_no_response_90d
              ? ` · ${plural(company.stats.closed_no_response_90d, "close sans réponse", "closes sans réponse")} en 90 jours`
              : ""}
          </small>
        </div>
      </section>

      <section aria-label="Vos offres" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Vos offres</h2>
          <div className="chips" role="group" aria-label="Filtrer par statut">
            {FILTERS.filter((f) => f === "all" || counts[f]).map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Toutes" : OFFER_STATUS_LABELS[f]} <span style={{ opacity: 0.7 }}>{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {error ? <ErrorBox message={error} onRetry={load} /> : null}
        {!rows && !error ? <Loading /> : null}
        {rows && !rows.length ? (
          <div className="surface" style={{ textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}>
            <strong style={{ fontSize: 18 }}>Votre première offre</strong>
            <p className="muted">
              Intitulé, fourchette de salaire, trois missions et une vraie photo du lieu de travail : comptez dix minutes.
            </p>
            <Link className="btn btn--accent" href="/recruteur/offres/nouvelle">
              Créer une offre
            </Link>
          </div>
        ) : null}
        {rows && rows.length > 0 && !visible.length ? (
          <p className="surface muted" style={{ textAlign: "center" }}>
            Aucune offre avec ce statut pour le moment.
          </p>
        ) : null}

        {visible.map((o, i) => {
          const urgent = o.urgent_count > 0 || isUrgent(o.next_due_at);
          const meta = [
            CONTRACT_LABELS[o.contract],
            o.city,
            fmtSalary(o.salary_min_k, o.salary_max_k, ""),
            o.published_at ? `publiée le ${fmtDay(o.published_at)}` : null,
            o.status === "published" && o.expires_at ? `expire le ${fmtDay(o.expires_at)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={o.id}
              className={urgent ? "offer-row offer-row--urgent" : "offer-row"}
              style={{ animationDelay: `${0.04 * i}s` }}
            >
              <div className="offer-main">
                <div className="offer-title">
                  <strong>{o.title}</strong>
                  <OfferStatusBadge status={o.status} />
                </div>
                <span className="muted small">{meta}</span>
                {o.status === "rejected" && o.status_reason ? (
                  <span className="small" style={{ color: "var(--err)", fontWeight: 600 }}>
                    Motif : {o.status_reason}
                  </span>
                ) : null}
                {o.status === "pending_review" ? (
                  <span className="small muted">Notre équipe vérifie l’offre et ses photos, en général sous 24 h.</span>
                ) : null}
                <DeadlineChip due={o.next_due_at} toReview={o.counts.to_review} />
              </div>
              <div className="offer-counts">
                <span>
                  <strong>{o.counts.total}</strong>
                  <small>candidatures</small>
                </span>
                <span>
                  <strong style={{ color: "var(--accent)" }}>{o.counts.to_review}</strong>
                  <small>à examiner</small>
                </span>
                <span>
                  <strong>{o.counts.interview}</strong>
                  <small>entretiens</small>
                </span>
              </div>
              <div className="offer-actions">
                {o.status === "published" && o.counts.to_review > 0 ? (
                  <Link className="btn btn--accent" href={`/recruteur/offres/${o.id}/pile`}>
                    <IconStack size={18} /> Trier la pile
                  </Link>
                ) : null}
                {EDITABLE.includes(o.status) ? (
                  <Link className="btn btn--outline" href={`/recruteur/offres/${o.id}/modifier`}>
                    {o.status === "rejected" ? "Corriger l’offre" : "Terminer l’offre"}
                  </Link>
                ) : null}
                {o.counts.total > 0 || o.status === "published" ? (
                  <Link className="btn btn--soft" href={`/recruteur/offres/${o.id}/suivi`}>
                    Suivi
                  </Link>
                ) : null}
                {CLOSABLE.includes(o.status) ? (
                  <div className="menu">
                    <button
                      type="button"
                      className="btn btn--soft btn--icon"
                      aria-label={`Autres actions pour ${o.title}`}
                      aria-expanded={menu === o.id}
                      onClick={() => setMenu(menu === o.id ? null : o.id)}
                    >
                      <IconMore />
                    </button>
                    {menu === o.id ? (
                      <div className="menu-list" role="menu">
                        {o.status === "published" ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenu(null);
                              setClosing({ row: o, reason: "filled" });
                            }}
                          >
                            Marquer comme pourvue
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenu(null);
                            setClosing({ row: o, reason: "archived" });
                          }}
                        >
                          Archiver l’offre
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {closing ? (
        <Modal
          title={closing.reason === "filled" ? "Poste pourvu ?" : "Archiver l’offre ?"}
          onClose={() => setClosing(null)}
        >
          <p>
            « {closing.row.title} » ne sera plus visible des candidats.
            {closing.row.counts.to_review > 0
              ? ` Les ${plural(closing.row.counts.to_review, "candidature à examiner recevra", "candidatures à examiner recevront")} une réponse polie : « Le poste vient d’être pourvu ; nous ne pouvons pas donner suite. »`
              : ""}{" "}
            Les candidatures en cours d’entretien restent ouvertes dans le suivi.
          </p>
          <div className="row">
            <button type="button" className="btn btn--accent" onClick={confirmClose} disabled={busy}>
              {busy ? "Envoi…" : closing.reason === "filled" ? "Marquer comme pourvue" : "Archiver"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setClosing(null)}>
              Annuler
            </button>
          </div>
        </Modal>
      ) : null}
      {toast}
    </>
  );
}

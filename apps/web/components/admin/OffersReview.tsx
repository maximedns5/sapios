"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  CONTRACT_LABELS,
  EXPERIENCE_BAND_LABELS,
  OFFER_PHOTO_KIND_LABELS,
  PHOTO_KINDS_WITH_PEOPLE,
  requiresLanguageJustification,
  type AdminOfferReview,
  type OfferDraft,
} from "@sapios/shared";
import { fmtDateTime } from "@/lib/admin/format";
import { OFFER_PHOTOS_BUCKET } from "@/lib/emploi/config";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtRemote, fmtSalary } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

type Photo = OfferDraft["photos"][number];

const RULES = [
  "Au moins une photo du lieu de travail réel : bureaux, atelier, chantier.",
  "Ni banque d’images, ni publicité, ni logo seul.",
  "Pas de mineurs, de clients reconnaissables ni d’écrans montrant des données.",
  "Personnes visibles : accord écrit certifié par l’entreprise.",
  "Fourchette de salaire cohérente avec le poste ; intitulé neutre ; aucun critère discriminatoire.",
];

export default function OffersReview() {
  const [rows, setRows] = useState<AdminOfferReview[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    rpc<AdminOfferReview[]>(supabase, "admin_list_offers_to_review").then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      const list = data ?? [];
      setRows(list);
      const paths = list.flatMap((r) => r.offer.photos.map((p) => p.storage_path));
      if (!paths.length) return;
      const signed = await supabase.storage.from(OFFER_PHOTOS_BUCKET).createSignedUrls(paths, 600);
      const next: Record<string, string> = {};
      for (const d of signed.data ?? []) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      setUrls(next);
    });
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHead
        label="Modération"
        title={
          <>
            Offres <em>et photos</em>
          </>
        }
        lead="Chaque offre passe ici à sa première publication. Statuez d’abord sur chaque photo, puis sur l’offre : publier exige une entreprise vérifiée et au moins une photo du lieu de travail acceptée."
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && !rows.length ? <Empty title="Aucune offre en attente de modération." /> : null}
      <div style={{ display: "grid", gap: 28 }}>
        {(rows ?? []).map((r) => (
          <OfferCard
            key={r.offer.id}
            review={r}
            urls={urls}
            onChanged={load}
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

function OfferCard({
  review,
  urls,
  onChanged,
  onDone,
}: {
  review: AdminOfferReview;
  urls: Record<string, string>;
  onChanged: () => void;
  onDone: (m: string) => void;
}) {
  const id = useId();
  const o = review.offer;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = o.photos.filter((p) => p.moderation === "pending").length;
  const workplaceOk = o.photos.some((p) => p.kind === "workplace" && p.moderation === "approved");

  async function decide(decision: "publish" | "reject") {
    if (decision === "reject" && reason.trim().length < 5) {
      setError("Un motif est obligatoire pour refuser : le recruteur le reçoit pour corriger l’offre.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "admin_decide_offer", {
      p_id: o.id,
      p_decision: decision,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onDone(decision === "publish" ? `« ${o.title} » est publiée.` : `« ${o.title} » est refusée. Le recruteur a reçu le motif.`);
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 id={`${id}-t`} style={{ fontSize: 18, fontWeight: 600 }}>
          {o.title} <span className="muted">· {review.company.display_name}</span>
        </h2>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {review.company.status !== "verified" ? <span className="badge badge--solid">Entreprise non vérifiée</span> : null}
          <span className="label">Envoyée le {fmtDateTime(o.submitted_at)}</span>
        </span>
      </div>
      <div className="panel-b" style={{ display: "grid", gap: 20 }}>
        {review.banned_word ? (
          <p className="notice" role="alert">
            <span className="label">Mot interdit</span>
            <span>« {review.banned_word} » repéré par le contrôle automatique : à confirmer, puis refuser avec ce motif.</span>
          </p>
        ) : null}
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <dl className="kv">
            <dt>Contrat</dt>
            <dd>{CONTRACT_LABELS[o.contract]}</dd>
            <dt>Lieu</dt>
            <dd>{o.address_label || [o.postcode, o.city].filter(Boolean).join(" ") || "—"}</dd>
            <dt>Télétravail</dt>
            <dd>{fmtRemote(o.remote_days)}</dd>
            <dt>Salaire</dt>
            <dd>{fmtSalary(o.salary_min_k, o.salary_max_k)}</dd>
            <dt>Début</dt>
            <dd className={o.start_label ? undefined : "empty"}>{o.start_label ?? "non précisé"}</dd>
            <dt>Expérience</dt>
            <dd>{EXPERIENCE_BAND_LABELS[o.experience_band]}</dd>
            <dt>Recrutement</dt>
            <dd>
              {o.interviews_count} entretien{o.interviews_count > 1 ? "s" : ""} · réponse sous {o.response_days} jours
            </dd>
            <dt>Manager</dt>
            <dd className={o.manager_name ? undefined : "empty"}>{[o.manager_name, o.manager_title].filter(Boolean).join(", ") || "non précisé"}</dd>
          </dl>
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div>
              <p className="label">Missions</p>
              <ol style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
                {o.missions.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="label">Indispensable</p>
              <div className="chips">
                {o.must_have.map((m) => (
                  <span key={m} className="chip">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            {o.nice_to_have.length ? (
              <div>
                <p className="label">Apprécié</p>
                <div className="chips">
                  {o.nice_to_have.map((m) => (
                    <span key={m} className="chip">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {requiresLanguageJustification(o.must_have) ? (
              <p className="notice notice--outline">
                <span className="label">Langue exigée</span>
                <span>{o.language_justification ?? "Aucune justification : à refuser."}</span>
              </p>
            ) : null}
            {o.team_description ? (
              <div>
                <p className="label">Équipe</p>
                <p>{o.team_description}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <p className="label" style={{ marginBottom: 10 }}>
            Photos · {o.photos.length} ({pending} à statuer)
          </p>
          <div className="emp-photos">
            {o.photos.map((p) => (
              <PhotoReview key={p.id} photo={p} url={urls[p.storage_path] ?? null} onChanged={onChanged} />
            ))}
          </div>
        </div>

        <details className="panel--fold">
          <summary className="label">Règles de modération</summary>
          <ul style={{ paddingLeft: 18, display: "grid", gap: 4, marginTop: 10 }}>
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>

        <div className="field">
          <label className="label" htmlFor={`${id}-reason`}>
            Motif d’un refus (envoyé au recruteur)
          </label>
          <textarea id={`${id}-reason`} className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            onClick={() => decide("publish")}
            disabled={busy || pending > 0 || !workplaceOk || review.company.status !== "verified"}
            title={pending > 0 ? "Statuez d’abord sur chaque photo" : !workplaceOk ? "Il faut une photo du lieu de travail acceptée" : undefined}
          >
            Publier l’offre
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => decide("reject")} disabled={busy}>
            Refuser l’offre
          </button>
        </div>
      </div>
    </section>
  );
}

function PhotoReview({ photo: p, url, onChanged }: { photo: Photo; url: string | null; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsConsent = PHOTO_KINDS_WITH_PEOPLE.includes(p.kind);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && reason.trim().length < 3) {
      setError("Motif obligatoire.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "admin_moderate_photo", {
      p_photo_id: p.id,
      p_decision: decision,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onChanged();
  }

  return (
    <figure className="emp-photo">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* URL signée éphémère d'un bucket privé : next/image n'apporte rien ici. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${OFFER_PHOTO_KIND_LABELS[p.kind]}`} />
        </a>
      ) : (
        <span className="emp-photo-ph" />
      )}
      <figcaption>
        <strong>{OFFER_PHOTO_KIND_LABELS[p.kind]}</strong>
        {needsConsent ? <span>{p.consent_certified ? "Accord des personnes certifié" : "Accord non certifié : refuser"}</span> : null}
        <span className={p.moderation === "pending" ? "badge badge--solid" : "badge"}>
          {p.moderation === "approved" ? "Acceptée" : p.moderation === "rejected" ? "Refusée" : "À statuer"}
        </span>
        {p.moderation === "pending" ? (
          <>
            <input className="input" placeholder="Motif si refus" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} aria-label="Motif du refus de la photo" />
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="btn btn--sm" onClick={() => decide("approve")} disabled={busy || (needsConsent && !p.consent_certified)}>
                Accepter
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => decide("reject")} disabled={busy}>
                Refuser
              </button>
            </span>
          </>
        ) : p.moderation_reason ? (
          <span className="muted">{p.moderation_reason}</span>
        ) : null}
        {error ? <span className="field-error">{error}</span> : null}
      </figcaption>
    </figure>
  );
}

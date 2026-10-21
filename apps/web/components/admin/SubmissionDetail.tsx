"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  EDGE_FUNCTIONS,
  signalLabel,
  type AccessTier,
  type ReviewDecideResponse,
  type ReviewDecision,
  type ReviewSignedUrlResponse,
} from "@sapios/shared";
import { describeError, errorCode, errorMessage, isMissingFunction } from "@/lib/admin/errors";
import {
  ageFrom,
  confidenceValue,
  DEGREE_TYPE_LABELS,
  fmtDate,
  fmtDateTime,
  LEVELS,
  levelText,
  pct,
  TIER_LABELS,
} from "@/lib/admin/format";
import { compareNames, NAME_MATCH_LABELS } from "@/lib/admin/names";
import type { PolicyRow, SubmissionRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import LevelLabel from "@/components/LevelLabel";
import { allSignals, isManualReview } from "./SubmissionsQueue";
import { ErrorNotice, Loading, StatusBadge, SuccessNotice, TierBadge } from "./ui";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = ["needs_review", "pending", "processing", "needs_more"];

const REJECT_REASONS = [
  "Document falsifié ou retouché",
  "Ce document n’est pas un diplôme",
  "Diplôme déjà utilisé par un autre compte",
  "Le titulaire n’est pas la personne inscrite",
];
const MORE_REASONS = [
  "Document illisible ou flou : renvoyez une photo nette, à plat, en pleine lumière",
  "Page manquante : envoyez le document complet",
  "Nom différent du nom légal : joignez un justificatif (acte de mariage, changement de nom)",
  "Envoyez le diplôme lui-même, pas une attestation d’inscription",
];

interface Loaded {
  row: SubmissionRow;
  access: { level: number | null; tier: AccessTier } | null;
  policies: PolicyRow[];
  history: Array<{ id: string; status: SubmissionRow["status"]; created_at: string; level_verified: number | null }>;
}

async function loadSubmission(id: string): Promise<Loaded | null> {
  const supabase = createClient();
  let row: SubmissionRow | null = null;

  const direct = await supabase.rpc("admin_get_submission", { p_id: id });
  if (!direct.error) {
    row = ((Array.isArray(direct.data) ? direct.data[0] : direct.data) ?? null) as SubmissionRow | null;
  } else if (!isMissingFunction(direct.error)) {
    throw direct.error;
  }

  if (!row) {
    // Les admins n'ont pas le droit de colonne sur `extracted`/`signals` : on passe par la RPC de liste.
    const head = await supabase.from("degree_submissions").select("id, status").eq("id", id).maybeSingle();
    if (head.error) throw head.error;
    if (!head.data) return null;
    const list = await supabase.rpc("admin_list_submissions", { p_status: head.data.status });
    if (list.error) throw list.error;
    row = ((list.data ?? []) as SubmissionRow[]).find((r) => r.id === id) ?? null;
    if (!row) return null;
  }

  const [access, policies, history] = await Promise.all([
    supabase.from("user_access").select("level, tier").eq("user_id", row.user_id).maybeSingle(),
    supabase.from("access_policy").select("*").order("min_level", { ascending: false }),
    supabase
      .from("degree_submissions")
      .select("id, status, created_at, level_verified")
      .eq("user_id", row.user_id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    row,
    access: (access.data as Loaded["access"]) ?? null,
    policies: (policies.data ?? []) as PolicyRow[],
    history: (history.data ?? []) as Loaded["history"],
  };
}

// Libellé d'un signal ; un code inconnu de @sapios/shared est rendu lisible plutôt qu'affiché brut.
function humanSignal(code: string): string {
  const label = signalLabel(code);
  if (label !== code) return label;
  const known: Record<string, string> = {
    name_accent_mismatch: "Nom identique au nom légal aux accents près",
  };
  return known[code] ?? code.replace(/_/g, " ");
}

function policyFor(level: number, policies: PolicyRow[]): PolicyRow | null {
  return policies.filter((p) => p.min_level <= level).sort((a, b) => b.min_level - a.min_level)[0] ?? null;
}

/* ───────────── Document (URL signée 5 min) ───────────── */

function DocumentViewer({ row }: { row: SubmissionRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const purged = Boolean(row.file_deleted_at);
  const [busy, setBusy] = useState(!purged);

  const requestUrl = useCallback(
    () =>
      createClient()
        .functions.invoke<ReviewSignedUrlResponse>(EDGE_FUNCTIONS.reviewDiploma, {
          body: { action: "signed_url", submission_id: row.id },
        })
        .then(async ({ data, error }) => {
          const message = error || !data?.url ? (error ? errorMessage(await errorCode(error)) : "Lien non reçu.") : null;
          setBusy(false);
          setError(message);
          setUrl(message ? null : (data?.url ?? null));
          if (!message) setExpiresAt(Date.now() + 5 * 60 * 1000);
        }),
    [row.id],
  );

  const fetchUrl = () => {
    setBusy(true);
    setError(null);
    void requestUrl();
  };

  useEffect(() => {
    if (!purged) void requestUrl();
  }, [requestUrl, purged]);

  useEffect(() => {
    if (!url) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [url]);

  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const expired = Boolean(url) && left === 0;
  const isPdf = row.mime === "application/pdf";

  return (
    <section className="detail-doc" aria-label="Document soumis">
      <div className="doc-bar">
        <span className="label">
          Document · {isPdf ? "PDF" : row.mime.replace("image/", "").toUpperCase()}
        </span>
        {url && !expired ? (
          <span className="label" aria-live="off">
            Lien valable {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <div className="doc">
        {purged ? (
          <div className="doc-empty">
            <p className="label">Fichier purgé</p>
            <p className="serif" style={{ fontSize: 26, marginTop: 8 }}>
              Supprimé le {fmtDate(row.file_deleted_at)}.
            </p>
            <p style={{ marginTop: 8 }}>Minimisation : seules les données extraites et l’audit restent.</p>
          </div>
        ) : error ? (
          <div className="doc-empty">
            <p className="label">Document indisponible</p>
            <p style={{ marginTop: 8 }}>{error}</p>
            <button type="button" className="btn btn--sm" style={{ marginTop: 16 }} onClick={fetchUrl} disabled={busy}>
              Réessayer
            </button>
          </div>
        ) : !url || busy ? (
          <p className="loading">Génération du lien signé</p>
        ) : expired ? (
          <div className="doc-empty">
            <p className="label">Lien expiré</p>
            <button type="button" className="btn btn--sm" style={{ marginTop: 16 }} onClick={fetchUrl}>
              Générer un nouveau lien
            </button>
          </div>
        ) : isPdf ? (
          <iframe src={`${url}#navpanes=0&view=FitH`} title={`Diplôme de ${row.legal_name ?? row.display_name ?? "ce membre"} (PDF)`} />
        ) : (
          // URL signée externe et éphémère : next/image n'apporte rien ici.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Diplôme soumis par ${row.legal_name ?? row.display_name ?? "ce membre"}`} />
        )}
      </div>
      {url && !expired && !purged ? (
        <div className="doc-bar">
          <a className="adm-link" href={url} target="_blank" rel="noreferrer noopener">
            Ouvrir dans un onglet
          </a>
          <button type="button" className="adm-link" onClick={fetchUrl} disabled={busy}>
            Renouveler le lien
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────── Décision ───────────── */

function DecisionForm({
  row,
  access,
  policies,
  onDecided,
}: {
  row: SubmissionRow;
  access: Loaded["access"];
  policies: PolicyRow[];
  onDecided: (result: ReviewDecideResponse, decision: ReviewDecision) => void;
}) {
  const id = useId();
  const estimate = row.extracted?.level_estimate ?? null;
  const validEstimate = estimate != null && estimate >= 1 && estimate <= 8 ? estimate : null;
  const [decision, setDecision] = useState<ReviewDecision>("approve");
  const [level, setLevel] = useState<number | null>(validEstimate);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = level ? policyFor(level, policies) : null;
  const keepsHigher =
    decision === "approve" && access?.level != null && level != null && access.level > level ? access : null;

  const canSubmit =
    !busy &&
    (decision === "approve" ? level != null && checked : reason.trim().length >= 3 && reason.trim().length <= 500);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const body =
      decision === "approve"
        ? { action: "decide", submission_id: row.id, decision, level }
        : { action: "decide", submission_id: row.id, decision, reason: reason.trim() };
    const { data, error } = await createClient().functions.invoke<ReviewDecideResponse>(EDGE_FUNCTIONS.reviewDiploma, {
      body,
    });
    setBusy(false);
    if (error || !data) {
      setError(error ? errorMessage(await errorCode(error)) : "Réponse vide du serveur.");
      return;
    }
    onDecided(data, decision);
  }

  const submitLabel =
    decision === "approve"
      ? level
        ? `Valider au niveau ${LEVELS.find((l) => l.level === level)?.label ?? level}`
        : "Choisissez un niveau"
      : decision === "reject"
        ? "Refuser le diplôme"
        : "Demander un complément";

  return (
    <form className="panel" onSubmit={submit} aria-labelledby={`${id}-title`}>
      <div className="panel-h">
        <h2 className="label" id={`${id}-title`}>
          Décision du modérateur
        </h2>
        <span className="label">Journalisée</span>
      </div>
      <div className="panel-b decide">
        <div className="seg" role="group" aria-label="Type de décision">
          {(
            [
              ["approve", "Valider"],
              ["reject", "Refuser"],
              ["needs_more", "À compléter"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={decision === value}
              onClick={() => {
                setDecision(value);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {decision === "approve" ? (
          <>
            <fieldset style={{ border: 0, display: "grid", gap: 8 }}>
              <legend className="label" style={{ marginBottom: 8 }}>
                Niveau validé (obligatoire)
                {validEstimate ? " — l’estimation de l’IA est présélectionnée, à confirmer" : ""}
              </legend>
              <div className="levels">
                {LEVELS.map((l) => (
                  <label key={l.level}>
                    <input
                      type="radio"
                      name={`${id}-level`}
                      value={l.level}
                      checked={level === l.level}
                      onChange={() => setLevel(l.level)}
                    />
                    <span className="n">
                      <LevelLabel label={l.label} />
                    </span>
                    <span className="d">
                      Niv. {l.level} · {l.detail}
                    </span>
                    {validEstimate === l.level ? (
                      <span className="ai" aria-label="Estimation de l’IA">
                        IA
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
            {level ? (
              <p className="notice notice--outline">
                <span className="label">Effet</span>
                <span>
                  {policy ? (
                    <>
                      Palier <strong>{TIER_LABELS[policy.tier]}</strong>
                      {policy.can_browse
                        ? policy.daily_like_quota == null
                          ? ", likes illimités"
                          : `, ${policy.daily_like_quota} likes par jour`
                        : ", pas d’accès au feed"}
                      {policy.sees_likers ? ", voit qui l’a liké" : ""}. Texte du verdict : <code>{policy.copy_key}</code>.
                    </>
                  ) : (
                    "Aucune ligne de la politique d’accès ne couvre ce niveau : la décision sera refusée."
                  )}
                  {keepsHigher ? (
                    <>
                      {" "}
                      Le membre a déjà le niveau {keepsHigher.level} ({TIER_LABELS[keepsHigher.tier]}) : pas de
                      rétrogradation.
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>
                J’ai examiné le document original, le nom du titulaire et le niveau.
                {isManualReview(row) ? null : " L’extraction IA n’est qu’une proposition."}
              </span>
            </label>
          </>
        ) : (
          <div className="field">
            <label className="label" htmlFor={`${id}-reason`}>
              {decision === "reject" ? "Motif du refus (visible par le membre)" : "Ce qu’il faut fournir (visible par le membre)"}
            </label>
            <div className="chips">
              {(decision === "reject" ? REJECT_REASONS : MORE_REASONS).map((r) => (
                <button key={r} type="button" className="chip" onClick={() => setReason(r)}>
                  {r.split(" : ")[0]}
                </button>
              ))}
            </div>
            <textarea
              id={`${id}-reason`}
              className="textarea"
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={decision === "reject" ? "Ex. : document retouché" : "Ex. : photo floue, renvoyez une image nette"}
            />
            <span className="label" style={{ textAlign: "right" }}>
              {reason.length} / 500
            </span>
          </div>
        )}

        <div aria-live="assertive">{error ? <ErrorNotice message={error} /> : null}</div>

        <div className="form-actions">
          <button className="btn" type="submit" disabled={!canSubmit}>
            {busy ? "Envoi…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ───────────── Note interne ───────────── */

function ModeratorNote({ row }: { row: SubmissionRow }) {
  const id = useId();
  const [saved, setSaved] = useState(row.moderator_note ?? "");
  const [note, setNote] = useState(saved);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const dirty = note !== saved;
  return (
    <form
      className="field"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "saving" });
        const value = note.trim() || null;
        const { data, error } = await createClient()
          .from("degree_submissions")
          .update({ moderator_note: value })
          .eq("id", row.id)
          .select("id");
        if (error) setState({ kind: "error", message: await describeError(error) });
        else if (!data?.length) setState({ kind: "error", message: "Note non enregistrée (droits insuffisants ?)." });
        else {
          setSaved(value ?? "");
          setNote(value ?? "");
          setState({ kind: "saved" });
        }
      }}
    >
      <label className="label" htmlFor={`${id}-note`}>
        Note interne (jamais montrée au membre)
      </label>
      <textarea id={`${id}-note`} className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="form-actions">
        <button className="btn btn--sm btn--ghost" type="submit" disabled={!dirty || state.kind === "saving"}>
          Enregistrer la note
        </button>
        <span className="label" aria-live="polite">
          {state.kind === "saved" && !dirty ? "Enregistrée" : state.kind === "error" ? state.message : ""}
        </span>
      </div>
    </form>
  );
}

/* ───────────── Revue manuelle (sans clé API) ───────────── */

function ManualChecklist({ birthdate }: { birthdate: string | null }) {
  return (
    <section className="panel" aria-labelledby="manual-title">
      <div className="panel-h">
        <h2 className="label" id="manual-title">
          Revue manuelle
        </h2>
        <span className="label">Aucune extraction IA</span>
      </div>
      <div className="panel-b">
        <dl className="kv">
          <dt>Titulaire</dt>
          <dd>Même personne que le nom légal ci-dessus.</dd>
          <dt>Document</dt>
          <dd>Diplôme complet et lisible, établissement et intitulé crédibles, sceau et signature présents.</dd>
          <dt>Année</dt>
          <dd>
            Cohérente avec la date de naissance
            {birthdate ? ` (${fmtDate(birthdate)})` : ""} : un master se termine rarement avant 22 ans.
          </dd>
          <dt>Niveau</dt>
          <dd>
            8 doctorat · 7 master, ingénieur, grande école · 6 licence, BUT, M1 · 5 BTS, DUT · 4 bac · 3 et moins : CAP,
            BEP, brevet.
          </dd>
        </dl>
      </div>
    </section>
  );
}

/* ───────────── Page ───────────── */

export default function SubmissionDetail({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: ReviewDecideResponse; decision: ReviewDecision } | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  const load = useCallback(() => {
    const request = UUID_RE.test(id) ? loadSubmission(id) : Promise.resolve(null);
    request
      .then((d) => {
        setError(null);
        setData(d);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, [id]);

  useEffect(load, [load]);

  const onDecided = useCallback(
    async (res: ReviewDecideResponse, decision: ReviewDecision) => {
      setResult({ res, decision });
      load();
      const { data: queue } = await createClient().rpc("admin_list_submissions", { p_status: "needs_review" });
      const next = ((queue ?? []) as SubmissionRow[]).find((r) => r.id !== id);
      setNextId(next?.id ?? null);
    },
    [id, load],
  );

  const row = data?.row;
  const signals = useMemo(() => (row ? allSignals(row) : []), [row]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (data === undefined) return <Loading />;
  if (data === null || !row) {
    return (
      <div className="empty">
        <p className="label">Introuvable</p>
        <p className="serif">Cette soumission n’existe pas ou plus.</p>
        <p style={{ marginTop: 12 }}>
          <Link className="adm-link" href="/admin/diplomes">
            Retour à la file
          </Link>
        </p>
      </div>
    );
  }

  const ex = row.extracted;
  const manual = isManualReview(row);
  const conf = confidenceValue(row.confidence);
  const age = ageFrom(row.birthdate);
  const match = compareNames(row.legal_name, ex?.holder_full_name);
  const open = OPEN_STATUSES.includes(row.status);
  const ageAtAward =
    row.birthdate && ex?.year_awarded ? ex.year_awarded - new Date(`${row.birthdate}T00:00:00Z`).getUTCFullYear() : null;

  const fields: Array<[string, React.ReactNode]> = ex
    ? [
        ["Diplôme reconnu", ex.is_diploma === false ? "Non" : ex.is_diploma ? "Oui" : null],
        ["Intitulé", ex.degree_title],
        ["Type", ex.degree_type ? (DEGREE_TYPE_LABELS[ex.degree_type] ?? ex.degree_type) : null],
        ["Établissement", ex.institution],
        ["Pays", ex.country],
        ["Spécialité", ex.field_of_study],
        [
          "Année",
          ex.year_awarded != null ? `${ex.year_awarded}${ageAtAward != null ? ` (à ${ageAtAward} ans environ)` : ""}` : null,
        ],
        ["Mention", ex.honors],
        ["Niveau estimé", ex.level_estimate != null ? levelText(ex.level_estimate) : null],
      ]
    : [];

  return (
    <>
      <Link className="adm-back label" href={`/admin/diplomes?statut=${open ? "needs_review" : row.status}`}>
        ← File des diplômes
      </Link>
      <div className="adm-head" style={{ marginTop: 8 }}>
        <div>
          <p className="label">
            Soumis le {fmtDateTime(row.created_at)} ·{" "}
            {manual ? "revue manuelle" : `${row.attempts} essai${row.attempts > 1 ? "s" : ""} d’extraction`}
          </p>
          <h1>
            {row.display_name ?? "Sans prénom"}
            {age != null ? <em>, {age} ans</em> : null}
          </h1>
          <p className="lead">
            Nom légal : <strong>{row.legal_name ?? "non renseigné"}</strong>
            {row.email ? ` · ${row.email}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusBadge status={row.status} />
          <TierBadge tier={data.access?.tier} />
        </div>
      </div>

      {result ? (
        <div style={{ marginBottom: 24, display: "grid", gap: 10 }}>
          <SuccessNotice>
            {result.decision === "approve"
              ? `Diplôme validé. Le membre est au niveau ${result.res.level ?? "—"}, palier ${
                  result.res.tier ? TIER_LABELS[result.res.tier] : "—"
                }.`
              : result.decision === "reject"
                ? "Diplôme refusé. Le membre est notifié avec le motif."
                : "Complément demandé. Le membre est notifié."}
          </SuccessNotice>
          <div className="form-actions">
            {nextId ? (
              <Link className="btn" href={`/admin/diplomes/${nextId}`}>
                Soumission suivante →
              </Link>
            ) : (
              <span className="label">La file est vide.</span>
            )}
            <Link className="btn btn--ghost" href="/admin/diplomes">
              Retour à la file
            </Link>
          </div>
        </div>
      ) : null}

      <div className="detail">
        <DocumentViewer row={row} />

        <div style={{ display: "grid", gap: 20 }}>
          <section className="panel" aria-labelledby="sig-title">
            <div className="panel-h">
              <h2 className="label" id="sig-title">
                Signaux de fraude
              </h2>
              <span className="label">{signals.length}</span>
            </div>
            <div className="panel-b">
              {signals.length ? (
                <ul className="signals">
                  {signals.map((s) => (
                    <li key={s}>
                      <span>
                        {humanSignal(s)}
                        <small>{s.startsWith("model:") ? "Relevé par le modèle" : "Contrôle automatique"}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-signal">Aucun signal. Ce n’est pas une preuve d’authenticité.</p>
              )}
            </div>
          </section>

          <section aria-label="Comparaison des noms">
            <div className="names">
              <div>
                <p className="label">Nom légal (compte)</p>
                <p className="v">{row.legal_name ?? "—"}</p>
              </div>
              <div>
                <p className="label">{manual ? "Nom sur le diplôme" : "Nom extrait (diplôme)"}</p>
                <p className="v">{manual ? "À lire sur le document" : (ex?.holder_full_name ?? "—")}</p>
              </div>
              {manual ? (
                <p className="names-verdict">
                  <span className="label">À vérifier</span>
                  <span>Le nom du document doit être celui du nom légal (accents et ordre des prénoms mis à part).</span>
                </p>
              ) : (
                <p className={match === "mismatch" ? "names-verdict is-bad" : "names-verdict"}>
                  <span className="label">{match === "mismatch" ? "Attention" : "Comparaison"}</span>
                  <span>{NAME_MATCH_LABELS[match]}</span>
                </p>
              )}
            </div>
          </section>

          {manual ? (
            <ManualChecklist birthdate={row.birthdate} />
          ) : (
            <section className="panel" aria-labelledby="ex-title">
              <div className="panel-h">
                <h2 className="label" id="ex-title">
                  Extraction IA
                </h2>
                <span className="label">Proposition, pas décision</span>
              </div>
              <div className="panel-b" style={{ display: "grid", gap: 16 }}>
                <div className="meter">
                  <div className="meter-row">
                    <span className="label">Confiance</span>
                    <strong>{pct(conf)}</strong>
                  </div>
                  <div className="meter-track" aria-hidden="true">
                    <i style={{ width: `${(conf ?? 0) * 100}%` }} />
                  </div>
                </div>
                {ex ? (
                  <dl className="kv">
                    {fields.map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd className={v == null || v === "" ? "empty" : undefined}>{v == null || v === "" ? "illisible" : v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="no-signal">
                    {row.status === "pending" || row.status === "processing"
                      ? "Extraction en cours. La décision reste possible à partir du document."
                      : "Aucune extraction disponible pour ce document."}
                  </p>
                )}
              </div>
            </section>
          )}

          {open && !result ? (
            <DecisionForm row={row} access={data.access} policies={data.policies} onDecided={onDecided} />
          ) : (
            <section className="panel panel--dark" aria-labelledby="dec-title">
              <div className="panel-h">
                <h2 className="label" id="dec-title">
                  Décision
                </h2>
                <StatusBadge status={row.status} />
              </div>
              <div className="panel-b">
                <dl className="kv">
                  <dt>Le</dt>
                  <dd>{fmtDateTime(row.reviewed_at)}</dd>
                  <dt>Niveau validé</dt>
                  <dd>{levelText(row.level_verified)}</dd>
                  <dt>Motif</dt>
                  <dd>{row.rejection_reason ?? "—"}</dd>
                </dl>
              </div>
            </section>
          )}

          <section className="panel" aria-label="Note interne et historique">
            <div className="panel-b" style={{ display: "grid", gap: 20 }}>
              <ModeratorNote row={row} />
              {data.history.length > 1 ? (
                <div>
                  <p className="label" style={{ marginBottom: 8 }}>
                    Soumissions de ce membre
                  </p>
                  <ul style={{ listStyle: "none", display: "grid", gap: 6 }}>
                    {data.history.map((h) => (
                      <li key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <StatusBadge status={h.status} />
                        {h.id === row.id ? (
                          <span>{fmtDateTime(h.created_at)} (celle-ci)</span>
                        ) : (
                          <Link href={`/admin/diplomes/${h.id}`}>{fmtDateTime(h.created_at)}</Link>
                        )}
                        {h.level_verified ? <span className="label">{levelText(h.level_verified)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

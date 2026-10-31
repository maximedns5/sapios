"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  EDGE_FUNCTIONS,
  INSTITUTION_MAX_LENGTH,
  signalLabel,
  STUDY_FIELD_LABELS,
  STUDY_FIELDS,
  studyFieldLabel,
  type AccessTier,
  type ReviewDecideRequest,
  type ReviewDecideResponse,
  type ReviewDecision,
  type ReviewSignedUrlResponse,
  type StudyField,
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
} from "@/lib/admin/format";
import { compareNames, NAME_MATCH_LABELS } from "@/lib/admin/names";
import type { PolicyRow, SubmissionRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import LevelLabel from "@/components/LevelLabel";
import { allSignals, isManualReview } from "./SubmissionsQueue";
import { ErrorNotice, Loading, StatusBadge, SuccessNotice } from "./ui";

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

type Access = {
  level: number | null;
  tier: AccessTier;
  institution: string | null;
  study_field: StudyField | null;
  source_submission_id: string | null;
};

interface Loaded {
  row: SubmissionRow;
  access: Access | null;
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
    supabase
      .from("user_access")
      .select("level, tier, institution, study_field, source_submission_id")
      .eq("user_id", row.user_id)
      .maybeSingle(),
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
  // Loupe : un clic grossit ×2,5 au point visé, la souris déplace la zone lue, un second clic revient.
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const aim = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

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
          <iframe src={`${url}#navpanes=0&view=FitH`} title={`Diplôme de ${row.legal_name ?? row.display_name ?? "ce candidat"} (PDF)`} />
        ) : (
          <button
            type="button"
            className={zoom ? "doc-zoom is-zoomed" : "doc-zoom"}
            aria-pressed={Boolean(zoom)}
            aria-label={zoom ? "Revenir à la vue entière" : "Agrandir (loupe)"}
            onClick={(e) => setZoom(zoom ? null : aim(e))}
            onMouseMove={(e) => (zoom ? setZoom(aim(e)) : undefined)}
          >
            {/* URL signée externe et éphémère : next/image n'apporte rien ici. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Diplôme soumis par ${row.legal_name ?? row.display_name ?? "ce candidat"}`}
              style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
          </button>
        )}
      </div>
      {url && !expired && !purged ? (
        <div className="doc-bar">
          <a className="adm-link" href={url} target="_blank" rel="noreferrer noopener">
            Ouvrir dans un onglet
          </a>
          {!isPdf ? <span className="label">Clic : loupe</span> : null}
          <button type="button" className="adm-link" onClick={fetchUrl} disabled={busy}>
            Renouveler le lien
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────── Décision ───────────── */

const DECISIONS = [
  ["approve", "Valider", "V"],
  ["reject", "Refuser", "R"],
  ["needs_more", "À compléter", "C"],
] as const;

/** Un raccourci ne doit jamais voler une frappe destinée à un champ. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") return !["radio", "checkbox"].includes((el as HTMLInputElement).type);
  return false;
}

/** Entrée sur un bouton ou un lien l'active déjà : ne pas envoyer le formulaire en plus. */
function isActivatable(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === "BUTTON" || tag === "A";
}

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
  const formRef = useRef<HTMLFormElement>(null);
  const checkRef = useRef<HTMLInputElement>(null);
  const estimate = row.extracted?.level_estimate ?? null;
  const validEstimate = estimate != null && estimate >= 1 && estimate <= 8 ? estimate : null;
  const [decision, setDecision] = useState<ReviewDecision>("approve");
  const [level, setLevel] = useState<number | null>(validEstimate);
  const [institution, setInstitution] = useState(row.extracted?.institution ?? access?.institution ?? "");
  const [field, setField] = useState<StudyField | "">(access?.study_field ?? "");
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = level ? policyFor(level, policies) : null;
  const keepsHigher =
    decision === "approve" && access?.level != null && level != null && access.level > level ? access : null;
  const institutionOk = institution.trim().length >= 2 && institution.trim().length <= INSTITUTION_MAX_LENGTH;

  const missing =
    decision === "approve"
      ? [!level && "le niveau", !institutionOk && "l’établissement", !field && "le domaine", !checked && "la case d’examen"].filter(
          Boolean,
        )
      : reason.trim().length < 3
        ? ["le motif"]
        : [];
  const canSubmit = !busy && missing.length === 0 && reason.trim().length <= 500;

  // Raccourcis (audit n° 22) : 1 à 8 niveau, X case d'examen, V / R / C décision, Entrée envoi.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "enter") {
        if (isActivatable(e.target)) return;
        e.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }
      if (/^[1-8]$/.test(k)) {
        setDecision("approve");
        setLevel(Number(k));
      } else if (k === "v") setDecision("approve");
      else if (k === "r") setDecision("reject");
      else if (k === "c") setDecision("needs_more");
      else if (k === "x") setChecked((c) => !c);
      else return;
      e.preventDefault();
      setError(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      if (missing.length) setError(`Il manque ${missing.join(", ")}.`);
      if (decision === "approve" && !checked) checkRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const body: ReviewDecideRequest =
      decision === "approve"
        ? {
            action: "decide",
            submission_id: row.id,
            decision,
            level: level ?? undefined,
            institution: institution.trim(),
            field: field || undefined,
          }
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
    <form ref={formRef} className="panel panel--decide" onSubmit={submit} aria-labelledby={`${id}-title`} noValidate>
      <div className="panel-h">
        <h2 className="label" id={`${id}-title`}>
          Décision du modérateur
        </h2>
        <span className="label">Journalisée</span>
      </div>
      <div className="panel-b decide">
        <div className="seg" role="group" aria-label="Type de décision">
          {DECISIONS.map(([value, label, key]) => (
            <button
              key={value}
              type="button"
              aria-pressed={decision === value}
              aria-keyshortcuts={key}
              onClick={() => {
                setDecision(value);
                setError(null);
              }}
            >
              {label} <kbd>{key}</kbd>
            </button>
          ))}
        </div>

        {decision === "approve" ? (
          <>
            <fieldset style={{ border: 0, display: "grid", gap: 8 }}>
              <legend className="label" style={{ marginBottom: 8 }}>
                Niveau validé · touches 1 à 8{validEstimate ? " · estimation de l’IA présélectionnée" : ""}
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
                      aria-keyshortcuts={String(l.level)}
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

            <div className="decide-row">
              <div className="field">
                <label className="label" htmlFor={`${id}-inst`}>
                  Établissement
                </label>
                <input
                  id={`${id}-inst`}
                  className="input"
                  required
                  aria-required="true"
                  value={institution}
                  maxLength={INSTITUTION_MAX_LENGTH}
                  placeholder="Tel qu’écrit sur le diplôme"
                  onChange={(e) => setInstitution(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-field`}>
                  Domaine
                </label>
                <select
                  id={`${id}-field`}
                  className="select"
                  required
                  aria-required="true"
                  value={field}
                  onChange={(e) => setField(e.target.value as StudyField | "")}
                >
                  <option value="">Choisir…</option>
                  {STUDY_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {STUDY_FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {level ? (
              <p className="notice notice--outline">
                <span className="label">Effet</span>
                <span>
                  {policy ? (
                    <>
                      Badge « Diplôme vérifié · <strong>{levelText(level)}</strong> » sur le CV du candidat. Il informe
                      les recruteurs et ne ferme aucune offre.
                    </>
                  ) : (
                    "Aucune ligne de la politique d’accès ne couvre ce niveau : la décision sera refusée."
                  )}
                  {keepsHigher ? (
                    <>
                      {" "}
                      Le candidat a déjà un niveau vérifié supérieur ({levelText(keepsHigher.level)}) : pas de
                      rétrogradation.
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            <label className="check">
              <input
                ref={checkRef}
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                aria-keyshortcuts="X"
              />
              <span>
                J’ai examiné le document original, le nom du titulaire et le niveau. <kbd>X</kbd>
                {isManualReview(row) ? null : " L’extraction IA n’est qu’une proposition."}
              </span>
            </label>
          </>
        ) : (
          <div className="field">
            <label className="label" htmlFor={`${id}-reason`}>
              {decision === "reject" ? "Motif du refus (visible par le candidat)" : "Ce qu’il faut fournir (visible par le candidat)"}
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
          <button className="btn" type="submit" disabled={busy} aria-keyshortcuts="Enter">
            {busy ? "Envoi…" : submitLabel} <kbd className="on-ink">Entrée</kbd>
          </button>
        </div>
        <p className="label shortcuts" aria-hidden="true">
          1–8 niveau · X examiné · V valider · R refuser · C compléter · Entrée envoyer
        </p>
      </div>
    </form>
  );
}

/* ───────────── Établissement d'un candidat déjà validé (rattrapage) ───────────── */

function InstitutionBackfill({ userId, access, onSaved }: { userId: string; access: Access; onSaved: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(!access.institution || !access.study_field);
  const [institution, setInstitution] = useState(access.institution ?? "");
  const [field, setField] = useState<StudyField | "">(access.study_field ?? "");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const valid = institution.trim().length >= 2 && institution.trim().length <= INSTITUTION_MAX_LENGTH && field !== "";

  if (!open) {
    return (
      <p>
        <button type="button" className="adm-link" onClick={() => setOpen(true)}>
          Corriger l’établissement ou le domaine
        </button>
      </p>
    );
  }
  return (
    <form
      className="field"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setState({ kind: "saving" });
        const { error } = await createClient().rpc("admin_set_member_institution", {
          p_user: userId,
          p_institution: institution.trim(),
          p_field: field as StudyField,
        });
        if (error) setState({ kind: "error", message: await describeError(error) });
        else {
          setState({ kind: "saved" });
          onSaved();
        }
      }}
    >
      <p className="label">
        {access.institution ? "Corriger" : "À saisir : candidat validé avant l’enregistrement de l’établissement"}
      </p>
      <div className="decide-row">
        <div className="field">
          <label className="label" htmlFor={`${id}-inst`}>
            Établissement
          </label>
          <input
            id={`${id}-inst`}
            className="input"
            value={institution}
            maxLength={INSTITUTION_MAX_LENGTH}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-field`}>
            Domaine
          </label>
          <select id={`${id}-field`} className="select" value={field} onChange={(e) => setField(e.target.value as StudyField | "")}>
            <option value="">Choisir…</option>
            {STUDY_FIELDS.map((f) => (
              <option key={f} value={f}>
                {STUDY_FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn--sm on-ink" type="submit" disabled={!valid || state.kind === "saving"}>
          Enregistrer
        </button>
        <span className="label" aria-live="polite">
          {state.kind === "saved" ? "Enregistré et journalisé" : state.kind === "error" ? state.message : ""}
        </span>
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
        Note interne (jamais montrée au candidat)
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
  // Identique pour chaque dossier : repliée par défaut pour garder la décision à l'écran (audit n° 22).
  return (
    <details className="panel panel--fold">
      <summary className="panel-h">
        <span className="label">Grille de revue manuelle</span>
        <span className="label">Aucune extraction IA · déplier</span>
      </summary>
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
    </details>
  );
}

/* ───────────── Page ───────────── */

const AUTO_NEXT_KEY = "sapios.admin.autoNext";

export default function SubmissionDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: ReviewDecideResponse; decision: ReviewDecision } | null>(null);
  const [nextId, setNextId] = useState<string | null | undefined>(undefined);
  // Lu au premier rendu : la case n'apparaît qu'une fois le dossier chargé, côté client.
  const [autoNext, setAutoNext] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(AUTO_NEXT_KEY) !== "0";
    } catch {
      return true; // stockage indisponible : on garde le passage automatique
    }
  });

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

  // Passage automatique au dossier suivant, après un court délai pour lire la confirmation.
  useEffect(() => {
    if (!result || !nextId || !autoNext) return;
    const t = window.setTimeout(() => router.push(`/admin/diplomes/${nextId}`), 1500);
    return () => window.clearTimeout(t);
  }, [result, nextId, autoNext, router]);

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
  // Rattrapage seulement sur la soumission qui donne le niveau retenu.
  const isSource = data.access?.source_submission_id === row.id;

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
      <div className="review-head">
        <div>
          <Link className="adm-back label" href={`/admin/diplomes?statut=${open ? "needs_review" : row.status}`}>
            ← File des diplômes
          </Link>
          <h1>
            {row.display_name ?? "Sans prénom"}
            {age != null ? <em>, {age} ans</em> : null}
          </h1>
          <p className="lead">
            Nom légal : <strong>{row.legal_name ?? "non renseigné"}</strong>
            {row.email ? ` · ${row.email}` : ""} · soumis le {fmtDateTime(row.created_at)}
            {manual ? " · revue manuelle" : ` · ${row.attempts} essai${row.attempts > 1 ? "s" : ""} d’extraction`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <StatusBadge status={row.status} />
        </div>
      </div>

      {result ? (
        <div style={{ marginBottom: 20, display: "grid", gap: 10 }}>
          <SuccessNotice>
            {result.decision === "approve"
              ? `Diplôme validé : badge ${result.res.level ? levelText(result.res.level) : "—"} ajouté au CV du candidat.`
              : result.decision === "reject"
                ? "Diplôme refusé. Le candidat est notifié avec le motif."
                : "Complément demandé. Le candidat est notifié."}
            {nextId && autoNext ? " Dossier suivant dans un instant…" : ""}
          </SuccessNotice>
          <div className="form-actions">
            {nextId ? (
              <Link className="btn" href={`/admin/diplomes/${nextId}`}>
                Soumission suivante →
              </Link>
            ) : nextId === null ? (
              <span className="label">La file est vide.</span>
            ) : null}
            <Link className="btn btn--ghost" href="/admin/diplomes">
              Retour à la file
            </Link>
          </div>
        </div>
      ) : null}

      <div className="detail detail--review">
        <DocumentViewer row={row} />

        <div className="review-side">
          {open && !result ? (
            <>
              <DecisionForm row={row} access={data.access} policies={data.policies} onDecided={onDecided} />
              <label className="check">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(e) => {
                    setAutoNext(e.target.checked);
                    try {
                      window.localStorage.setItem(AUTO_NEXT_KEY, e.target.checked ? "1" : "0");
                    } catch {
                      // sans stockage, le choix vaut pour cette page
                    }
                  }}
                />
                <span>Après la décision, ouvrir automatiquement le dossier suivant</span>
              </label>
            </>
          ) : (
            <section className="panel panel--dark" aria-labelledby="dec-title">
              <div className="panel-h">
                <h2 className="label" id="dec-title">
                  Décision
                </h2>
                <StatusBadge status={row.status} />
              </div>
              <div className="panel-b" style={{ display: "grid", gap: 16 }}>
                <dl className="kv">
                  <dt>Le</dt>
                  <dd>{fmtDateTime(row.reviewed_at)}</dd>
                  <dt>Niveau validé</dt>
                  <dd>{levelText(row.level_verified)}</dd>
                  {row.status === "approved" ? (
                    <>
                      <dt>Établissement</dt>
                      <dd className={row.institution_verified || data.access?.institution ? undefined : "empty"}>
                        {row.institution_verified ?? (isSource ? data.access?.institution : null) ?? "non saisi"}
                      </dd>
                      <dt>Domaine</dt>
                      <dd className={row.field_verified || data.access?.study_field ? undefined : "empty"}>
                        {studyFieldLabel(row.field_verified ?? (isSource ? data.access?.study_field : null)) ?? "non saisi"}
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>Motif</dt>
                      <dd>{row.rejection_reason ?? "—"}</dd>
                    </>
                  )}
                </dl>
                {row.status === "approved" && isSource && data.access ? (
                  <InstitutionBackfill userId={row.user_id} access={data.access} onSaved={load} />
                ) : null}
              </div>
            </section>
          )}

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

          <section className="panel" aria-label="Note interne et historique">
            <div className="panel-b" style={{ display: "grid", gap: 20 }}>
              <ModeratorNote row={row} />
              {data.history.length > 1 ? (
                <div>
                  <p className="label" style={{ marginBottom: 8 }}>
                    Soumissions de ce candidat
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

"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import {
  EMPLOI_LIMITS,
  MATCHED_STATUSES,
  OPEN_STATUSES,
  REFUSAL_REASON_LABELS,
  REFUSAL_REASONS,
  REFUSAL_TEMPLATES,
  type ApplicationStatus,
  type InterviewMode,
  type RecruiterApplication,
  type RefusalReason,
} from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtDay, fmtLongDate, fmtNumber, fmtSlot, parisLocalToMs } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { IconCalendar, IconHeart, IconPlus, IconX } from "./Icons";

const NEXT_STEP: Partial<Record<ApplicationStatus, { status: ApplicationStatus; label: string }>> = {
  interested: { status: "interview", label: "Passer en entretien" },
  interview: { status: "offer_made", label: "Faire une proposition" },
  offer_made: { status: "hired", label: "Marquer comme embauché·e" },
};

const SLOT_STATUS_LABELS = { proposed: "Proposé", accepted: "Accepté", declined: "Décliné", cancelled: "Annulé" } as const;

/** Décisions et suivi d'une candidature : intéressé, refus poli, étapes, créneaux, notes internes. */
export default function ApplicationActions({
  app,
  onChanged,
  notify,
}: {
  app: RecruiterApplication;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const a = app.application;
  const open = OPEN_STATUSES.includes(a.status);
  const matched = MATCHED_STATUSES.includes(a.status);
  const [refusing, setRefusing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = NEXT_STEP[a.status];

  async function interested() {
    setBusy(true);
    setError(null);
    const { data, error } = await rpc<{ status: ApplicationStatus; identity: { first_name: string; last_name: string } | null }>(
      createClient(),
      "decide_application",
      { p_id: a.application_id, p_decision: "interested" },
    );
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    notify(
      data?.identity
        ? `${fmtNumber(a.cv.number)} s’appelle ${data.identity.first_name} ${data.identity.last_name}. La conversation est ouverte.`
        : "C’est un match : la conversation est ouverte.",
    );
    onChanged();
  }

  async function move() {
    if (!next) return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "move_application", { p_id: a.application_id, p_status: next.status });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    notify(next.status === "hired" ? "Embauche enregistrée. Pensez à marquer l’offre comme pourvue." : "Étape enregistrée.");
    onChanged();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <section className="surface" style={{ display: "grid", gap: 12 }} aria-label="Votre réponse">
          <p className="small" style={{ fontWeight: 700 }}>
            Sans réponse de votre part avant le {fmtDay(a.due_at)}, la candidature sera close sans réponse et comptée
            dans votre délai moyen.
          </p>
          <div className="row">
            <button type="button" className="btn btn--accent" onClick={interested} disabled={busy}>
              <IconHeart size={18} /> Intéressé
            </button>
            <button type="button" className="btn btn--soft" onClick={() => setRefusing((v) => !v)} disabled={busy}>
              <IconX size={16} /> Pas pour ce poste
            </button>
          </div>
          <p className="hint">« Intéressé » révèle le prénom et le nom du candidat et ouvre la conversation.</p>
        </section>
      ) : null}

      {matched ? (
        <section className="surface" style={{ display: "grid", gap: 12 }} aria-label="Étapes">
          <div className="row">
            <Link className="btn btn--accent" href={`/recruteur/candidatures/${a.application_id}`}>
              Conversation{app.unread_messages ? ` · ${app.unread_messages} non lu${app.unread_messages > 1 ? "s" : ""}` : ""}
            </Link>
            {a.status === "interested" || a.status === "interview" ? (
              <button type="button" className="btn btn--soft" onClick={() => setProposing((v) => !v)}>
                <IconCalendar size={18} /> Proposer des créneaux
              </button>
            ) : null}
            {next ? (
              <button type="button" className="btn btn--soft" onClick={move} disabled={busy}>
                {next.label}
              </button>
            ) : null}
          </div>
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setRefusing((v) => !v)}>
            Ne pas donner suite, poliment
          </button>
        </section>
      ) : null}

      {a.status === "hired" ? (
        <p className="alert alert--ok">Embauche enregistrée. Si le poste est pourvu, marquez l’offre comme pourvue depuis vos offres.</p>
      ) : null}

      {a.status === "rejected" ? (
        <section className="surface" style={{ display: "grid", gap: 6 }}>
          <strong>Réponse envoyée{a.decided_at ? ` le ${fmtLongDate(a.decided_at)}` : ""}</strong>
          {a.refusal_reason ? <span className="small muted">{REFUSAL_REASON_LABELS[a.refusal_reason]}</span> : null}
          {a.refusal_message ? <blockquote className="cv-quote">{a.refusal_message}</blockquote> : null}
        </section>
      ) : null}
      {a.status === "closed_no_response" ? (
        <p className="alert">Close sans réponse à l’échéance du {fmtDay(a.due_at)} : comptée dans votre délai moyen.</p>
      ) : null}
      {a.status === "withdrawn" ? <p className="alert">Le candidat a retiré sa candidature.</p> : null}

      {refusing ? (
        <RefusalForm
          applicationId={a.application_id}
          firstName={app.identity?.first_name ?? null}
          onCancel={() => setRefusing(false)}
          onDone={() => {
            setRefusing(false);
            notify("Réponse envoyée · candidature close");
            onChanged();
          }}
        />
      ) : null}

      {proposing ? (
        <SlotsForm
          applicationId={a.application_id}
          onCancel={() => setProposing(false)}
          onDone={(n) => {
            setProposing(false);
            notify(`${n} créneau${n > 1 ? "x" : ""} proposé${n > 1 ? "s" : ""} au candidat`);
            onChanged();
          }}
        />
      ) : null}

      {app.slots.length ? (
        <section className="cv-sec" aria-label="Créneaux d’entretien">
          <span>Créneaux d’entretien</span>
          {app.slots.map((s) => (
            <span key={s.id} className="row small" style={{ justifyContent: "space-between" }}>
              <span>
                <strong>{fmtSlot(s.starts_at)}</strong> · {s.duration_min} min · {s.mode === "visio" ? "visio" : "sur place"}
                {s.with_whom ? ` · avec ${s.with_whom}` : ""}
              </span>
              <span className={s.status === "accepted" ? "badge badge--ok" : "badge"}>{SLOT_STATUS_LABELS[s.status]}</span>
            </span>
          ))}
        </section>
      ) : null}

      <Notes applicationId={a.application_id} notes={app.notes} onChanged={onChanged} />
    </div>
  );
}

function RefusalForm({
  applicationId,
  firstName,
  onCancel,
  onDone,
}: {
  applicationId: string;
  firstName: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const greet = (t: string) => (firstName ? `Bonjour ${firstName},\n\n${t}` : `Bonjour,\n\n${t}`);
  const [reason, setReason] = useState<RefusalReason>("other_profile");
  const [message, setMessage] = useState(greet(REFUSAL_TEMPLATES.other_profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const len = message.trim().length;
  const ok = len >= EMPLOI_LIMITS.refusalMessageMin && len <= EMPLOI_LIMITS.refusalMessageMax;

  function pick(r: RefusalReason) {
    // Le modèle suit le motif tant que le recruteur ne l'a pas réécrit.
    if (message === greet(REFUSAL_TEMPLATES[reason])) setMessage(greet(REFUSAL_TEMPLATES[r]));
    setReason(r);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<unknown>(createClient(), "decide_application", {
      p_id: applicationId,
      p_decision: "rejected",
      p_reason: reason,
      p_message: message.trim(),
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onDone();
  }

  return (
    <form className="card" style={{ display: "grid", gap: 14 }} onSubmit={submit} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`}>Refuser poliment</h3>
      <fieldset className="field">
        <legend className="field-label">Motif (gardé pour vos statistiques, jamais montré tel quel)</legend>
        <div className="chips">
          {REFUSAL_REASONS.map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => pick(r)} style={{ whiteSpace: "normal", textAlign: "left" }}>
              {REFUSAL_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-msg`}>
          Message au candidat
        </label>
        <textarea
          id={`${id}-msg`}
          className="textarea"
          rows={6}
          maxLength={EMPLOI_LIMITS.refusalMessageMax}
          value={message}
          aria-invalid={!ok}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="counter">
          {len}/{EMPLOI_LIMITS.refusalMessageMax}
        </span>
        <p className="hint">Restez factuel et bienveillant. Aucun critère personnel : âge, origine, situation familiale.</p>
      </div>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn btn--danger" disabled={busy || !ok}>
          {busy ? "Envoi…" : "Envoyer la réponse"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

interface SlotDraft {
  date: string;
  time: string;
  duration: number;
  mode: InterviewMode;
  location: string;
  withWhom: string;
}

const blankSlot = (): SlotDraft => ({ date: "", time: "10:00", duration: 45, mode: "visio", location: "", withWhom: "" });

function SlotsForm({ applicationId, onCancel, onDone }: { applicationId: string; onCancel: () => void; onDone: (n: number) => void }) {
  const id = useId();
  const [slots, setSlots] = useState<SlotDraft[]>([blankSlot(), blankSlot(), blankSlot()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Heure figée à l'ouverture du formulaire : le rendu reste pur.
  const [now] = useState(() => Date.now());
  const today = new Date(now).toISOString().slice(0, 10);
  const filled = slots.filter((s) => s.date && s.time);
  const future = filled.every((s) => parisLocalToMs(s.date, s.time) > now);

  function update(i: number, patch: Partial<SlotDraft>) {
    setSlots((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!filled.length || !future) return;
    setBusy(true);
    setError(null);
    const { data, error } = await rpc<number>(createClient(), "propose_interview_slots", {
      p_id: applicationId,
      p_slots: filled.map((s) => ({
        starts_at: new Date(parisLocalToMs(s.date, s.time)).toISOString(),
        duration_min: s.duration,
        mode: s.mode,
        location: s.location.trim() || null,
        with_whom: s.withWhom.trim() || null,
      })),
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onDone(data ?? filled.length);
  }

  return (
    <form className="card" style={{ display: "grid", gap: 14 }} onSubmit={submit} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`}>Proposer des créneaux</h3>
      <p className="hint">Le candidat en choisit un dans l’app. Proposez-en 2 ou 3, sur des jours différents.</p>
      {slots.map((s, i) => (
        <fieldset key={i} className="surface" style={{ display: "grid", gap: 10, padding: 14 }}>
          <legend className="sr-only">Créneau {i + 1}</legend>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong className="small">Créneau {i + 1}</strong>
            {slots.length > 1 ? (
              <button type="button" className="link small" onClick={() => setSlots((l) => l.filter((_, j) => j !== i))}>
                Retirer
              </button>
            ) : null}
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <label className="field">
              <span className="field-label">Jour</span>
              <input type="date" className="input" min={today} value={s.date} onChange={(e) => update(i, { date: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Heure</span>
              <input type="time" className="input" value={s.time} step={900} onChange={(e) => update(i, { time: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Durée</span>
              <select className="select" value={s.duration} onChange={(e) => update(i, { duration: Number(e.target.value) })}>
                {[30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Format</span>
              <select className="select" value={s.mode} onChange={(e) => update(i, { mode: e.target.value as InterviewMode })}>
                <option value="visio">Visio</option>
                <option value="onsite">Sur place</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{s.mode === "onsite" ? "Adresse" : "Lien ou consigne (facultatif)"}</span>
              <input className="input" maxLength={200} value={s.location} onChange={(e) => update(i, { location: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Avec qui</span>
              <input className="input" maxLength={120} placeholder="Inès Moreau, Head of Data" value={s.withWhom} onChange={(e) => update(i, { withWhom: e.target.value })} />
            </label>
          </div>
        </fieldset>
      ))}
      {slots.length < EMPLOI_LIMITS.slotsMax ? (
        <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: "start" }} onClick={() => setSlots((l) => [...l, blankSlot()])}>
          <IconPlus size={16} /> Ajouter un créneau
        </button>
      ) : null}
      {!future ? <p className="field-error">Les créneaux doivent être dans le futur.</p> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn btn--accent" disabled={busy || !filled.length || !future}>
          {busy ? "Envoi…" : `Proposer ${filled.length || ""} créneau${filled.length > 1 ? "x" : ""}`}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Notes({
  applicationId,
  notes,
  onChanged,
}: {
  applicationId: string;
  notes: RecruiterApplication["notes"];
  onChanged: () => void;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<string>(createClient(), "add_application_note", { p_id: applicationId, p_body: body.trim() });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    setBody("");
    onChanged();
  }

  return (
    <section className="cv-sec" aria-labelledby={`${id}-t`}>
      <span id={`${id}-t`}>Notes internes</span>
      <p className="hint">Visibles par votre équipe. Le candidat peut en demander une copie (droit d’accès, RGPD) : restez factuel.</p>
      {notes.map((n) => (
        <div key={n.id} className="cv-quote small">
          {n.body}
          <span className="muted" style={{ display: "block", marginTop: 4 }}>
            {[n.author_job_title, fmtLongDate(n.created_at)].filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
      <form className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }} onSubmit={add}>
        <label className="sr-only" htmlFor={`${id}-n`}>
          Ajouter une note
        </label>
        <textarea id={`${id}-n`} className="textarea" style={{ minHeight: 60 }} maxLength={1000} placeholder="Ajouter une note" value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="submit" className="btn btn--sm" disabled={busy || !body.trim()}>
          Ajouter
        </button>
      </form>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

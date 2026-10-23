"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  EVENT_MAX_CAPACITY,
  EVENT_STATUS_LABELS,
  EVENT_TITLE_MAX_LENGTH,
  type AccessTier,
  type EventKind,
  type EventStatus,
} from "@sapios/shared";
import { describeError, errorCode, errorMessage } from "@/lib/admin/errors";
import { fmtEventDate, fmtHour, fromLocalInput, numberFr, TIER_LABELS, toLocalInput } from "@/lib/admin/format";
import type { AdminEventRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

/** Paliers qui voient la découverte : les seuls qu'un événement peut accueillir (contrat §2). */
const EVENT_TIERS: Array<{ tier: Extract<AccessTier, "unlimited" | "standard">; label: string }> = [
  { tier: "unlimited", label: "Bac+8" },
  { tier: "standard", label: "Bac+5" },
];

type Phase = EventStatus | "past";

const PHASE_LABELS: Record<Phase, string> = { ...EVENT_STATUS_LABELS, past: "Passé" };

export function eventPhase(e: Pick<AdminEventRow, "status" | "ends_at">, now = Date.now()): Phase {
  if (e.status === "published" && new Date(e.ends_at).getTime() < now) return "past";
  return e.status;
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const cls =
    phase === "published" ? "badge badge--solid" : phase === "draft" ? "badge badge--dashed" : "badge";
  return <span className={cls}>{PHASE_LABELS[phase]}</span>;
}

/** Places prises : inscrits confirmés et venus (les absents ont occupé leur place). */
export function seatsTaken(e: Pick<AdminEventRow, "registered_count" | "attended_count" | "no_show_count">): number {
  return e.registered_count + e.attended_count + e.no_show_count;
}

export function FillBar({ taken, capacity }: { taken: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(taken / capacity, 1) : 0;
  return (
    <div className="fill">
      <span className="fill-n">
        {taken}/{capacity}
      </span>
      <span className="fill-track" aria-hidden="true">
        <i style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </div>
  );
}

interface Draft {
  title: string;
  kind: EventKind;
  description: string;
  city: string;
  neighbourhood: string;
  venue_name: string;
  venue_address: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  tiers: AccessTier[];
  status: Extract<EventStatus, "draft" | "published">;
}

const EMPTY: Draft = {
  title: "",
  kind: "dinner",
  description: "",
  city: "Paris",
  neighbourhood: "",
  venue_name: "",
  venue_address: "",
  starts_at: "",
  ends_at: "",
  capacity: "24",
  tiers: ["standard", "unlimited"],
  status: "draft",
};

function draftOf(e: AdminEventRow): Draft {
  return {
    title: e.title,
    kind: e.kind,
    description: e.description,
    city: e.city,
    neighbourhood: e.neighbourhood ?? "",
    venue_name: e.venue_name ?? "",
    venue_address: e.venue_address ?? "",
    starts_at: toLocalInput(e.starts_at),
    ends_at: toLocalInput(e.ends_at),
    capacity: String(e.capacity),
    tiers: e.allowed_tiers,
    status: e.status === "published" ? "published" : "draft",
  };
}

function problemsOf(d: Draft, current: AdminEventRow | null): Record<string, string> {
  const p: Record<string, string> = {};
  if (!d.title.trim()) p.title = "Donnez un titre.";
  if (!d.city.trim()) p.city = "Indiquez la ville.";
  const start = fromLocalInput(d.starts_at);
  const end = fromLocalInput(d.ends_at);
  if (!start) p.starts_at = "Indiquez le début.";
  if (!end) p.ends_at = "Indiquez la fin.";
  if (start && end && new Date(end) <= new Date(start)) p.ends_at = "La fin doit suivre le début.";
  const cap = Number(d.capacity);
  if (!/^\d+$/.test(d.capacity.trim()) || cap < 1 || cap > EVENT_MAX_CAPACITY) {
    p.capacity = `Une capacité de 1 à ${EVENT_MAX_CAPACITY}.`;
  } else if (current && cap < seatsTaken(current)) {
    p.capacity = `Déjà ${seatsTaken(current)} places prises : la capacité ne peut pas descendre en dessous.`;
  }
  if (!d.tiers.length) p.tiers = "Au moins un palier.";
  if (d.status === "published" && !d.venue_address.trim()) {
    p.venue_address = "L’adresse est envoyée aux inscrits : renseignez-la avant de publier.";
  }
  return p;
}

function Editor({
  event,
  onSaved,
  onCancelled,
  onClose,
}: {
  event: AdminEventRow | null;
  onSaved: (id: string, message: string) => void;
  onCancelled: (message: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(event ? draftOf(event) : EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const phase = event ? eventPhase(event) : "draft";
  const readOnly = phase === "cancelled";
  const active = event ? event.registered_count + event.waitlisted_count : 0;
  // Dépublier un événement qui a des inscrits les laisserait sans nouvelles : la base le refuse.
  const lockPublished = event?.status === "published" && active > 0;
  const problems = useMemo(() => problemsOf(draft, event), [draft, event]);
  const show = (k: string) => (touched && problems[k] ? problems[k] : null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("admin_upsert_event", {
      p_id: event?.id ?? (null as unknown as string),
      p_title: draft.title.trim(),
      p_kind: draft.kind,
      p_description: draft.description,
      p_city: draft.city.trim(),
      p_neighbourhood: draft.neighbourhood.trim(),
      p_venue_name: draft.venue_name.trim(),
      p_venue_address: draft.venue_address.trim(),
      p_starts_at: fromLocalInput(draft.starts_at) as string,
      p_ends_at: fromLocalInput(draft.ends_at) as string,
      p_capacity: Number(draft.capacity),
      p_allowed_tiers: draft.tiers,
      p_status: draft.status,
    });
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    const savedId = typeof data === "string" ? data : (event?.id ?? "");
    onSaved(
      savedId,
      event
        ? `« ${draft.title.trim()} » enregistré.${draft.status === "published" ? " Les membres voient la mise à jour." : ""}`
        : `« ${draft.title.trim()} » créé${draft.status === "published" ? " et publié" : " en brouillon, invisible des membres"}.`,
    );
  }

  async function cancelEvent() {
    if (!event) return;
    if (!reason.trim()) {
      setError("Écrivez le motif : il est envoyé à chaque inscrit.");
      return;
    }
    setCancelling(true);
    setError(null);
    const { data, error } = await createClient().rpc("admin_cancel_event", {
      p_event_id: event.id,
      p_reason: reason.trim(),
    });
    setCancelling(false);
    if (error) {
      const code = await errorCode(error);
      setError(code === "reason_required" ? "Un motif de 500 caractères au plus est obligatoire." : errorMessage(code));
      return;
    }
    const n = typeof data === "number" ? data : 0;
    onCancelled(
      n
        ? `« ${event.title} » annulé. ${n} personne${n > 1 ? "s" : ""} prévenue${n > 1 ? "s" : ""}, avec le motif.`
        : `« ${event.title} » annulé. Personne n’était inscrit.`,
    );
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 className="label" id={`${id}-t`}>
          {event ? (readOnly ? "Événement annulé" : "Modifier l’événement") : "Créer un événement"}
        </h2>
        <button type="button" className="adm-link" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="panel-b">
        {readOnly && event ? (
          <dl className="kv">
            <dt>Titre</dt>
            <dd>{event.title}</dd>
            <dt>Date</dt>
            <dd>{fmtEventDate(event.starts_at)}</dd>
            <dt>Motif envoyé</dt>
            <dd>« {event.cancel_reason} »</dd>
            <dt>Inscriptions annulées</dt>
            <dd>{event.cancelled_count}</dd>
          </dl>
        ) : (
          <form className="form-grid" onSubmit={save} noValidate>
            <div className="field full">
              <label className="label" htmlFor={`${id}-title`}>
                Titre
              </label>
              <input
                id={`${id}-title`}
                className="input"
                maxLength={EVENT_TITLE_MAX_LENGTH}
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                aria-invalid={show("title") ? true : undefined}
                aria-describedby={show("title") ? `${id}-title-e` : undefined}
              />
              {show("title") ? (
                <span className="field-error" id={`${id}-title-e`}>
                  {show("title")}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-kind`}>
                Type
              </label>
              <select id={`${id}-kind`} className="select" value={draft.kind} onChange={(e) => set("kind", e.target.value as EventKind)}>
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-cap`}>
                Capacité
              </label>
              <input
                id={`${id}-cap`}
                className="input"
                inputMode="numeric"
                value={draft.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                aria-invalid={show("capacity") ? true : undefined}
                aria-describedby={show("capacity") ? `${id}-cap-e` : undefined}
              />
              {show("capacity") ? (
                <span className="field-error" id={`${id}-cap-e`}>
                  {show("capacity")}
                </span>
              ) : null}
            </div>
            <div className="field full">
              <label className="label" htmlFor={`${id}-desc`}>
                Programme
              </label>
              <textarea
                id={`${id}-desc`}
                className="textarea"
                maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="19 h 30 accueil · 20 h sujets en 4 minutes · 21 h dîner"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-city`}>
                Ville
              </label>
              <input
                id={`${id}-city`}
                className="input"
                maxLength={80}
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
                aria-invalid={show("city") ? true : undefined}
              />
              {show("city") ? <span className="field-error">{show("city")}</span> : null}
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-nb`}>
                Quartier affiché
              </label>
              <input
                id={`${id}-nb`}
                className="input"
                maxLength={80}
                value={draft.neighbourhood}
                onChange={(e) => set("neighbourhood", e.target.value)}
                placeholder="Paris 5e"
              />
            </div>
            <div className="field full">
              <label className="label" htmlFor={`${id}-venue`}>
                Lieu
              </label>
              <input
                id={`${id}-venue`}
                className="input"
                maxLength={120}
                value={draft.venue_name}
                onChange={(e) => set("venue_name", e.target.value)}
              />
            </div>
            <div className="field full">
              <label className="label" htmlFor={`${id}-addr`}>
                Adresse privée
              </label>
              <input
                id={`${id}-addr`}
                className="input"
                maxLength={300}
                value={draft.venue_address}
                onChange={(e) => set("venue_address", e.target.value)}
                aria-invalid={show("venue_address") ? true : undefined}
                aria-describedby={`${id}-addr-h`}
              />
              <span className="form-hint muted" id={`${id}-addr-h`}>
                {show("venue_address") ?? "Envoyée aux seuls inscrits confirmés, jamais affichée dans la liste."}
              </span>
            </div>
            <div className="field full">
              <label className="label" htmlFor={`${id}-start`}>
                Début
              </label>
              <input
                id={`${id}-start`}
                type="datetime-local"
                className="input"
                value={draft.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
                aria-invalid={show("starts_at") ? true : undefined}
              />
              {show("starts_at") ? <span className="field-error">{show("starts_at")}</span> : null}
            </div>
            <div className="field full">
              <label className="label" htmlFor={`${id}-end`}>
                Fin
              </label>
              <input
                id={`${id}-end`}
                type="datetime-local"
                className="input"
                value={draft.ends_at}
                onChange={(e) => set("ends_at", e.target.value)}
                aria-invalid={show("ends_at") ? true : undefined}
              />
              {show("ends_at") ? <span className="field-error">{show("ends_at")}</span> : null}
            </div>
            <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Paliers admis
              </legend>
              <div className="chips">
                {EVENT_TIERS.map(({ tier, label }) => (
                  <label key={tier} className="check">
                    <input
                      type="checkbox"
                      checked={draft.tiers.includes(tier)}
                      onChange={(e) =>
                        set("tiers", e.target.checked ? [...draft.tiers, tier] : draft.tiers.filter((t) => t !== tier))
                      }
                    />
                    <span>
                      {label} <span className="muted">({TIER_LABELS[tier]})</span>
                    </span>
                  </label>
                ))}
              </div>
              {show("tiers") ? <span className="field-error">{show("tiers")}</span> : null}
            </fieldset>
            <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Statut
              </legend>
              <div className="seg" role="group" aria-label="Statut de l’événement">
                <button
                  type="button"
                  aria-pressed={draft.status === "draft"}
                  disabled={lockPublished}
                  title={lockPublished ? "Des membres sont inscrits : annulez plutôt l’événement." : undefined}
                  onClick={() => set("status", "draft")}
                >
                  Brouillon
                </button>
                <button type="button" aria-pressed={draft.status === "published"} onClick={() => set("status", "published")}>
                  Publié
                </button>
              </div>
              <span className="form-hint muted">
                {draft.status === "draft"
                  ? "Invisible des membres tant qu’il n’est pas publié."
                  : "Visible des membres des paliers admis, sans l’adresse."}
              </span>
            </fieldset>
            <div className="full" aria-live="assertive">
              {error ? <ErrorNotice message={error} /> : null}
            </div>
            <div className="form-actions full">
              <button type="submit" className="btn btn--sm" disabled={busy}>
                {busy ? "Enregistrement…" : event ? "Enregistrer" : "Créer l’événement"}
              </button>
              {event ? (
                <Link className="adm-link" href={`/admin/evenements/${event.id}`}>
                  Voir les inscrits
                </Link>
              ) : null}
            </div>
          </form>
        )}

        {event && !readOnly ? (
          <div className="danger-zone">
            <label className="label" htmlFor={`${id}-reason`}>
              Annuler l’événement · motif envoyé {active ? `aux ${active} inscrits` : "aux inscrits"} (obligatoire)
            </label>
            <textarea
              id={`${id}-reason`}
              className="textarea"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Le lieu nous a fait faux bond. Nous reprogrammons au plus vite."
            />
            <div className="form-actions">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={cancelling || !reason.trim()}
                onClick={cancelEvent}
              >
                {cancelling ? "Annulation…" : "Annuler et prévenir les inscrits"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function EventsView({ initialId }: { initialId?: string }) {
  const [rows, setRows] = useState<AdminEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState<string | "new" | null>(initialId ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    createClient()
      .rpc("admin_list_events", { p_include_past: past })
      .then(async ({ data, error }) => {
        if (error) {
          setError(await describeError(error));
          return;
        }
        const list = (data ?? []) as AdminEventRow[];
        setError(null);
        setRows(list);
        // Un lien vers un événement passé ouvre la liste complète.
        if (initialId && !past && !list.some((r) => r.id === initialId)) setPast(true);
      });
  }, [past, initialId]);
  useEffect(load, [load]);

  const current = open && open !== "new" ? (rows?.find((r) => r.id === open) ?? null) : null;
  const upcoming = rows?.filter((r) => eventPhase(r) !== "past" && r.status !== "cancelled").length ?? 0;

  return (
    <>
      <PageHead
        label={`Agenda${rows ? ` · ${numberFr.format(upcoming)} à venir` : ""}`}
        title={
          <>
            Les <em>événements</em>
          </>
        }
        lead="Réservés aux paliers qui voient la découverte. Les membres voient les places restantes, jamais la liste des inscrits ni l’adresse avant leur inscription."
        aside={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setNotice(null);
              setOpen("new");
            }}
          >
            + Créer un événement
          </button>
        }
      />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Période">
          <button type="button" aria-pressed={!past} onClick={() => setPast(false)}>
            À venir
          </button>
          <button type="button" aria-pressed={past} onClick={() => setPast(true)}>
            Passés compris
          </button>
        </div>
        {rows ? (
          <span className="label" role="status">
            {rows.length} événement{rows.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}

      {rows ? (
        <div className={open === "new" || current ? "ev-layout" : undefined}>
          <div>
            {rows.length === 0 ? (
              <Empty title="Aucun événement. Le premier dîner de thèse attend son organisateur.">
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen("new")}>
                  Créer un événement
                </button>
              </Empty>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl tbl--cards">
                  <caption className="sr-only">Événements</caption>
                  <thead>
                    <tr>
                      <th scope="col">Statut</th>
                      <th scope="col">Date</th>
                      <th scope="col">Événement</th>
                      <th scope="col">Remplissage</th>
                      <th scope="col" className="num">
                        Attente
                      </th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const phase = eventPhase(e);
                      const taken = seatsTaken(e);
                      const dim = phase === "past" || phase === "cancelled";
                      const note =
                        phase === "cancelled"
                          ? `Motif envoyé : ${e.cancel_reason}`
                          : phase === "past"
                            ? `${e.attended_count} venu${e.attended_count > 1 ? "s" : ""} sur ${taken} inscrit${taken > 1 ? "s" : ""}`
                            : phase === "draft"
                              ? "Invisible des membres"
                              : taken >= e.capacity
                                ? "Complet"
                                : null;
                      return (
                        <tr
                          key={e.id}
                          className={[open === e.id ? "is-current" : "", dim && open !== e.id ? "is-dim" : ""].join(" ").trim() || undefined}
                        >
                          <td data-label="Statut">
                            <PhaseBadge phase={phase} />
                          </td>
                          <td data-label="Date" className="ev-date">
                            <span className="strong">{fmtEventDate(e.starts_at).split(" · ")[0]}</span>
                            <br />
                            <span className="muted">{fmtHour(e.starts_at)}</span>
                          </td>
                          <td data-label="Événement" className="span">
                            <span className="strong">{e.title}</span>
                            <br />
                            <span className="muted">
                              {[EVENT_KIND_LABELS[e.kind], e.neighbourhood ?? e.city, note].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td data-label="Remplissage">
                            <FillBar taken={taken} capacity={e.capacity} />
                          </td>
                          <td data-label="Attente" className="num">
                            {phase === "published" ? e.waitlisted_count : "—"}
                          </td>
                          <td>
                            <div className="form-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                              <button
                                type="button"
                                className="adm-link"
                                onClick={() => {
                                  setNotice(null);
                                  setOpen(e.id);
                                }}
                              >
                                {phase === "cancelled" ? "Détails" : "Modifier"}
                              </button>
                              <Link className="row-link" href={`/admin/evenements/${e.id}`}>
                                Inscrits
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {open === "new" || current ? (
            <div className="ev-side">
              <Editor
                key={open}
                event={current}
                onClose={() => setOpen(null)}
                onSaved={(id, message) => {
                  setNotice(message);
                  setOpen(id || null);
                  load();
                }}
                onCancelled={(message) => {
                  setNotice(message);
                  load();
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

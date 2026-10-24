"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPLOI_LIMITS,
  REFUSAL_REASON_LABELS,
  REFUSAL_REASONS,
  REFUSAL_TEMPLATES,
  type PileCard,
  type RecruiterOfferRow,
  type RefusalReason,
} from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtDay, fmtNumber, fmtRemaining, isUrgent, plural } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import CvView from "./CvView";
import { IconCheck, IconClock, IconHeart, IconX } from "./Icons";
import { ErrorBox, Loading, Modal, useToast } from "./ui";

type Out = "left" | "right" | null;

// La pile : une candidature à la fois, dans l'ordre d'arrivée (contrat §6), utilisable au téléphone.
export default function Pile({ offerId }: { offerId: string }) {
  const [queue, setQueue] = useState<PileCard[] | null>(null);
  const [offer, setOffer] = useState<RecruiterOfferRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Out>(null);
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [decided, setDecided] = useState(0);
  const [toast, showToast] = useToast();
  const seen = useRef(new Set<string>());

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      rpc<PileCard[]>(supabase, "get_offer_pile", { p_offer_id: offerId, p_limit: 20 }),
      rpc<RecruiterOfferRow[]>(supabase, "list_company_offers"),
    ]).then(async ([pile, offers]) => {
      if (pile.error) {
        setError(await describeEmploiError(pile.error));
        return;
      }
      setError(null);
      setQueue(pile.data ?? []);
      setOffer((offers.data ?? []).find((o) => o.id === offerId) ?? null);
    });
  }, [offerId]);
  useEffect(load, [load]);

  const card = queue?.[0] ?? null;
  const next = queue?.[1] ?? null;

  // Une carte montrée passe « Vue » pour le candidat.
  useEffect(() => {
    if (!card || card.status !== "sent" || seen.current.has(card.application_id)) return;
    seen.current.add(card.application_id);
    rpc<null>(createClient(), "mark_application_seen", { p_id: card.application_id });
  }, [card]);

  const advance = useCallback(() => {
    setOut(null);
    setQueue((q) => (q ?? []).slice(1));
  }, []);

  // Pile vidée après des décisions : on recharge une fois, d'autres candidatures ont pu arriver.
  const reloadedAt = useRef(-1);
  useEffect(() => {
    if (queue && queue.length === 0 && decided > 0 && reloadedAt.current !== decided) {
      reloadedAt.current = decided;
      load();
    }
  }, [queue, decided, load]);

  const interested = useCallback(async () => {
    if (!card || busy) return;
    setBusy(true);
    setOut("right");
    const started = Date.now();
    const { data, error } = await rpc<{ identity: { first_name: string; last_name: string } | null }>(
      createClient(),
      "decide_application",
      { p_id: card.application_id, p_decision: "interested" },
    );
    if (error) {
      setOut(null);
      setBusy(false);
      showToast(await describeEmploiError(error));
      return;
    }
    window.setTimeout(() => {
      showToast(
        data?.identity
          ? `${fmtNumber(card.cv.number)} s’appelle ${data.identity.first_name} ${data.identity.last_name} · conversation ouverte`
          : "C’est un match · conversation ouverte",
      );
      setDecided((n) => n + 1);
      setBusy(false);
      advance();
    }, Math.max(0, 550 - (Date.now() - started)));
  }, [advance, busy, card, showToast]);

  const refuse = useCallback(
    async (reason: RefusalReason, message: string) => {
      if (!card) return;
      setRefusing(false);
      setBusy(true);
      setOut("left");
      const started = Date.now();
      const { error } = await rpc<unknown>(createClient(), "decide_application", {
        p_id: card.application_id,
        p_decision: "rejected",
        p_reason: reason,
        p_message: message,
      });
      if (error) {
        setOut(null);
        setBusy(false);
        showToast(await describeEmploiError(error));
        return;
      }
      window.setTimeout(() => {
        showToast("Réponse polie envoyée · CV resté anonyme");
        setDecided((n) => n + 1);
        setBusy(false);
        advance();
      }, Math.max(0, 550 - (Date.now() - started)));
    },
    [advance, card, showToast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (refusing || busy || !card) return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "ArrowRight") interested();
      if (e.key === "ArrowLeft") setRefusing(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, card, interested, refusing]);

  const remaining = queue?.length ?? 0;
  const due = queue?.map((c) => c.due_at).sort()[0] ?? null;

  return (
    <div className="pile">
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Link className="link small" href={`/recruteur/offres/${offerId}/suivi`}>
          ← Suivi de l’offre
        </Link>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>{offer?.title ?? "Pile de candidatures"}</h1>
        {queue && remaining ? (
          <span className={due && isUrgent(due) ? "deadline deadline--urgent" : "deadline"}>
            <IconClock size={15} />
            {remaining}
            {remaining >= 20 ? "+" : ""} à examiner · répondre avant le {fmtDay(due)}
            {due && isUrgent(due) ? ` (${fmtRemaining(due)})` : ""}
          </span>
        ) : null}
      </header>

      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!queue && !error ? <Loading /> : null}

      {queue && !card ? (
        <div className="pile-done">
          <span className="pile-done-icon" aria-hidden="true">
            <IconCheck size={30} />
          </span>
          <strong style={{ fontSize: 20 }}>Pile triée</strong>
          <p className="muted">
            {decided
              ? `${plural(decided, "réponse envoyée", "réponses envoyées")} dans le délai promis.`
              : "Aucune candidature n’attend de réponse pour cette offre."}
          </p>
          <Link className="btn btn--soft" href={`/recruteur/offres/${offerId}/suivi`}>
            Voir le suivi
          </Link>
        </div>
      ) : null}

      {card ? (
        <>
          <div className="pile-stage">
            {next ? <div className="pile-under" aria-hidden="true" /> : null}
            <article
              key={card.application_id}
              className="pile-card"
              data-out={out ?? undefined}
              aria-label={`Candidature ${fmtNumber(card.cv.number)}`}
            >
              {out === "right" ? (
                <span className="stamp stamp--yes" aria-hidden="true">
                  INTÉRESSÉ
                </span>
              ) : null}
              {out === "left" ? (
                <span className="stamp stamp--no" aria-hidden="true">
                  PAS POUR CE POSTE
                </span>
              ) : null}
              <span className="small muted" style={{ fontWeight: 700 }}>
                Reçue le {fmtDay(card.created_at)}
                {card.invited ? " · après votre invitation" : ""} · réponse avant le {fmtDay(card.due_at)}
              </span>
              <CvView cv={card.cv} matches={card.matches} note={card.note} noteTarget={card.note_target_label} compact />
              <Link className="link" href={`/recruteur/candidatures/${card.application_id}`}>
                Voir le CV complet →
              </Link>
            </article>
          </div>
          <div className="pile-actions">
            <button type="button" className="btn btn--soft" onClick={() => setRefusing(true)} disabled={busy}>
              <IconX size={18} /> Pas pour ce poste
            </button>
            <button type="button" className="btn btn--accent" onClick={interested} disabled={busy}>
              <IconHeart size={18} /> Intéressé
            </button>
          </div>
          <p className="hint" style={{ textAlign: "center" }}>
            Raccourcis : flèche droite pour « Intéressé », flèche gauche pour répondre poliment.
          </p>
        </>
      ) : null}

      {refusing && card ? <RefusalSheet onCancel={() => setRefusing(false)} onConfirm={refuse} /> : null}
      {toast}
    </div>
  );
}

function RefusalSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (r: RefusalReason, m: string) => void }) {
  const [reason, setReason] = useState<RefusalReason>("other_profile");
  const [message, setMessage] = useState(REFUSAL_TEMPLATES.other_profile);
  const len = message.trim().length;
  const ok = len >= EMPLOI_LIMITS.refusalMessageMin && len <= EMPLOI_LIMITS.refusalMessageMax;
  return (
    <Modal title="Pas pour ce poste" onClose={onCancel}>
      <p className="muted small">Le candidat reçoit ce message. Son CV reste anonyme : il ne saura jamais rien de plus de vous, et vous de lui.</p>
      <fieldset className="field">
        <legend className="field-label">Motif</legend>
        <div className="chips">
          {REFUSAL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className="chip"
              aria-pressed={reason === r}
              style={{ whiteSpace: "normal", textAlign: "left" }}
              onClick={() => {
                if (message === REFUSAL_TEMPLATES[reason]) setMessage(REFUSAL_TEMPLATES[r]);
                setReason(r);
              }}
            >
              {REFUSAL_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">Message</span>
        <textarea className="textarea" rows={5} maxLength={EMPLOI_LIMITS.refusalMessageMax} value={message} onChange={(e) => setMessage(e.target.value)} />
        <span className="counter">
          {len}/{EMPLOI_LIMITS.refusalMessageMax}
        </span>
      </label>
      <div className="row">
        <button type="button" className="btn btn--accent" disabled={!ok} onClick={() => onConfirm(reason, message.trim())}>
          Envoyer la réponse
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}

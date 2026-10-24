"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EMPLOI_LIMITS, levelLabel, type OpenCandidate, type RecruiterOfferRow } from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtNumber, fmtSalary } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import CvView from "./CvView";
import { IconCheckCircle, IconSend } from "./Icons";
import { ErrorBox, Loading, Modal, useToast } from "./ui";

// Niveaux de `user_access.level` (échelle nationale) : 6 = Bac+3, 7 = Bac+5, 8 = Bac+8.
const LEVELS = [null, 6, 7, 8] as const;

function invitationText(o: RecruiterOfferRow): string {
  return `Bonjour, votre profil correspond à notre offre « ${o.title} » (${fmtSalary(o.salary_min_k, o.salary_max_k)}, ${o.city}). Elle pourrait vous intéresser : nous serions heureux de recevoir votre candidature.`;
}

export default function DirectApproach() {
  const id = useId();
  const [offers, setOffers] = useState<RecruiterOfferRow[] | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [skill, setSkill] = useState("");
  const [results, setResults] = useState<OpenCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<OpenCandidate | null>(null);
  const [toast, showToast] = useToast();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    rpc<RecruiterOfferRow[]>(createClient(), "list_company_offers").then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      const published = (data ?? []).filter((o) => o.status === "published");
      setOffers(published);
      setOfferId((cur) => cur ?? published[0]?.id ?? null);
    });
  }, []);

  const search = useCallback(
    (oid: string, lvl: number | null, sk: string) => {
      setResults(null);
      rpc<OpenCandidate[]>(createClient(), "search_open_candidates", {
        p_offer_id: oid,
        p_min_level: lvl,
        p_skill: sk.trim() || null,
      }).then(async ({ data, error }) => {
        if (error) {
          setError(await describeEmploiError(error));
          setResults([]);
          return;
        }
        setError(null);
        setResults(data ?? []);
      });
    },
    [],
  );

  useEffect(() => {
    if (!offerId) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => search(offerId, level, skill), skill ? 350 : 0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [offerId, level, skill, search]);

  const offer = offers?.find((o) => o.id === offerId) ?? null;

  return (
    <>
      <header className="rec-head">
        <div>
          <h1>Approche directe</h1>
          <p className="rec-lead">
            Des candidats « ouverts aux opportunités », anonymes, dont la zone de recherche couvre le lieu de votre offre.
            Ceux qui ont masqué votre entreprise n’apparaissent pas.
          </p>
        </div>
      </header>

      {offers && !offers.length ? (
        <div className="surface" style={{ display: "grid", gap: 10 }}>
          <strong>Aucune offre publiée</strong>
          <p className="muted">Une invitation pointe toujours vers une offre publiée, avec sa fourchette de salaire.</p>
          <Link className="btn btn--accent" style={{ justifySelf: "start" }} href="/recruteur/offres/nouvelle">
            Créer une offre
          </Link>
        </div>
      ) : null}

      {offers && offers.length ? (
        <section className="surface" style={{ display: "grid", gap: 14 }} aria-label="Filtres">
          <div className="field">
            <label className="field-label" htmlFor={`${id}-offer`}>
              Pour l’offre
            </label>
            <select id={`${id}-offer`} className="select" value={offerId ?? ""} onChange={(e) => setOfferId(e.target.value)}>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} · {o.city}
                </option>
              ))}
            </select>
          </div>
          <div className="chips" role="group" aria-label="Filtres simples">
            {offer ? (
              <span className="tag tag--dark" style={{ minHeight: 40, padding: "0 14px" }} title="Zone de recherche du candidat, jamais son adresse">
                <span style={{ opacity: 0.75, fontWeight: 600 }}>Cherche à</span> {offer.city}
              </span>
            ) : null}
            {LEVELS.map((l) => (
              <button key={String(l)} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
                {l == null ? "Tous diplômes" : `${levelLabel(l)} et plus`}
              </button>
            ))}
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-skill`}>
              Compétence
            </label>
            <input
              id={`${id}-skill`}
              className="input"
              maxLength={40}
              placeholder="SQL, Power BI, gestion de projet…"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            />
          </div>
          <p className="hint">
            Le filtre de lieu porte sur la zone où le candidat cherche, jamais sur son domicile, qui n’est pas collecté.
          </p>
        </section>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}
      {offers === null || (offerId && results === null) ? <Loading /> : null}

      {results && offerId ? (
        <>
          <p className="small muted" style={{ fontWeight: 700 }} aria-live="polite">
            {results.length ? `${results.length} profil${results.length > 1 ? "s" : ""}` : "Aucun profil ne correspond pour l’instant."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {results.map((c) => (
              <article key={c.number} className="card" style={{ display: "grid", gap: 14, alignContent: "start" }}>
                <CvView cv={c.cv} matches={c.matches} compact />
                {c.already_invited ? (
                  <span className="badge badge--ok" style={{ justifySelf: "start" }}>
                    <IconCheckCircle size={14} /> Invitation envoyée
                  </span>
                ) : (
                  <button type="button" className="btn btn--accent" onClick={() => setInviting(c)}>
                    <IconSend size={18} /> Inviter à postuler
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {inviting && offer ? (
        <InviteSheet
          offer={offer}
          candidate={inviting}
          onCancel={() => setInviting(null)}
          onSent={() => {
            setResults((r) => (r ?? []).map((x) => (x.number === inviting.number ? { ...x, already_invited: true } : x)));
            showToast(`Invitation envoyée à ${fmtNumber(inviting.number)}`);
            setInviting(null);
          }}
        />
      ) : null}
      {toast}
    </>
  );
}

function InviteSheet({
  offer,
  candidate,
  onCancel,
  onSent,
}: {
  offer: RecruiterOfferRow;
  candidate: OpenCandidate;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState(invitationText(offer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const { error } = await rpc<string>(createClient(), "invite_candidate", {
      p_offer_id: offer.id,
      p_number: candidate.number,
      p_message: message.trim(),
    });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    onSent();
  }

  return (
    <Modal title={`Inviter ${fmtNumber(candidate.number)}`} onClose={onCancel}>
      <div className="surface" style={{ padding: 14 }}>
        <strong>{offer.title}</strong>
        <p className="small muted">
          {offer.city} · {fmtSalary(offer.salary_min_k, offer.salary_max_k)}
        </p>
      </div>
      <label className="field">
        <span className="field-label">Votre message</span>
        <textarea className="textarea" rows={5} maxLength={EMPLOI_LIMITS.invitationMessageMax} value={message} onChange={(e) => setMessage(e.target.value)} />
        <span className="counter">
          {message.length}/{EMPLOI_LIMITS.invitationMessageMax}
        </span>
      </label>
      <p className="hint">
        Le candidat reçoit l’invitation dans l’app et reste anonyme. S’il postule, sa candidature arrive dans votre pile,
        avec le même délai de réponse. Les invitations sont limitées chaque semaine.
      </p>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="btn btn--accent" onClick={send} disabled={busy || message.trim().length < 20}>
          {busy ? "Envoi…" : "Envoyer l’invitation"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}

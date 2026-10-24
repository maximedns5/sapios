"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  APPLICATION_STATUS_LABELS_RECRUITER,
  EMPLOI_LIMITS,
  MATCHED_STATUSES,
  type ApplicationMessage,
  type RecruiterApplication,
} from "@sapios/shared";
import { describeEmploiError, errorCode } from "@/lib/emploi/errors";
import { fmtDay, fmtNumber, fmtSlot } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import ApplicationActions from "./ApplicationActions";
import CvView from "./CvView";
import { IconSend } from "./Icons";
import { ErrorBox, Loading, useToast } from "./ui";

export default function ApplicationPage({ applicationId }: { applicationId: string }) {
  const [app, setApp] = useState<RecruiterApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    const supabase = createClient();
    rpc<RecruiterApplication>(supabase, "get_recruiter_application", { p_id: applicationId }).then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setApp(data);
      if (data?.application.status === "sent") rpc<null>(supabase, "mark_application_seen", { p_id: applicationId });
    });
  }, [applicationId]);
  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!app) return <Loading />;

  const a = app.application;
  const name = app.identity ? `${app.identity.first_name} ${app.identity.last_name}` : `Candidat·e ${fmtNumber(a.cv.number)}`;
  const matchedNow = MATCHED_STATUSES.includes(a.status);

  return (
    <>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">
            <Link className="link" href={`/recruteur/offres/${app.offer.id}/suivi?c=${applicationId}`}>
              ← {app.offer.title}
            </Link>
            <span className="badge">{APPLICATION_STATUS_LABELS_RECRUITER[a.status]}</span>
          </p>
          <h1>{name}</h1>
          <p className="rec-lead">
            Candidature reçue le {fmtDay(a.created_at)}
            {a.invited ? " après votre invitation" : ""}
          </p>
        </div>
      </header>
      <div className="grid-2" style={{ alignItems: "start", gap: 32 }}>
        <section className="card" aria-label="CV">
          <CvView cv={a.cv} identity={app.identity} matches={a.matches} note={a.note} noteTarget={a.note_target_label} showHidden />
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ApplicationActions app={app} onChanged={load} notify={showToast} />
          <Messages applicationId={applicationId} counterpart={app.identity?.first_name ?? null} active={matchedNow} />
        </div>
      </div>
      {app.slots.some((s) => s.status === "accepted") ? (
        <p className="alert alert--ok">
          Entretien confirmé : {fmtSlot(app.slots.find((s) => s.status === "accepted")!.starts_at)}.
        </p>
      ) : null}
      {toast}
    </>
  );
}

function Messages({ applicationId, counterpart, active }: { applicationId: string; counterpart: string | null; active: boolean }) {
  const id = useId();
  const [messages, setMessages] = useState<ApplicationMessage[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    rpc<ApplicationMessage[]>(createClient(), "get_application_messages", { p_id: applicationId }).then(async ({ data, error }) => {
      if (error) {
        if ((await errorCode(error)) === "not_matched") {
          setLocked(true);
          setMessages([]);
          return;
        }
        setError(await describeEmploiError(error));
        return;
      }
      setLocked(false);
      setError(null);
      setMessages(data ?? []);
    });
  }, [applicationId]);

  useEffect(() => {
    load();
    // Pas de temps réel dans ce produit minimal : relecture toutes les 20 s tant que la page est ouverte.
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<string>(createClient(), "send_application_message", { p_id: applicationId, p_body: body.trim() });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    setBody("");
    load();
  }

  return (
    <section className="card" style={{ display: "grid", gap: 12 }} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={{ fontSize: 18 }}>
        Conversation{counterpart ? ` avec ${counterpart}` : ""}
      </h2>
      {locked ? (
        <p className="muted small">La conversation s’ouvre avec votre « Intéressé ». Avant, le candidat reste anonyme.</p>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {!messages ? <Loading /> : null}
      {messages && !locked ? (
        <div className="msgs" ref={listRef} aria-live="polite">
          {messages.length ? (
            messages.map((m) => (
              <div key={m.id} className={m.mine ? "msg msg--mine" : "msg"}>
                {m.context ? <span className="msg-ctx">{m.context}</span> : null}
                {m.body}
                <small>{fmtSlotSafe(m.created_at)}</small>
              </div>
            ))
          ) : (
            <p className="muted small">Écrivez le premier message : présentez-vous et proposez la suite.</p>
          )}
        </div>
      ) : null}
      {active && !locked ? (
        <form className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }} onSubmit={send}>
          <label className="sr-only" htmlFor={`${id}-m`}>
            Votre message
          </label>
          <textarea
            id={`${id}-m`}
            className="textarea"
            style={{ minHeight: 64 }}
            maxLength={EMPLOI_LIMITS.messageMax}
            placeholder="Votre message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="submit" className="btn btn--accent btn--icon" aria-label="Envoyer" disabled={busy || !body.trim()}>
            <IconSend />
          </button>
        </form>
      ) : null}
    </section>
  );
}

function fmtSlotSafe(iso: string): string {
  try {
    return fmtSlot(iso);
  } catch {
    return "";
  }
}

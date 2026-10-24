"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { APPLICATION_STATUS_LABELS_RECRUITER, type ConversationSummary } from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtDay } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { ErrorBox, Loading } from "./ui";

export default function Conversations() {
  const [rows, setRows] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc<ConversationSummary[]>(createClient(), "get_my_conversations").then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setRows(data ?? []);
    });
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <header className="rec-head">
        <div>
          <h1>Messages</h1>
          <p className="rec-lead">Une conversation s’ouvre à chaque « Intéressé ». Les candidats répondent depuis l’app.</p>
        </div>
      </header>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows && !rows.length ? (
        <p className="surface muted" style={{ textAlign: "center" }}>
          Aucune conversation pour l’instant. Triez une pile pour faire votre premier match.
        </p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(rows ?? []).map((c) => (
          <Link key={c.application_id} className="list-row" href={`/recruteur/candidatures/${c.application_id}`}>
            <span className="rec-avatar" aria-hidden="true" style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--surface)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
              {c.counterpart.slice(0, 1).toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <strong>{c.counterpart}</strong>
                <span className="small muted">{c.last_message_at ? fmtDay(c.last_message_at) : ""}</span>
              </span>
              <span className="small muted">
                {c.offer_title} · {APPLICATION_STATUS_LABELS_RECRUITER[c.status]}
              </span>
              <span className="small" style={{ fontWeight: c.unread_count ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.last_message ?? "Pas encore de message"}
              </span>
            </span>
            {c.unread_count ? (
              <span className="rec-nav-count" aria-label={`${c.unread_count} non lu${c.unread_count > 1 ? "s" : ""}`} style={{ minWidth: 22, height: 22, borderRadius: 11, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {c.unread_count}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </>
  );
}

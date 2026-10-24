"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OFFER_STATUS_LABELS, type OfferStatus } from "@sapios/shared";
import { fmtDay, fmtRemaining, isUrgent } from "@/lib/emploi/format";
import { IconClock, IconX } from "./Icons";

const OFFER_BADGE: Record<OfferStatus, string> = {
  draft: "badge badge--dashed",
  pending_review: "badge badge--warn",
  published: "badge badge--ok",
  rejected: "badge badge--err",
  filled: "badge badge--accent",
  expired: "badge",
  archived: "badge",
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <span className={OFFER_BADGE[status]}>{OFFER_STATUS_LABELS[status]}</span>;
}

/** « 12 à examiner · répondre avant le 31 oct. », surligné à moins de 48 h. */
export function DeadlineChip({ due, toReview }: { due: string | null; toReview: number }) {
  if (!due || toReview <= 0) return null;
  const urgent = isUrgent(due);
  return (
    <span className={urgent ? "deadline deadline--urgent" : "deadline"}>
      <IconClock size={15} />
      {toReview} à examiner · répondre avant le {fmtDay(due)}
      {urgent ? ` (${fmtRemaining(due)})` : ""}
    </span>
  );
}

/** Fenêtre modale (feuille du bas sur téléphone) : Échap et clic hors du cadre la ferment. */
export function Modal({
  title,
  onClose,
  children,
  labelledBy,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = labelledBy ?? "rec-modal-title";
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  // Une seule fois à l'ouverture : focus sur le premier champ, Échap pour fermer, focus rendu à la fin.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Fermer" data-close onClick={onClose}>
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Message bref en bas d'écran, qui disparaît seul. */
export function useToast(): [React.ReactNode, (message: string) => void] {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div key={toast.id} className="toast" role="status">
      {toast.message}
    </div>
  ) : null;
  return [node, show];
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <p className="muted" role="status" style={{ padding: "24px 0" }}>
      {label}
    </p>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert" role="alert" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn--sm btn--soft" onClick={onRetry}>
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

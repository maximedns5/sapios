import type { AccessTier, SubmissionStatus } from "@sapios/shared";
import { STATUS_LABELS, TIER_LABELS } from "@/lib/admin/format";

export function PageHead({
  label,
  title,
  lead,
  aside,
}: {
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="adm-head">
      <div>
        <p className="label">{label}</p>
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {aside ? <div>{aside}</div> : null}
    </div>
  );
}

const SOLID_STATUSES: SubmissionStatus[] = ["needs_review"];
const DASHED_STATUSES: SubmissionStatus[] = ["pending", "processing"];

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const variant = SOLID_STATUSES.includes(status)
    ? "badge badge--solid"
    : DASHED_STATUSES.includes(status)
      ? "badge badge--dashed"
      : "badge";
  const mark = status === "approved" ? "✓ " : status === "rejected" ? "✕ " : "";
  return (
    <span className={variant}>
      {mark}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function TierBadge({ tier }: { tier: AccessTier | null | undefined }) {
  if (!tier) return <span className="badge badge--dashed">Sans palier</span>;
  const solid = tier === "unlimited" || tier === "standard";
  return <span className={solid ? "badge badge--solid" : "badge"}>{TIER_LABELS[tier] ?? tier}</span>;
}

/** Lot 2 : la personne a utilisé une lettre de recommandation ; sa demande passe devant, jamais le diplôme. */
export function ReferredMark({ by }: { by: string | null | undefined }) {
  return (
    <span className="prio-mark">
      <span className="badge badge--solid">Prioritaire</span>
      <span className="muted">{by ? `Recommandé·e par ${by}` : "Recommandé·e (parrain parti)"}</span>
    </span>
  );
}

export function Loading({ label = "Chargement" }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}

export function Empty({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="label">Rien à signaler</p>
      <p className="serif">{title}</p>
      {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice" role="alert" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="label">Erreur</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn--sm btn--ghost on-ink" onClick={onRetry}>
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

export function SuccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice notice--outline" role="status">
      <span className="label">Fait</span>
      <span>{children}</span>
    </div>
  );
}

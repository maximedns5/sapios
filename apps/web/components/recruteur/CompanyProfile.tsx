"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { COMPANY_STATUS_LABELS, type MyCompany } from "@sapios/shared";
import { describeEmploiError, emploiErrorMessage } from "@/lib/emploi/errors";
import { plural } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { IconCheckCircle } from "./Icons";
import { ErrorBox } from "./ui";

const fmtSiren = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");
const ROLE_LABELS = { owner: "Responsable du compte", recruiter: "Recruteur·se" } as const;

export default function CompanyProfile({ initial, error }: { initial: MyCompany | null; error: string | null }) {
  const id = useId();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial?.company.display_name ?? "");
  const [description, setDescription] = useState(initial?.company.description ?? "");
  const [website, setWebsite] = useState(initial?.company.website ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (!initial) return <ErrorBox message={emploiErrorMessage(error ?? "not_member")} onRetry={() => router.refresh()} />;
  const c = initial.company;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error } = await rpc<null>(createClient(), "update_company_profile", {
      p_display_name: displayName.trim() || null,
      p_description: description.trim() || null,
      p_website: website.trim() || null,
    });
    setBusy(false);
    if (error) {
      setNotice({ ok: false, text: await describeEmploiError(error) });
      return;
    }
    setNotice({ ok: true, text: "Page entreprise mise à jour." });
    router.refresh();
  }

  return (
    <>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">
            <span className={c.status === "verified" ? "badge badge--accent" : c.status === "pending" ? "badge badge--warn" : "badge badge--err"}>
              {c.status === "verified" ? <IconCheckCircle size={14} /> : null}
              {COMPANY_STATUS_LABELS[c.status]}
            </span>
          </p>
          <h1>{c.display_name}</h1>
          <p className="rec-lead">
            {c.legal_name} · SIREN {fmtSiren(c.siren)}
            {c.naf_label ? ` · ${c.naf_label}` : ""}
            {c.city ? ` · ${c.city}` : ""}
          </p>
        </div>
      </header>

      <section className="kpis" aria-label="Indicateurs">
        <div className="kpi kpi--accent">
          <span>Délai de réponse moyen</span>
          <strong>
            {c && initial.stats.avg_response_days != null
              ? `${String(Math.round(initial.stats.avg_response_days * 10) / 10).replace(".", ",")} j`
              : "—"}
          </strong>
          <small>Sur 90 jours, affiché aux candidats</small>
        </div>
        <div className="kpi">
          <span>Closes sans réponse</span>
          <strong>{initial.stats.closed_no_response_90d}</strong>
          <small>Sur 90 jours</small>
        </div>
        <div className="kpi">
          <span>Offres publiées</span>
          <strong>{initial.stats.offers_published}</strong>
          <small>En ce moment</small>
        </div>
        <div className="kpi">
          <span>À examiner</span>
          <strong>{initial.stats.applications_to_review}</strong>
          <small>Toutes offres confondues</small>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: "start", gap: 32 }}>
        <form className="card" style={{ display: "grid", gap: 16 }} onSubmit={save} aria-labelledby={`${id}-t`}>
          <h2 id={`${id}-t`}>Page entreprise</h2>
          <p className="hint">Les candidats la voient depuis chaque offre, avec les photos approuvées de vos offres.</p>
          <label className="field">
            <span className="field-label">Nom affiché</span>
            <input className="input" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Présentation</span>
            <textarea
              className="textarea"
              rows={6}
              maxLength={1000}
              placeholder="Ce que fait l’entreprise, comment l’équipe travaille, ce qui la distingue."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="counter">{description.length}/1000</span>
          </label>
          <label className="field">
            <span className="field-label">Site web</span>
            <input className="input" type="url" maxLength={200} placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          {notice ? (
            <p className={notice.ok ? "alert alert--ok" : "alert"} role={notice.ok ? "status" : "alert"}>
              {notice.text}
            </p>
          ) : null}
          <button type="submit" className="btn btn--accent" style={{ justifySelf: "start" }} disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 20 }}>
          <section className="card" id="equipe" style={{ display: "grid", gap: 12 }} aria-labelledby={`${id}-team`}>
            <h2 id={`${id}-team`}>Équipe</h2>
            <p className="hint">{plural(initial.members.length, "membre", "membres")}. L’ajout de collègues arrive après le pilote.</p>
            {initial.members.map((m) => (
              <div key={m.user_id} className="row" style={{ justifyContent: "space-between" }}>
                <strong className="small">{m.job_title}</strong>
                <span className="badge">{ROLE_LABELS[m.role]}</span>
              </div>
            ))}
          </section>
          <section className="surface" style={{ display: "grid", gap: 8 }} aria-label="Vérification">
            <h3>Vérification</h3>
            <p className="small">
              Domaine de l’email : <strong>{c.email_domain ?? "—"}</strong>
            </p>
            {c.status_reason ? <p className="small">Motif : {c.status_reason}</p> : null}
            <p className="small muted">
              Le badge « Entreprise vérifiée » confirme l’existence de la société au registre et votre lien avec elle,
              rien de plus.
            </p>
          </section>
          <section className="surface" style={{ display: "grid", gap: 6 }} aria-label="Facturation">
            <h3>Facturation</h3>
            <p className="small muted">Gratuit pendant le pilote. Un abonnement par offre active viendra ensuite, annoncé à l’avance.</p>
          </section>
        </div>
      </div>
    </>
  );
}

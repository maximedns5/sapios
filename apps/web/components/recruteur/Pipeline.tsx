"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EXPERIENCE_BAND_LABELS,
  type ApplicationStatus,
  type PipelineCard,
  type RecruiterApplication,
  type RecruiterOfferRow,
} from "@sapios/shared";
import { describeEmploiError } from "@/lib/emploi/errors";
import { fmtDay, fmtDiploma, fmtNumber, fmtSlot, isUrgent, plural } from "@/lib/emploi/format";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import ApplicationActions from "./ApplicationActions";
import CvView from "./CvView";
import { IconCheckCircle, IconClock, IconLock, IconStack, IconX } from "./Icons";
import { ErrorBox, Loading, OfferStatusBadge, useToast } from "./ui";

const COLUMNS: Array<{ key: string; label: string; hint: string; statuses: ApplicationStatus[]; anon: boolean }> = [
  { key: "review", label: "À examiner", hint: "anonymes", statuses: ["sent", "seen"], anon: true },
  { key: "interested", label: "Intéressé·e", hint: "identité révélée", statuses: ["interested"], anon: false },
  { key: "interview", label: "Entretien", hint: "créneau choisi", statuses: ["interview"], anon: false },
  { key: "offer", label: "Proposition", hint: "offre écrite", statuses: ["offer_made"], anon: false },
  { key: "hired", label: "Embauché·e", hint: "poste pourvu", statuses: ["hired"], anon: false },
  { key: "closed", label: "Close", hint: "refus envoyé ou sans réponse", statuses: ["rejected", "closed_no_response", "withdrawn"], anon: false },
];

const CLOSED_LABEL: Partial<Record<ApplicationStatus, string>> = {
  rejected: "Refus envoyé",
  closed_no_response: "Close sans réponse",
  withdrawn: "Retirée par le candidat",
};

export default function Pipeline({ offerId }: { offerId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("c");
  const [cards, setCards] = useState<PipelineCard[] | null>(null);
  const [offer, setOffer] = useState<RecruiterOfferRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      rpc<PipelineCard[]>(supabase, "list_offer_applications", { p_offer_id: offerId }),
      rpc<RecruiterOfferRow[]>(supabase, "list_company_offers"),
    ]).then(async ([apps, offers]) => {
      if (apps.error) {
        setError(await describeEmploiError(apps.error));
        return;
      }
      setError(null);
      setCards(apps.data ?? []);
      setOffer((offers.data ?? []).find((o) => o.id === offerId) ?? null);
    });
  }, [offerId]);
  useEffect(load, [load]);

  const openCards = useMemo(() => (cards ?? []).filter((c) => c.status === "sent" || c.status === "seen"), [cards]);
  const earliest = openCards.map((c) => c.due_at).sort()[0] ?? null;
  const urgent = openCards.some((c) => isUrgent(c.due_at));

  const select = (id: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (id) q.set("c", id);
    else q.delete("c");
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  return (
    <>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">
            <Link className="link" href="/recruteur/offres">
              ← Vos offres
            </Link>
            {offer ? <OfferStatusBadge status={offer.status} /> : null}
          </p>
          <h1>{offer?.title ?? "Suivi des candidatures"}</h1>
          <p className="rec-lead">
            {cards ? plural(cards.length, "candidature", "candidatures") : "…"} · les cartes restent anonymes jusqu’à votre
            « Intéressé ».
          </p>
        </div>
        {openCards.length ? (
          <Link className="btn btn--accent btn--lg" href={`/recruteur/offres/${offerId}/pile`}>
            <IconStack size={18} /> Trier la pile
          </Link>
        ) : null}
      </header>

      {cards ? (
        <div className={openCards.length ? (urgent ? "banner banner--warn" : "banner") : "banner banner--ok"} role="status">
          {openCards.length ? <IconClock /> : <IconCheckCircle />}
          <span>
            {openCards.length
              ? `${plural(openCards.length, "candidature attend", "candidatures attendent")} une réponse (la première avant le ${fmtDay(earliest)}). Passé ce délai, ${openCards.length > 1 ? "elles seront closes sans réponse et comptées" : "elle sera close sans réponse et comptée"} dans votre délai moyen.`
              : "Toutes les candidatures ont reçu une réponse dans le délai promis."}
          </span>
        </div>
      ) : null}

      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!cards && !error ? <Loading /> : null}

      {cards ? (
        <div className="kb">
          {COLUMNS.map((col, ci) => {
            const list = cards.filter((c) => col.statuses.includes(c.status));
            return (
              <section key={col.key} className="kb-col" aria-label={`${col.label}, ${plural(list.length, "candidature", "candidatures")}`} style={{ animationDelay: `${0.05 * ci}s` }}>
                <div className="kb-col-head">
                  <h2>
                    {col.label}
                    <span className="kb-n" style={col.key === "review" && list.length ? { background: "var(--accent)", color: "#fff" } : undefined}>
                      {list.length}
                    </span>
                  </h2>
                  <small>
                    {col.anon ? <IconLock size={12} /> : null}
                    {col.hint}
                  </small>
                </div>
                {list.map((c) => (
                  <button
                    key={c.application_id}
                    type="button"
                    className="kb-card"
                    aria-pressed={selected === c.application_id}
                    aria-label={`Ouvrir ${c.name ?? fmtNumber(c.number)}`}
                    onClick={() => select(c.application_id)}
                  >
                    <strong>{c.name ?? fmtNumber(c.number)}</strong>
                    {c.name ? <span className="muted">{fmtNumber(c.number)}</span> : null}
                    <span style={{ fontWeight: 700 }}>
                      {c.diploma ? fmtDiploma(c.diploma) : "Diplôme non vérifié"}
                    </span>
                    <span className="muted">{EXPERIENCE_BAND_LABELS[c.experience_band]}</span>
                    <span style={{ fontWeight: 600 }}>
                      {c.must_met}/{c.must_total} indispensable{c.must_total > 1 ? "s" : ""}
                    </span>
                    {c.status === "sent" || c.status === "seen" ? (
                      <span className={isUrgent(c.due_at) ? "deadline deadline--urgent" : "deadline"}>
                        {c.status === "sent" ? "Nouvelle · " : ""}avant le {fmtDay(c.due_at)}
                      </span>
                    ) : null}
                    {c.next_slot ? (
                      <span className={c.next_slot.status === "accepted" ? "badge badge--ok" : "badge"}>
                        {c.next_slot.status === "accepted" ? fmtSlot(c.next_slot.starts_at) : "Créneaux proposés"}
                      </span>
                    ) : null}
                    {CLOSED_LABEL[c.status] ? <span className="badge">{CLOSED_LABEL[c.status]}</span> : null}
                  </button>
                ))}
                {!list.length ? <span className="kb-empty">{col.key === "review" ? "Rien à examiner" : "Personne pour l’instant"}</span> : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {selected ? (
        <ApplicationDrawer
          applicationId={selected}
          onClose={() => select(null)}
          onChanged={load}
          notify={showToast}
        />
      ) : null}
      {toast}
    </>
  );
}

function ApplicationDrawer({
  applicationId,
  onClose,
  onChanged,
  notify,
}: {
  applicationId: string;
  onClose: () => void;
  onChanged: () => void;
  notify: (m: string) => void;
}) {
  const [app, setApp] = useState<RecruiterApplication | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    rpc<RecruiterApplication>(supabase, "get_recruiter_application", { p_id: applicationId }).then(async ({ data, error }) => {
      if (error) {
        setError(await describeEmploiError(error));
        return;
      }
      setError(null);
      setApp(data);
      // Ouvrir une candidature nouvelle la marque « Vue » pour le candidat.
      if (data?.application.status === "sent") {
        rpc<null>(supabase, "mark_application_seen", { p_id: applicationId }).then(() => onChanged());
      }
    });
  }, [applicationId, onChanged]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Candidature">
        <div className="drawer-head">
          <span className="small muted" style={{ fontWeight: 700 }}>
            {app ? `Reçue le ${fmtDay(app.application.created_at)}${app.application.invited ? " · après votre invitation" : ""}` : "Candidature"}
          </span>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Fermer" onClick={onClose}>
            <IconX />
          </button>
        </div>
        {error ? <ErrorBox message={error} onRetry={load} /> : null}
        {!app && !error ? <Loading /> : null}
        {app ? (
          <>
            <CvView
              cv={app.application.cv}
              identity={app.identity}
              matches={app.application.matches}
              note={app.application.note}
              noteTarget={app.application.note_target_label}
              showHidden
            />
            <ApplicationActions
              app={app}
              notify={notify}
              onChanged={() => {
                load();
                onChanged();
              }}
            />
            <Link className="link" href={`/recruteur/candidatures/${applicationId}`}>
              Ouvrir en pleine page →
            </Link>
          </>
        ) : null}
      </aside>
    </>
  );
}

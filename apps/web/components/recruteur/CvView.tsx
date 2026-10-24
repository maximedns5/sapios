import {
  EXPERIENCE_BAND_LABELS,
  LANGUAGE_LEVEL_LABELS,
  type AnonymousCv,
  type RequirementMatch,
} from "@sapios/shared";
import { fmtAvailability, fmtDiploma, fmtMonths, fmtNumber, fmtRemote, fmtSalary } from "@/lib/emploi/format";
import { IconCap, IconCheck, IconLock, IconUnlock, IconX } from "./Icons";

const HIDDEN = ["Nom", "Prénom", "Photo", "Âge", "Genre", "Adresse"];

/** Correspondances : chaque critère de l'offre, rempli ou non. Jamais de score (contrat §6). */
export function Matches({ matches }: { matches: RequirementMatch[] }) {
  if (!matches.length) return null;
  return (
    <div className="matches" aria-label="Correspondances avec les critères de l’offre">
      {matches.map((m) => (
        <span key={`${m.kind}-${m.label}`} className="match" data-met={m.met ? "true" : "false"} data-kind={m.kind}>
          {m.met ? <IconCheck size={14} /> : <IconX size={13} />}
          {m.label}
          {m.kind === "nice" ? <span className="sr-only"> (apprécié)</span> : null}
          <span className="sr-only">{m.met ? " : rempli" : " : non rempli"}</span>
        </span>
      ))}
    </div>
  );
}

export default function CvView({
  cv,
  identity = null,
  matches,
  note,
  noteTarget,
  compact = false,
  showHidden = false,
}: {
  cv: AnonymousCv;
  identity?: { first_name: string; last_name: string } | null;
  matches?: RequirementMatch[];
  note?: string | null;
  noteTarget?: string | null;
  compact?: boolean;
  showHidden?: boolean;
}) {
  const experiences = compact ? cv.experiences.slice(0, 1) : cv.experiences;
  const skills = compact ? cv.skills.slice(0, 6) : cv.skills;
  return (
    <div className="cv">
      <div className="cv-top">
        <span className={identity ? "cv-lock cv-lock--open" : "cv-lock"} aria-hidden="true">
          {identity ? <IconUnlock size={20} /> : <IconLock size={20} />}
        </span>
        <span style={{ display: "flex", flexDirection: "column" }}>
          <strong>{identity ? `${identity.first_name} ${identity.last_name}` : `Candidat·e ${fmtNumber(cv.number)}`}</strong>
          <span className="small muted">
            {identity ? `${fmtNumber(cv.number)} · identité révélée après votre « Intéressé »` : "CV anonyme jusqu’au match"}
          </span>
        </span>
      </div>

      <div className="cv-sec">
        <span>Poste visé</span>
        <span className="cv-v" style={{ fontSize: 17 }}>
          {cv.target_role}
        </span>
        <span className="small muted">{fmtAvailability(cv.available_from)}</span>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {cv.diploma ? (
          <span className="diploma">
            <IconCap size={16} /> Diplôme vérifié · {fmtDiploma(cv.diploma)}
          </span>
        ) : (
          <span className="badge">Diplôme non vérifié</span>
        )}
        <span className="badge">{EXPERIENCE_BAND_LABELS[cv.experience_band]} d’expérience</span>
      </div>

      {experiences.length ? (
        <div className="cv-sec">
          <span>{compact ? "Dernière expérience" : "Expériences récentes"}</span>
          {experiences.map((e, i) => (
            <span key={i} style={{ display: "flex", flexDirection: "column" }}>
              <span className="cv-v">{e.title}</span>
              <span className="small muted">
                {[e.employer ?? "Employeur masqué", fmtMonths(e.months), e.current ? "en cours" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {skills.length ? (
        <div className="cv-sec">
          <span>Compétences</span>
          <div className="chips" style={{ gap: 6 }}>
            {skills.map((s) => (
              <span key={s} className="tag">
                {s}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="cv-kv">
        <div className="cv-sec">
          <span>Prétentions</span>
          <span className="cv-v">{fmtSalary(cv.salary_min_k, cv.salary_max_k, "")}</span>
        </div>
        <div className="cv-sec">
          <span>Cherche à</span>
          <span className="cv-v">
            {cv.search_city} · {cv.search_radius_km} km
          </span>
          <span className="small muted">
            {cv.remote_days_min > 0 ? `Souhaite ${fmtRemote(cv.remote_days_min).toLowerCase()}` : "Télétravail indifférent"}
          </span>
        </div>
        <div className="cv-sec">
          <span>Langues</span>
          <span className="cv-v" style={{ fontSize: 14 }}>
            {cv.languages.length
              ? cv.languages.map((l) => `${l.language} ${LANGUAGE_LEVEL_LABELS[l.level].split(" ·")[0]}`).join(", ")
              : "—"}
          </span>
        </div>
        <div className="cv-sec">
          <span>Autorisation de travail en France</span>
          <span className="cv-v">{cv.work_authorization ? "Oui" : "À vérifier"}</span>
        </div>
      </div>

      {cv.looking_for ? (
        <figure className="cv-sec" style={{ margin: 0 }}>
          <figcaption className="cv-k">Ce que je cherche</figcaption>
          <blockquote className="cv-quote">« {cv.looking_for} »</blockquote>
        </figure>
      ) : null}

      {note ? (
        <div className="cv-note">
          <span>{noteTarget ? `A répondu à votre offre : « ${noteTarget} »` : "Un mot sur votre offre"}</span>
          <p>{note}</p>
        </div>
      ) : null}

      {matches?.length ? (
        <div className="cv-sec">
          <span>Correspondances avec vos critères</span>
          <Matches matches={matches} />
        </div>
      ) : null}

      {showHidden && !identity ? (
        <div className="cv-sec">
          <span>Caché jusqu’au match</span>
          <div className="hidden-list">
            {HIDDEN.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

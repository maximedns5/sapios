"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  EMPLOI_LIMITS,
  EXPERIENCE_BAND_LABELS,
  EXPERIENCE_BANDS,
  findBannedWord,
  LANGUAGE_PATTERN,
  OFFER_CHECK_LABELS,
  OFFER_PHOTO_KIND_LABELS,
  OFFER_PHOTO_KINDS,
  PHOTO_KINDS_WITH_PEOPLE,
  RESPONSE_DAYS,
  requiresLanguageJustification,
  type CompanyStatus,
  type ContractType,
  type ExperienceBand,
  type GeoResult,
  type OfferCheck,
  type OfferCheckKey,
  type OfferDraft,
  type OfferPhotoKind,
  type ResponseDays,
} from "@sapios/shared";
import { OFFER_PHOTO_MAX_BYTES, OFFER_PHOTO_TYPES, OFFER_PHOTOS_BUCKET } from "@/lib/emploi/config";
import { describeEmploiError, emploiErrorMessage, errorCode } from "@/lib/emploi/errors";
import { fmtRemote, fmtSalary } from "@/lib/emploi/format";
import { rpc, untyped } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import { IconAlert, IconCheck, IconCheckCircle, IconGlobe, IconPhoto, IconX } from "./Icons";
import { Modal, OfferStatusBadge } from "./ui";

type Photo = OfferDraft["photos"][number];

interface Form {
  title: string;
  contract: ContractType;
  city: string;
  postcode: string | null;
  address_label: string | null;
  lat: number | null;
  lng: number | null;
  remote_days: number;
  salary_min: string;
  salary_max: string;
  start_label: string;
  experience_band: ExperienceBand;
  missions: [string, string, string];
  must_have: string[];
  nice_to_have: string[];
  language_justification: string;
  team_description: string;
  manager_name: string;
  manager_title: string;
  interviews_count: number;
  response_days: ResponseDays;
}

const EMPTY: Form = {
  title: "",
  contract: "cdi",
  city: "",
  postcode: null,
  address_label: null,
  lat: null,
  lng: null,
  remote_days: 2,
  salary_min: "",
  salary_max: "",
  start_label: "",
  experience_band: "y0_1",
  missions: ["", "", ""],
  must_have: [],
  nice_to_have: [],
  language_justification: "",
  team_description: "",
  manager_name: "",
  manager_title: "",
  interviews_count: 2,
  response_days: 7,
};

function fromDraft(d: OfferDraft): Form {
  const m = [...d.missions, "", "", ""].slice(0, 3) as [string, string, string];
  return {
    title: d.title ?? "",
    contract: d.contract ?? "cdi",
    city: d.city ?? "",
    postcode: d.postcode,
    address_label: d.address_label,
    lat: d.lat,
    lng: d.lng,
    remote_days: d.remote_days ?? 0,
    salary_min: d.salary_min_k == null ? "" : String(d.salary_min_k),
    salary_max: d.salary_max_k == null ? "" : String(d.salary_max_k),
    start_label: d.start_label ?? "",
    experience_band: d.experience_band ?? "y0_1",
    missions: m,
    must_have: d.must_have ?? [],
    nice_to_have: d.nice_to_have ?? [],
    language_justification: d.language_justification ?? "",
    team_description: d.team_description ?? "",
    manager_name: d.manager_name ?? "",
    manager_title: d.manager_title ?? "",
    interviews_count: d.interviews_count ?? 2,
    response_days: d.response_days ?? 7,
  };
}

const nullIfEmpty = (s: string) => (s.trim() ? s.trim() : null);
const toInt = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : null);

/** Champs envoyés à `save_offer` : un brouillon peut être incomplet, `submit_offer` fait les contrôles. */
function payload(f: Form) {
  return {
    title: f.title.trim(),
    contract: f.contract,
    city: nullIfEmpty(f.city),
    postcode: f.postcode,
    address_label: f.address_label,
    lat: f.lat,
    lng: f.lng,
    remote_days: f.remote_days,
    salary_min_k: toInt(f.salary_min),
    salary_max_k: toInt(f.salary_max),
    start_label: nullIfEmpty(f.start_label),
    experience_band: f.experience_band,
    missions: f.missions.map((m) => m.trim()).filter(Boolean),
    must_have: f.must_have,
    nice_to_have: f.nice_to_have,
    language_justification: nullIfEmpty(f.language_justification),
    team_description: nullIfEmpty(f.team_description),
    manager_name: nullIfEmpty(f.manager_name),
    manager_title: nullIfEmpty(f.manager_title),
    interviews_count: f.interviews_count,
    response_days: f.response_days,
  };
}

function salaryState(f: Form): "ok" | "err" | "warn" {
  const min = toInt(f.salary_min);
  const max = toInt(f.salary_max);
  if (min == null || max == null) return "warn";
  if (min < EMPLOI_LIMITS.salaryMinK || max > EMPLOI_LIMITS.salaryMaxK || max < min) return "err";
  return "ok";
}

/** Miroir côté client des contrôles de `submit_offer` (la base tranche). */
function checks(f: Form, photos: Photo[], companyStatus: CompanyStatus): OfferCheckKey[] {
  const missing: OfferCheckKey[] = [];
  if (companyStatus !== "verified") missing.push("company_not_verified");
  if (f.title.trim().length < 3) missing.push("title");
  if (salaryState(f) !== "ok") missing.push("salary");
  if (f.missions.some((m) => m.trim().length < 3)) missing.push("missions");
  if (!f.must_have.length) missing.push("must_have");
  if (!photos.some((p) => p.kind === "workplace" && p.moderation !== "rejected")) missing.push("workplace_photo");
  if (photos.some((p) => PHOTO_KINDS_WITH_PEOPLE.includes(p.kind) && !p.consent_certified)) missing.push("photo_consent");
  if (requiresLanguageJustification(f.must_have) && f.language_justification.trim().length < 10) {
    missing.push("language_justification");
  }
  if (bannedIn(f)) missing.push("banned_words");
  return missing;
}

function bannedIn(f: Form): string | null {
  return findBannedWord([f.title, ...f.missions, ...f.must_have, ...f.nice_to_have, f.team_description]);
}

const STEPS = [
  { label: "Le poste", sub: "Intitulé, lieu, salaire", keys: ["title", "salary"] },
  { label: "Missions et profil", sub: "Ce que la personne fera", keys: ["missions", "must_have", "language_justification", "banned_words"] },
  { label: "Photos", sub: "Le vrai lieu de travail", keys: ["workplace_photo", "photo_consent"] },
  { label: "Recrutement", sub: "Entretiens et délai", keys: [] },
] as const;

export default function OfferEditor({
  companyId,
  companyName,
  companyStatus,
  initial,
}: {
  companyId: string;
  companyName: string;
  companyStatus: CompanyStatus;
  initial: OfferDraft | null;
}) {
  const id = useId();
  const router = useRouter();
  const [offerId, setOfferId] = useState<string | null>(initial?.id ?? null);
  const [form, setForm] = useState<Form>(initial ? fromDraft(initial) : EMPTY);
  const [photos, setPhotos] = useState<Photo[]>(initial?.photos ?? []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState<OfferCheckKey[] | null>(null);
  const [sent, setSent] = useState(false);

  const set = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setServerMissing(null);
  }, []);

  const missing = useMemo(() => checks(form, photos, companyStatus), [form, photos, companyStatus]);
  const banned = useMemo(() => bannedIn(form), [form]);
  const stepDone = STEPS.map((s) => s.keys.every((k) => !missing.includes(k as OfferCheckKey)));
  const sState = salaryState(form);
  const languageItems = form.must_have.filter((m) => LANGUAGE_PATTERN.test(m));
  const languageOk = form.language_justification.trim().length >= 10;

  // URLs signées des photos (bucket privé), renouvelées quand la liste change.
  useEffect(() => {
    const missingUrls = photos.filter((p) => !urls[p.storage_path]).map((p) => p.storage_path);
    if (!missingUrls.length) return;
    createClient()
      .storage.from(OFFER_PHOTOS_BUCKET)
      .createSignedUrls(missingUrls, 3600)
      .then(({ data }) => {
        if (!data) return;
        setUrls((u) => {
          const next = { ...u };
          for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          return next;
        });
      });
  }, [photos, urls]);

  async function save(): Promise<string | null> {
    if (form.title.trim().length < 3) {
      setError("Donnez d’abord un intitulé au poste (3 caractères au moins) pour enregistrer le brouillon.");
      setStep(1);
      return null;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await rpc<string>(createClient(), "save_offer", { p_id: offerId, p_fields: payload(form) });
    setSaving(false);
    if (error) {
      setError(await describeEmploiError(error));
      return null;
    }
    const newId = data ?? offerId;
    if (newId && newId !== offerId) {
      setOfferId(newId);
      window.history.replaceState(null, "", `/recruteur/offres/${newId}/modifier`);
    }
    setDirty(false);
    setSavedAt(new Date());
    return newId ?? null;
  }

  async function go(n: number) {
    if (n === step) return;
    // Les photos sont rattachées à une offre : il faut un brouillon enregistré avant l'étape 3.
    if (dirty || (n >= 3 && !offerId)) {
      const ok = await save();
      if (!ok && n >= 3) return;
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const savedId = await save();
    if (!savedId) return;
    setSaving(true);
    const { data, error } = await rpc<OfferCheck>(createClient(), "submit_offer", { p_id: savedId });
    setSaving(false);
    if (error) {
      setError(await describeEmploiError(error));
      return;
    }
    if (data?.ok) {
      setSent(true);
      return;
    }
    setServerMissing(data?.missing ?? []);
  }

  const shownMissing = serverMissing ?? missing;
  const canSubmit = !missing.length && !saving;

  return (
    <>
      <header className="rec-head">
        <div>
          <p className="rec-eyebrow">
            <Link className="link" href="/recruteur/offres">
              ← Vos offres
            </Link>
            {initial ? <OfferStatusBadge status={initial.status} /> : <span className="badge badge--dashed">Nouvelle offre</span>}
          </p>
          <h1>{form.title.trim() || "Nouvelle offre"}</h1>
          {initial?.status === "rejected" && initial.status_reason ? (
            <p className="rec-lead" style={{ color: "var(--err)" }}>
              Offre refusée par la modération. Motif : {initial.status_reason}
            </p>
          ) : null}
        </div>
        <div className="row">
          <span className="small muted" aria-live="polite">
            {saving ? "Enregistrement…" : savedAt ? `Brouillon enregistré à ${savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : dirty ? "Modifications non enregistrées" : ""}
          </span>
          <button type="button" className="btn btn--soft" onClick={save} disabled={saving}>
            Enregistrer le brouillon
          </button>
        </div>
      </header>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ed">
        <nav className="ed-steps" aria-label="Étapes de l’offre">
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className="ed-step"
              aria-current={step === i + 1 ? "step" : undefined}
              data-done={stepDone[i] ? "true" : "false"}
              onClick={() => go(i + 1)}
            >
              <span className="ed-step-dot" aria-hidden="true">
                {stepDone[i] && step !== i + 1 ? <IconCheck size={16} /> : i + 1}
              </span>
              <span>
                {s.label}
                <small>{stepDone[i] ? s.sub : "À compléter"}</small>
              </span>
            </button>
          ))}
        </nav>

        <div>
          {step === 1 ? (
            <section className="ed-form" aria-labelledby={`${id}-s1`}>
              <div>
                <p className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  Étape 1 sur 4
                </p>
                <h2 id={`${id}-s1`}>Le poste</h2>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-title`}>
                  Intitulé du poste
                </label>
                <input
                  id={`${id}-title`}
                  className="input"
                  maxLength={80}
                  placeholder="Data analyst junior, Chargé·e d’études…"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
                <p className="hint">Intitulé neutre : écriture inclusive (Chargé·e) ou « H/F ».</p>
              </div>
              <fieldset className="field">
                <legend className="field-label">Contrat</legend>
                <div className="chips">
                  {CONTRACT_TYPES.map((c) => (
                    <button key={c} type="button" className="chip" aria-pressed={form.contract === c} onClick={() => set("contract", c)}>
                      {CONTRACT_LABELS[c]}
                    </button>
                  ))}
                </div>
                <p className="hint">Stages et alternances : après le pilote.</p>
              </fieldset>
              <PlacePicker form={form} onPick={(r) => {
                setForm((f) => ({
                  ...f,
                  city: r.city,
                  postcode: r.postcode,
                  lat: r.lat,
                  lng: r.lng,
                  address_label: r.label !== r.city ? r.label : null,
                }));
                setDirty(true);
              }} />
              <fieldset className="field">
                <legend className="field-label">Télétravail par semaine</legend>
                <div className="chips">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="chip"
                      aria-pressed={form.remote_days === n}
                      aria-label={n === 0 ? "Aucun jour" : `${n} jour${n > 1 ? "s" : ""}`}
                      onClick={() => set("remote_days", n)}
                      style={{ minWidth: 52, justifyContent: "center" }}
                    >
                      {n === 0 ? "Sur site" : n}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="ed-box" data-state={sState}>
                <span style={{ fontWeight: 800 }}>Fourchette de salaire, obligatoire</span>
                <div className="ed-salary">
                  <label className="sr-only" htmlFor={`${id}-smin`}>
                    Minimum en milliers d’euros brut par an
                  </label>
                  <input
                    id={`${id}-smin`}
                    className="input"
                    inputMode="numeric"
                    placeholder="42"
                    value={form.salary_min}
                    onChange={(e) => set("salary_min", e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                  <span aria-hidden="true">à</span>
                  <label className="sr-only" htmlFor={`${id}-smax`}>
                    Maximum en milliers d’euros brut par an
                  </label>
                  <input
                    id={`${id}-smax`}
                    className="input"
                    inputMode="numeric"
                    placeholder="48"
                    value={form.salary_max}
                    onChange={(e) => set("salary_max", e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                  <strong>k€ brut par an</strong>
                </div>
                <p className="small" style={{ fontWeight: 600 }} aria-live="polite">
                  {sState === "ok"
                    ? "Parfait : la fourchette s’affiche en haut de la carte, avant même la description."
                    : sState === "err"
                      ? `Le maximum doit être supérieur ou égal au minimum, entre ${EMPLOI_LIMITS.salaryMinK} et ${EMPLOI_LIMITS.salaryMaxK} k€.`
                      : "Les offres sans fourchette sont refusées. Les candidats voient le salaire avant de swiper : c’est la première chose qu’ils regardent."}
                </p>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor={`${id}-start`}>
                    Début
                  </label>
                  <input
                    id={`${id}-start`}
                    className="input"
                    maxLength={40}
                    placeholder="Janvier 2027, dès que possible…"
                    value={form.start_label}
                    onChange={(e) => set("start_label", e.target.value)}
                  />
                </div>
                <fieldset className="field">
                  <legend className="field-label">Expérience attendue</legend>
                  <div className="chips">
                    {EXPERIENCE_BANDS.map((b) => (
                      <button key={b} type="button" className="chip" aria-pressed={form.experience_band === b} onClick={() => set("experience_band", b)}>
                        {EXPERIENCE_BAND_LABELS[b]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="ed-nav">
                <span />
                <button type="button" className="btn btn--lg" onClick={() => go(2)} disabled={saving}>
                  Suivant : missions
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="ed-form" aria-labelledby={`${id}-s2`}>
              <div>
                <p className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  Étape 2 sur 4
                </p>
                <h2 id={`${id}-s2`}>Missions et profil</h2>
              </div>
              <fieldset className="field">
                <legend className="field-label">Les 3 missions principales</legend>
                {form.missions.map((m, i) => (
                  <label key={i} className="row" style={{ flexWrap: "nowrap" }}>
                    <span className="ed-step-dot" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="sr-only">Mission {i + 1}</span>
                    <input
                      className="input"
                      maxLength={160}
                      placeholder="Un verbe d’action, un résultat concret"
                      value={m}
                      onChange={(e) => {
                        const next = [...form.missions] as [string, string, string];
                        next[i] = e.target.value;
                        set("missions", next);
                      }}
                    />
                  </label>
                ))}
              </fieldset>
              <div className="grid-2">
                <RequirementGroup
                  title="Indispensable"
                  hint={`${EMPLOI_LIMITS.mustHaveMax} au maximum`}
                  strong
                  items={form.must_have}
                  max={EMPLOI_LIMITS.mustHaveMax}
                  onChange={(items) => set("must_have", items)}
                />
                <RequirementGroup
                  title="Apprécié"
                  hint="un plus, pas un filtre"
                  items={form.nice_to_have}
                  max={EMPLOI_LIMITS.niceToHaveMax}
                  onChange={(items) => set("nice_to_have", items)}
                />
              </div>
              <p className="hint">
                Les correspondances affichées aux candidats et dans votre pile comparent ces critères à leurs
                compétences, langues et diplôme vérifié. Rien d’autre n’est calculé.
              </p>
              {banned ? (
                <p className="alert" role="alert">
                  <IconAlert size={18} />
                  <span>
                    Le mot « {banned} » vise l’âge, l’origine ou l’apparence du candidat. Retirez-le : indiquez plutôt un
                    niveau, par exemple « anglais C1 », ou une compétence.
                  </span>
                </p>
              ) : null}
              {languageItems.length ? (
                <div className="ed-box" data-state={languageOk ? "ok" : "warn"}>
                  <span className="row" style={{ fontWeight: 700, flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <IconGlobe size={18} />
                    {languageOk
                      ? `Langue justifiée : ${languageItems.join(", ")}`
                      : `${languageItems.join(", ")} en indispensable : dites pourquoi le poste l’exige`}
                  </span>
                  <span className="small">
                    Exiger une langue n’est permis que si le poste le demande vraiment. Votre justification est relue par
                    notre équipe avant publication.
                  </span>
                  <label className="sr-only" htmlFor={`${id}-lang`}>
                    Pourquoi le poste exige cette langue
                  </label>
                  <input
                    id={`${id}-lang`}
                    className="input"
                    maxLength={200}
                    placeholder="Ex. : réunions chaque semaine avec le turbinier danois, en anglais"
                    value={form.language_justification}
                    onChange={(e) => set("language_justification", e.target.value)}
                  />
                </div>
              ) : null}
              <div className="field">
                <label className="field-label" htmlFor={`${id}-team`}>
                  L’équipe (facultatif)
                </label>
                <textarea
                  id={`${id}-team`}
                  className="textarea"
                  maxLength={300}
                  placeholder="5 personnes, une data engineer, deux analystes…"
                  value={form.team_description}
                  onChange={(e) => set("team_description", e.target.value)}
                />
                <span className="counter">{form.team_description.length}/300</span>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor={`${id}-mname`}>
                    Manager (facultatif)
                  </label>
                  <input id={`${id}-mname`} className="input" maxLength={80} placeholder="Inès Moreau" value={form.manager_name} onChange={(e) => set("manager_name", e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`${id}-mtitle`}>
                    Sa fonction
                  </label>
                  <input id={`${id}-mtitle`} className="input" maxLength={80} placeholder="Head of Data" value={form.manager_title} onChange={(e) => set("manager_title", e.target.value)} />
                </div>
              </div>
              <div className="ed-nav">
                <button type="button" className="btn btn--soft btn--lg" onClick={() => go(1)}>
                  Retour
                </button>
                <button type="button" className="btn btn--lg" onClick={() => go(3)} disabled={saving}>
                  Suivant : photos
                </button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="ed-form" aria-labelledby={`${id}-s3`}>
              <div>
                <p className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  Étape 3 sur 4
                </p>
                <h2 id={`${id}-s3`}>Photos</h2>
                <p className="rec-lead">
                  Au moins une photo du lieu de travail réel. Les candidats la voient en premier.
                </p>
              </div>
              {offerId ? (
                <PhotoManager
                  companyId={companyId}
                  offerId={offerId}
                  photos={photos}
                  urls={urls}
                  onChange={(next) => {
                    setPhotos(next);
                    setServerMissing(null);
                  }}
                />
              ) : (
                <p className="alert">Enregistrez d’abord le brouillon pour ajouter des photos.</p>
              )}
              <div className="ed-nav">
                <button type="button" className="btn btn--soft btn--lg" onClick={() => go(2)}>
                  Retour
                </button>
                <button type="button" className="btn btn--lg" onClick={() => go(4)} disabled={saving}>
                  Suivant : recrutement
                </button>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="ed-form" aria-labelledby={`${id}-s4`}>
              <div>
                <p className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  Étape 4 sur 4
                </p>
                <h2 id={`${id}-s4`}>Le recrutement</h2>
              </div>
              <fieldset className="field">
                <legend className="field-label">Nombre d’entretiens</legend>
                <div className="chips">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" className="chip" aria-pressed={form.interviews_count === n} onClick={() => set("interviews_count", n)}>
                      {n} entretien{n > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend className="field-label">Votre délai de réponse garanti</legend>
                <div className="chips">
                  {RESPONSE_DAYS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="chip"
                      aria-pressed={form.response_days === n}
                      onClick={() => set("response_days", n)}
                      style={{ minHeight: 64, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", padding: "10px 18px", borderRadius: 20 }}
                    >
                      <span style={{ fontSize: 15 }}>{n} jours</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.8 }}>
                        {n === 3 ? "le plus apprécié" : n === 7 ? "recommandé" : "maximum"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Chaque candidature reçoit une réponse de votre part dans ce délai. Sans réponse, elle est close sans
                  réponse et comptée dans votre délai moyen, affiché aux candidats sur vos offres.
                </p>
              </fieldset>
              <div className="ed-nav">
                <button type="button" className="btn btn--soft btn--lg" onClick={() => go(3)}>
                  Retour
                </button>
                <button type="button" className="btn btn--accent btn--lg" onClick={submit} disabled={!canSubmit}>
                  Envoyer en vérification
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="ed-aside" aria-label="Aperçu et vérifications">
          <OfferPreview form={form} companyName={companyName} verified={companyStatus === "verified"} photoUrl={firstPhotoUrl(photos, urls)} />
          <section className="surface" aria-label="Avant l’envoi">
            <h3 style={{ marginBottom: 10 }}>Avant l’envoi</h3>
            <ul className="ed-checks">
              {shownMissing.length === 0 ? (
                <li data-ok="false" style={{ color: "var(--ok)" }}>
                  <IconCheckCircle size={18} /> Tout est prêt.
                </li>
              ) : (
                shownMissing.map((k) => (
                  <li key={k} data-ok="false">
                    <span className="ed-check-dot" aria-hidden="true" />
                    <span>
                      {OFFER_CHECK_LABELS[k]}
                      {k === "company_not_verified" ? " : l’envoi attendra la validation." : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <button type="button" className="btn btn--accent" style={{ width: "100%", marginTop: 14 }} onClick={submit} disabled={!canSubmit}>
              Envoyer en vérification
            </button>
            <p className="hint" style={{ marginTop: 8 }}>
              Notre équipe relit l’offre et ses photos avant publication, en général sous 24 h.
            </p>
          </section>
        </aside>
      </div>

      {sent ? (
        <Modal title="Offre envoyée en vérification" onClose={() => router.push("/recruteur/offres")}>
          <p>
            Notre équipe vérifie l’offre et ses photos, en général sous 24 h. Vous recevrez un email à la publication,
            ou le motif d’un refus pour corriger.
          </p>
          <div className="row">
            <button type="button" className="btn btn--accent" onClick={() => router.push("/recruteur/offres")}>
              Retour à vos offres
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function firstPhotoUrl(photos: Photo[], urls: Record<string, string>): string | null {
  const p = [...photos].sort((a, b) => Number(b.kind === "workplace") - Number(a.kind === "workplace") || a.position - b.position)[0];
  return p ? urls[p.storage_path] ?? null : null;
}

function PlacePicker({ form, onPick }: { form: Form; onPick: (r: GeoResult) => void }) {
  const id = useId();
  const [q, setQ] = useState(form.address_label ?? form.city ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const picked = form.lat != null && form.lng != null;

  function search(value: string) {
    setQ(value);
    setOpen(true);
    if (timer.current) window.clearTimeout(timer.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      const { data, error } = await createClient().functions.invoke<{ results: GeoResult[] }>("geocode", {
        body: { q: value.trim(), kind: "address" },
      });
      if (error) {
        setError(emploiErrorMessage(await errorCode(error)));
        setResults([]);
        return;
      }
      setError(null);
      setResults(data?.results ?? []);
    }, 300);
  }

  return (
    <div className="field" style={{ position: "relative" }}>
      <label className="field-label" htmlFor={`${id}-place`}>
        Lieu de travail
      </label>
      <input
        id={`${id}-place`}
        className="input"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Adresse ou ville : 14 rue de la Roquette, Paris"
        value={q}
        onChange={(e) => search(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length ? (
        <ul id={`${id}-list`} role="listbox" className="menu-list" style={{ left: 0, right: 0, top: "calc(100% + 4px)", listStyle: "none", margin: 0 }}>
          {results.map((r) => (
            <li key={`${r.label}-${r.lat}-${r.lng}`} role="option" aria-selected={false}>
              <button
                type="button"
                style={{ width: "100%" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r);
                  setQ(r.label);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="hint">
        {error ??
          (picked
            ? `Retenu : ${form.address_label ?? [form.postcode, form.city].filter(Boolean).join(" ")}. Les candidats voient la ville et la distance depuis leur zone de recherche.`
            : "Choisissez une proposition de la liste : elle place l’offre sur la carte.")}
      </p>
    </div>
  );
}

function RequirementGroup({
  title,
  hint,
  strong = false,
  items,
  max,
  onChange,
}: {
  title: string;
  hint: string;
  strong?: boolean;
  items: string[];
  max: number;
  onChange: (items: string[]) => void;
}) {
  const id = useId();
  const [input, setInput] = useState("");
  const full = items.length >= max;
  function add() {
    const v = input.trim().slice(0, EMPLOI_LIMITS.requirementMax);
    if (!v || full || items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setInput("");
  }
  return (
    <fieldset className="ed-req">
      <legend className="sr-only">{title}</legend>
      <div className="row" aria-hidden="true">
        <span className={strong ? "tag tag--dark" : "tag"} style={strong ? undefined : { background: "var(--accent-soft)", color: "var(--accent)" }}>
          {title}
        </span>
        <span className="small muted">{hint}</span>
      </div>
      <div className="chips" style={{ minHeight: 40 }}>
        {items.map((label, i) => (
          <span key={label} className={strong ? "ed-req-tag ed-req-tag--strong" : "ed-req-tag"}>
            {label}
            <button type="button" aria-label={`Retirer ${label}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <IconX size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <label className="sr-only" htmlFor={`${id}-add`}>
          Ajouter un critère {title.toLowerCase()}
        </label>
        <input
          id={`${id}-add`}
          className="input input--soft"
          maxLength={EMPLOI_LIMITS.requirementMax}
          placeholder={full ? "Maximum atteint" : "Ex. : SQL"}
          disabled={full}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn--sm" onClick={add} disabled={full || !input.trim()}>
          Ajouter
        </button>
      </div>
    </fieldset>
  );
}

function PhotoManager({
  companyId,
  offerId,
  photos,
  urls,
  onChange,
}: {
  companyId: string;
  offerId: string;
  photos: Photo[];
  urls: Record<string, string>;
  onChange: (photos: Photo[]) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<OfferPhotoKind>(photos.some((p) => p.kind === "workplace") ? "team" : "workplace");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsConsent = PHOTO_KINDS_WITH_PEOPLE.includes(kind);
  const blocked = busy || photos.length >= 8 || (needsConsent && !consent);

  async function upload(file: File) {
    const ext = OFFER_PHOTO_TYPES[file.type];
    if (!ext) {
      setError("Formats acceptés : JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > OFFER_PHOTO_MAX_BYTES) {
      setError("Photo trop lourde : 5 Mo au plus.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(OFFER_PHOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      setError("Envoi de la photo impossible. Réessayez.");
      return;
    }
    const position = photos.length ? Math.max(...photos.map((p) => p.position)) + 1 : 0;
    const { data, error } = await untyped(supabase)
      .from("offer_photos")
      .insert({ offer_id: offerId, company_id: companyId, kind, storage_path: path, position, consent_certified: needsConsent ? consent : false })
      .select("id, kind, storage_path, position, consent_certified, moderation, moderation_reason")
      .single();
    setBusy(false);
    if (error || !data) {
      await supabase.storage.from(OFFER_PHOTOS_BUCKET).remove([path]);
      setError(await describeEmploiError(error));
      return;
    }
    onChange([...photos, data as Photo]);
    setConsent(false);
    if (kind === "workplace" && photos.filter((p) => p.kind === "workplace").length >= 2) setKind("team");
  }

  async function remove(p: Photo) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await untyped(supabase).from("offer_photos").delete().eq("id", p.id);
    if (error) {
      setBusy(false);
      setError(await describeEmploiError(error));
      return;
    }
    await supabase.storage.from(OFFER_PHOTOS_BUCKET).remove([p.storage_path]);
    setBusy(false);
    onChange(photos.filter((x) => x.id !== p.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ph-grid">
        {photos.map((p) => (
          <figure key={p.id} className="ph-tile" style={{ margin: 0 }}>
            {urls[p.storage_path] ? (
              // URL signée éphémère d'un bucket privé : next/image n'apporte rien ici.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p.storage_path]} alt={`Photo : ${OFFER_PHOTO_KIND_LABELS[p.kind]}`} />
            ) : (
              <span className="ph-ph" aria-hidden="true" />
            )}
            <figcaption className="ph-cap">
              {OFFER_PHOTO_KIND_LABELS[p.kind]}
              <span
                className={p.moderation === "approved" ? "badge badge--ok" : p.moderation === "rejected" ? "badge badge--err" : "badge"}
                style={{ alignSelf: "flex-start" }}
              >
                {p.moderation === "approved" ? "Acceptée" : p.moderation === "rejected" ? "Refusée" : "À vérifier"}
              </span>
              {p.moderation === "rejected" && p.moderation_reason ? (
                <span className="small" style={{ color: "var(--err)", fontWeight: 600 }}>
                  {p.moderation_reason}
                </span>
              ) : null}
            </figcaption>
            <button type="button" className="ph-remove" aria-label={`Retirer la photo ${OFFER_PHOTO_KIND_LABELS[p.kind]}`} onClick={() => remove(p)} disabled={busy}>
              <IconX size={14} />
            </button>
          </figure>
        ))}
        <button
          type="button"
          className="ph-drop"
          aria-disabled={blocked}
          onClick={() => {
            if (!blocked) fileRef.current?.click();
          }}
        >
          <IconPhoto size={26} />
          {busy ? "Envoi…" : `Ajouter : ${OFFER_PHOTO_KIND_LABELS[kind].toLowerCase()}`}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>

      <fieldset className="field">
        <legend className="field-label">Type de la prochaine photo</legend>
        <div className="chips">
          {OFFER_PHOTO_KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setConsent(false); }}>
              {OFFER_PHOTO_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {needsConsent ? (
        <label className="check" htmlFor={`${id}-consent`} style={{ background: consent ? "var(--ok-bg)" : "var(--warn-bg)", color: consent ? "var(--ok)" : "var(--warn)", padding: "12px 14px", borderRadius: 16 }}>
          <input id={`${id}-consent`} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Chaque personne visible a donné son accord écrit pour cette photo sur Sapios. L’entreprise conserve ces
            accords, et retire la photo sous 72 h si une personne le demande.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="surface" style={{ display: "grid", gap: 8 }}>
        <strong>Ce qui est accepté</strong>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }} className="small">
          <li>Au moins une photo du lieu de travail réel : bureaux, atelier, chantier.</li>
          <li>Le manager et l’équipe, avec l’accord écrit de chaque personne visible.</li>
          <li>Les outils et le quartier, facultatifs.</li>
        </ul>
        <strong style={{ marginTop: 6 }}>Ce qui est refusé</strong>
        <p className="small muted">
          Banque d’images, publicité, logo seul, mineurs, clients reconnaissables, écrans montrant des données.
        </p>
      </div>
    </div>
  );
}

function OfferPreview({
  form,
  companyName,
  verified,
  photoUrl,
}: {
  form: Form;
  companyName: string;
  verified: boolean;
  photoUrl: string | null;
}) {
  const min = toInt(form.salary_min);
  const max = toInt(form.salary_max);
  const salaryOk = salaryState(form) === "ok";
  const missions = form.missions.filter((m) => m.trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <span className="small muted" style={{ fontWeight: 700 }}>
        Aperçu : la carte telle que les candidats la swipent
      </span>
      <div className="phone" aria-label="Aperçu de la carte de l’offre">
        <div className="phone-screen">
          <div className="pv-photo">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" />
            ) : (
              <span>Photo du lieu de travail</span>
            )}
          </div>
          <div className="pv-body">
            <strong style={{ fontSize: 19, lineHeight: 1.2 }}>{form.title.trim() || "Intitulé du poste"}</strong>
            <span className="row small" style={{ gap: 6 }}>
              <strong>{companyName}</strong>
              {verified ? (
                <span className="badge badge--accent" style={{ padding: "2px 8px" }}>
                  <IconCheckCircle size={12} /> vérifiée
                </span>
              ) : null}
            </span>
            <span className="pv-salary" data-empty={salaryOk ? "false" : "true"}>
              {salaryOk ? fmtSalary(min, max) : "Salaire à renseigner"}
            </span>
            <span className="pv-meta">
              {[form.city || "Lieu", fmtRemote(form.remote_days)].join(" · ")}
            </span>
            <span className="pv-meta">
              {[CONTRACT_LABELS[form.contract], form.start_label.trim() || null, EXPERIENCE_BAND_LABELS[form.experience_band]]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {missions.length ? (
              <ul className="pv-missions">
                {missions.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : null}
            {form.must_have.length ? (
              <div className="chips" style={{ gap: 6 }}>
                {form.must_have.map((m) => (
                  <span key={m} className="match" data-met="false">
                    {m}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

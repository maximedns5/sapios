"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { DISCOVERY_MAX_DISTANCE_KM, DISCOVERY_MIN_DISTANCE_KM, type Json } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { fmtDateTime } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const WEIGHTS = [
  { key: "affinity_weight_field", label: "Même domaine d’études", help: "Points, une fois" },
  { key: "affinity_weight_book", label: "Livre en commun", help: "Points par livre" },
  { key: "affinity_weight_prompt", label: "Même question choisie", help: "Points par question" },
  { key: "affinity_weight_institution", label: "Même établissement", help: "Points, si les deux l’affichent" },
] as const;
type WeightKey = (typeof WEIGHTS)[number]["key"];

const WEIGHT_MAX = 20;
const WORDS_MAX = 300;
const WORD_MAX_LENGTH = 40;

interface Settings {
  feed_radius_km: string;
  weights: Record<WeightKey, string>;
  blocklist: string;
  updated_at: string | null;
}

const KEYS = ["feed_radius_km", "moderation_blocklist", ...WEIGHTS.map((w) => w.key)];

async function loadSettings(): Promise<Settings> {
  const { data, error } = await createClient().from("app_settings").select("key, value, updated_at").in("key", KEYS);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ key: string; value: unknown; updated_at: string }>;
  const get = (key: string) => rows.find((r) => r.key === key);
  const words = get("moderation_blocklist")?.value;
  return {
    feed_radius_km: String(get("feed_radius_km")?.value ?? 50),
    weights: Object.fromEntries(WEIGHTS.map((w) => [w.key, String(get(w.key)?.value ?? 0)])) as Record<WeightKey, string>,
    blocklist: Array.isArray(words) ? words.join("\n") : "",
    updated_at: rows.map((r) => r.updated_at).sort().at(-1) ?? null,
  };
}

const isInt = (v: string) => /^\d+$/.test(v.trim());

function parseWords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,;]+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export default function DiscoverySettings() {
  const id = useId();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadSettings()
      .then((s) => {
        setError(null);
        setSaved(s);
        setDraft(s);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, []);
  useEffect(load, [load]);

  const words = useMemo(() => (draft ? parseWords(draft.blocklist) : []), [draft]);

  const problems = useMemo(() => {
    if (!draft) return {} as Record<string, string>;
    const p: Record<string, string> = {};
    const r = Number(draft.feed_radius_km);
    if (!isInt(draft.feed_radius_km) || r < DISCOVERY_MIN_DISTANCE_KM || r > DISCOVERY_MAX_DISTANCE_KM) {
      p.feed_radius_km = `Un nombre entier entre ${DISCOVERY_MIN_DISTANCE_KM} et ${DISCOVERY_MAX_DISTANCE_KM} km.`;
    }
    for (const w of WEIGHTS) {
      const v = draft.weights[w.key];
      if (!isInt(v) || Number(v) > WEIGHT_MAX) p[w.key] = `Un entier de 0 à ${WEIGHT_MAX}.`;
    }
    if (words.length > WORDS_MAX) p.blocklist = `${WORDS_MAX} mots au plus.`;
    const long = words.find((w) => w.length > WORD_MAX_LENGTH);
    if (long) p.blocklist = `« ${long.slice(0, 20)}… » dépasse ${WORD_MAX_LENGTH} caractères.`;
    return p;
  }, [draft, words]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !saved || Object.keys(problems).length) return;
    const values: { [key: string]: Json } = {};
    if (draft.feed_radius_km.trim() !== saved.feed_radius_km) values.feed_radius_km = Number(draft.feed_radius_km);
    for (const w of WEIGHTS) {
      if (draft.weights[w.key].trim() !== saved.weights[w.key]) values[w.key] = Number(draft.weights[w.key]);
    }
    if (words.join("\n") !== parseWords(saved.blocklist).join("\n")) values.moderation_blocklist = words;
    if (!Object.keys(values).length) {
      setNotice("Rien à enregistrer.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    const { error } = await createClient().rpc("admin_update_settings", { p_values: values });
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    setNotice("Réglages enregistrés et journalisés. Ils valent dès le prochain chargement du feed ou du prochain texte.");
    load();
  }

  const set = (patch: Partial<Settings>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <>
      <PageHead
        label="Configuration"
        title={
          <>
            Découverte <em>et modération</em>
          </>
        }
        lead="Le rayon par défaut s’applique aux membres qui n’ont pas choisi le leur. Le score d’affinité classe les profils après la fraîcheur (tri par défaut), et seulement entre profils éligibles."
        aside={saved?.updated_at ? <span className="label">Modifié le {fmtDateTime(saved.updated_at)}</span> : null}
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!draft && !error ? <Loading /> : null}
      {draft ? (
        <form onSubmit={submit} style={{ display: "grid", gap: 24 }} noValidate>
          <section className="panel" aria-labelledby={`${id}-radius`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-radius`}>
                Rayon par défaut
              </h2>
              <span className="label">
                {DISCOVERY_MIN_DISTANCE_KM} à {DISCOVERY_MAX_DISTANCE_KM} km
              </span>
            </div>
            <div className="panel-b settings-grid">
              <div className="field">
                <label className="label" htmlFor={`${id}-r`}>
                  Kilomètres
                </label>
                <input
                  id={`${id}-r`}
                  className="input"
                  inputMode="numeric"
                  value={draft.feed_radius_km}
                  onChange={(e) => set({ feed_radius_km: e.target.value })}
                  aria-invalid={problems.feed_radius_km ? true : undefined}
                  aria-describedby={problems.feed_radius_km ? `${id}-r-err` : undefined}
                />
                {problems.feed_radius_km ? (
                  <span className="field-error" id={`${id}-r-err`}>
                    {problems.feed_radius_km}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby={`${id}-aff`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-aff`}>
                Poids des affinités
              </h2>
              <span className="label">0 à {WEIGHT_MAX} points · 0 = ignoré</span>
            </div>
            <div className="panel-b settings-grid">
              {WEIGHTS.map((w) => (
                <div className="field" key={w.key}>
                  <label className="label" htmlFor={`${id}-${w.key}`}>
                    {w.label}
                  </label>
                  <input
                    id={`${id}-${w.key}`}
                    className="input"
                    inputMode="numeric"
                    value={draft.weights[w.key]}
                    onChange={(e) => set({ weights: { ...draft.weights, [w.key]: e.target.value } })}
                    aria-invalid={problems[w.key] ? true : undefined}
                    aria-describedby={`${id}-${w.key}-help`}
                  />
                  <span className={problems[w.key] ? "field-error" : "label"} id={`${id}-${w.key}-help`}>
                    {problems[w.key] ?? w.help}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel" id="moderation" aria-labelledby={`${id}-words`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-words`}>
                Mots surveillés
              </h2>
              <span className="label">
                {words.length} / {WORDS_MAX}
              </span>
            </div>
            <div className="panel-b" style={{ display: "grid", gap: 10 }}>
              <p>
                Un texte (réponse, livre, thèse) qui contient l’un de ces mots part dans la file{" "}
                <a className="adm-link" href="/admin/contenus">
                  Contenus
                </a>
                , tout en restant publié jusqu’à votre décision. Majuscules et accents sont ignorés. Téléphones, emails,
                pseudos @ et liens sont repérés sans liste.
              </p>
              <div className="field">
                <label className="label" htmlFor={`${id}-bl`}>
                  Un mot par ligne
                </label>
                <textarea
                  id={`${id}-bl`}
                  className="textarea"
                  rows={10}
                  value={draft.blocklist}
                  onChange={(e) => set({ blocklist: e.target.value })}
                  aria-invalid={problems.blocklist ? true : undefined}
                  aria-describedby={problems.blocklist ? `${id}-bl-err` : undefined}
                />
                {problems.blocklist ? (
                  <span className="field-error" id={`${id}-bl-err`}>
                    {problems.blocklist}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <div aria-live="polite">{notice ? <SuccessNotice>{notice}</SuccessNotice> : null}</div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy || Object.keys(problems).length > 0}>
              {busy ? "Enregistrement…" : "Enregistrer les réglages"}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setDraft(saved)}>
              Annuler les modifications
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

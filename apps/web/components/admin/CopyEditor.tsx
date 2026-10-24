"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { describeError } from "@/lib/admin/errors";
import { fmtDateTime } from "@/lib/admin/format";
import type { CopyRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

// Clés que l'emploi lit dans `app_copy` (docs/EMPLOI_CONTRACT.md §5) : verdict du diplôme envoyé par `notify`
// et écran des CGU. Les textes de l'app candidat ont un repli local ; les clés du dating restent éditables
// tant qu'elles existent en base.
const REQUIRED_KEYS = [
  "emploi.verdict.approved",
  "emploi.verdict.rejected",
  "emploi.verdict.needs_more",
  "terms.title",
  "terms.lead",
];
const LOCALE = "fr";

// Groupe d'une clé = préfixe avant le premier point ; le libellé dit où le texte apparaît.
const GROUP_LABELS: Record<string, string> = {
  emploi: "Emploi",
  email: "Emails",
  push: "Notifications",
  safety: "Sécurité",
  terms: "CGU",
  notice: "Avis",
  scan: "Analyse du diplôme (ancienne app)",
  verdict: "Verdicts (ancienne app)",
};

/** Emplacements remplis par l'app ({title}, {count}…) : à garder tels quels. */
function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])];
}

function CopyItem({ row, onSaved }: { row: CopyRow; onSaved: (r: CopyRow) => void }) {
  const id = useId();
  const [text, setText] = useState(row.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = text !== row.text;
  const slots = placeholders(row.text);
  const lost = slots.filter((p) => !text.includes(p));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Un texte vide n’est pas accepté.");
      return;
    }
    if (lost.length) {
      setError(`Emplacement retiré : ${lost.join(", ")}. L’app le remplit, gardez-le tel quel.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await createClient()
      .from("app_copy")
      .update({ text })
      .eq("key", row.key)
      .eq("locale", row.locale)
      .select("key, locale, text, updated_at");
    setBusy(false);
    if (error || !data?.length) {
      setError(error ? await describeError(error) : "Aucune ligne modifiée (droits insuffisants ?).");
      return;
    }
    setJustSaved(true);
    onSaved(data[0] as CopyRow);
  }

  return (
    <form className="copy-item" onSubmit={save}>
      <div>
        <label className="copy-key" htmlFor={`${id}-t`}>
          {row.key}
        </label>
        <p className="copy-meta">
          {row.locale} · {row.updated_at ? `modifié ${fmtDateTime(row.updated_at)}` : "—"}
        </p>
        {slots.length ? <p className="copy-meta">À garder : {slots.join(", ")}</p> : null}
      </div>
      <div className="copy-edit">
        <textarea
          id={`${id}-t`}
          className="textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setJustSaved(false);
          }}
          rows={Math.min(6, Math.max(2, Math.ceil(text.length / 70)))}
        />
        {error ? <ErrorNotice message={error} /> : null}
        <div className="copy-actions">
          <span className="label" aria-live="polite">
            {justSaved && !dirty ? "Enregistré" : dirty ? "Modifié" : ""}
          </span>
          {dirty ? (
            <button type="button" className="adm-link" onClick={() => setText(row.text)}>
              Annuler
            </button>
          ) : null}
          <button type="submit" className="btn btn--sm" disabled={!dirty || busy}>
            {busy ? "Envoi…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </form>
  );
}

function NewCopy({ existing, onCreated }: { existing: Set<string>; onCreated: (r: CopyRow) => void }) {
  const id = useId();
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    const k = key.trim();
    if (!/^[a-z0-9_.]+$/.test(k)) return setError("Clé : minuscules, chiffres, points et tirets bas uniquement.");
    if (existing.has(k)) return setError("Cette clé existe déjà : modifiez-la dans la liste.");
    if (!text.trim()) return setError("Le texte est obligatoire.");
    setBusy(true);
    setError(null);
    const { data, error } = await createClient()
      .from("app_copy")
      .insert({ key: k, locale: LOCALE, text })
      .select("key, locale, text, updated_at");
    setBusy(false);
    if (error || !data?.length) {
      setError(error ? await describeError(error) : "Création refusée.");
      return;
    }
    onCreated(data[0] as CopyRow);
    setKey("");
    setText("");
  }

  return (
    <form className="panel" onSubmit={create} aria-labelledby={`${id}-h`} style={{ marginTop: 32 }}>
      <div className="panel-h">
        <h2 className="label" id={`${id}-h`}>
          Nouveau texte
        </h2>
        <span className="label">locale {LOCALE}</span>
      </div>
      <div className="panel-b" style={{ display: "grid", gap: 14 }}>
        <div className="field">
          <label className="label" htmlFor={`${id}-k`}>
            Clé
          </label>
          <input
            id={`${id}-k`}
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ex. verdict.custom"
            list={`${id}-missing`}
            autoCapitalize="none"
            spellCheck={false}
          />
          <datalist id={`${id}-missing`}>
            {REQUIRED_KEYS.filter((k) => !existing.has(k)).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-v`}>
            Texte
          </label>
          <textarea id={`${id}-v`} className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <div className="form-actions">
          <button type="submit" className="btn btn--sm" disabled={busy}>
            Créer
          </button>
        </div>
      </div>
    </form>
  );
}

export default function CopyEditor() {
  const [rows, setRows] = useState<CopyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    createClient()
      .from("app_copy")
      .select("key, locale, text, updated_at")
      .eq("locale", LOCALE)
      .order("key")
      .then(async ({ data, error }) => {
        if (error) setError(await describeError(error));
        else {
          setError(null);
          setRows((data ?? []) as CopyRow[]);
        }
      });
  }, []);
  useEffect(load, [load]);

  const existing = useMemo(() => new Set((rows ?? []).map((r) => r.key)), [rows]);
  const missing = REQUIRED_KEYS.filter((k) => rows && !existing.has(k));
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (rows ?? []).filter((r) => !q || r.key.includes(q) || r.text.toLowerCase().includes(q));
    const map = new Map<string, CopyRow[]>();
    for (const r of filtered) {
      const g = r.key.split(".")[0] ?? r.key;
      map.set(g, [...(map.get(g) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, query]);

  const replace = (r: CopyRow) =>
    setRows((rs) => {
      const list = rs ?? [];
      const exists = list.some((x) => x.key === r.key && x.locale === r.locale);
      return (exists ? list.map((x) => (x.key === r.key && x.locale === r.locale ? r : x)) : [...list, r]).sort((a, b) =>
        a.key.localeCompare(b.key),
      );
    });

  return (
    <>
      <PageHead
        label="Ton de la marque"
        title={
          <>
            Les <em>textes</em>
          </>
        }
        lead="Textes des emails, du verdict du diplôme et des CGU. Modifiés ici, ils changent sans redéploiement."
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!rows && !error ? <Loading /> : null}
      {rows ? (
        <>
          <div className="toolbar">
            <div className="field" style={{ minWidth: "min(100%, 360px)" }}>
              <label className="label" htmlFor="copy-search">
                Rechercher une clé ou un texte
              </label>
              <input
                id="copy-search"
                className="input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="emploi, verdict, terms…"
              />
            </div>
            <span className="label">{rows.length} textes</span>
          </div>
          {missing.length ? (
            <p className="notice" style={{ marginBottom: 20 }}>
              <span className="label">Manquant</span>
              <span>Clés du contrat absentes : {missing.join(", ")}.</span>
            </p>
          ) : null}
          <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
            {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
          </div>
          {groups.length === 0 ? <Empty title="Aucun texte ne correspond." /> : null}
          {groups.map(([group, items]) => (
            <section key={group} aria-label={`Textes ${group}`} style={{ marginBottom: 32 }}>
              <h2 className="label" style={{ marginBottom: 8 }}>
                {GROUP_LABELS[group] ? `${GROUP_LABELS[group]} (${group})` : group} · {items.length}
              </h2>
              <div className="copy-list">
                {items.map((r) => (
                  <CopyItem key={`${r.key}:${r.locale}`} row={r} onSaved={replace} />
                ))}
              </div>
            </section>
          ))}
          <NewCopy
            existing={existing}
            onCreated={(r) => {
              replace(r);
              setNotice(`Texte « ${r.key} » créé.`);
            }}
          />
        </>
      ) : null}
    </>
  );
}

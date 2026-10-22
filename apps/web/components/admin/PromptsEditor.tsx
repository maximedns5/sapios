"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { MAX_ANSWERS } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { numberFr } from "@/lib/admin/format";
import { loadPromptTexts, promptCopyKey, promptText, type PromptTexts } from "@/lib/admin/prompts";
import type { PromptRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const KEY_RE = /^[a-z0-9_]{2,40}$/;
const TEXT_MAX = 120;

interface Loaded {
  prompts: PromptRow[];
  texts: PromptTexts;
  usage: Record<string, number>;
}

async function loadPrompts(): Promise<Loaded> {
  const supabase = createClient();
  const [prompts, texts, answers] = await Promise.all([
    supabase.from("profile_prompts").select("key, active, position, created_at").order("position").order("key"),
    loadPromptTexts(),
    // Admins lisent toutes les réponses (RLS) : on ne garde que la clé, pour compter.
    supabase.from("profile_answers").select("prompt_key").limit(10000),
  ]);
  if (prompts.error) throw prompts.error;
  const usage: Record<string, number> = {};
  for (const a of (answers.data ?? []) as Array<{ prompt_key: string }>) usage[a.prompt_key] = (usage[a.prompt_key] ?? 0) + 1;
  return { prompts: (prompts.data ?? []) as PromptRow[], texts, usage };
}

/** Clé technique dérivée du texte : minuscules sans accents, mots séparés par « _ ». */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 4)
    .join("_")
    .slice(0, 40);
}

function PromptRowEditor({
  row,
  index,
  count,
  text,
  usage,
  busy,
  onToggle,
  onMove,
  onSaveText,
}: {
  row: PromptRow;
  index: number;
  count: number;
  text: string;
  usage: number;
  busy: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onSaveText: (value: string) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(text);
  const dirty = draft.trim() !== text;
  const valid = draft.trim().length >= 3 && draft.trim().length <= TEXT_MAX;

  return (
    <li className={row.active ? "prompt-row" : "prompt-row is-off"}>
      <span className="prompt-pos label" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <form
        className="prompt-main"
        onSubmit={async (e) => {
          e.preventDefault();
          if (dirty && valid) await onSaveText(draft.trim());
        }}
      >
        <label className="sr-only" htmlFor={`${id}-text`}>
          Texte de la question {row.key}
        </label>
        <input
          id={`${id}-text`}
          className="input"
          value={draft}
          maxLength={TEXT_MAX}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={!valid ? true : undefined}
        />
        <span className="prompt-meta label">
          <code>{row.key}</code> · {usage ? `${numberFr.format(usage)} réponse${usage > 1 ? "s" : ""}` : "aucune réponse"}
          {row.active ? "" : " · désactivée"}
        </span>
        {dirty ? (
          <span className="form-actions">
            <button type="submit" className="btn btn--sm" disabled={!valid || busy}>
              Enregistrer le texte
            </button>
            <button type="button" className="adm-link" onClick={() => setDraft(text)}>
              Annuler
            </button>
          </span>
        ) : null}
      </form>
      <div className="prompt-actions">
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onMove(-1)}
          disabled={busy || index === 0}
          aria-label={`Monter « ${text} »`}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onMove(1)}
          disabled={busy || index === count - 1}
          aria-label={`Descendre « ${text} »`}
        >
          ↓
        </button>
        <label className="check">
          <input type="checkbox" checked={row.active} onChange={onToggle} disabled={busy} />
          <span>{row.active ? "Proposée" : "Masquée"}</span>
        </label>
      </div>
    </li>
  );
}

export default function PromptsEditor() {
  const id = useId();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newText, setNewText] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  const load = useCallback(() => {
    loadPrompts()
      .then((d) => {
        setError(null);
        setData(d);
      })
      .catch(async (e) => setError(await describeError(e)));
  }, []);
  useEffect(load, [load]);

  const activeCount = useMemo(() => data?.prompts.filter((p) => p.active).length ?? 0, [data]);
  const key = keyTouched ? newKey : slugify(newText);
  const keyTaken = Boolean(data?.prompts.some((p) => p.key === key));
  const canAdd = !busy && newText.trim().length >= 3 && newText.trim().length <= TEXT_MAX && KEY_RE.test(key) && !keyTaken;

  async function run(action: () => PromiseLike<{ error: unknown }>, done: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    setError(null);
    const { error } = await action();
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return false;
    }
    setNotice(done);
    load();
    return true;
  }

  async function saveText(row: PromptRow, value: string) {
    return run(
      () =>
        createClient()
          .from("app_copy")
          .upsert({ key: promptCopyKey(row.key), locale: "fr", text: value }, { onConflict: "key,locale" }),
      "Texte enregistré. Les membres le voient à leur prochain chargement.",
    );
  }

  async function toggle(row: PromptRow) {
    if (row.active && activeCount <= MAX_ANSWERS + 2) {
      if (!window.confirm(`Il ne resterait que ${activeCount - 1} questions proposées. Masquer quand même ?`)) return;
    }
    await run(
      () => createClient().from("profile_prompts").update({ active: !row.active }).eq("key", row.key),
      row.active
        ? "Question masquée : elle n’est plus proposée. Les réponses existantes restent publiées."
        : "Question de nouveau proposée.",
    );
  }

  async function move(index: number, delta: -1 | 1) {
    if (!data) return;
    const list = [...data.prompts];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    if (!moved) return;
    list.splice(target, 0, moved);
    // Positions renumérotées de 1 à n : l'ordre affiché devient l'ordre en base.
    const supabase = createClient();
    await run(async () => {
      for (const [i, p] of list.entries()) {
        if (p.position === i + 1) continue;
        const { error } = await supabase.from("profile_prompts").update({ position: i + 1 }).eq("key", p.key);
        if (error) return { error };
      }
      return { error: null };
    }, "Ordre enregistré.");
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!canAdd || !data) return;
    const position = Math.max(0, ...data.prompts.map((p) => p.position)) + 1;
    const supabase = createClient();
    const ok = await run(async () => {
      const copy = await supabase
        .from("app_copy")
        .upsert({ key: promptCopyKey(key), locale: "fr", text: newText.trim() }, { onConflict: "key,locale" });
      if (copy.error) return copy;
      return supabase.from("profile_prompts").insert({ key, position, active: true });
    }, "Question ajoutée en fin de liste.");
    if (ok) {
      setNewText("");
      setNewKey("");
      setKeyTouched(false);
    }
  }

  return (
    <>
      <PageHead
        label="Profil intellectuel"
        title={
          <>
            Les <em>questions</em>
          </>
        }
        lead={`Chaque membre choisit ${MAX_ANSWERS} questions dans ce catalogue, dans cet ordre. Aucune question n’invite la politique, la religion, la santé ou la sexualité : ce sont des données sensibles.`}
        aside={
          data ? (
            <span className="label">
              {activeCount} proposée{activeCount > 1 ? "s" : ""} sur {data.prompts.length}
            </span>
          ) : null
        }
      />
      <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <ol className="prompt-list" aria-label="Catalogue des questions">
            {data.prompts.map((row, i) => (
              <PromptRowEditor
                // Le texte enregistré change la clé : le brouillon repart du texte en base.
                key={`${row.key}:${promptText(row.key, data.texts)}`}
                row={row}
                index={i}
                count={data.prompts.length}
                text={promptText(row.key, data.texts)}
                usage={data.usage[row.key] ?? 0}
                busy={busy}
                onToggle={() => toggle(row)}
                onMove={(delta) => move(i, delta)}
                onSaveText={(value) => saveText(row, value)}
              />
            ))}
          </ol>

          <form className="panel" style={{ marginTop: 28 }} onSubmit={add} aria-labelledby={`${id}-add`}>
            <div className="panel-h">
              <h2 className="label" id={`${id}-add`}>
                Ajouter une question
              </h2>
            </div>
            <div className="panel-b" style={{ display: "grid", gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor={`${id}-new-text`}>
                  Texte affiché aux membres
                </label>
                <input
                  id={`${id}-new-text`}
                  className="input"
                  value={newText}
                  maxLength={TEXT_MAX}
                  placeholder="Ex. : Le musée où je pourrais passer la nuit"
                  onChange={(e) => setNewText(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-new-key`}>
                  Clé technique (définitive : elle relie les réponses à la question)
                </label>
                <input
                  id={`${id}-new-key`}
                  className="input"
                  value={key}
                  maxLength={40}
                  onChange={(e) => {
                    setKeyTouched(true);
                    setNewKey(e.target.value.toLowerCase());
                  }}
                  aria-invalid={key && (!KEY_RE.test(key) || keyTaken) ? true : undefined}
                  aria-describedby={`${id}-key-help`}
                />
                <span className="label" id={`${id}-key-help`}>
                  {keyTaken
                    ? "Cette clé existe déjà."
                    : "Minuscules, chiffres et « _ », de 2 à 40 caractères."}
                </span>
              </div>
              <div className="form-actions">
                <button className="btn btn--sm" type="submit" disabled={!canAdd}>
                  Ajouter
                </button>
              </div>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}

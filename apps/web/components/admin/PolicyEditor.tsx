"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCESS_TIERS, type AccessTier } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { LEVELS, TIER_LABELS } from "@/lib/admin/format";
import type { CopyRow, PolicyRow } from "@/lib/admin/types";
import LevelLabel from "@/components/LevelLabel";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

type Draft = Omit<PolicyRow, "id" | "daily_like_quota"> & { id: string | null; quota: string; key: string };

const toDraft = (p: PolicyRow): Draft => ({
  id: p.id,
  key: p.id,
  min_level: p.min_level,
  tier: p.tier,
  quota: p.daily_like_quota == null ? "" : String(p.daily_like_quota),
  can_browse: p.can_browse,
  sees_likers: p.sees_likers,
  copy_key: p.copy_key,
});

function validate(d: Draft, all: Draft[]): string | null {
  if (!Number.isInteger(d.min_level) || d.min_level < 1 || d.min_level > 8) return "Niveau minimum entre 1 et 8.";
  if (all.some((o) => o.key !== d.key && o.min_level === d.min_level)) return `Le seuil ${d.min_level} existe déjà.`;
  if (d.quota !== "" && !/^\d+$/.test(d.quota)) return "Quota : un entier positif, ou vide pour illimité.";
  if (!/^[a-z0-9_.]+$/.test(d.copy_key)) return "Clé de texte invalide.";
  return null;
}

function payload(d: Draft) {
  return {
    min_level: d.min_level,
    tier: d.tier,
    daily_like_quota: d.quota === "" ? null : Number.parseInt(d.quota, 10),
    can_browse: d.can_browse,
    sees_likers: d.sees_likers,
    copy_key: d.copy_key,
  };
}

export default function PolicyEditor() {
  const [saved, setSaved] = useState<PolicyRow[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [copies, setCopies] = useState<CopyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("access_policy").select("*").order("min_level", { ascending: false }),
      supabase.from("app_copy").select("key, locale, text").eq("locale", "fr").like("key", "verdict.%").order("key"),
    ]).then(async ([p, c]) => {
      if (p.error) {
        setError(await describeError(p.error));
        return;
      }
      const rows = (p.data ?? []) as PolicyRow[];
      setError(null);
      setSaved(rows);
      setDrafts(rows.map(toDraft));
      setCopies((c.data ?? []) as CopyRow[]);
    });
  }, []);
  useEffect(load, [load]);

  // Simulation : pour chaque niveau, la ligne au plus grand min_level <= niveau (contrat §2).
  const sim = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => {
        const p = drafts.filter((d) => d.min_level <= lvl).sort((a, b) => b.min_level - a.min_level)[0];
        return { lvl, p };
      }),
    [drafts],
  );

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const isDirty = (d: Draft) => {
    if (!d.id) return true;
    const s = saved?.find((x) => x.id === d.id);
    return !s || JSON.stringify(payload(d)) !== JSON.stringify(payload(toDraft(s)));
  };

  async function save(d: Draft) {
    const problem = validate(d, drafts);
    setRowErrors((e) => ({ ...e, [d.key]: problem ?? "" }));
    if (problem) return;
    setBusy(d.key);
    setNotice(null);
    const supabase = createClient();
    const res = d.id
      ? await supabase.from("access_policy").update(payload(d)).eq("id", d.id).select("id")
      : await supabase.from("access_policy").insert(payload(d)).select("id");
    setBusy(null);
    if (res.error || !res.data?.length) {
      const msg = res.error ? await describeError(res.error) : "Aucune ligne modifiée (droits insuffisants ?).";
      setRowErrors((e) => ({ ...e, [d.key]: msg }));
      return;
    }
    setNotice(`Seuil ${d.min_level} enregistré. Les droits d’un palier (feed, quota, likes visibles) valent tout de suite pour ses membres ; un changement de seuil ne vaut que pour les prochaines décisions.`);
    load();
  }

  async function remove(d: Draft) {
    if (!d.id) {
      setDrafts((ds) => ds.filter((x) => x.key !== d.key));
      return;
    }
    if (!window.confirm(`Supprimer le seuil ${d.min_level} (${TIER_LABELS[d.tier]}) ?`)) return;
    setBusy(d.key);
    const res = await createClient().from("access_policy").delete().eq("id", d.id).select("id");
    setBusy(null);
    if (res.error || !res.data?.length) {
      const msg = res.error ? await describeError(res.error) : "Suppression refusée.";
      setRowErrors((e) => ({ ...e, [d.key]: msg }));
      return;
    }
    setNotice(`Seuil ${d.min_level} supprimé.`);
    load();
  }

  function add() {
    const used = new Set(drafts.map((d) => d.min_level));
    const free = [8, 7, 6, 5, 4, 3, 2, 1].find((l) => !used.has(l)) ?? 1;
    setDrafts((ds) => [
      ...ds,
      {
        id: null,
        key: `new-${Date.now()}`,
        min_level: free,
        tier: "refused",
        quota: "0",
        can_browse: false,
        sees_likers: false,
        copy_key: "verdict.refused",
      },
    ]);
  }

  const copyKeys = Array.from(new Set([...copies.map((c) => c.key), ...drafts.map((d) => d.copy_key)])).sort();

  return (
    <>
      <PageHead
        label="Configuration"
        title={
          <>
            Paliers <em>d’accès</em>
          </>
        }
        lead="Le palier d’un niveau N est la ligne au plus grand seuil inférieur ou égal à N. Les droits d’un palier sont lus sur sa ligne la plus haute."
      />
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!saved && !error ? <Loading /> : null}
      {saved ? (
        <>
          <h2 className="label" style={{ marginBottom: 10 }}>
            Simulation (brouillon compris)
          </h2>
          <div className="policy-sim" role="list" aria-label="Palier obtenu pour chaque niveau">
            {sim.map(({ lvl, p }) => (
              <div key={lvl} role="listitem" className={p?.can_browse ? "browse" : undefined}>
                <span className="n">
                  <LevelLabel label={LEVELS.find((l) => l.level === lvl)?.label ?? String(lvl)} />
                </span>
                <span className="t">{p ? TIER_LABELS[p.tier] : "Aucun"}</span>
              </div>
            ))}
          </div>
          <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
            {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">Lignes de la politique d’accès</caption>
              <thead>
                <tr>
                  <th scope="col">Seuil</th>
                  <th scope="col">Palier</th>
                  <th scope="col">Likes / jour</th>
                  <th scope="col">Feed</th>
                  <th scope="col">Voit les likes</th>
                  <th scope="col">Texte du verdict</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const dirty = isDirty(d);
                  const copy = copies.find((c) => c.key === d.copy_key);
                  return (
                    <tr key={d.key}>
                      <td style={{ minWidth: 132 }}>
                        <select
                          className="select"
                          aria-label="Niveau minimum"
                          value={d.min_level}
                          onChange={(e) => update(d.key, { min_level: Number(e.target.value) })}
                        >
                          {LEVELS.map((l) => (
                            <option key={l.level} value={l.level}>
                              {l.level} · {l.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <select
                          className="select"
                          aria-label="Palier"
                          value={d.tier}
                          onChange={(e) => update(d.key, { tier: e.target.value as AccessTier })}
                        >
                          {ACCESS_TIERS.map((t) => (
                            <option key={t} value={t}>
                              {TIER_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ width: 110, minWidth: 96 }}>
                        <input
                          className="input"
                          inputMode="numeric"
                          aria-label="Quota de likes par jour (vide = illimité)"
                          placeholder="illimité"
                          value={d.quota}
                          onChange={(e) => update(d.key, { quota: e.target.value.trim() })}
                        />
                      </td>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={d.can_browse}
                            onChange={(e) => update(d.key, { can_browse: e.target.checked })}
                          />
                          <span>{d.can_browse ? "Oui" : "Non"}</span>
                        </label>
                      </td>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={d.sees_likers}
                            onChange={(e) => update(d.key, { sees_likers: e.target.checked })}
                          />
                          <span>{d.sees_likers ? "Oui" : "Non"}</span>
                        </label>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <select
                          className="select"
                          aria-label="Clé du texte de verdict"
                          value={d.copy_key}
                          onChange={(e) => update(d.key, { copy_key: e.target.value })}
                        >
                          {copyKeys.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        {copy ? (
                          <p className="muted" style={{ marginTop: 6, fontStyle: "italic" }}>
                            « {copy.text} »
                          </p>
                        ) : null}
                        {rowErrors[d.key] ? (
                          <p className="notice" role="alert" style={{ marginTop: 8 }}>
                            <span>{rowErrors[d.key]}</span>
                          </p>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div className="form-actions" style={{ flexWrap: "nowrap" }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={!dirty || busy === d.key}
                            onClick={() => save(d)}
                          >
                            {d.id ? "Enregistrer" : "Créer"}
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={busy === d.key}
                            onClick={() => remove(d)}
                            aria-label={`Supprimer le seuil ${d.min_level}`}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={add} disabled={drafts.length >= 8}>
              Ajouter un seuil
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { normalizeReferralCode, REFERRAL_CODE_PATTERN, REFERRAL_LETTERS, REFERRAL_WINDOW_DAYS } from "@sapios/shared";
import { describeError } from "@/lib/admin/errors";
import { fmtDateTime, levelText, numberFr, TIER_LABELS } from "@/lib/admin/format";
import type { ReferralStats, ReferrerStatsRow } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/client";
import { Empty, ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

const SETTING_KEYS = ["referral_letters_unlimited", "referral_letters_standard", "referral_window_days"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

const SETTING_FIELDS: Array<{ key: SettingKey; label: string; help: string; min: number; max: number; fallback: number }> = [
  { key: "referral_letters_unlimited", label: "Lettres · Bac+8", help: "Par période", min: 0, max: 20, fallback: REFERRAL_LETTERS.unlimited },
  { key: "referral_letters_standard", label: "Lettres · Bac+5", help: "Par période", min: 0, max: 20, fallback: REFERRAL_LETTERS.standard },
  { key: "referral_window_days", label: "Période glissante", help: "En jours, de 7 à 90", min: 7, max: 90, fallback: REFERRAL_WINDOW_DAYS },
];

function plural(n: number, one: string, many: string): string {
  return `${numberFr.format(n)} ${n > 1 ? many : one}`;
}

function outcome(r: ReferrerStatsRow): string {
  const parts = [
    r.referees_admitted ? plural(r.referees_admitted, "validé", "validés") : null,
    r.referees_pending ? `${numberFr.format(r.referees_pending)} en revue` : null,
    r.referees_waitlisted ? `${numberFr.format(r.referees_waitlisted)} en liste d’attente` : null,
    r.referees_refused ? plural(r.referees_refused, "refusé", "refusés") : null,
    r.referees_banned ? plural(r.referees_banned, "banni", "bannis") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Aucun filleul";
}

function quotaOf(r: ReferrerStatsRow, settings: Record<SettingKey, string> | null): number | null {
  if (r.tier !== "unlimited" && r.tier !== "standard") return null;
  const key = r.tier === "unlimited" ? "referral_letters_unlimited" : "referral_letters_standard";
  const v = Number(settings?.[key]);
  return Number.isFinite(v) ? v : REFERRAL_LETTERS[r.tier];
}

function RevokeForm({
  code,
  name,
  onDone,
  onClose,
}: {
  code?: string | null;
  name?: string | null;
  onDone: (message: string) => void;
  onClose?: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(code ?? "");
  const [reason, setReason] = useState("");
  const [disable, setDisable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeReferralCode(value);
  const valid = REFERRAL_CODE_PATTERN.test(normalized);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("Un code compte 10 caractères (lettres et chiffres, sans I, L, O ni U).");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("admin_revoke_referral_code", {
      p_code: normalized,
      p_disable: disable,
      p_reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    onDone(
      `Code ${normalized} révoqué${name ? ` (${name})` : ""}.${disable ? " Ses recommandations sont suspendues." : " Un nouveau code sera créé à sa prochaine demande."}`,
    );
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate style={{ marginTop: code ? 10 : 0 }}>
      {code ? null : (
        <div className="field">
          <label className="label" htmlFor={`${id}-code`}>
            Code à révoquer
          </label>
          <input
            id={`${id}-code`}
            className="input mono-code"
            style={{ minHeight: 42, borderWidth: 1.5, padding: "8px 10px" }}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="K7QM2XPA9D"
          />
        </div>
      )}
      <div className={code ? "field full" : "field"}>
        <label className="label" htmlFor={`${id}-reason`}>
          Motif (journal interne)
        </label>
        <input
          id={`${id}-reason`}
          className="input"
          style={{ minHeight: 42, borderWidth: 1.5, padding: "8px 10px", fontSize: 14 }}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lien publié sur un forum"
        />
      </div>
      <label className="check full">
        <input type="checkbox" checked={disable} onChange={(e) => setDisable(e.target.checked)} />
        <span>Suspendre aussi ses recommandations (aucun nouveau code tant qu’elles ne sont pas rétablies)</span>
      </label>
      <div className="full" aria-live="assertive">
        {error ? <ErrorNotice message={error} /> : null}
      </div>
      <div className="form-actions full">
        <button type="submit" className="btn btn--sm" disabled={busy || !value.trim()}>
          {busy ? "Révocation…" : "Révoquer le code"}
        </button>
        {onClose ? (
          <button type="button" className="adm-link" onClick={onClose}>
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Settings({ values, onSaved }: { values: Record<SettingKey, string>; onSaved: (v: Record<SettingKey, string>) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const problems = useMemo(() => {
    const p: Partial<Record<SettingKey, string>> = {};
    for (const f of SETTING_FIELDS) {
      const v = draft[f.key].trim();
      if (!/^\d+$/.test(v) || Number(v) < f.min || Number(v) > f.max) p[f.key] = `Un entier de ${f.min} à ${f.max}.`;
    }
    return p;
  }, [draft]);
  const changed = SETTING_KEYS.filter((k) => draft[k].trim() !== values[k]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(problems).length || !changed.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const payload = Object.fromEntries(changed.map((k) => [k, Number(draft[k])]));
    const { error } = await createClient().rpc("admin_update_settings", { p_values: payload });
    setBusy(false);
    if (error) {
      setError(await describeError(error));
      return;
    }
    const next = { ...values, ...Object.fromEntries(changed.map((k) => [k, draft[k].trim()])) } as Record<SettingKey, string>;
    onSaved(next);
    setNotice("Réglages enregistrés. Les compteurs des membres suivent immédiatement.");
  }

  return (
    <section className="panel" aria-labelledby={`${id}-t`}>
      <div className="panel-h">
        <h2 className="label" id={`${id}-t`}>
          Lettres par période
        </h2>
      </div>
      <form className="panel-b" onSubmit={save} noValidate>
        <div className="settings-grid">
          {SETTING_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label className="label" htmlFor={`${id}-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`${id}-${f.key}`}
                className="input"
                inputMode="numeric"
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                aria-invalid={problems[f.key] ? true : undefined}
                aria-describedby={`${id}-${f.key}-h`}
              />
              <span className={problems[f.key] ? "field-error" : "form-hint muted"} id={`${id}-${f.key}-h`}>
                {problems[f.key] ?? f.help}
              </span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: "14px 0", fontSize: 13 }}>
          Bac+3 et en dessous ne recommandent pas. Aucune récompense pour le parrain : une lettre fait passer devant dans
          la file, jamais au-delà du diplôme.
        </p>
        <div aria-live="polite">
          {error ? <ErrorNotice message={error} /> : null}
          {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn--sm" disabled={busy || !changed.length || Object.keys(problems).length > 0}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function ReferralsView() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [settings, setSettings] = useState<Record<SettingKey, string> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      supabase.rpc("admin_referral_stats"),
      supabase.from("app_settings").select("key, value, updated_at").in("key", [...SETTING_KEYS]),
    ]).then(async ([s, cfg]) => {
      const err = s.error ?? cfg.error;
      if (err) {
        setError(await describeError(err));
        return;
      }
      setError(null);
      setStats(s.data as unknown as ReferralStats);
      const rows = (cfg.data ?? []) as Array<{ key: SettingKey; value: unknown; updated_at: string }>;
      setSettings(
        Object.fromEntries(
          SETTING_FIELDS.map((f) => [f.key, String(rows.find((r) => r.key === f.key)?.value ?? f.fallback)]),
        ) as Record<SettingKey, string>,
      );
      setUpdatedAt(rows.map((r) => r.updated_at).sort().at(-1) ?? null);
    });
  }, []);
  useEffect(load, [load]);

  const totals = useMemo(() => {
    const t = { admitted: 0, refused: 0, pending: 0, waitlisted: 0, flagged: 0 };
    for (const r of stats?.referrers ?? []) {
      t.admitted += r.referees_admitted;
      t.refused += r.referees_refused;
      t.pending += r.referees_pending;
      t.waitlisted += r.referees_waitlisted;
      if (r.flagged) t.flagged += 1;
    }
    return t;
  }, [stats]);

  async function enable(r: ReferrerStatsRow) {
    setBusy(r.referrer_id);
    setError(null);
    const { error } = await createClient().rpc("admin_enable_referrals", { p_user: r.referrer_id });
    setBusy(null);
    if (error) {
      setError(await describeError(error));
      return;
    }
    setNotice(`Recommandations de ${r.display_name ?? "ce membre"} rétablies. Un nouveau code sera créé à sa prochaine demande.`);
    load();
  }

  const windowDays = settings?.referral_window_days ?? String(REFERRAL_WINDOW_DAYS);

  return (
    <>
      <PageHead
        label={`Lettres de recommandation · ${windowDays} derniers jours`}
        title={
          <>
            Les <em>parrainages</em>
          </>
        }
        lead="Les personnes recommandées passent devant dans la file des diplômes et dans les admissions. Les parrains ne voient qu’un compteur, jamais un nom ni un verdict."
        aside={
          <button type="button" className="btn btn--sm btn--ghost" onClick={load}>
            Actualiser
          </button>
        }
      />
      <div aria-live="polite" style={{ marginBottom: notice ? 16 : 0 }}>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      </div>
      {error ? <ErrorNotice message={error} onRetry={load} /> : null}
      {!stats && !error ? <Loading /> : null}
      {stats ? (
        <>
          <div className="kpis" style={{ marginBottom: 28 }}>
            <div className="kpi kpi--hero">
              <span className="label">Lettres utilisées</span>
              <span className="v">{numberFr.format(stats.referrals_window)}</span>
              <span className="s">Sur {windowDays} jours · {numberFr.format(stats.referrals_total)} au total</span>
            </div>
            <div className="kpi">
              <span className="label">Codes actifs</span>
              <span className="v">{numberFr.format(stats.codes_active)}</span>
              <span className="s">{plural(stats.codes_revoked, "révoqué", "révoqués")}</span>
            </div>
            <div className="kpi">
              <span className="label">Filleuls validés</span>
              <span className="v">{numberFr.format(totals.admitted)}</span>
              <span className="s">{plural(totals.refused, "refusé", "refusés")}</span>
            </div>
            <div className="kpi">
              <span className="label">En revue</span>
              <span className="v">{numberFr.format(totals.pending)}</span>
              <span className="s">{numberFr.format(totals.waitlisted)} en liste d’attente</span>
            </div>
            <div className="kpi">
              <span className="label">Signaux</span>
              <span className="v">{numberFr.format(totals.flagged)}</span>
              <span className="s">Parrain d’un filleul banni</span>
            </div>
          </div>

          <div className="ev-layout">
            <section aria-label="Parrains">
              {stats.referrers.length === 0 ? (
                <Empty title="Personne n’a encore utilisé de lettre." />
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl tbl--cards">
                    <caption className="sr-only">Parrains et devenir de leurs filleuls</caption>
                    <thead>
                      <tr>
                        <th scope="col">Parrain</th>
                        <th scope="col" className="num">
                          Lettres
                        </th>
                        <th scope="col">Filleuls</th>
                        <th scope="col">Signal</th>
                        <th scope="col">Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.referrers.map((r) => {
                        const quota = quotaOf(r, settings);
                        return (
                          <tr key={r.referrer_id}>
                            <td data-label="Parrain" className="span">
                              <span className="strong">{r.display_name ?? "Sans prénom"}</span>
                              <br />
                              <span className="muted">
                                {[r.tier ? TIER_LABELS[r.tier] : null, r.level != null ? levelText(r.level) : null, r.email]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </td>
                            <td data-label="Lettres" className="num">
                              {r.letters_used_window}
                              {quota != null ? ` / ${quota}` : ""}
                            </td>
                            <td data-label="Filleuls">{outcome(r)}</td>
                            <td data-label="Signal">
                              {r.flagged ? (
                                <span className="badge badge--solid" title="Un signal, jamais une sanction automatique">
                                  ! Filleul banni
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td data-label="Code">
                              {r.referral_disabled ? (
                                <>
                                  <span className="badge badge--dashed">Suspendu</span>{" "}
                                  <button
                                    type="button"
                                    className="adm-link"
                                    disabled={busy === r.referrer_id}
                                    onClick={() => enable(r)}
                                  >
                                    Rétablir
                                  </button>
                                </>
                              ) : r.active_code ? (
                                <>
                                  <span className="mono-code">{r.active_code}</span>
                                  <br />
                                  {revoking === r.referrer_id ? null : (
                                    <button type="button" className="adm-link" onClick={() => setRevoking(r.referrer_id)}>
                                      Révoquer
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="muted">Aucun code actif</span>
                              )}
                              {revoking === r.referrer_id && r.active_code ? (
                                <RevokeForm
                                  code={r.active_code}
                                  name={r.display_name}
                                  onClose={() => setRevoking(null)}
                                  onDone={(m) => {
                                    setRevoking(null);
                                    setNotice(m);
                                    load();
                                  }}
                                />
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                Un signal n’entraîne aucune sanction automatique : il invite à regarder les autres filleuls du même
                parrain. Les parrains sans filleul n’apparaissent pas ici.
              </p>
            </section>

            <div className="ev-side" style={{ display: "grid", gap: 20 }}>
              {settings ? (
                <Settings
                  key={JSON.stringify(settings)}
                  values={settings}
                  onSaved={(v) => {
                    setSettings(v);
                    setUpdatedAt(new Date().toISOString());
                  }}
                />
              ) : null}
              {updatedAt ? (
                <p className="label" style={{ marginTop: -8 }}>
                  Réglages modifiés le {fmtDateTime(updatedAt)}
                </p>
              ) : null}
              <section className="panel" aria-label="Révoquer un code">
                <div className="panel-h">
                  <h2 className="label">Révoquer un code</h2>
                </div>
                <div className="panel-b">
                  <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                    Un code partagé publiquement ou utilisé pour du démarchage se révoque ici, même sans filleul.
                  </p>
                  <RevokeForm
                    onDone={(m) => {
                      setNotice(m);
                      load();
                    }}
                  />
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { Json } from "@sapios/shared";
import { errorCode, errorMessage } from "@/lib/admin/errors";
import { fmtDateTime } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading, PageHead, SuccessNotice } from "./ui";

// Durées de conservation (AIPD, sections 2 et 7). Les valeurs vivent dans `app_settings` et sont
// appliquées par les tâches planifiées de la base ; ici, on ne fait que les régler.
const RETENTION = [
  {
    key: "inactive_warning_days",
    label: "Compte inactif : avertissement",
    help: "Jours sans connexion avant l’email d’avertissement.",
    def: 730,
    min: 180,
    max: 3650,
  },
  {
    key: "inactive_grace_days",
    label: "Compte inactif : délai avant suppression",
    help: "Jours entre l’avertissement et la suppression, si le membre ne revient pas.",
    def: 30,
    min: 7,
    max: 180,
  },
  {
    key: "report_retention_days",
    label: "Signalements après suppression du compte visé",
    help: "Conservés pseudonymisés, puis effacés.",
    def: 365,
    min: 30,
    max: 1825,
  },
  {
    key: "audit_retention_days",
    label: "Journal d’audit",
    help: "Décisions de modération et changements de réglages.",
    def: 1825,
    min: 365,
    max: 3650,
  },
  {
    key: "banned_identity_retention_days",
    label: "Empreintes des comptes bannis",
    help: "Empêchent le retour d’une personne exclue. Jamais lisibles en clair.",
    def: 1095,
    min: 180,
    max: 3650,
  },
  {
    key: "notice_retention_days",
    label: "Avis aux membres",
    help: "Motifs de retrait, annulations, places obtenues.",
    def: 365,
    min: 30,
    max: 1825,
  },
] as const;
type RetentionKey = (typeof RETENTION)[number]["key"];

const KEYS = [...RETENTION.map((r) => r.key), "terms_version"];
const CONFIRM_WORD = "PUBLIER";

interface Loaded {
  values: Record<RetentionKey, string>;
  stored: Record<RetentionKey, boolean>;
  termsVersion: string | null;
  termsUpdatedAt: string | null;
  updated_at: string | null;
}

async function load(): Promise<Loaded> {
  const { data, error } = await createClient().from("app_settings").select("key, value, updated_at").in("key", KEYS);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ key: string; value: unknown; updated_at: string }>;
  const get = (key: string) => rows.find((r) => r.key === key);
  const terms = get("terms_version");
  return {
    values: Object.fromEntries(RETENTION.map((r) => [r.key, String(get(r.key)?.value ?? r.def)])) as Record<RetentionKey, string>,
    stored: Object.fromEntries(RETENTION.map((r) => [r.key, Boolean(get(r.key))])) as Record<RetentionKey, boolean>,
    termsVersion: terms ? String(terms.value) : null,
    termsUpdatedAt: terms?.updated_at ?? null,
    updated_at: rows.map((r) => r.updated_at).sort().at(-1) ?? null,
  };
}

const isInt = (v: string) => /^\d+$/.test(v.trim());

/** « 730 jours » → « environ 2 ans » : aide à la lecture. */
function humanDays(v: string): string {
  if (!isInt(v)) return "";
  const n = Number(v);
  if (n >= 365) {
    const y = Math.round((n / 365) * 10) / 10;
    return `environ ${String(y).replace(".", ",")} an${y >= 2 ? "s" : ""}`;
  }
  if (n >= 60) return `environ ${Math.round(n / 30)} mois`;
  return "";
}

async function describe(error: unknown): Promise<string> {
  const code = await errorCode(error);
  if (code === "unknown_setting") {
    return "La base ne connaît pas encore ce réglage : la mise à jour « Conformité : base et app » doit être déployée avant.";
  }
  return errorMessage(code);
}

export default function ComplianceSettings() {
  const id = useId();
  const [saved, setSaved] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Record<RetentionKey, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState("");

  const reload = useCallback(() => {
    load()
      .then((s) => {
        setError(null);
        setSaved(s);
        setDraft(s.values);
      })
      .catch(async (e) => setError(await describe(e)));
  }, []);
  useEffect(reload, [reload]);

  const problems = useMemo(() => {
    const p: Partial<Record<RetentionKey, string>> = {};
    if (!draft) return p;
    for (const r of RETENTION) {
      const v = draft[r.key];
      if (!isInt(v) || Number(v) < r.min || Number(v) > r.max) p[r.key] = `Un nombre entier de ${r.min} à ${r.max} jours.`;
    }
    return p;
  }, [draft]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !saved || Object.keys(problems).length) return;
    const values: { [key: string]: Json } = {};
    for (const r of RETENTION) {
      if (draft[r.key].trim() !== saved.values[r.key] || !saved.stored[r.key]) values[r.key] = Number(draft[r.key]);
    }
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
      setError(await describe(error));
      return;
    }
    setNotice("Durées enregistrées et journalisées. Elles s’appliquent au prochain passage des tâches de purge.");
    reload();
  }

  const versionOk = /^[0-9A-Za-z._-]{1,40}$/.test(version.trim()) && version.trim() !== saved?.termsVersion;

  async function publishTerms(e: FormEvent) {
    e.preventDefault();
    if (!versionOk || confirm !== CONFIRM_WORD) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const { error } = await createClient().rpc("admin_update_settings", { p_values: { terms_version: version.trim() } });
    setBusy(false);
    if (error) {
      setError(await describe(error));
      return;
    }
    setConfirm("");
    setNotice(`Version « ${version.trim()} » publiée. Chaque membre devra l’accepter à sa prochaine ouverture de l’application.`);
    reload();
  }

  return (
    <>
      <PageHead
        label="Configuration"
        title={
          <>
            Conservation <em>et conformité</em>
          </>
        }
        lead="Durées appliquées par les purges automatiques de la base, et version des CGU que chaque membre doit avoir acceptée. Chaque changement est journalisé."
        aside={saved?.updated_at ? <span className="label">Modifié le {fmtDateTime(saved.updated_at)}</span> : null}
      />
      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}
      {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
      {!draft && !error ? <Loading /> : null}
      {draft && saved ? (
        <div style={{ display: "grid", gap: 24 }}>
          <form onSubmit={save} noValidate>
            <section className="panel" aria-labelledby={`${id}-ret`}>
              <div className="panel-h">
                <h2 className="label" id={`${id}-ret`}>
                  Durées de conservation
                </h2>
                <span className="label">En jours</span>
              </div>
              <div className="panel-b settings-grid">
                {RETENTION.map((r) => (
                  <div className="field" key={r.key}>
                    <label className="label" htmlFor={`${id}-${r.key}`}>
                      {r.label}
                    </label>
                    <input
                      id={`${id}-${r.key}`}
                      className="input"
                      inputMode="numeric"
                      value={draft[r.key]}
                      aria-invalid={problems[r.key] ? true : undefined}
                      aria-describedby={`${id}-${r.key}-help`}
                      onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                    />
                    <p className="form-hint muted" id={`${id}-${r.key}-help`}>
                      {r.help} {humanDays(draft[r.key])}
                      {saved.stored[r.key] ? "" : " · valeur par défaut, pas encore enregistrée"}
                    </p>
                    {problems[r.key] ? <p className="field-error">{problems[r.key]}</p> : null}
                  </div>
                ))}
              </div>
            </section>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={busy || Object.keys(problems).length > 0}>
                {busy ? "Enregistrement…" : "Enregistrer les durées"}
              </button>
            </div>
          </form>

          <form onSubmit={publishTerms} noValidate>
            <section className="panel" aria-labelledby={`${id}-cgu`}>
              <div className="panel-h">
                <h2 className="label" id={`${id}-cgu`}>
                  Conditions générales d’utilisation
                </h2>
                <span className="label">
                  {saved.termsVersion ? `Version en vigueur : ${saved.termsVersion}` : "Aucune version enregistrée"}
                </span>
              </div>
              <div className="panel-b" style={{ display: "grid", gap: 16, maxWidth: 640 }}>
                <p>
                  Publier une nouvelle version oblige <strong>chaque membre</strong> à relire et accepter les CGU à sa
                  prochaine ouverture de l’application, avant tout autre écran. À faire seulement après avoir mis en
                  ligne le nouveau texte sur <Link href="/cgu">la page CGU</Link>, et au moins 30 jours après l’avoir
                  annoncé (article 14.1).
                  {saved.termsUpdatedAt ? ` Dernière publication : ${fmtDateTime(saved.termsUpdatedAt)}.` : ""}
                </p>
                <div className="field">
                  <label className="label" htmlFor={`${id}-version`}>
                    Nouvelle version
                  </label>
                  <input
                    id={`${id}-version`}
                    className="input"
                    value={version}
                    maxLength={40}
                    onChange={(e) => setVersion(e.target.value)}
                    aria-describedby={`${id}-version-help`}
                  />
                  <p className="form-hint muted" id={`${id}-version-help`}>
                    Lettres, chiffres, point, tiret. Par exemple la date de la nouvelle version.
                  </p>
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${id}-confirm`}>
                    Tapez {CONFIRM_WORD} pour confirmer
                  </label>
                  <input
                    id={`${id}-confirm`}
                    className="input"
                    autoComplete="off"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={busy || !versionOk || confirm !== CONFIRM_WORD}>
                    Publier une nouvelle version des CGU
                  </button>
                </div>
              </div>
            </section>
          </form>
        </div>
      ) : null}
    </>
  );
}

import { levelLabel, type AccessTier, type SubmissionStatus } from "@sapios/shared";
import type { ProfileStatus, ReportStatus } from "./types";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const dateOnly = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
export const numberFr = new Intl.NumberFormat("fr-FR");

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : "—";
}

export function fmtDate(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso)) : "—";
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relative.format(Math.round(diff), "second");
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour");
  return relative.format(Math.round(diff / 86400), "day");
}

export function ageFrom(birthdate: string | null | undefined, at = new Date()): number | null {
  if (!birthdate) return null;
  const b = new Date(`${birthdate}T00:00:00Z`);
  let age = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

export const LEVELS: ReadonlyArray<{ level: number; label: string; detail: string }> = [
  { level: 8, label: "Bac+8", detail: "Doctorat" },
  { level: 7, label: "Bac+5", detail: "Master, ingénieur, grande école" },
  { level: 6, label: "Bac+3", detail: "Licence, BUT, licence pro, M1" },
  { level: 5, label: "Bac+2", detail: "BTS, DUT, DEUST" },
  { level: 4, label: "Bac", detail: "Baccalauréat" },
  { level: 3, label: "Niv. 3", detail: "CAP, BEP" },
  { level: 2, label: "Niv. 2", detail: "Brevet" },
  { level: 1, label: "Niv. 1", detail: "Aucun diplôme" },
];

export function levelText(level: number | null | undefined): string {
  if (level == null) return "—";
  return `${levelLabel(level)} · niv. ${level}`;
}

export const TIER_LABELS: Record<AccessTier, string> = {
  unlimited: "Illimité",
  standard: "Toléré",
  waitlist: "Liste d’attente",
  refused: "Refusé",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  needs_review: "À revoir",
  pending: "En attente",
  processing: "En analyse",
  needs_more: "À compléter",
  approved: "Validé",
  rejected: "Refusé",
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  onboarding: "Inscription",
  active: "Actif",
  paused: "En pause",
  banned: "Banni",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Ouvert",
  actioned: "Sanctionné",
  dismissed: "Classé",
};

// Motifs envoyés par l'app mobile (report_user).
export const REPORT_REASON_LABELS: Record<string, string> = {
  fake_profile: "Faux profil ou usurpation",
  fake_diploma: "Diplôme douteux",
  inappropriate_content: "Photos ou propos inappropriés",
  harassment: "Harcèlement ou menaces",
  minor: "Personne mineure",
  scam: "Arnaque ou spam",
  other: "Autre",
};

export const DEGREE_TYPE_LABELS: Record<string, string> = {
  bac: "Baccalauréat",
  bac_plus_2: "Bac+2",
  licence: "Licence",
  master: "Master",
  ingenieur: "Diplôme d’ingénieur",
  ecole_commerce: "École de commerce",
  doctorat: "Doctorat",
  autre: "Autre",
};

export function confidenceValue(c: number | string | null | undefined): number | null {
  if (c == null) return null;
  const n = typeof c === "string" ? Number.parseFloat(c) : c;
  return Number.isFinite(n) ? n : null;
}

export function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)} %`;
}

// --- Lot 2 : événements ---------------------------------------------------------------------------

const eventDay = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const eventLongDay = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});
const eventTime = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** « 19 h 30 », « 20 h ». */
export function fmtHour(iso: string): string {
  const [h, m] = eventTime.format(new Date(iso)).split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** « Jeu. 6 nov. · 19 h 30 ». */
export function fmtEventDate(iso: string): string {
  const day = eventDay.format(new Date(iso));
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${fmtHour(iso)}`;
}

/** « Jeudi 6 novembre 2026 · 19 h 30 à 22 h ». */
export function fmtEventRange(startIso: string, endIso: string): string {
  const day = eventLongDay.format(new Date(startIso));
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${fmtHour(startIso)} à ${fmtHour(endIso)}`;
}

/** Valeur d'un champ `datetime-local` (heure locale du navigateur) depuis une date ISO. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date ISO depuis un champ `datetime-local` ; null si vide ou invalide. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

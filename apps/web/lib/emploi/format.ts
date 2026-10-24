import {
  formatCandidateNumber,
  formatSalaryRange,
  levelLabel,
  studyFieldLabel,
  type DiplomaBadge,
} from "@sapios/shared";

const TZ = "Europe/Paris";
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: TZ });
const dayMonthYear = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const weekdayTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** « 31 oct. » */
export function fmtDay(iso: string | null | undefined): string {
  return iso ? dayMonth.format(new Date(iso)) : "—";
}

/** « 31 octobre 2026 » */
export function fmtLongDate(iso: string | null | undefined): string {
  return iso ? dayMonthYear.format(new Date(iso)) : "—";
}

/** « jeu. 5 nov., 9 h 30 » */
export function fmtSlot(iso: string): string {
  return weekdayTime.format(new Date(iso)).replace(/(\d{1,2}):(\d{2})/, (_, h, m) => `${h} h ${m}`).replace(" h 00", " h");
}

/** « janvier 2027 », ou « immédiatement ». */
export function fmtAvailability(date: string | null | undefined): string {
  if (!date) return "Disponible immédiatement";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return d.getTime() <= Date.now() ? "Disponible immédiatement" : `Disponible en ${monthYear.format(d)}`;
}

/** Heures restantes avant une échéance (négatif si dépassée). */
export function hoursLeft(iso: string, now = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000;
}

/** Moins de 48 h : la réponse garantie arrive à échéance. */
export function isUrgent(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  const h = hoursLeft(iso, now);
  return h >= 0 && h <= 48;
}

/** « encore 3 jours », « encore 5 h », « échue ». */
export function fmtRemaining(iso: string, now = Date.now()): string {
  const h = hoursLeft(iso, now);
  if (h < 0) return "échue";
  if (h < 24) return `encore ${Math.max(1, Math.floor(h))} h`;
  const d = Math.floor(h / 24);
  return `encore ${d} jour${d > 1 ? "s" : ""}`;
}

/** « 1 an 2 mois », « 8 mois ». */
export function fmtMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} an${y > 1 ? "s" : ""}`);
  if (m || !y) parts.push(`${m} mois`);
  return parts.join(" ");
}

/** « Bac+5 · Économie » (+ établissement s'il est montré). */
export function fmtDiploma(d: Pick<DiplomaBadge, "level" | "study_field"> & { institution?: string | null }): string {
  const field = studyFieldLabel(d.study_field);
  return [levelLabel(d.level), field, d.institution ?? null].filter(Boolean).join(" · ");
}

export const fmtNumber = formatCandidateNumber;
export const fmtSalary = (min: number | null | undefined, max: number | null | undefined, suffix = " brut/an") =>
  min != null && max != null ? formatSalaryRange(min, max, suffix) : "Salaire à renseigner";

export function fmtRemote(days: number): string {
  if (days <= 0) return "Sur site";
  if (days >= 5) return "Télétravail complet";
  return `${days} j de télétravail`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « 14:32 » aujourd'hui, « hier », sinon « 21.10 ». */
export function formatShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'hier';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** « 31 oct. » (année ajoutée si elle diffère de l'année en cours). */
export function formatShortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('fr-FR', opts);
}

/** « jeudi 5 novembre, 9 h 30 ». */
export function formatSlot(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const minutes = d.getMinutes();
  return `${day}, ${d.getHours()} h${minutes ? ` ${pad(minutes)}` : ''}`;
}

/** « janvier 2027 » depuis AAAA-MM-JJ ; null = immédiatement. */
export function formatMonth(isoDate: string | null | undefined): string {
  if (!isoDate) return 'immédiatement';
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** Jours restants avant une échéance (0 si dépassée). */
export function daysLeft(iso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

/** « 2 jours de télétravail » ; 0 = sur site. */
export function remoteLabel(days: number): string {
  if (days <= 0) return 'Sur site';
  if (days >= 5) return 'Télétravail complet';
  return `${days} jour${days > 1 ? 's' : ''} de télétravail par semaine`;
}

/** « à 4 km » ; moins d'un km : « à moins d'un km ». */
export function distanceLabel(km: number): string {
  return km < 1 ? 'à moins d’un km' : `à ${Math.round(km)} km`;
}

/** Durée en mois → « 1 an 2 mois ». */
export function monthsLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = y ? `${y} an${y > 1 ? 's' : ''}` : '';
  const rest = m ? `${m} mois` : '';
  return [years, rest].filter(Boolean).join(' ') || 'moins d’un mois';
}

/** Initiales d'une entreprise (« Maison Verte » → « MV »). */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}&\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

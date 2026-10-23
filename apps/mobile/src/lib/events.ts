import AsyncStorage from '@react-native-async-storage/async-storage';
import { EVENT_KIND_LABELS, type EventDetail, type EventSummary, type EventTicket } from '@sapios/shared';
import { File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { AppError } from './errors';

/** Les événements ont lieu à Paris : dates et heures toujours affichées à l'heure de Paris. */
const TZ = 'Europe/Paris';

function parts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

const clean = (s: string) => s.replace(/\./g, '').toUpperCase();

/** Pavé de date : « JEU », « 6 », « NOV ». */
export function dateBlock(iso: string): { weekday: string; day: string; month: string } {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return { weekday: clean(p.weekday ?? ''), day: p.day ?? '', month: clean(p.month ?? '') };
}

/** « Jeudi 6 novembre ». */
export function longDate(iso: string): string {
  const p = parts(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const weekday = p.weekday ?? '';
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${p.day} ${p.month}`;
}

/** « Jeu. 6 nov. ». */
export function shortDate(iso: string): string {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const weekday = p.weekday ?? '';
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${p.day} ${p.month}`;
}

/** « 19 h 30 », « 20 h ». */
export function hour(iso: string): string {
  const p = parts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const h = String(Number(p.hour ?? '0'));
  return p.minute && p.minute !== '00' ? `${h} h ${p.minute}` : `${h} h`;
}

export function timeRange(starts: string, ends: string): string {
  return `${hour(starts)} – ${hour(ends)}`;
}

export const kindLabel = (e: Pick<EventSummary, 'kind'>) => EVENT_KIND_LABELS[e.kind] ?? 'Événement';

export const isPast = (e: Pick<EventSummary, 'ends_at'>) => Date.parse(e.ends_at) < Date.now();
export const hasStarted = (e: Pick<EventSummary, 'starts_at'>) => Date.parse(e.starts_at) <= Date.now();
export const isFull = (e: Pick<EventSummary, 'seats_left'>) => e.seats_left <= 0;

/** Place confirmée (billet disponible). */
export const holdsSeat = (e: Pick<EventSummary, 'my_status'>) => e.my_status === 'registered' || e.my_status === 'attended';

/** Rang en liste d'attente : « 3e », « 1re ». */
export const rank = (n: number) => (n === 1 ? '1re' : `${n}e`);

/** « 8 places », « 1 place », « Complet ». */
export function seatsLabel(e: Pick<EventSummary, 'seats_left'>): string {
  if (e.seats_left <= 0) return 'Complet';
  return `${e.seats_left} place${e.seats_left > 1 ? 's' : ''}`;
}

/** Prochain événement ouvert à proposer en découverte : publié, à venir, sans place prise, non masqué. */
export function nextOpenEvent(list: EventSummary[], dismissed: Set<string>): EventSummary | null {
  return (
    [...list]
      .filter((e) => e.status === 'published' && !hasStarted(e) && !e.my_status && !dismissed.has(e.id))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
  );
}

const DISMISS_KEY = (userId: string) => `sapios.events.dismissed.${userId}`;

export async function dismissedEvents(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function dismissEvent(userId: string, id: string) {
  const current = await dismissedEvents(userId);
  current.add(id);
  await AsyncStorage.setItem(DISMISS_KEY(userId), JSON.stringify([...current].slice(-50))).catch(() => {});
}

const EVENT_ERRORS: Record<string, string> = {
  charter_required: 'Cochez la charte de conduite pour vous inscrire.',
  not_found: 'Cet événement n’existe plus.',
  event_cancelled: 'Cet événement a été annulé.',
  event_started: 'L’événement a déjà commencé.',
  paid_event_unavailable: 'Les événements payants arrivent bientôt. Celui-ci n’est pas encore ouvert.',
  not_allowed: 'Cet événement n’est pas ouvert à votre palier.',
  not_registered: 'Vous n’êtes pas inscrit·e à cet événement.',
  network: 'Connexion impossible. Vérifiez le réseau et réessayez.',
};

/** Message d'erreur propre aux événements (les codes génériques gardent leur sens ici). */
export function eventErrorMessage(error: unknown): string {
  const code = error instanceof AppError ? error.code : 'unknown';
  return EVENT_ERRORS[code] ?? 'Une erreur est survenue. Réessayez.';
}

type CalendarEvent = Pick<EventDetail, 'id' | 'title' | 'starts_at' | 'ends_at' | 'city' | 'neighbourhood'> & {
  venue_name?: string | null;
  venue_address?: string | null;
};

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

/** Fichier .ics (RFC 5545) : heures en UTC, lieu exact seulement s'il est connu (place confirmée). */
export function icsFor(e: CalendarEvent): string {
  const where = [e.venue_name, e.venue_address].filter(Boolean).join(', ') || [e.neighbourhood, e.city].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sapios//Evenements//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@sapios`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.starts_at)}`,
    `DTEND:${icsDate(e.ends_at)}`,
    `SUMMARY:${icsText(e.title)}`,
    `LOCATION:${icsText(where)}`,
    'DESCRIPTION:Sapios. Billet et adresse dans l’application.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Ajout au calendrier : téléchargement du .ics sur le web, feuille de partage sur téléphone. */
export async function addToCalendar(e: CalendarEvent) {
  const ics = icsFor(e);
  const name = `sapios-${e.id.slice(0, 8)}.ics`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(ics);
  if (!(await Sharing.isAvailableAsync())) throw new AppError('unavailable_on_web');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: e.title });
}

/** Itinéraire vers l'adresse exacte, dans l'application de cartes du téléphone ou un onglet. */
export function openDirections(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(url).catch(() => {});
}

/** Billet prêt à présenter : le code lisible par groupes de quatre. */
export function ticketDisplay(t: Pick<EventTicket, 'ticket_code'>): string {
  return t.ticket_code.replace(/(.{4})(?=.)/g, '$1 ');
}

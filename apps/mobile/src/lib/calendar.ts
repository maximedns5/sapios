import type { InterviewSlot } from '@sapios/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { AppError } from './errors';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

/** Événement iCalendar d'un entretien (aucune donnée envoyée à un service tiers). */
export function interviewIcs(slot: InterviewSlot, title: string, company: string): string {
  const start = new Date(slot.starts_at);
  const end = new Date(start.getTime() + slot.duration_min * 60_000);
  const where = slot.mode === 'visio' ? 'Visio (lien envoyé par l’entreprise)' : slot.location ?? company;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sapios//Emploi//FR',
    'BEGIN:VEVENT',
    `UID:${slot.id}@sapios`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`Entretien · ${title} · ${company}`)}`,
    `LOCATION:${escape(where)}`,
    `DESCRIPTION:${escape(slot.with_whom ? `Avec ${slot.with_whom}` : 'Entretien Sapios')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Téléchargement (web) ou feuille de partage (téléphone) du fichier .ics. */
export async function addToCalendar(slot: InterviewSlot, title: string, company: string): Promise<void> {
  const ics = interviewIcs(slot, title, company);
  const name = `entretien-${slot.starts_at.slice(0, 10)}.ics`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
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
  await file.write(ics);
  if (!(await Sharing.isAvailableAsync())) throw new AppError('unknown', 'partage indisponible');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: 'Ajouter au calendrier', UTI: 'public.calendar-event' });
}

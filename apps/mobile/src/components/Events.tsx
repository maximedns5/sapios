import type { EventDetail, EventNotice, EventSummary } from '@sapios/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { useCopy } from '@/lib/copy';
import { dateBlock, hour, isPast, kindLabel, longDate, rank, seatsLabel } from '@/lib/events';
import { alpha, colors, radius } from '@/lib/theme';
import { Button, IconButton } from './Button';
import { DateBlock } from './Community';
import { Checkbox } from './Controls';
import { AlertIcon, CameraIcon, CheckIcon, ChevronRightIcon, CrossIcon, HourglassIcon, ShieldIcon, UserIcon } from './Icons';
import { Rise, stagger } from './motion';
import { Backdrop, SheetFrame } from './Overlay';
import { Body, Small, Title } from './Text';

/** Ligne d'état d'une carte : inscrit, liste d'attente, annulé, passé, ou places restantes. */
function StatusLine({ e }: { e: EventSummary }) {
  if (e.status === 'cancelled')
    return (
      <Small size={13.5} weight="bold" color={colors.danger}>
        Annulé
      </Small>
    );
  if (e.my_status === 'registered' || e.my_status === 'attended')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CheckIcon size={15} stroke={2.8} color={colors.accent} />
        <Small size={13.5} weight="bold" color={colors.accent}>
          {isPast(e) ? 'Vous y étiez' : 'Inscrit·e · voir mon billet'}
        </Small>
      </View>
    );
  if (e.my_status === 'waitlisted')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <HourglassIcon size={15} color={colors.accent} />
        <Small size={13.5} weight="bold" color={colors.accent}>
          Liste d’attente{e.my_waitlist_rank ? `, ${rank(e.my_waitlist_rank)}` : ''}
        </Small>
      </View>
    );
  if (isPast(e)) return <Small size={13.5}>Passé</Small>;
  const taken = Math.max(0, e.capacity - e.seats_left);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, (taken / Math.max(1, e.capacity)) * 100)}%`, height: '100%', backgroundColor: e.seats_left > 0 ? colors.accent : colors.muted }} />
      </View>
      <Small size={13.5} weight="bold" color={e.seats_left > 0 ? colors.text : colors.muted}>
        {e.seats_left > 0 ? seatsLabel(e) : 'Complet · liste d’attente'}
      </Small>
    </View>
  );
}

/** Carte d'agenda : pavé de date, type et heure, titre, état. Inscrit·e : ouvre le billet. */
export function EventCard({ e, delay = 0 }: { e: EventSummary; delay?: number }) {
  const past = isPast(e) || e.status === 'cancelled';
  const d = dateBlock(e.starts_at);
  const holds = e.my_status === 'registered' || e.my_status === 'attended';
  const open = () => router.push(holds && !isPast(e) ? { pathname: '/events/[id]/ticket', params: { id: e.id } } : { pathname: '/events/[id]', params: { id: e.id } });
  return (
    <Rise delay={delay}>
      <Pressable
        testID={`event-${e.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${kindLabel(e)}, ${longDate(e.starts_at)} à ${hour(e.starts_at)}, ${e.neighbourhood ?? e.city}. ${e.title}`}
        onPress={open}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 14, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.surfaceSoft : colors.bg, opacity: past ? 0.6 : 1 })}
      >
        <DateBlock {...d} muted={past} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: past ? colors.surface : alpha(colors.accent, 0.08), borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Small size={12} weight="bold" color={past ? colors.muted : colors.accent}>
                {kindLabel(e)}
              </Small>
            </View>
            <Small size={13}>
              {hour(e.starts_at)} · {e.neighbourhood ?? e.city}
            </Small>
          </View>
          <Body weight="bold" size={16} style={{ lineHeight: 21 }}>
            {e.title}
          </Body>
          <StatusLine e={e} />
        </View>
      </Pressable>
    </Rise>
  );
}

/** Avis d'événement (place libérée, annulation), en tête de l'agenda et de la découverte. */
export function EventNoticeCard({ notice, onAck }: { notice: EventNotice; onAck: () => void }) {
  const promoted = notice.kind === 'event_promoted';
  const when = longDate(notice.payload.starts_at);
  return (
    <Animated.View exiting={FadeOut.duration(180)} testID={`event-notice-${notice.kind}`} accessibilityRole="alert" style={{ backgroundColor: promoted ? alpha(colors.accent, 0.08) : alpha(colors.danger, 0.06), borderRadius: radius.card, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {promoted ? <CheckIcon size={18} stroke={2.6} color={colors.accent} /> : <AlertIcon size={18} color={colors.danger} />}
        <Body weight="bold" size={15.5} color={promoted ? colors.accent : colors.danger} style={{ flex: 1 }}>
          {promoted ? 'Une place s’est libérée' : 'Événement annulé'}
        </Body>
      </View>
      <Body size={14.5} style={{ lineHeight: 21 }}>
        {promoted ? `Vous êtes inscrit·e à « ${notice.payload.title} », ${when.toLowerCase()}.` : `« ${notice.payload.title} », prévu ${when.toLowerCase()}, est annulé.`}
        {!promoted && notice.payload.reason ? ` ${notice.payload.reason}` : ''}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {promoted ? (
          <Button
            label="Voir mon billet"
            size="md"
            style={{ flex: 1 }}
            onPress={() => {
              onAck();
              router.push({ pathname: '/events/[id]/ticket', params: { id: notice.payload.event_id } });
            }}
          />
        ) : null}
        <Button label={promoted ? 'Plus tard' : 'J’ai compris'} size="md" variant="secondary" style={{ flex: 1 }} onPress={onAck} />
      </View>
    </Animated.View>
  );
}

/** Bandeau de la découverte : le prochain événement ouvert, masquable (le choix est retenu sur l'appareil). */
export function EventBanner({ e, onDismiss }: { e: EventSummary; onDismiss: () => void }) {
  const d = dateBlock(e.starts_at);
  const meta = [e.neighbourhood ?? e.city, e.seats_left > 0 ? seatsLabel(e) : 'complet', e.price_cents === 0 ? 'gratuit' : null].filter(Boolean).join(' · ');
  return (
    <Rise delay={150}>
      <Animated.View exiting={FadeOut.duration(180)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.accent, 0.06), borderRadius: 20, borderWidth: 1, borderColor: alpha(colors.accent, 0.14), overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.accent }} />
        <Pressable
          testID="event-banner"
          accessibilityRole="button"
          accessibilityLabel={`Événement réservé aux membres : ${e.title}, ${longDate(e.starts_at)}, ${meta}`}
          onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14 }}
        >
          <DateBlock {...d} size="sm" />
          <View style={{ flex: 1, gap: 1 }}>
            <Small size={12} weight="bold" color={colors.accent} numberOfLines={1}>
              Événement · membres
            </Small>
            <Body weight="bold" size={15} numberOfLines={1}>
              {e.title}
            </Body>
            <Small size={13} numberOfLines={1}>
              {meta}
            </Small>
          </View>
          <ChevronRightIcon size={18} color={colors.muted} />
        </Pressable>
        <IconButton testID="event-banner-dismiss" label="Masquer cet événement" variant="plain" size={44} onPress={onDismiss}>
          <CrossIcon size={16} color={colors.muted} />
        </IconButton>
      </Animated.View>
    </Rise>
  );
}

const POINTS = [
  { icon: <UserIcon size={18} color={colors.accent} />, title: 'Le respect', text: 'On débat des idées, jamais des personnes.' },
  { icon: <ShieldIcon size={18} color={colors.accent} />, title: 'Le consentement', text: 'Un non est un non. On n’insiste pas, ni sur place, ni après.' },
  { icon: <CameraIcon size={18} color={colors.accent} />, title: 'Pas de photo sans accord', text: 'Ni des personnes, ni de leur badge. Ce qui se dit sur place reste sur place.' },
  { icon: <CheckIcon size={18} stroke={2.6} color={colors.accent} />, title: 'Une personne de l’équipe sur place', text: 'Elle peut demander à quelqu’un de partir.' },
];

/**
 * Feuille d'inscription : la charte de conduite (quatre règles et le texte complet du back-office), une
 * case à cocher obligatoire, puis la confirmation. `readOnly` : simple lecture, depuis la fiche.
 */
export function CharterSheet({ event, waitlist, readOnly, onConfirm, onClose }: { event: Pick<EventDetail, 'title' | 'starts_at'>; waitlist?: boolean; readOnly?: boolean; onConfirm?: () => Promise<void>; onClose: () => void }) {
  const { t } = useCopy();
  const [checked, setChecked] = useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, justifyContent: 'flex-end' }]} testID="charter-sheet">
      <Backdrop onPress={onClose} />
      <SheetFrame>
        <View style={{ gap: 4 }}>
          <Small size={13} weight="bold" color={colors.accent} numberOfLines={1}>
            {event.title} · {longDate(event.starts_at).toLowerCase()}
          </Small>
          <Title size={26}>Charte de conduite</Title>
          <Body secondary size={15}>
            Quatre règles, pour que la soirée reste agréable pour tout le monde.
          </Body>
        </View>
        <View style={{ gap: 12 }}>
          {POINTS.map((p, i) => (
            <Rise key={p.title} delay={stagger(i, 120)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: alpha(colors.accent, 0.08), alignItems: 'center', justifyContent: 'center' }}>{p.icon}</View>
              <View style={{ flex: 1 }}>
                <Body weight="bold" size={15}>
                  {p.title}
                </Body>
                <Small size={13.5}>{p.text}</Small>
              </View>
            </Rise>
          ))}
        </View>
        <Small size={12.5} style={{ lineHeight: 18 }}>
          {t('events.charter')}
        </Small>
        {readOnly ? (
          <Button label="Fermer" variant="secondary" onPress={onClose} />
        ) : (
          <>
            <Checkbox testID="charter-accept" checked={checked} onChange={setChecked} label="J’ai lu la charte et je m’engage à la respecter." />
            <Button testID="charter-confirm" label={waitlist ? 'Rejoindre la liste d’attente' : 'Confirmer mon inscription'} disabled={!checked} onPress={() => onConfirm?.()} />
            <Button label="Annuler" variant="ghost" onPress={onClose} />
          </>
        )}
      </SheetFrame>
    </View>
  );
}

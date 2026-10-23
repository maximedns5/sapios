import type { EventDetail } from '@sapios/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Button, IconButton } from '@/components/Button';
import { ProgressBar } from '@/components/Controls';
import { CharterSheet } from '@/components/Events';
import { CalendarIcon, CapIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, PinIcon, ShareIcon, ShieldIcon, TicketIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise, Spinner, stagger } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Body, Heading, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { APP_URL } from '@/lib/env';
import { eventErrorMessage, hasStarted, holdsSeat, isPast, kindLabel, longDate, rank, timeRange } from '@/lib/events';
import { alpha, colors, radius, space } from '@/lib/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/events'));

/** Décor de la fiche : une table vue de haut, ses places en points (pleins = prises). */
function Hero({ capacity, taken }: { capacity: number; taken: number }) {
  const seats = Math.min(capacity, 24);
  const filled = Math.round((taken / Math.max(1, capacity)) * seats);
  const dots = Array.from({ length: seats }, (_, i) => {
    const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
    return { x: 195 + Math.cos(a) * 128, y: 150 + Math.sin(a) * 62, on: i < filled };
  });
  return (
    <Svg width="100%" height={260} viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
      <Rect x={0} y={0} width={390} height={300} fill={colors.accent} />
      <Circle cx={340} cy={40} r={90} fill="#FFFFFF" fillOpacity={0.08} />
      <Circle cx={30} cy={270} r={70} fill="#FFFFFF" fillOpacity={0.06} />
      <Rect x={95} y={118} width={200} height={64} rx={32} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={2} />
      <Path d="M180 150h30" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={7} fill={d.on ? '#FFFFFF' : 'none'} stroke="#FFFFFF" strokeOpacity={d.on ? 1 : 0.55} strokeWidth={1.6} />
      ))}
    </Svg>
  );
}

function InfoRow({ icon, title, sub, delay }: { icon: ReactNode; title: string; sub?: string; delay: number }) {
  return (
    <Rise delay={delay} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(colors.accent, 0.08), alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Body weight="bold" size={15.5}>
          {title}
        </Body>
        {sub ? <Small size={13.5}>{sub}</Small> : null}
      </View>
    </Rise>
  );
}

/**
 * Fiche d'un événement : date, quartier (l'adresse exacte seulement pour une place confirmée), gratuité,
 * places restantes (jamais la liste des inscrits), programme, charte. Inscription en bas d'écran.
 * Cible des emails et des notifications d'événement.
 */
export default function EventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useCopy();
  const { refresh } = useApp();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'register' | 'read' | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api
      .event(id)
      .then(setEvent)
      .catch((e) => setError(eventErrorMessage(e)));
  }, [id]);
  useFocusEffect(load);

  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 60, paddingHorizontal: space.gutter, gap: 12 }} testID="event-error">
        <Notice kind="error" title="Événement indisponible" message={error} />
        <Button label="Voir l’agenda" variant="secondary" onPress={() => router.replace('/events')} />
      </View>
    );
  if (!event)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </View>
    );

  const taken = Math.max(0, event.capacity - event.seats_left);
  const full = event.seats_left <= 0;
  const cancelled = event.status === 'cancelled';
  const over = isPast(event) || hasStarted(event);
  const seat = holdsSeat(event);
  const waiting = event.my_status === 'waitlisted';
  const paragraphs = event.description.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);

  const register = async () => {
    try {
      const res = await api.registerEvent(event.id);
      setSheet(null);
      refresh();
      router.push({ pathname: '/events/[id]/confirmed', params: { id: event.id, status: res.status, rank: res.waitlist_rank ? String(res.waitlist_rank) : '' } });
    } catch (e) {
      overlay.toast(eventErrorMessage(e));
      load();
    }
  };

  const leaveWaitlist = async () => {
    const ok = await overlay.confirm({ title: 'Quitter la liste d’attente ?', message: 'Votre rang est perdu. Vous pourrez vous réinscrire tant que l’événement n’a pas commencé.', confirm: 'Quitter la liste', cancel: 'Rester', destructive: true });
    if (!ok) return;
    try {
      await api.cancelRegistration(event.id);
      overlay.toast('Vous avez quitté la liste d’attente.');
      load();
    } catch (e) {
      overlay.toast(eventErrorMessage(e));
    }
  };

  const share = async () => {
    const url = `${APP_URL}/events/${event.id}`;
    const text = `${event.title}, ${longDate(event.starts_at).toLowerCase()}. Réservé aux membres de Sapios.`;
    if (Platform.OS === 'web') {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) await nav.share({ title: event.title, text, url }).catch(() => {});
      else {
        await navigator.clipboard?.writeText(url).catch(() => {});
        overlay.toast('Lien copié');
      }
      return;
    }
    await Share.share({ message: `${text} ${url}`, url }).catch(() => {});
  };

  let footer: ReactNode;
  if (cancelled) footer = <Notice kind="error" title="Événement annulé" message={event.cancel_reason || 'Nous en sommes désolés.'} />;
  else if (over) footer = <Button label={seat ? 'Voir mon billet' : 'Événement terminé'} variant="secondary" disabled={!seat} onPress={() => router.push({ pathname: '/events/[id]/ticket', params: { id: event.id } })} />;
  else if (seat) footer = <Button testID="event-ticket" label="Voir mon billet" icon={<TicketIcon size={20} color="#FFFFFF" />} onPress={() => router.push({ pathname: '/events/[id]/ticket', params: { id: event.id } })} />;
  else if (waiting)
    footer = (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 0.08) }}>
          <Body weight="bold" color={colors.accent}>
            Liste d’attente{event.my_waitlist_rank ? `, ${rank(event.my_waitlist_rank)}` : ''}
          </Body>
        </View>
        <Button label="Quitter la liste d’attente" variant="danger" size="md" onPress={leaveWaitlist} />
      </View>
    );
  else if (!event.can_register) footer = <Button label="Inscriptions fermées" variant="secondary" disabled />;
  else footer = <Button testID="event-register" label={full ? 'Rejoindre la liste d’attente' : 'Je m’inscris'} trailing={<ChevronRightIcon size={18} color="#FFFFFF" />} onPress={() => setSheet('register')} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="event">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ height: 240 + insets.top }}>
          <Hero capacity={event.capacity} taken={taken} />
        </View>
        <View style={{ marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.gutter, paddingTop: 24, gap: 18 }}>
          <View style={{ gap: 8 }}>
            <Rise>
              <Small size={13.5} weight="bold" color={colors.accent}>
                {kindLabel(event)}
                {event.price_cents === 0 ? ' · gratuit' : ''}
              </Small>
            </Rise>
            <MaskUp delay={80}>
              <Title size={28} accessibilityRole="header" style={{ lineHeight: 34 }}>
                {event.title}
              </Title>
            </MaskUp>
          </View>

          <View>
            <InfoRow delay={stagger(0, 160)} icon={<CalendarIcon size={19} color={colors.accent} />} title={longDate(event.starts_at)} sub={timeRange(event.starts_at, event.ends_at)} />
            <InfoRow
              delay={stagger(1, 160)}
              icon={seat ? <PinIcon size={19} color={colors.accent} /> : <LockIcon size={19} color={colors.accent} />}
              title={seat && event.venue_name ? event.venue_name : (event.neighbourhood ?? event.city)}
              sub={seat && event.venue_address ? event.venue_address : t('events.address_hidden')}
            />
            <InfoRow delay={stagger(2, 160)} icon={<ShieldIcon size={19} color={colors.accent} />} title={event.price_cents === 0 ? 'Gratuit' : 'Payant'} sub={event.kind === 'dinner' ? 'Chacun règle son repas sur place' : 'Aucun paiement dans l’application'} />
            <InfoRow delay={stagger(3, 160)} icon={<CapIcon size={19} color={colors.accent} stroke={2} />} title="Réservé aux membres admis" sub="Ceux qui ont accès à la découverte" />
          </View>

          {!cancelled && !over ? (
            <Rise delay={420} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Heading size={18}>{full ? 'Complet' : `Il reste ${event.seats_left} place${event.seats_left > 1 ? 's' : ''}`}</Heading>
                <Small size={13.5}>
                  {taken} inscrit{taken > 1 ? 's' : ''} sur {event.capacity}
                </Small>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <ProgressBar value={taken / Math.max(1, event.capacity)} label={`${taken} places prises sur ${event.capacity}`} height={8} />
              </View>
              <Small size={13}>{full && event.waitlist_count ? `${event.waitlist_count} personne${event.waitlist_count > 1 ? 's' : ''} en liste d’attente. ` : ''}{t('events.privacy')}</Small>
            </Rise>
          ) : null}

          {paragraphs.length ? (
            <Rise delay={500} style={{ gap: 10 }}>
              <Heading size={18}>Programme</Heading>
              {paragraphs.map((p, i) => (
                <Body key={i} size={15.5} style={{ lineHeight: 23 }}>
                  {p}
                </Body>
              ))}
            </Rise>
          ) : null}

          <Rise delay={560}>
            <Pressable testID="event-charter" accessibilityRole="button" onPress={() => setSheet('read')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.surfaceSoft : colors.bg })}>
              <ShieldIcon size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Body weight="bold" size={15}>
                  Charte de conduite
                </Body>
                <Small size={13.5}>Quatre règles, acceptées à l’inscription</Small>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </Pressable>
          </Rise>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: insets.bottom + space.m, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>{footer}</View>

      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton label="Retour aux événements" variant="glass" onPress={back} testID="header-back">
          <ChevronLeftIcon color="#FFFFFF" />
        </IconButton>
        <PopIn delay={300}>
          <IconButton label="Partager l’événement" variant="glass" onPress={share}>
            <ShareIcon size={20} color="#FFFFFF" />
          </IconButton>
        </PopIn>
      </View>

      {sheet ? <CharterSheet event={event} waitlist={full} readOnly={sheet === 'read'} onConfirm={register} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

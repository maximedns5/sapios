import type { EventDetail, EventTicket } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { Ticket, TicketFact } from '@/components/Community';
import { CalendarIcon, CrossIcon, ReplayIcon, TicketIcon } from '@/components/Icons';
import { haptic, MaskUp, Rise, Sparks, useJolt, useReplay } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { addToCalendar, eventErrorMessage, hour, kindLabel, longDate, rank, ticketDisplay } from '@/lib/events';
import { alpha, colors, ease, radius, space } from '@/lib/theme';

const close = () => router.replace('/events');

/** Le billet sort de la fente, se pose ; le tampon tombe dessus (« INSCRIT·E » ou « EN ATTENTE »). */
function Printed({ event, ticket, waitlist, onLand }: { event: EventDetail; ticket: EventTicket | null; waitlist: boolean; onLand: () => void }) {
  const reduced = useReducedMotion();
  const out = useSharedValue(reduced ? 1 : 0);
  const stamp = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    out.value = withDelay(250, withSequence(withTiming(0.62, { duration: 520, easing: ease.out }), withTiming(0.6, { duration: 120 }), withTiming(1, { duration: 520, easing: ease.out })));
    stamp.value = withDelay(1450, withTiming(1, { duration: 420, easing: ease.in }));
    const timer = setTimeout(onLand, 1450 + 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ticketStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (out.value - 1) * 340 }] }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: stamp.value > 0 ? 1 : 0, transform: [{ rotate: '-12deg' }, { scale: 2.6 - 1.6 * stamp.value }] }));
  return (
    <View style={{ alignItems: 'center' }}>
      {/* La fente de l'imprimante : le billet en sort. */}
      <View style={{ width: '88%', height: 14, borderRadius: 7, backgroundColor: colors.text, zIndex: 2 }} />
      <View style={{ width: '100%', overflow: 'hidden', marginTop: -6, paddingHorizontal: '9%', paddingBottom: 40 }}>
        <Animated.View style={ticketStyle}>
          <Ticket
            testID="confirmed-ticket"
            eyebrow={`SAPIOS · ${kindLabel(event).toUpperCase()}`}
            title={event.title}
            notch={colors.bg}
            style={{ boxShadow: '0px 10px 24px rgba(26,25,24,0.10)' }}
            info={
              <View style={{ gap: 2 }}>
                <Small size={14}>
                  {longDate(event.starts_at)} · {hour(event.starts_at)}
                </Small>
                <Small size={14}>{event.neighbourhood ?? event.city}</Small>
              </View>
            }
            footer={<TicketFact label="Billet" value={ticket ? ticketDisplay(ticket) : waitlist ? 'Liste d’attente' : '…'} />}
          />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: -16, bottom: 18, borderWidth: 3, borderColor: colors.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.94)' }, stampStyle]}>
            <Body weight="extrabold" size={17} color={colors.accent} style={{ letterSpacing: 1.2, lineHeight: 22 }}>
              {waitlist ? 'EN ATTENTE' : 'INSCRIT·E'}
            </Body>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Inscription confirmée : le billet s'imprime et le tampon tombe, avec quelques étincelles. Complet : le
 * même billet, tamponné « en attente », et le rang.
 */
export default function Confirmed() {
  const { id, status, rank: rankParam } = useLocalSearchParams<{ id: string; status?: string; rank?: string }>();
  const insets = useSafeAreaInsets();
  const { toast } = useOverlay();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [ticket, setTicket] = useState<EventTicket | null>(null);
  const [key, replay] = useReplay();
  const [sparks, setSparks] = useState(0);
  const { style: joltStyle, trigger: jolt } = useJolt(4);
  const waitlist = status === 'waitlisted';
  const position = Number(rankParam) || null;

  useEffect(() => {
    if (!id) return;
    api.event(id).then(setEvent).catch((e) => toast(eventErrorMessage(e)));
    if (!waitlist) api.ticket(id).then(setTicket).catch(() => {});
  }, [id, toast, waitlist]);

  const onLand = () => {
    jolt();
    if (!waitlist) {
      setSparks((k) => k + 1);
      haptic.success();
    } else haptic.light();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 56, paddingBottom: insets.bottom + space.l, paddingHorizontal: space.gutter }} testID={`event-confirmed-${waitlist ? 'waitlist' : 'registered'}`}>
      <View style={{ position: 'absolute', top: insets.top + 8, right: 12, flexDirection: 'row', gap: 8, zIndex: 5 }}>
        <IconButton label="Rejouer l’animation" onPress={replay}>
          <ReplayIcon size={20} />
        </IconButton>
        <IconButton label="Fermer" onPress={close} testID="confirmed-close">
          <CrossIcon size={20} />
        </IconButton>
      </View>

      {event ? (
        <Animated.View key={key} style={joltStyle}>
          <Printed event={event} ticket={ticket} waitlist={waitlist} onLand={onLand} />
          {!waitlist ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '55%', height: 0, alignItems: 'center' }}>
              <View style={{ width: 0, height: 0 }}>
                <Sparks playKey={sparks} radius={70} />
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={{ height: 260 }} />
      )}

      <View key={`t${key}`} style={{ gap: 10, marginTop: 8 }}>
        <MaskUp delay={1700}>
          <Title size={34}>{waitlist ? 'Complet.' : 'C’est noté.'}</Title>
        </MaskUp>
        <Rise delay={1850}>
          <Body secondary size={16.5}>
            {waitlist
              ? `Vous êtes ${position ? rank(position) : 'inscrit·e'} sur la liste d’attente. On vous prévient si une place se libère.`
              : 'Votre place est réservée. L’adresse exacte et votre billet vous attendent dans l’application.'}
          </Body>
        </Rise>
      </View>

      <View style={{ flex: 1 }} />

      <Rise delay={2000} style={{ gap: 8 }}>
        {waitlist ? (
          <Button testID="confirmed-back" label="Retour aux événements" onPress={close} />
        ) : (
          <>
            <Button testID="confirmed-ticket-open" label="Voir mon billet" icon={<TicketIcon size={20} color="#FFFFFF" />} onPress={() => router.replace({ pathname: '/events/[id]/ticket', params: { id } })} />
            {event ? (
              <Button
                label="Ajouter au calendrier"
                variant="secondary"
                icon={<CalendarIcon size={19} />}
                onPress={() => addToCalendar(event).catch(() => toast('Ajout au calendrier impossible sur cet appareil.'))}
              />
            ) : null}
          </>
        )}
        <View style={{ alignSelf: 'center', backgroundColor: alpha(colors.accent, 0.06), borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 }}>
          <Small size={12.5}>La liste des inscrits n’est jamais publiée.</Small>
        </View>
      </Rise>
    </View>
  );
}

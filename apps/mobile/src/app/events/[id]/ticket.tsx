import type { EventTicket } from '@sapios/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Ticket, TicketFact } from '@/components/Community';
import { QrCode } from '@/components/QrCode';
import { CalendarIcon, CheckIcon, LockIcon, PinIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Small } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { addToCalendar, eventErrorMessage, hasStarted, hour, kindLabel, openDirections, shortDate, ticketDisplay } from '@/lib/events';
import { alpha, colors, radius } from '@/lib/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/events'));

/**
 * Billet : QR code du code de billet (pointage à l'entrée), adresse exacte révélée aux inscrits, ajout au
 * calendrier, itinéraire. Annuler libère la place pour la première personne de la liste d'attente.
 */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useApp();
  const overlay = useOverlay();
  const [ticket, setTicket] = useState<EventTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setError(null);
      api
        .ticket(id)
        .then(setTicket)
        .catch((e) => setError(eventErrorMessage(e)));
    }, [id]),
  );

  const cancel = async () => {
    if (!ticket) return;
    const ok = await overlay.confirm({
      label: 'Annulation',
      title: 'Annuler votre place ?',
      message: 'Elle revient aussitôt à la première personne de la liste d’attente. Vous pourrez vous réinscrire s’il reste de la place.',
      confirm: 'Annuler ma place',
      cancel: 'Garder ma place',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.cancelRegistration(ticket.event.id);
      refresh();
      overlay.toast('Place libérée. Merci pour la personne suivante.');
      router.replace('/events');
    } catch (e) {
      overlay.toast(eventErrorMessage(e));
    }
  };

  const e = ticket?.event;
  const address = e ? [e.venue_name, e.venue_address].filter(Boolean).join(', ') : '';
  const started = e ? hasStarted(e) : false;

  return (
    <Screen scroll testID="ticket" header={<Header onBack={back} backLabel="Retour aux événements" title="Votre billet" />}>
      <View style={{ gap: 18, paddingTop: 6 }}>
        {error ? <Notice kind="error" title="Billet indisponible" message={error} /> : null}
        {!ticket && !error ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <Spinner />
          </View>
        ) : null}

        {ticket && e ? (
          <>
            <Rise duration={600} distance={24}>
              <Ticket
                eyebrow={`SAPIOS · ${kindLabel(e).toUpperCase()}`}
                title={e.title}
                info={
                  <View style={{ flexDirection: 'row', gap: 22, marginTop: 6 }}>
                    <TicketFact label="Date" value={shortDate(e.starts_at)} />
                    <TicketFact label="Accueil" value={hour(e.starts_at)} />
                    <TicketFact label="Places" value="1" />
                  </View>
                }
                footer={
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <QrCode value={ticket.ticket_code} size={176} label={`QR code du billet ${ticket.ticket_code}`} />
                    <Body weight="extrabold" size={20} style={{ letterSpacing: 2 }} selectable testID="ticket-code">
                      {ticketDisplay(ticket)}
                    </Body>
                    {ticket.checked_in_at ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CheckIcon size={15} stroke={2.8} color={colors.accent} />
                        <Small size={13.5} weight="bold" color={colors.accent}>
                          Pointé·e à l’entrée
                        </Small>
                      </View>
                    ) : (
                      <Small size={13} align="center">
                        À présenter à l’entrée. Un billet par personne, à votre nom.
                      </Small>
                    )}
                  </View>
                }
              />
            </Rise>

            <Rise delay={250} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LockIcon size={15} color={colors.accent} />
                <Small size={12} weight="bold" color={colors.accent} style={{ letterSpacing: 1.2 }}>
                  ADRESSE RÉVÉLÉE AUX INSCRITS
                </Small>
              </View>
              <MaskUp delay={420}>
                <View style={{ gap: 2 }}>
                  <Body weight="bold" size={17}>
                    {e.venue_name ?? e.neighbourhood ?? e.city}
                  </Body>
                  {e.venue_address ? (
                    <Body size={15} selectable testID="ticket-address">
                      {e.venue_address}
                    </Body>
                  ) : null}
                </View>
              </MaskUp>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Button
                  label="Calendrier"
                  size="md"
                  variant="inverse"
                  icon={<CalendarIcon size={18} />}
                  style={{ flex: 1 }}
                  onPress={() => addToCalendar(e).catch(() => overlay.toast('Ajout au calendrier impossible sur cet appareil.'))}
                />
                {address ? <Button label="Itinéraire" size="md" variant="inverse" icon={<PinIcon size={18} />} style={{ flex: 1 }} onPress={() => openDirections(address)} /> : null}
              </View>
            </Rise>

            <Rise delay={350} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: radius.card, backgroundColor: alpha(colors.accent, 0.06) }}>
              <Body size={14.5} style={{ flex: 1, lineHeight: 21 }}>
                Une personne de l’équipe Sapios vous accueille à l’entrée. Un problème pendant la soirée ? C’est à elle qu’il faut le dire.
              </Body>
            </Rise>

            {!started ? <Button testID="ticket-cancel" label="Annuler mon inscription" variant="danger" onPress={cancel} /> : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

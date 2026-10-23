import { EVENT_KIND_LABELS, type EventKind, type EventNotice, type EventSummary } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Chip, ChipRow } from '@/components/Controls';
import { EventCard, EventNoticeCard } from '@/components/Events';
import { CalendarIcon } from '@/components/Icons';
import { MaskUp, Rise, stagger } from '@/components/motion';
import { FeedSkeleton } from '@/components/FeedStates';
import { Notice } from '@/components/Notice';
import { Header, Screen } from '@/components/Screen';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { eventErrorMessage, isPast } from '@/lib/events';
import { alpha, colors } from '@/lib/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/feed'));

/**
 * Agenda des événements : à venir d'abord (filtre par type), puis les événements passés, grisés. Jamais
 * la liste des inscrits ; seulement les places restantes. Les avis (place libérée, annulation) en tête.
 */
export default function Agenda() {
  const { state, refresh } = useApp();
  const { t } = useCopy();
  const [list, setList] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<EventKind | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      setError(null);
      api
        .events()
        .then(setList)
        .catch((e) => setError(eventErrorMessage(e)));
    }, []),
  );

  const notices = (state?.notices ?? []).filter((n): n is EventNotice => n.kind === 'event_promoted' || n.kind === 'event_cancelled');
  const kinds = useMemo(() => [...new Set((list ?? []).filter((e) => !isPast(e)).map((e) => e.kind))], [list]);
  const upcoming = (list ?? [])
    .filter((e) => !isPast(e) && (kind === 'all' || e.kind === kind))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = (list ?? []).filter((e) => isPast(e)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  return (
    <Screen scroll testID="events" header={<Header onBack={back} backLabel="Retour à la découverte" />}>
      <View style={{ gap: 18, paddingTop: 4 }}>
        <View style={{ gap: 8 }}>
          <MaskUp>
            <Title size={34} accessibilityRole="header">
              {t('events.title')}
            </Title>
          </MaskUp>
          <Rise delay={120}>
            <Body secondary size={16}>
              {t('events.lead')}
            </Body>
          </Rise>
        </View>

        {notices.map((n) => (
          <EventNoticeCard
            key={n.id}
            notice={n}
            onAck={() => {
              api.ackNotice(n.id).then(() => refresh()).catch(() => {});
            }}
          />
        ))}

        {kinds.length > 1 ? (
          <Rise delay={200}>
            <ChipRow>
              <Chip label="Tous" active={kind === 'all'} onPress={() => setKind('all')} radio />
              {kinds.map((k) => (
                <Chip key={k} label={EVENT_KIND_LABELS[k]} active={kind === k} onPress={() => setKind(k)} radio />
              ))}
            </ChipRow>
          </Rise>
        ) : null}

        {error ? <Notice kind="error" message={error} /> : null}
        {!list && !error ? <FeedSkeleton /> : null}

        {list && upcoming.length === 0 ? (
          <Rise delay={200} style={{ alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: alpha(colors.accent, 0.08), alignItems: 'center', justifyContent: 'center' }}>
              <CalendarIcon size={28} color={colors.accent} />
            </View>
            <Body secondary align="center">
              {t('events.empty')}
            </Body>
          </Rise>
        ) : null}

        <View style={{ gap: 12 }}>
          {upcoming.map((e, i) => (
            <EventCard key={e.id} e={e} delay={stagger(i, 220)} />
          ))}
        </View>

        {past.length ? (
          <View style={{ gap: 12, marginTop: 6 }}>
            <Small weight="bold" size={14}>
              Passés
            </Small>
            {past.slice(0, 5).map((e, i) => (
              <EventCard key={e.id} e={e} delay={stagger(i, 320)} />
            ))}
          </View>
        ) : null}

        {list ? (
          <Small size={13} align="center" style={{ marginTop: 8 }}>
            {t('events.privacy')}
          </Small>
        ) : null}
      </View>
    </Screen>
  );
}

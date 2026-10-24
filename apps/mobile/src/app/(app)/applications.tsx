import { CLOSED_STATUSES, formatSalaryRange, MATCHED_STATUSES, OPEN_STATUSES, type Invitation, type MyApplication } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnonymityLine, ClosedNoResponse, DueBar, StatusChip } from '@/components/ApplicationBits';
import { Button, TextLink } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { Chip } from '@/components/Controls';
import { FeedSkeleton, LoadError } from '@/components/FeedStates';
import { CalendarIcon, ChatIcon, ChevronRightIcon, MailIcon } from '@/components/Icons';
import { Rise, stagger } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Body, Heading, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatShortDate, formatSlot } from '@/lib/format';
import { openChat, openOffer } from '@/lib/nav';
import { alpha, colors, radius, space } from '@/lib/theme';
import type { AnyNotice } from '@/lib/types';

type Filter = 'all' | 'open' | 'interview' | 'closed';

const has = (list: readonly string[], status: string) => list.includes(status);

function inFilter(a: MyApplication, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'open') return has(OPEN_STATUSES, a.status) || a.status === 'interested';
  if (f === 'interview') return a.status === 'interview' || a.status === 'offer_made';
  return has(CLOSED_STATUSES, a.status);
}

/** Avis à lire en tête de liste (refus, clôture, créneaux proposés). */
function NoticeLine({ notice, onOpen, onAck }: { notice: AnyNotice; onOpen: () => void; onAck: () => void }) {
  const text =
    notice.kind === 'application_rejected'
      ? `${notice.payload.company_name} a répondu à votre candidature « ${notice.payload.offer_title} ».`
      : notice.kind === 'application_closed'
        ? `« ${notice.payload.offer_title} » : pas de réponse de ${notice.payload.company_name} dans le délai promis.`
        : notice.kind === 'interview_proposed'
          ? `${notice.payload.company_name} vous propose des créneaux d’entretien.`
          : null;
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: alpha(colors.accent, 0.07), borderRadius: 18, paddingLeft: 14, paddingRight: 6, paddingVertical: 8 }}>
      <Body size={14.5} style={{ flex: 1, lineHeight: 20 }}>
        {text}
      </Body>
      <TextLink label="Voir" color={colors.accent} size={14} onPress={onOpen} />
      <TextLink label="OK" color={colors.muted} size={14} onPress={onAck} />
    </View>
  );
}

function InvitationCard({ inv, onDone }: { inv: Invitation; onDone: () => void }) {
  const { toast } = useOverlay();
  const respond = async (accept: boolean) => {
    try {
      const res = await emploi.respondInvitation(inv.id, accept);
      onDone();
      if (accept) openOffer(res.offer_id);
      else toast('Invitation déclinée. L’entreprise n’en saura pas plus.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  return (
    <View testID="invitation" style={{ borderWidth: 2, borderColor: colors.accent, borderRadius: radius.card, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MailIcon size={17} color={colors.accent} />
        <Small weight="bold" color={colors.accent}>
          Invitation à postuler
        </Small>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <CompanyLogo name={inv.company.display_name} size={44} />
        <View style={{ flex: 1 }}>
          <Body weight="bold" size={16}>
            {inv.offer.title}
          </Body>
          <Small>
            {inv.company.display_name} · {inv.offer.city} · {formatSalaryRange(inv.offer.salary_min_k, inv.offer.salary_max_k, '')}
          </Small>
        </View>
      </View>
      <Body size={14.5} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12, lineHeight: 21 }}>
        « {inv.message} »
      </Body>
      <Small>L’entreprise a vu votre CV anonyme, rien d’autre. Postuler reste votre décision.</Small>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button testID="invitation-decline" label="Décliner" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => respond(false)} />
        <Button testID="invitation-accept" label="Voir l’offre" size="md" style={{ flex: 1 }} onPress={() => respond(true)} />
      </View>
    </View>
  );
}

/** Une candidature : statut, compte à rebours de la réponse garantie, entretien, réponse ou clôture. */
function ApplicationCard({ app, index = 0 }: { app: MyApplication; index?: number }) {
  const matched = has(MATCHED_STATUSES, app.status);
  const closed = has(CLOSED_STATUSES, app.status);
  return (
    <Rise delay={stagger(index, 0, 60)}>
      <Pressable
        testID={`application-${app.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${app.offer.title}, ${app.company.display_name}`}
        onPress={() => router.push({ pathname: '/applications/[id]', params: { id: app.id } })}
      >
        {({ pressed }) => (
          <View style={{ borderWidth: matched ? 2 : 1, borderColor: matched ? colors.accent : colors.line, borderRadius: radius.card, padding: 16, gap: 12, backgroundColor: pressed ? colors.surfaceSoft : colors.bg }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <CompanyLogo name={app.company.display_name} size={46} muted={closed} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body weight="bold" size={16} color={closed ? colors.secondary : colors.text} numberOfLines={2}>
                  {app.offer.title}
                </Body>
                <Small size={13.5}>
                  {app.company.display_name} · {app.offer.city} · {formatSalaryRange(app.offer.salary_min_k, app.offer.salary_max_k, '')}
                </Small>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </View>
            <StatusChip status={app.status} testID="application-status" />
            {app.interview ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                <CalendarIcon size={15} color="#FFFFFF" />
                <Small weight="bold" color="#FFFFFF">
                  Entretien {formatSlot(app.interview.starts_at)}
                </Small>
              </View>
            ) : null}
            {matched && app.slots_to_answer > 0 ? (
              <Small weight="bold" color={colors.accent}>
                {app.slots_to_answer} créneau{app.slots_to_answer > 1 ? 'x' : ''} d’entretien à choisir
              </Small>
            ) : null}
            <DueBar app={app} />
            {app.status === 'rejected' ? (
              <View style={{ gap: 10 }}>
                {app.refusal_message ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 6 }}>
                    <Body size={14.5} style={{ lineHeight: 21 }}>
                      « {app.refusal_message} »
                    </Body>
                    <Small size={13}>
                      {app.company.display_name}
                      {app.closed_at ? `, le ${formatShortDate(app.closed_at)}` : ''}
                    </Small>
                  </View>
                ) : null}
                <AnonymityLine text={`Votre CV reste anonyme : ${app.company.display_name} n’a jamais vu votre nom.`} />
              </View>
            ) : null}
            {app.status === 'closed_no_response' ? <ClosedNoResponse company={app.company.display_name} dueAt={app.due_at} /> : null}
            {matched ? (
              <Pressable testID="application-chat" accessibilityRole="button" onPress={() => openChat(app.id)}>
                {({ pressed }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? colors.line : colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <ChatIcon size={18} color={colors.accent} />
                    <Body weight="semibold" size={14.5} style={{ flex: 1 }}>
                      Conversation avec {app.company.display_name}
                    </Body>
                    {app.unread_messages ? (
                      <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                        <Small size={12} weight="bold" color="#FFFFFF">
                          {app.unread_messages}
                        </Small>
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </Pressable>
    </Rise>
  );
}

/** Mes candidatures : invitations, avis, filtres, et chaque candidature avec sa réponse garantie. */
export default function Applications() {
  const { state, refresh } = useApp();
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<MyApplication[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [failure, setFailure] = useState<{ network: boolean; message: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const [list, invs] = await Promise.all([emploi.applications(), emploi.invitations().catch(() => [] as Invitation[])]);
      setApps(list);
      setInvitations(invs.filter((i) => i.status === 'sent'));
      setFailure(null);
    } catch (e) {
      setFailure({ network: errorCode(e) === 'network', message: errorMessage(e) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const notices = (state?.notices ?? []).filter((n) => n.kind === 'application_rejected' || n.kind === 'application_closed' || n.kind === 'interview_proposed');
  const ack = (id: string) => api.ackNotice(id).then(() => refresh()).catch(() => {});
  const list = apps ?? [];
  const interviews = list.filter((a) => a.interview && new Date(a.interview.starts_at) > new Date()).length;
  const counts: Record<Filter, number> = {
    all: list.length,
    open: list.filter((a) => inFilter(a, 'open')).length,
    interview: list.filter((a) => inFilter(a, 'interview')).length,
    closed: list.filter((a) => inFilter(a, 'closed')).length,
  };
  const shown = list.filter((a) => inFilter(a, filter));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="applications">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: space.xl, gap: 14 }}>
        <View style={{ gap: 2 }}>
          <Title size={30}>Candidatures</Title>
          {apps ? (
            <Small size={14}>
              {list.length} candidature{list.length > 1 ? 's' : ''}
              {interviews ? ` · ${interviews} entretien${interviews > 1 ? 's' : ''} à venir` : ''}
            </Small>
          ) : null}
        </View>

        {notices.map((n) => (
          <NoticeLine
            key={n.id}
            notice={n}
            onAck={() => ack(n.id)}
            onOpen={() => {
              ack(n.id);
              const appId = 'application_id' in n.payload ? n.payload.application_id : null;
              if (!appId) return;
              if (n.kind === 'interview_proposed') openChat(appId);
              else router.push({ pathname: '/applications/[id]', params: { id: appId } });
            }}
          />
        ))}

        {invitations.length ? (
          <View style={{ gap: 10 }}>
            <Heading size={17}>Invitations</Heading>
            {invitations.map((inv) => (
              <InvitationCard key={inv.id} inv={inv} onDone={() => load().then(() => refresh())} />
            ))}
          </View>
        ) : null}

        {failure && !apps ? (
          <LoadError network={failure.network} message={failure.message} onRetry={load} />
        ) : !apps ? (
          <FeedSkeleton />
        ) : list.length === 0 ? (
          <View style={{ gap: 12, paddingTop: 24, alignItems: 'center' }} testID="applications-empty">
            <Title size={24} align="center">
              Aucune candidature pour l’instant
            </Title>
            <Body secondary align="center">
              Chaque offre affiche son salaire et son délai de réponse garanti. Postulez en un geste, avec votre CV anonyme.
            </Body>
            <Button label="Voir les offres" onPress={() => router.navigate('/offers')} />
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: 8 }}>
              {(
                [
                  ['all', 'Toutes'],
                  ['open', 'En cours'],
                  ['interview', 'Entretiens'],
                  ['closed', 'Terminées'],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <Chip key={key} testID={`filter-${key}`} radio label={`${label} · ${counts[key]}`} active={filter === key} onPress={() => setFilter(key)} />
              ))}
            </ScrollView>
            {shown.map((a, i) => (
              <ApplicationCard key={a.id} app={a} index={i} />
            ))}
            {shown.length === 0 ? <Small align="center">Rien dans ce filtre.</Small> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

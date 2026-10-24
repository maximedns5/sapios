import { CLOSED_STATUSES, formatSalaryRange, MATCHED_STATUSES, OPEN_STATUSES, REFUSAL_REASON_LABELS, type MyApplicationDetail } from '@sapios/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AnonymityLine, ClosedNoResponse, DueBar, SlotRow, StatusChip } from '@/components/ApplicationBits';
import { Button, TextLink } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { LoadError } from '@/components/FeedStates';
import { CheckIcon, ChatIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatShortDate } from '@/lib/format';
import { back, openChat, openOffer } from '@/lib/nav';
import { colors, radius } from '@/lib/theme';

const STEPS = [
  { key: 'sent', label: 'Envoyée' },
  { key: 'seen', label: 'Vue' },
  { key: 'interested', label: 'Intéressé·e' },
  { key: 'interview', label: 'Entretien' },
] as const;

function progressIndex(status: string): number {
  if (status === 'interview' || status === 'offer_made' || status === 'hired') return 3;
  if (status === 'interested') return 2;
  if (status === 'seen') return 1;
  return 0;
}

/** Étapes d'une candidature : barres pleines jusqu'au statut atteint (closes : grisées). */
function Timeline({ status }: { status: string }) {
  const closed = (CLOSED_STATUSES as readonly string[]).includes(status) && status !== 'hired';
  const at = progressIndex(status);
  return (
    <View role="list" accessibilityLabel="Étapes de la candidature" style={{ flexDirection: 'row', gap: 4 }}>
      {STEPS.map((s, i) => {
        const done = i <= at && !closed;
        return (
          <View key={s.key} role="listitem" style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: done ? colors.accent : colors.line }} />
            <Small size={12} weight={i === at && !closed ? 'bold' : 'semibold'} color={done ? colors.text : colors.muted}>
              {s.label}
            </Small>
          </View>
        );
      })}
    </View>
  );
}

/** Détail d'une candidature (lien des emails : /applications/<id>). */
export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useApp();
  const { confirm, toast } = useOverlay();
  const [app, setApp] = useState<MyApplicationDetail | null>(null);
  const [failure, setFailure] = useState<{ network: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setApp(await emploi.application(id));
      setFailure(null);
    } catch (e) {
      setFailure({ network: errorCode(e) === 'network', message: errorMessage(e) });
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = <Header onBack={() => back('/applications')} title="Candidature" />;
  if (!app) {
    return <Screen header={header}>{failure ? <LoadError network={failure.network} message={failure.message} onRetry={load} /> : <Spinner />}</Screen>;
  }

  const matched = (MATCHED_STATUSES as readonly string[]).includes(app.status);
  const open = (OPEN_STATUSES as readonly string[]).includes(app.status);
  const toAnswer = app.slots.filter((s) => s.status === 'proposed');
  const accepted = app.slots.find((s) => s.status === 'accepted');

  const withdraw = async () => {
    const ok = await confirm({
      title: 'Retirer votre candidature ?',
      message: `${app.company.display_name} ne la verra plus. Vous ne pourrez pas repostuler à cette offre.`,
      confirm: 'Retirer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await emploi.withdraw(app.id);
      await Promise.all([load(), refresh()]);
      toast('Candidature retirée.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      header={header}
      testID="application-detail"
      footer={
        matched ? (
          <Button testID="detail-chat" label={toAnswer.length ? 'Choisir un créneau' : `Écrire à ${app.recruiter?.first_name ?? app.company.display_name}`} onPress={() => openChat(app.id)} icon={<ChatIcon size={18} color="#FFFFFF" />} />
        ) : undefined
      }
    >
      <View style={{ gap: 20, paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <CompanyLogo name={app.company.display_name} size={52} />
          <View style={{ flex: 1 }}>
            <MaskUp>
              <Title size={24}>{app.offer.title}</Title>
            </MaskUp>
            <Small size={14}>
              {app.company.display_name} · {app.offer.city} · {formatSalaryRange(app.offer.salary_min_k, app.offer.salary_max_k, '')}
            </Small>
          </View>
        </View>
        <StatusChip status={app.status} />
        <Timeline status={app.status} />
        <DueBar app={app} />

        {accepted ? (
          <Rise style={{ gap: 8 }}>
            <Heading size={17}>Votre entretien</Heading>
            <SlotRow slot={accepted} />
            <TextLink label="Préparer l’entretien →" color={colors.accent} onPress={() => router.push({ pathname: '/interview/[id]', params: { id: app.id } })} />
          </Rise>
        ) : null}

        {toAnswer.length ? (
          <Rise style={{ gap: 8 }}>
            <Heading size={17}>Créneaux proposés</Heading>
            {toAnswer.map((s) => (
              <SlotRow key={s.id} slot={s} />
            ))}
            <Small>Choisissez-en un dans la conversation.</Small>
          </Rise>
        ) : null}

        {app.status === 'rejected' ? (
          <View style={{ gap: 10 }}>
            {app.refusal_message ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, padding: 14, gap: 6 }}>
                <Body size={15} style={{ lineHeight: 22 }}>
                  « {app.refusal_message} »
                </Body>
                <Small>
                  {app.refusal_reason ? `${REFUSAL_REASON_LABELS[app.refusal_reason]} · ` : ''}
                  {app.closed_at ? formatShortDate(app.closed_at) : ''}
                </Small>
              </View>
            ) : null}
            <AnonymityLine text={`Votre CV reste anonyme : ${app.company.display_name} n’a jamais vu votre nom.`} />
          </View>
        ) : null}
        {app.status === 'closed_no_response' ? <ClosedNoResponse company={app.company.display_name} dueAt={app.due_at} /> : null}
        {app.status === 'hired' ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, padding: 14 }}>
            <CheckIcon size={20} color={colors.accent} />
            <Body weight="bold" style={{ flex: 1 }}>
              Félicitations. Bon début chez {app.company.display_name}.
            </Body>
          </View>
        ) : null}

        {app.note || app.note_target_label ? (
          <View style={{ gap: 8 }}>
            <Heading size={17}>Votre mot</Heading>
            {app.note_target_label ? (
              <View style={{ borderLeftWidth: 3, borderColor: colors.accent, paddingLeft: 12 }}>
                <Small size={13.5}>En réponse à « {app.note_target_label} »</Small>
              </View>
            ) : null}
            {app.note ? (
              <Body size={15} style={{ alignSelf: 'flex-start', maxWidth: '90%', backgroundColor: colors.accent, color: '#FFFFFF', borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                {app.note}
              </Body>
            ) : null}
          </View>
        ) : null}

        {matched && app.recruiter ? (
          <Small>
            Votre interlocuteur : {app.recruiter.first_name ? `${app.recruiter.first_name}, ` : ''}
            {app.recruiter.job_title}
          </Small>
        ) : null}

        <View style={{ gap: 4, alignItems: 'flex-start' }}>
          <TextLink label="Revoir l’offre" color={colors.accent} onPress={() => openOffer(app.offer.id)} />
          {open ? <TextLink testID="withdraw" label="Retirer ma candidature" color={colors.danger} onPress={withdraw} /> : null}
          <Small size={13}>Envoyée le {formatShortDate(app.created_at)}{app.seen_at ? ` · vue le ${formatShortDate(app.seen_at)}` : ''}</Small>
        </View>
      </View>
    </Screen>
  );
}

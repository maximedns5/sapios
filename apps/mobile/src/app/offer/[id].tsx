import { CONTRACT_LABELS, EXPERIENCE_BAND_LABELS, formatSalaryRange, type OfferDetail } from '@sapios/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { StatusChip } from '@/components/ApplicationBits';
import { Button, IconButton, TextLink } from '@/components/Button';
import { CompanyLine } from '@/components/Company';
import { LoadError } from '@/components/FeedStates';
import { BriefcaseIcon, CalendarIcon, ChatIcon, FlagIcon, HomeIcon, PinIcon, SendIcon, UserIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { InfoLine, Matches } from '@/components/OfferCard';
import { OfferPhotos } from '@/components/OfferPhotos';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { distanceLabel, formatShortDate, remoteLabel } from '@/lib/format';
import { back } from '@/lib/nav';
import { alpha, colors, radius } from '@/lib/theme';

/** Point de l'offre avec « Répondre à ce point » : ouvre la candidature avec ce point cité. */
function Point({ text, onReply, testID, index }: { text: string; onReply?: () => void; testID?: string; index?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: colors.line }}>
      {index != null ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          <Small weight="extrabold" color={colors.text}>
            {index + 1}
          </Small>
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 4 }}>
        <Body size={15.5} style={{ lineHeight: 22 }}>
          {text}
        </Body>
        {onReply ? (
          <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`Répondre à ce point : ${text}`} onPress={onReply} hitSlop={8}>
            {({ pressed }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 }}>
                <ChatIcon size={15} color={colors.accent} />
                <Small weight="bold" color={colors.accent}>
                  Répondre à ce point
                </Small>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Heading size={18}>{title}</Heading>
      {children}
    </View>
  );
}

/**
 * Offre complète : photos (lieu, manager, équipe), salaire, missions, critères, équipe, déroulé du
 * recrutement. Chaque point peut recevoir une réponse ; « Postuler » reste en bas de l'écran.
 */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [failure, setFailure] = useState<{ network: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setOffer(await emploi.offer(id));
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

  const apply = (target?: string) => {
    if (offer) router.push({ pathname: '/apply/[id]', params: { id: offer.id, title: offer.title, company: offer.company.display_name, ...(target ? { target } : {}) } });
  };
  const canReply = !!offer?.can_apply;

  const header = (
    <Header
      onBack={() => back('/offers')}
      title={offer?.company.display_name}
      right={
        offer ? (
          <IconButton testID="offer-report" label="Signaler cette offre" onPress={() => router.push({ pathname: '/report/[offerId]', params: { offerId: offer.id, title: offer.title } })}>
            <FlagIcon size={19} />
          </IconButton>
        ) : null
      }
    />
  );

  if (!offer) {
    return (
      <Screen header={header} testID="offer-loading">
        {failure ? <LoadError network={failure.network} message={failure.message} onRetry={load} /> : <Spinner />}
      </Screen>
    );
  }

  const footer = offer.my_application ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Small>Votre candidature</Small>
        <StatusChip status={offer.my_application.status} />
      </View>
      <Button
        label="Suivre"
        variant="secondary"
        size="md"
        onPress={() => router.push({ pathname: '/applications/[id]', params: { id: offer.my_application!.id } })}
      />
    </View>
  ) : offer.can_apply ? (
    <Button testID="offer-apply" label="Postuler" onPress={() => apply()} icon={<SendIcon size={18} color="#FFFFFF" />} />
  ) : (
    <Small align="center">Cette offre n’accepte plus de candidatures.</Small>
  );

  return (
    <Screen scroll header={header} footer={footer} testID="offer" contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}>
      <OfferPhotos photos={offer.photos} company={offer.company.display_name} height={280} />
      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 22 }}>
        <View style={{ gap: 12 }}>
          <MaskUp>
            <Title size={28}>{offer.title}</Title>
          </MaskUp>
          <Pressable accessibilityRole="link" accessibilityLabel={`Page de l’entreprise ${offer.company.display_name}`} onPress={() => router.push({ pathname: '/company/[id]', params: { id: offer.company.id } })}>
            <CompanyLine name={offer.company.display_name} verified={offer.company.verified} sub={offer.company.headcount_band ? `${offer.company.headcount_band} salariés` : offer.company.naf_label} />
          </Pressable>
          <View style={{ alignSelf: 'flex-start', backgroundColor: alpha(colors.accent, 0.08), borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Body weight="extrabold" size={22} color={colors.accent}>
              {formatSalaryRange(offer.salary_min_k, offer.salary_max_k)}
            </Body>
          </View>
          <View style={{ gap: 8 }}>
            <InfoLine icon={<PinIcon size={18} color={colors.muted} />} text={`${offer.address_label ?? offer.city} · ${distanceLabel(offer.distance_km)}`} />
            <InfoLine icon={<HomeIcon size={18} color={colors.muted} />} text={remoteLabel(offer.remote_days)} />
            <InfoLine icon={<BriefcaseIcon size={18} color={colors.muted} />} text={`${CONTRACT_LABELS[offer.contract]}${offer.start_label ? ` · ${offer.start_label}` : ''} · ${EXPERIENCE_BAND_LABELS[offer.experience_band]} d’expérience`} />
            <InfoLine icon={<CalendarIcon size={18} color={colors.muted} />} text={`Publiée le ${formatShortDate(offer.published_at)} · jusqu’au ${formatShortDate(offer.expires_at)}`} />
          </View>
          <Matches matches={offer.matches} />
        </View>

        <Rise delay={120}>
          <Section title="Les missions">
            {offer.missions.map((m, i) => (
              <Point key={i} index={i} text={m} testID={`reply-mission-${i}`} onReply={canReply ? () => apply(`mission:${i}`) : undefined} />
            ))}
          </Section>
        </Rise>

        <Rise delay={180}>
          <Section title="Le profil recherché">
            {offer.must_have.map((m, i) => (
              <Point key={`must-${i}`} text={`Indispensable : ${m}`} testID={`reply-must-${i}`} onReply={canReply ? () => apply(`must:${i}`) : undefined} />
            ))}
            {offer.nice_to_have.map((m, i) => (
              <Point key={`nice-${i}`} text={`Apprécié : ${m}`} testID={`reply-nice-${i}`} onReply={canReply ? () => apply(`nice:${i}`) : undefined} />
            ))}
            {offer.language_justification ? <Small>Pourquoi la langue est demandée : {offer.language_justification}</Small> : null}
          </Section>
        </Rise>

        {offer.team_description || offer.manager_name ? (
          <Rise delay={220}>
            <Section title="L’équipe">
              {offer.manager_name ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <UserIcon size={18} color={colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body weight="bold" size={15}>
                      {offer.manager_name}
                    </Body>
                    {offer.manager_title ? <Small>{offer.manager_title}, votre futur·e manager</Small> : null}
                  </View>
                </View>
              ) : null}
              {offer.team_description ? <Point text={offer.team_description} testID="reply-team" onReply={canReply ? () => apply('team') : undefined} /> : null}
            </Section>
          </Rise>
        ) : null}

        <Rise delay={260}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 8 }}>
            <Heading size={18}>Le recrutement</Heading>
            <Body size={15.5}>
              {offer.interviews_count} entretien{offer.interviews_count > 1 ? 's' : ''} · réponse garantie sous {offer.response_days} jours
            </Body>
            <Small>Votre CV reste anonyme jusqu’à ce que l’entreprise se dise intéressée. Sans réponse à temps, votre candidature est close et le retard compte dans le délai affiché de l’entreprise.</Small>
            {canReply ? <TextLink testID="reply-process" label="Répondre à ce point" color={colors.accent} onPress={() => apply('process')} /> : null}
          </View>
        </Rise>

        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <TextLink
            testID="offer-report-link"
            label="Signaler cette offre"
            color={colors.muted}
            size={14}
            onPress={() => router.push({ pathname: '/report/[offerId]', params: { offerId: offer.id, title: offer.title } })}
          />
        </View>
      </View>
    </Screen>
  );
}

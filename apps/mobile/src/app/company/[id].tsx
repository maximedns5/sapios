import { CONTRACT_LABELS, formatSalaryRange, type CompanyPage } from '@sapios/shared';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { TextLink } from '@/components/Button';
import { CompanyLine } from '@/components/Company';
import { LoadError } from '@/components/FeedStates';
import { ChevronRightIcon, ClockIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner, stagger } from '@/components/motion';
import { OfferPhotos } from '@/components/OfferPhotos';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatShortDate, headcountFigure } from '@/lib/format';
import { back, openOffer } from '@/lib/nav';
import { colors, radius } from '@/lib/theme';

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 2 }}>
      <Body weight="extrabold" size={19}>
        {value}
      </Body>
      <Small size={13}>{label}</Small>
    </View>
  );
}

/** Page entreprise : photos réelles, entreprise vérifiée, délai de réponse, offres ouvertes. */
export default function Company() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirm, toast } = useOverlay();
  const [page, setPage] = useState<CompanyPage | null>(null);
  const [failure, setFailure] = useState<{ network: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setPage(await emploi.company(id));
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

  const header = <Header onBack={() => back('/offers')} title={page?.display_name} />;
  if (!page) return <Screen header={header}>{failure ? <LoadError network={failure.network} message={failure.message} onRetry={load} /> : <Spinner />}</Screen>;

  const block = async () => {
    const ok = await confirm({
      title: `Masquer votre profil à ${page.display_name} ?`,
      message: 'Elle ne vous verra plus dans l’approche directe et ne pourra pas vous inviter. Vos candidatures déjà envoyées ne changent pas.',
      confirm: 'Masquer',
    });
    if (!ok) return;
    try {
      await emploi.blockCompany(page.id);
      toast(`Profil masqué à ${page.display_name}.`);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen scroll header={header} testID="company" contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}>
      {page.photos.length ? <OfferPhotos photos={page.photos} company={page.display_name} height={240} /> : null}
      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 20 }}>
        <View style={{ gap: 12 }}>
          <MaskUp>
            <Title size={30}>{page.display_name}</Title>
          </MaskUp>
          <CompanyLine name={page.display_name} verified={page.verified} sub={page.verified ? 'SIREN contrôlé par Sapios' : null} />
          {page.description ? (
            <Body size={15.5} style={{ lineHeight: 23 }}>
              {page.description}
            </Body>
          ) : null}
          {page.website ? <Small>{page.website.replace(/^https?:\/\//, '')}</Small> : null}
        </View>

        <Rise delay={120} style={{ flexDirection: 'row', gap: 10 }}>
          {page.headcount_band ? <Figure value={headcountFigure(page.headcount_band)} label="salariés" /> : null}
          {page.city ? <Figure value={page.city} label="siège" /> : null}
        </Rise>
        {page.naf_label ? <Small>Activité : {page.naf_label}</Small> : null}

        <Rise delay={180} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ClockIcon size={18} color={colors.accent} />
            <Heading size={16}>Comment nous recrutons</Heading>
          </View>
          <Body size={15}>
            {page.avg_response_days != null
              ? `Délai de réponse moyen : ${page.avg_response_days.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} jour${page.avg_response_days >= 2 ? 's' : ''}.`
              : 'Pas encore assez de candidatures pour un délai moyen.'}
          </Body>
          <Small>Chaque offre garantit une réponse dans un délai affiché. Les retards sont comptés ici.</Small>
        </Rise>

        <View style={{ gap: 10 }}>
          <Heading size={18}>Offres ouvertes</Heading>
          {page.offers.length ? (
            page.offers.map((o, i) => (
              <Rise key={o.id} delay={stagger(i, 220, 60)}>
                <Pressable testID={`company-offer-${o.id}`} accessibilityRole="button" onPress={() => openOffer(o.id)}>
                  {({ pressed }) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 14, backgroundColor: pressed ? colors.surface : colors.bg }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Body weight="bold" size={15.5}>
                          {o.title}
                        </Body>
                        <Small size={13.5}>
                          {CONTRACT_LABELS[o.contract]} · {o.city} · {formatSalaryRange(o.salary_min_k, o.salary_max_k, '')} · publiée le {formatShortDate(o.published_at)}
                        </Small>
                      </View>
                      <ChevronRightIcon size={18} color={colors.muted} />
                    </View>
                  )}
                </Pressable>
              </Rise>
            ))
          ) : (
            <Small>Aucune offre ouverte pour l’instant.</Small>
          )}
        </View>

        <View style={{ alignItems: 'center', paddingBottom: 12 }}>
          <TextLink testID="company-block" label="Masquer mon profil à cette entreprise" color={colors.muted} size={14} onPress={block} />
        </View>
      </View>
    </Screen>
  );
}

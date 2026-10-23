import { SAFETY_TIPS, type SafetyTip } from '@sapios/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AlertIcon, FlagIcon, PinIcon, ShieldIcon, SparkIcon, UserIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { Header, Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Text';
import { useCopy } from '@/lib/copy';
import { alpha, colors, radius } from '@/lib/theme';

const ICONS: Record<SafetyTip, ReactNode> = {
  public: <PinIcon size={18} color={colors.accent} />,
  friend: <UserIcon size={18} color={colors.accent} />,
  transport: <ShieldIcon size={18} color={colors.accent} />,
  money: <AlertIcon size={18} color={colors.accent} />,
  instinct: <SparkIcon size={18} color={colors.accent} />,
  report: <FlagIcon size={18} color={colors.accent} />,
};

/** Conseils de sécurité avant un premier rendez-vous (CGU art. 13.2), depuis « Mon profil ». */
export default function Safety() {
  const { t } = useCopy();
  return (
    <Screen scroll testID="safety" header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />}>
      <View style={{ gap: 18, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>{t('safety.title')}</Title>
        </MaskUp>
        <Rise delay={120}>
          <Body secondary>{t('safety.lead')}</Body>
        </Rise>
        <View style={{ gap: 10 }}>
          {SAFETY_TIPS.map((tip, i) => (
            <Rise key={tip} delay={180 + i * 60} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: alpha(colors.accent, 0.1), alignItems: 'center', justifyContent: 'center' }}>{ICONS[tip]}</View>
              <Body size={15.5} style={{ flex: 1, lineHeight: 22, paddingTop: 7 }} testID={`safety-tip-${tip}`}>
                {t(`safety.tip.${tip}`)}
              </Body>
            </Rise>
          ))}
        </View>
      </View>
    </Screen>
  );
}

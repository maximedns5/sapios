import { formatCandidateNumber, type MyApplicationDetail } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { BriefcaseIcon, LockIcon, ReplayIcon } from '@/components/Icons';
import { Confetti, haptic, MaskUp, PopIn, Rise, Shockwave, useReplay } from '@/components/motion';
import { Body, Small, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { useLayout } from '@/lib/layout';
import { openChat } from '@/lib/nav';
import { colors, ease, fonts } from '@/lib/theme';

const CARD_W = 140;
const CARD_H = 184;

/** Fond d'accent révélé en cercle. */
function Reveal({ width, height }: { width: number; height: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withTiming(1, { duration: 750, easing: ease.inOut });
  }, [p, reduced]);
  const size = Math.hypot(width, height) * 2;
  const style = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, left: width / 2 - size / 2, top: height * 0.4 - size / 2, backgroundColor: colors.accent }, style]}
    />
  );
}

/** Carte qui arrive de côté avec un ressort et se pose de biais. */
function FlyingCard({ side, delay, children }: { side: -1 | 1; delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withTiming(1, { duration: 900, easing: ease.spring }));
  }, [delay, p, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.8),
    transform: [{ translateX: (1 - p.value) * 240 * side }, { rotate: `${side * (7 + (1 - p.value) * 22)}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { width: CARD_W, height: CARD_H, borderRadius: 22, borderWidth: 4, borderColor: '#FFFFFF', overflow: 'hidden', backgroundColor: '#FFFFFF', boxShadow: '0px 18px 40px rgba(0,0,0,0.25)', marginRight: side < 0 ? -24 : 0 },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Le CV anonyme se retourne : « n° 0427 » devient votre nom, celui que l'entreprise découvre. */
function FlipFace({ number, name, delay }: { number: number; name: string; delay: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withTiming(1, { duration: 700, easing: ease.inOut }));
  }, [delay, p, reduced]);
  const squeeze = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.abs(interpolate(p.value, [0, 0.5, 1], [1, 0, 1])) }] }));
  const front = useAnimatedStyle(() => ({ opacity: p.value < 0.5 ? 1 : 0 }));
  const backFace = useAnimatedStyle(() => ({ opacity: p.value >= 0.5 ? 1 : 0 }));
  return (
    <Animated.View style={[{ flex: 1 }, squeeze]}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 }, front]}>
        <LockIcon size={26} color={colors.muted} />
        <Body weight="extrabold" size={17} color={colors.text}>
          {formatCandidateNumber(number)}
        </Body>
        <Small size={12.5} align="center" color={colors.muted}>
          CV anonyme
        </Small>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 }, backFace]}>
        <Body size={44} color={colors.accent} style={{ fontFamily: fonts.extrabold, lineHeight: 52 }}>
          {name.trim().charAt(0).toUpperCase() || '·'}
        </Body>
        <Body weight="extrabold" size={16} align="center" numberOfLines={2} color={colors.text}>
          {name}
        </Body>
        <Small size={12.5} align="center" color={colors.muted}>
          Nom révélé
        </Small>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * C'est un match : l'entreprise s'est dite intéressée. Le fond d'accent se déploie, le CV anonyme et l'offre
 * se rejoignent, le CV se retourne sur votre nom, onde de choc et confettis. Puis : choisir un créneau ou écrire.
 */
export default function MatchScreen() {
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const { state, markSeen, refresh } = useApp();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { columnWidth } = useLayout();
  const [app, setApp] = useState<MyApplicationDetail | null>(null);
  const [name, setName] = useState('');
  const [key, replay] = useReplay();

  useEffect(() => {
    emploi.application(id).then(setApp).catch(() => {});
    emploi
      .myIdentity()
      .then((i) => i && setName(`${i.first_name} ${i.last_name}`))
      .catch(() => {});
    if (notice) {
      markSeen(`match:${notice}`);
      api.ackNotice(notice).then(() => refresh()).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, notice]);

  useEffect(() => {
    const timer = setTimeout(() => haptic.success(), 1500);
    return () => clearTimeout(timer);
  }, [key]);

  const company = app?.company.display_name ?? 'L’entreprise';
  const recruiter = app?.recruiter?.first_name;
  const hasSlots = !!app?.slots.some((s) => s.status === 'proposed');
  const cardsTop = insets.top + 90;
  const center = cardsTop + CARD_H;
  const later = () => (router.canGoBack() ? router.back() : router.replace('/applications'));

  return (
    <ToneProvider tone="accent">
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: colors.bg, overflow: 'hidden' }} testID="match">
        <View key={key} style={{ flex: 1 }}>
          <Reveal width={columnWidth} height={height} />

          <View style={{ position: 'absolute', top: cardsTop, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <FlyingCard side={-1} delay={300}>
              <FlipFace number={state?.candidate?.number ?? 0} name={name || 'Vous'} delay={1250} />
            </FlyingCard>
            <FlyingCard side={1} delay={380}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 }}>
                <CompanyLogo name={company} size={56} />
                <Body weight="extrabold" size={15} align="center" numberOfLines={2} color={colors.text}>
                  {company}
                </Body>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <BriefcaseIcon size={13} color={colors.muted} />
                  <Small size={12.5} numberOfLines={1} color={colors.muted}>
                    {app?.offer.title ?? ''}
                  </Small>
                </View>
              </View>
            </FlyingCard>
          </View>

          <View pointerEvents="none" style={{ position: 'absolute', top: center - 60, left: columnWidth / 2 - 60, width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Shockwave size={120} delay={1450} />
          </View>
          <Confetti x={columnWidth / 2} y={center} delay={1450} />

          <View style={{ position: 'absolute', top: center + 40, left: 24, right: 24, bottom: insets.bottom + 28, alignItems: 'center', gap: 10 }}>
            <MaskUp delay={1500}>
              <Title size={40} align="center" color="#FFFFFF">
                C’est un match.
              </Title>
            </MaskUp>
            <Rise delay={1650}>
              <Body size={17} align="center" color="rgba(255,255,255,0.92)">
                {company} veut vous rencontrer. L’entreprise découvre votre nom, et la conversation s’ouvre.
              </Body>
            </Rise>
            <View style={{ flex: 1 }} />
            <Rise delay={1800} style={{ alignSelf: 'stretch', gap: 8 }}>
              <Pressable testID="match-slots" accessibilityRole="button" onPress={() => openChat(id, { replace: true })}>
                {({ pressed }) => (
                  <View style={{ minHeight: 56, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1 }}>
                    <Body weight="bold" size={16} color={colors.accent}>
                      {hasSlots ? 'Choisir un créneau' : recruiter ? `Écrire à ${recruiter}` : `Écrire à ${company}`}
                    </Body>
                  </View>
                )}
              </Pressable>
              <PopIn delay={1950}>
                <Pressable testID="match-later" accessibilityRole="button" onPress={later} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Body weight="bold" size={15} color="#FFFFFF">
                    Plus tard
                  </Body>
                </Pressable>
              </PopIn>
            </Rise>
          </View>

          <Rise delay={2100} style={{ position: 'absolute', top: insets.top + 14, right: 14 }}>
            <IconButton label="Rejouer l’animation" variant="glass" onPress={replay}>
              <ReplayIcon size={20} color="#FFFFFF" />
            </IconButton>
          </Rise>
        </View>
      </View>
    </ToneProvider>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { ArrowRightIcon, HeartIcon, ReplayIcon } from '@/components/Icons';
import { Confetti, haptic, Heartbeat, MaskUp, PopIn, Rise, Shockwave, useReplay } from '@/components/motion';
import { Photo, useSignedUrls } from '@/components/Photo';
import { Body, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { noteOwnMatch, useInbox } from '@/lib/inbox';
import { useLayout } from '@/lib/layout';
import { openChat } from '@/lib/nav';
import { loadPhotos } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors, ease, fonts } from '@/lib/theme';

const CARD_W = 136;
const CARD_H = 180;

/** Fond d'accent révélé en cercle depuis le haut de l'écran. */
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

/** Portrait qui arrive de côté avec un ressort et se pose de biais. */
function FlyingCard({ side, delay, children }: { side: -1 | 1; delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withTiming(1, { duration: 900, easing: ease.spring }));
  }, [delay, p, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.8),
    transform: [{ translateX: (1 - p.value) * 240 * side }, { rotate: `${side * (8 + (1 - p.value) * 22)}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { width: CARD_W, height: CARD_H, borderRadius: 22, borderWidth: 4, borderColor: '#FFFFFF', overflow: 'hidden', backgroundColor: colors.photo, boxShadow: '0px 18px 40px rgba(0,0,0,0.25)', marginRight: side < 0 ? -26 : 0 },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * C'est un match : le fond d'accent se déploie, les deux portraits se rejoignent, le cœur éclate (onde de
 * choc, confettis), le titre monte, puis le premier message. Bouton pour rejouer la scène.
 */
export default function MatchScreen() {
  const params = useLocalSearchParams<{ matchId: string; name?: string; photo?: string }>();
  const { userId } = useApp();
  const { markOpened } = useInbox();
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { columnWidth } = useLayout();
  const [name, setName] = useState(params.name ?? '');
  const [otherPhoto, setOtherPhoto] = useState<string | null>(params.photo || null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const urls = useSignedUrls([otherPhoto, myPhoto].filter((p): p is string => !!p));
  const [key, replay] = useReplay();

  useEffect(() => {
    if (params.matchId) {
      noteOwnMatch(params.matchId);
      markOpened(params.matchId);
    }
    if (userId) loadPhotos(userId).then((list) => setMyPhoto(list[0]?.storage_path ?? null)).catch(() => {});
    if (!params.name) {
      api
        .matches()
        .then((rows) => {
          const m = rows.find((r) => r.match_id === params.matchId);
          if (m) {
            setName(m.display_name);
            setOtherPhoto(m.photo_path);
          }
        })
        .catch(() => {});
    }
  }, [markOpened, params.matchId, params.name, userId]);

  useEffect(() => {
    const timer = setTimeout(() => haptic.success(), 760);
    return () => clearTimeout(timer);
  }, [key]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId || !params.matchId) {
      openChat(params.matchId, { replace: true });
      return;
    }
    setSending(true);
    const { error } = await supabase.from('messages').insert({ match_id: params.matchId, sender_id: userId, body });
    setSending(false);
    // En cas d'échec, la conversation s'ouvre avec le brouillon perdu : on le garde plutôt ici.
    if (error) return;
    openChat(params.matchId, { replace: true });
  };

  const cardsTop = insets.top + 96;
  const heartCenter = cardsTop + CARD_H;
  const later = () => (router.canGoBack() ? router.back() : router.replace('/feed'));

  return (
    <ToneProvider tone="accent">
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: colors.bg, overflow: 'hidden' }} testID="match">
        <View key={key} style={{ flex: 1 }}>
          <Reveal width={columnWidth} height={height} />

          <View style={{ position: 'absolute', top: cardsTop, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <FlyingCard side={-1} delay={300}>
              <Photo path={myPhoto} url={myPhoto ? urls[myPhoto] : ''} name="Vous" initialSize={56} style={{ flex: 1 }} />
            </FlyingCard>
            <FlyingCard side={1} delay={360}>
              <Photo path={otherPhoto} url={otherPhoto ? urls[otherPhoto] : ''} name={name || '?'} initialSize={56} style={{ flex: 1 }} />
            </FlyingCard>
          </View>

          <View pointerEvents="none" style={{ position: 'absolute', top: heartCenter - 60, left: columnWidth / 2 - 60, width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Shockwave size={120} delay={800} />
          </View>
          <Confetti x={columnWidth / 2} y={heartCenter} />
          <View pointerEvents="none" style={{ position: 'absolute', top: heartCenter - 30, left: columnWidth / 2 - 30 }}>
            <PopIn delay={720} duration={550} overshoot={1.28}>
              <Heartbeat delay={1800}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 24px rgba(0,0,0,0.25)' }}>
                  <HeartIcon size={28} color={colors.accent} filled />
                </View>
              </Heartbeat>
            </PopIn>
          </View>

          <View style={{ position: 'absolute', top: heartCenter + 50, left: 24, right: 24, bottom: insets.bottom + 28, alignItems: 'center', gap: 10 }}>
            <MaskUp delay={950}>
              <Title size={40} align="center" color="#FFFFFF">
                C’est un match !
              </Title>
            </MaskUp>
            <Rise delay={1150}>
              <Body size={17} align="center" color="rgba(255,255,255,0.92)">
                {name ? `${name} et vous. ${t('match.title')}` : t('match.title')}
              </Body>
            </Rise>
            <View style={{ flex: 1 }} />
            <Rise delay={1350} style={{ alignSelf: 'stretch' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 999, paddingLeft: 18, paddingRight: 6, paddingVertical: 6 }}>
                <TextInput
                  testID="match-message"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={name ? `Écrire à ${name}…` : 'Votre premier message…'}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Premier message"
                  maxLength={2000}
                  onSubmitEditing={send}
                  style={[{ flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: 10 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                />
                <Pressable testID="match-write" accessibilityRole="button" accessibilityLabel={draft.trim() ? 'Envoyer' : 'Ouvrir la conversation'} onPress={send} disabled={sending}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}>
                    <ArrowRightIcon size={20} color="#FFFFFF" stroke={2.4} />
                  </View>
                </Pressable>
              </View>
            </Rise>
            <Rise delay={1500}>
              <Pressable testID="match-later" accessibilityRole="button" onPress={later} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Body weight="bold" size={15} color="#FFFFFF">
                  Continuer à découvrir
                </Body>
              </Pressable>
            </Rise>
          </View>

          <Rise delay={1700} style={{ position: 'absolute', top: insets.top + 14, right: 14 }}>
            <IconButton label="Rejouer l’animation" variant="glass" onPress={replay}>
              <ReplayIcon size={20} color="#FFFFFF" />
            </IconButton>
          </Rise>
        </View>
      </View>
    </ToneProvider>
  );
}

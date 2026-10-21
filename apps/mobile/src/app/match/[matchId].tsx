import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/Button';
import { Photo, useSignedUrls } from '@/components/Photo';
import { Reveal } from '@/components/Reveal';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { Volet } from '@/components/Volet';
import { useShake } from '@/components/motion';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { splitTitle, useCopy } from '@/lib/copy';
import { noteOwnMatch, useInbox } from '@/lib/inbox';
import { openChat } from '@/lib/nav';
import { loadPhotos } from '@/lib/profile';
import { ease, INK, PAPER, space } from '@/lib/theme';

/** Match : animation plein écran, les deux portraits se rejoignent, titre révélé par masque. */
export default function MatchScreen() {
  const params = useLocalSearchParams<{ matchId: string; name?: string; photo?: string }>();
  const { userId } = useApp();
  const { markOpened } = useInbox();
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [name, setName] = useState(params.name ?? '');
  const [otherPhoto, setOtherPhoto] = useState<string | null>(params.photo || null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const urls = useSignedUrls([otherPhoto, myPhoto].filter((p): p is string => !!p));
  const { style: shakeStyle, trigger } = useShake(0.25);

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

  const left = useSharedValue(0);
  const right = useSharedValue(0);
  useEffect(() => {
    left.value = withDelay(450, withTiming(1, { duration: 900, easing: ease.expoOut }));
    right.value = withDelay(520, withTiming(1, { duration: 900, easing: ease.expoOut }));
    const timer = setTimeout(trigger, 1150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = Math.min(width, 560);
  const cardW = Math.min(150, (w - space.gutter * 2) * 0.42);
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - left.value) * -w }, { rotate: `${-7 + (1 - left.value) * -12}deg` }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - right.value) * w }, { rotate: `${6 + (1 - right.value) * 12}deg` }],
  }));

  const [l1, l2] = splitTitle(t('match.title'));

  return (
    <ToneProvider tone="dark">
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: INK }} testID="match">
        <Animated.View style={[{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: space.gutter }, shakeStyle]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Reveal delay={300}>
              <Label>C’est un match</Label>
            </Reveal>
            <Reveal delay={360}>
              <Label>N° {(params.matchId ?? '').slice(0, 4).toUpperCase()}</Label>
            </Reveal>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', height: cardW * 1.35 + 30, alignItems: 'center' }}>
              <Animated.View style={[{ marginRight: -18, zIndex: 1 }, leftStyle]}>
                <View style={{ backgroundColor: PAPER, padding: 5 }}>
                  <Photo path={myPhoto} url={myPhoto ? urls[myPhoto] : ''} name="Vous" monogramSize={56} caption={false} style={{ width: cardW, height: cardW * 1.25 }} />
                  <Label size={8.5} color={INK} style={{ marginTop: 5 }}>
                    Vous
                  </Label>
                </View>
              </Animated.View>
              <Animated.View style={[{ zIndex: 2 }, rightStyle]}>
                <View style={{ backgroundColor: PAPER, padding: 5 }}>
                  <Photo path={otherPhoto} url={otherPhoto ? urls[otherPhoto] : ''} name={name || '?'} monogramSize={56} caption={false} style={{ width: cardW, height: cardW * 1.25 }} />
                  <Label size={8.5} color={INK} style={{ marginTop: 5, textAlign: 'right' }} numberOfLines={1}>
                    {name || '—'}
                  </Label>
                </View>
              </Animated.View>
            </View>

            <View style={{ alignItems: 'center', marginTop: 28 }}>
              <Reveal delay={1000}>
                <Title size={40} style={{ textAlign: 'center' }}>
                  {l1}
                </Title>
              </Reveal>
              <Reveal delay={1080}>
                <Title size={40} style={{ textAlign: 'center' }}>
                  <Em>{l2}</Em>
                </Title>
              </Reveal>
              <Reveal delay={1250}>
                <Body style={{ textAlign: 'center', marginTop: 14, opacity: 0.8 }}>
                  {name ? `${name} et vous vous êtes mutuellement trouvés à la hauteur.` : 'Vous vous êtes mutuellement trouvés à la hauteur.'}
                </Body>
              </Reveal>
            </View>
          </View>

          <Reveal delay={1450}>
            <View style={{ gap: 10 }}>
              <Button testID="match-write" label={name ? `Écrire à ${name}` : 'Écrire'} trailing="→" onPress={() => openChat(params.matchId, { replace: true })} />
              <Button testID="match-later" label="Continuer la découverte" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
            </View>
          </Reveal>
        </Animated.View>
        <Volet color={PAPER} direction="up" duration={700} />
      </View>
    </ToneProvider>
  );
}

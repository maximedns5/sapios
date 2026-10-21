import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { ClipReveal } from '@/components/ClipReveal';
import { ScanCard, type DiplomaContent } from '@/components/DiplomaCard';
import { Reveal } from '@/components/Reveal';
import { ScanLog } from '@/components/ScanLog';
import { Screen } from '@/components/Screen';
import { Em, Label, Mono, Strong, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { Volet } from '@/components/Volet';
import { useApp } from '@/lib/app-state';
import { splitTitle, useCopy } from '@/lib/copy';
import { loadLegalName } from '@/lib/profile';
import { alpha, ease, INK, PAPER } from '@/lib/theme';

// Chronologie (ms), calquée sur la scène 02 de la vidéo, ralentie pour être lisible au téléphone.
const T = { title: 200, card: 300, progress: 500, scan: 1000, scanDuration: 1500, panel: 2900, cta: 3500 };

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** « Analyse du profil » : carte de diplôme, barre de scan, pourcentage, journaux, puis statut en revue. */
export default function Analysis() {
  const { t } = useCopy();
  const { userId } = useApp();
  const reduced = useReducedMotion();
  const { submission = '', kind = 'image' } = useLocalSearchParams<{ submission: string; kind: string }>();
  const [legal, setLegal] = useState<string | null>(null);
  const [pct, setPct] = useState(reduced ? 100 : 0);
  const [done, setDone] = useState(!!reduced);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (userId) loadLegalName(userId).then(setLegal);
  }, [userId]);

  // Pourcentage 000 % → 100 % (power1.inOut).
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = Date.now() + T.scan;
    const tick = () => {
      const k = Math.min(Math.max((Date.now() - t0) / T.scanDuration, 0), 1);
      setPct(Math.round(easeInOutQuad(k) * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setTimeout(() => setDone(true), T.cta);
    // Le statut final apparaît en bas : on l'amène à l'écran sur les petits téléphones.
    const scroll = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), T.panel + 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(scroll);
    };
  }, [reduced]);

  const card = useSharedValue(reduced ? 1 : 0);
  const prog = useSharedValue(reduced ? 1 : 0);
  const bar = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    card.value = withDelay(T.card, withTiming(1, { duration: 900, easing: ease.expoOut }));
    prog.value = withDelay(T.progress, withTiming(1, { duration: 600, easing: ease.expoOut }));
    bar.value = withDelay(T.scan, withTiming(1, { duration: T.scanDuration, easing: ease.power2InOut }));
  }, [bar, card, prog, reduced]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - card.value) * 620 }, { rotate: `${(1 - card.value) * 8}deg` }],
  }));
  const progStyle = useAnimatedStyle(() => ({ opacity: prog.value, transform: [{ translateY: (1 - prog.value) * 12 }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: bar.value }] }));

  const [line1, line2] = splitTitle(t('scan.title'));
  const content = useMemo<DiplomaContent>(
    () => ({
      issuer: 'Sapios · Comité d’admission',
      number: `N° ${submission.slice(0, 4).toUpperCase() || '0042'}-${kind === 'pdf' ? 'P' : 'I'}`,
      kicker: 'Document soumis',
      degree: 'DIPLÔME',
      lines: [`Titulaire : ${legal ?? '—'}`, 'Mention : en attente'],
      seal: 'S·A·P',
      signatory: 'Le comité d’admission',
    }),
    [kind, legal, submission],
  );

  return (
    <Screen
      scroll
      scrollRef={scroller}
      overlay={<Volet color={INK} direction="up" duration={600} />}
      testID="analysis"
      header={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, height: 52, alignItems: 'center' }}>
          <Reveal delay={260} duration={600}>
            <Label>Étape 01 / 01</Label>
          </Reveal>
          <Reveal delay={320} duration={600}>
            <Label>Vérification obligatoire</Label>
          </Reveal>
        </View>
      }
    >
      <View style={{ gap: 14, paddingBottom: 8 }}>
        <View>
          <Reveal delay={T.title}>
            <Title size={40}>{line1}</Title>
          </Reveal>
          <Reveal delay={T.title + 80}>
            <Title size={40}>
              <Em>{line2}</Em>
            </Title>
          </Reveal>
        </View>

        <Animated.View style={cardStyle}>
          <ScanCard content={content} delay={T.scan} />
        </Animated.View>

        <Animated.View style={progStyle}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Label>{t('scan.title')}</Label>
            <Mono size={22} testID="scan-pct">
              {String(pct).padStart(3, '0')}%
            </Mono>
          </View>
          <View style={{ height: 3, marginTop: 8, backgroundColor: alpha(INK, 0.12) }}>
            <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: INK, transformOrigin: 'left' }, barStyle]} />
          </View>
        </Animated.View>

        <ScanLog
          start={T.scan + 100}
          lines={[
            { text: t('scan.log.authenticity'), result: 'REÇU' },
            { text: t('scan.log.level'), result: 'EN REVUE', bad: true },
            { text: t('scan.log.einstein'), result: 'ÉCHEC', bad: true },
          ]}
        />

        <ClipReveal delay={T.panel} duration={500}>
          <ToneProvider tone="dark">
            <View style={{ backgroundColor: INK, padding: 20, gap: 10 }} testID="analysis-status">
              <Reveal delay={T.panel + 180} duration={700}>
                <Label color={PAPER}>Résultat de l’analyse</Label>
              </Reveal>
              <Reveal delay={T.panel + 250} duration={700}>
                <Strong size={28} color={PAPER}>
                  Dossier en revue.
                </Strong>
              </Reveal>
              <Reveal delay={T.panel + 320} duration={700}>
                <Title size={19} color={PAPER} style={{ lineHeight: 25 }}>
                  <Em>{t('scan.pending')}</Em>
                </Title>
              </Reveal>
              <View style={{ marginTop: 8, opacity: done ? 1 : 0 }}>
                <Button testID="analysis-continue" label="Continuer" trailing="→" disabled={!done} onPress={() => router.replace('/diploma/review')} />
              </View>
            </View>
          </ToneProvider>
        </ClipReveal>
      </View>
    </Screen>
  );
}

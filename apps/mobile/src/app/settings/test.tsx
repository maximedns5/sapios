import { QUIZ } from '@sapios/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, IconButton } from '@/components/Button';
import { Switch } from '@/components/Controls';
import { CheckIcon, ClockIcon, CrossIcon, DownloadIcon, ReplayIcon, SparkIcon } from '@/components/Icons';
import { Confetti, haptic, MaskUp, PopIn, Rise, SlideIn, Spinner, stagger, useCountUp, useReplay } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { loadMyIntellect, saveIntellectFlags } from '@/lib/intellect';
import { openQuizImage, shareQuizResult } from '@/lib/shareQuiz';
import { alpha, colors, radius } from '@/lib/theme';

type Step = { kind: 'intro' } | { kind: 'question'; index: number } | { kind: 'computing' } | { kind: 'result' };
const TOTAL = QUIZ.questions.length;
const KEYS = ['A', 'B', 'C', 'D'];
const copy = QUIZ.copy;

const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

/**
 * Test d'admission (gag assumé, comme sur la landing) : dix questions sous chronomètre, une correction
 * mise en scène, puis « QI estimé : 130 » pour tout le monde. Rien n'est enregistré, sauf le choix
 * d'afficher le badge. Jamais à côté d'un paiement, sans aucun lien avec l'accès.
 */
export default function AdmissionTest() {
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(TOTAL).fill(null));
  const [left, setLeft] = useState<number>(QUIZ.durationSeconds);
  const [timeUp, setTimeUp] = useState(false);

  // Chronomètre unique pour les dix questions : à zéro, la correction commence quand même.
  useEffect(() => {
    if (step.kind !== 'question' || timeUp) return;
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [step.kind, timeUp]);
  useEffect(() => {
    if (left > 0 || step.kind !== 'question') return;
    setTimeUp(true);
    const go = setTimeout(() => setStep({ kind: 'computing' }), 1600);
    return () => clearTimeout(go);
  }, [left, step.kind]);

  const restart = () => {
    setAnswers(Array(TOTAL).fill(null));
    setLeft(QUIZ.durationSeconds);
    setTimeUp(false);
    setStep({ kind: 'intro' });
  };

  if (step.kind === 'intro') return <Intro onStart={() => setStep({ kind: 'question', index: 0 })} />;
  if (step.kind === 'question')
    return (
      <Question
        index={step.index}
        picked={answers[step.index]}
        left={left}
        timeUp={timeUp}
        onPick={(i) => setAnswers((a) => a.map((v, k) => (k === step.index ? i : v)))}
        onNext={() => setStep(step.index + 1 < TOTAL ? { kind: 'question', index: step.index + 1 } : { kind: 'computing' })}
      />
    );
  if (step.kind === 'computing') return <Computing onDone={() => setStep({ kind: 'result' })} />;
  return <Result onRetry={restart} />;
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <Screen
      scroll
      testID="test-intro"
      backdrop={<View style={{ position: 'absolute', top: -110, right: -120, width: 300, height: 300, borderRadius: 150, backgroundColor: alpha(colors.accent, 0.1) }} />}
      header={
        <View style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label="Quitter le test" onPress={back} testID="test-close">
            <CrossIcon size={20} />
          </IconButton>
          <View style={{ backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Small size={13} weight="bold" color="#FFFFFF">
              {copy.intro.badge}
            </Small>
          </View>
        </View>
      }
      footer={
        <Rise delay={650}>
          <Button testID="test-start" label={copy.intro.start} onPress={onStart} />
        </Rise>
      }
    >
      <View style={{ gap: 10, paddingTop: 24 }}>
        <PopIn delay={60}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <SparkIcon size={30} color="#FFFFFF" stroke={2.2} />
          </View>
        </PopIn>
        <SlideIn delay={120}>
          <Eyebrow>{copy.intro.kicker}</Eyebrow>
        </SlideIn>
        <MaskUp delay={180}>
          <Title size={36}>{copy.intro.title}</Title>
        </MaskUp>
        <Rise delay={300}>
          <Body secondary size={16.5}>
            {copy.intro.lead}
          </Body>
        </Rise>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
        {copy.intro.facts.map((f, i) => (
          <Rise key={f.label} delay={stagger(i, 380, 70)} style={{ width: '48%', flexGrow: 1 }}>
            <View style={{ backgroundColor: f.highlight ? colors.accent : colors.surface, borderRadius: 20, padding: 16, gap: 2 }}>
              <Body weight="extrabold" size={22} color={f.highlight ? '#FFFFFF' : colors.text}>
                {f.value}
              </Body>
              <Small size={13.5} color={f.highlight ? 'rgba(255,255,255,0.85)' : colors.muted}>
                {f.label}
              </Small>
            </View>
          </Rise>
        ))}
      </View>
      <Rise delay={700} style={{ marginTop: 20 }}>
        <Small size={13} style={{ lineHeight: 19 }}>
          {copy.intro.disclaimer}
        </Small>
      </Rise>
    </Screen>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Question({ index, picked, left, timeUp, onPick, onNext }: { index: number; picked: number | null; left: number; timeUp: boolean; onPick: (i: number) => void; onNext: () => void }) {
  const q = QUIZ.questions[index];
  const reduced = useReducedMotion();
  const bar = useSharedValue(left / QUIZ.durationSeconds);
  useEffect(() => {
    bar.value = reduced ? left / QUIZ.durationSeconds : withTiming(left / QUIZ.durationSeconds, { duration: 1000, easing: Easing.linear });
  }, [bar, left, reduced]);
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const last = index === TOTAL - 1;
  return (
    <Screen
      testID="test-question"
      header={
        <View>
          <View style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton label={copy.question.quit} onPress={back}>
              <CrossIcon size={20} />
            </IconButton>
            <View accessibilityRole="progressbar" accessibilityLabel={copy.question.counter(index + 1, TOTAL)} style={{ flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              {QUIZ.questions.map((_, i) => (
                <View key={i} style={{ flex: i === index ? 2 : 1, height: 6, borderRadius: 3, backgroundColor: i <= index ? colors.accent : colors.line }} />
              ))}
            </View>
            <View accessibilityRole="timer" accessibilityLabel={`Temps restant : ${mmss(left)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: left <= 20 ? alpha(colors.danger, 0.1) : colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}>
              <ClockIcon size={15} color={left <= 20 ? colors.danger : colors.text} />
              <Body size={14} weight="bold" color={left <= 20 ? colors.danger : colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                {mmss(left)}
              </Body>
            </View>
          </View>
          <View style={{ height: 3, backgroundColor: colors.line }}>
            <Animated.View style={[{ height: 3, backgroundColor: colors.accent }, barStyle]} />
          </View>
        </View>
      }
      footer={<Button testID="test-next" label={last ? copy.question.last : copy.question.next} disabled={picked == null} onPress={onNext} />}
    >
      <View key={q.id} style={{ gap: 10, paddingTop: 22 }}>
        <SlideIn>
          <Eyebrow>{copy.question.counter(index + 1, TOTAL)}</Eyebrow>
        </SlideIn>
        <MaskUp delay={60}>
          <Title size={26} style={{ lineHeight: 33 }}>
            {q.prompt}
            {q.highlight ? <Title size={26} color={colors.accent}>{` ${q.highlight}`}</Title> : null}
          </Title>
        </MaskUp>
        <View role="radiogroup" accessibilityLabel={q.prompt} style={{ gap: 10, marginTop: 14 }}>
          {q.options.map((label, i) => {
            const active = picked === i;
            return (
              <Rise key={label} delay={stagger(i, 160, 60)}>
                <Pressable
                  testID={`test-option-${i}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => {
                    haptic.selection();
                    onPick(i);
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        minHeight: 60,
                        borderRadius: 20,
                        borderWidth: 2,
                        borderColor: active ? colors.accent : colors.line,
                        backgroundColor: active ? alpha(colors.accent, 0.08) : colors.bg,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: active ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Body weight="extrabold" size={14} color={active ? '#FFFFFF' : colors.muted}>
                          {KEYS[i]}
                        </Body>
                      </View>
                      <Body weight="bold" size={16} style={{ flex: 1 }}>
                        {label}
                      </Body>
                    </View>
                  )}
                </Pressable>
              </Rise>
            );
          })}
        </View>
        {picked != null || timeUp ? (
          <Rise>
            <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <CheckIcon size={16} color={colors.accent} stroke={2.6} />
              <Small weight="semibold" color={colors.accent}>
                {timeUp ? copy.question.timeUp : copy.question.noted}
              </Small>
            </View>
          </Rise>
        ) : null}
      </View>
    </Screen>
  );
}

function Computing({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const steps = copy.computing.steps;
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= steps.length) {
      const t = setTimeout(onDone, reduced ? 200 : 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), reduced ? 150 : 700);
    return () => clearTimeout(t);
  }, [done, onDone, reduced, steps.length]);
  return (
    <Screen testID="test-computing" contentStyle={{ justifyContent: 'center', gap: 22 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Spinner size={56} width={5} />
        <MaskUp>
          <Title size={28} align="center">
            {copy.computing.title}
          </Title>
        </MaskUp>
      </View>
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 6 }} accessibilityRole="list">
        {steps.map((label, i) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
              {i < done ? (
                <PopIn duration={380}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <CheckIcon size={14} stroke={3} color="#FFFFFF" />
                  </View>
                </PopIn>
              ) : i === done ? (
                <Spinner size={22} />
              ) : (
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.disabled }} />
              )}
            </View>
            <Body weight="bold" size={15.5} color={i <= done ? colors.text : colors.muted}>
              {label}
            </Body>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const R = 110;
const ARC = Math.PI * R;
const GAUGE_MAX = 160;

/** Jauge en demi-cercle : remplie au rythme du compteur. */
function Gauge({ value }: { value: number }) {
  return (
    <Svg width={R * 2 + 24} height={R + 24} viewBox={`-12 -12 ${R * 2 + 24} ${R + 24}`}>
      <Path d={`M 0 ${R} A ${R} ${R} 0 0 1 ${R * 2} ${R}`} stroke={colors.line} strokeWidth={14} fill="none" strokeLinecap="round" />
      <Path
        d={`M 0 ${R} A ${R} ${R} 0 0 1 ${R * 2} ${R}`}
        stroke={colors.accent}
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${ARC}`}
        strokeDashoffset={ARC * (1 - Math.min(value, GAUGE_MAX) / GAUGE_MAX)}
      />
    </Svg>
  );
}

function Result({ onRetry }: { onRetry: () => void }) {
  const { userId, refresh } = useApp();
  const { t } = useCopy();
  const { toast } = useOverlay();
  const [key, replay] = useReplay();
  const [badge, setBadge] = useState<boolean | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (userId) loadMyIntellect(userId).then((m) => setBadge(m.showQuizBadge)).catch(() => {});
  }, [userId]);

  const toggleBadge = async (v: boolean) => {
    if (!userId) return;
    setBadge(v);
    try {
      await saveIntellectFlags(userId, { show_quiz_badge: v });
      refresh();
      toast(v ? 'Badge affiché sur votre profil.' : 'Badge retiré.');
    } catch (e) {
      setBadge(!v);
      toast(errorMessage(e));
    }
  };

  const share = async () => {
    if ((await shareQuizResult()) === 'fallback') setFallback(true);
  };

  return (
    <Screen
      scroll
      testID="test-result"
      header={
        <View style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label="Fermer" onPress={back} testID="test-close">
            <CrossIcon size={20} />
          </IconButton>
          <Small weight="semibold">Test d’admission · résultat</Small>
          <IconButton label="Rejouer l’animation" onPress={replay}>
            <ReplayIcon size={20} />
          </IconButton>
        </View>
      }
    >
      <ResultHero key={key} />
      <View style={{ gap: 12, marginTop: 18 }}>
        <Rise delay={1500}>
          <Small align="center" size={13} style={{ lineHeight: 19 }}>
            {copy.result.disclaimer}
          </Small>
        </Rise>
        <Rise delay={1600} style={{ gap: 10 }}>
          <Button testID="test-share" label={copy.result.share} onPress={share} />
          {fallback ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 10 }}>
              <Small size={14}>Le partage direct n’est pas disponible ici. Ouvrez l’image pour l’enregistrer :</Small>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Format story" size="md" variant="inverse" icon={<DownloadIcon size={18} />} onPress={() => openQuizImage('story')} style={{ flex: 1 }} />
                <Button label="Format carré" size="md" variant="inverse" icon={<DownloadIcon size={18} />} onPress={() => openQuizImage('carre')} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}
          {badge != null ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Body weight="bold" size={15}>
                  Badge sur mon profil
                </Body>
                <Small>« {t('quiz.badge')} »</Small>
              </View>
              <Switch testID="test-badge" label={`Afficher « ${t('quiz.badge')} » sur mon profil`} value={badge} onChange={toggleBadge} />
            </View>
          ) : null}
          <Button label={copy.result.retry} variant="ghost" onPress={onRetry} />
          <Small align="center" size={13}>
            {copy.result.retryHint}
          </Small>
        </Rise>
      </View>
    </Screen>
  );
}

/** Compteur jusqu'à 130, jauge, pastille « Admis au test », titre et gerbe de confettis. */
function ResultHero() {
  const n = useCountUp(QUIZ.score, { delay: 250, duration: 1300 });
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 12 }}>
      <View style={{ alignItems: 'center', justifyContent: 'flex-end' }} accessible accessibilityLabel={`${copy.result.label} : ${QUIZ.score}`}>
        <Gauge value={n} />
        <View style={{ position: 'absolute', bottom: 0, alignItems: 'center' }}>
          <Small weight="semibold">{copy.result.label}</Small>
          <Body weight="extrabold" size={64} style={{ lineHeight: 70, letterSpacing: -2, fontVariant: ['tabular-nums'] }}>
            {n}
          </Body>
        </View>
        <Confetti x={R + 12} y={R} delay={1450} count={28} seed={7} palette={[colors.accent, colors.gold, colors.text]} reach={[100, 150, 200]} />
      </View>
      <PopIn delay={1400}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
          <CheckIcon size={16} stroke={2.8} color="#FFFFFF" />
          <Body weight="bold" size={15} color="#FFFFFF">
            {copy.result.badge}
          </Body>
        </View>
      </PopIn>
      <MaskUp delay={1500}>
        <Title size={32} align="center">
          {copy.result.title}
        </Title>
      </MaskUp>
      <Rise delay={1600}>
        <Body weight="bold" size={17} align="center" color={colors.accent}>
          {copy.result.subtitle}
        </Body>
      </Rise>
    </View>
  );
}

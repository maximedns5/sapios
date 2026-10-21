import { levelLabel } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AdmissionGrid, usePolicy } from '@/components/AdmissionGrid';
import { Button } from '@/components/Button';
import { ClipReveal } from '@/components/ClipReveal';
import { ScanCard } from '@/components/DiplomaCard';
import { useShake } from '@/components/motion';
import { Reveal } from '@/components/Reveal';
import { Stamp } from '@/components/Stamp';
import { Body, Em, Label, Strong, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { CropMarks } from '@/components/CropMarks';
import { useLayout } from '@/lib/layout';
import { useApp } from '@/lib/app-state';
import { splitVerdict, useCopy } from '@/lib/copy';
import { currentVerdict, submissionVerdictKey, tierVerdictKey } from '@/lib/routing';
import { invert, palette, space, type Tone } from '@/lib/theme';
import type { VerdictVariant } from '@/lib/types';

type Plan = {
  /** Ton de départ, puis ton après l'inversion franche (identique s'il n'y a pas d'inversion). */
  from: Tone;
  to: Tone;
  stamp?: { word: string; sub: string; shake: boolean };
  grid: boolean;
  label: string;
};

const PLANS: Record<VerdictVariant, Plan> = {
  unlimited: { from: 'dark', to: 'light', grid: true, label: 'Admission prononcée' },
  standard: { from: 'dark', to: 'light', grid: true, label: 'Admission prononcée' },
  waitlist: { from: 'light', to: 'dark', grid: true, label: 'Admission différée' },
  refused: { from: 'light', to: 'light', grid: true, stamp: { word: 'REFUSÉ', sub: 'QI insuffisant', shake: true }, label: 'Résultat de l’analyse' },
  uninstall: { from: 'light', to: 'dark', grid: true, stamp: { word: 'REFUSÉ', sub: 'Sans appel', shake: true }, label: 'Résultat de l’analyse' },
  rejected: { from: 'light', to: 'light', grid: false, stamp: { word: 'REJETÉ', sub: 'Document non validé', shake: true }, label: 'Document refusé' },
  needs_more: { from: 'light', to: 'light', grid: false, stamp: { word: 'À REVOIR', sub: 'Document à compléter', shake: false }, label: 'Dossier incomplet' },
};

// Chronologie (ms) : grille, emphase de la ligne, impact du tampon / inversion, volet du verdict.
const T = { grid: 250, emphasis: 1000, impact: 1650, panel: 1950, actions: 2600 };

export default function Verdict() {
  const params = useLocalSearchParams<{ v?: string }>();
  const { state, seen, markSeen } = useApp();
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const { wide, column } = useLayout();
  const policy = usePolicy();
  const { style: shakeStyle, trigger: shake } = useShake(0.45);

  const variant = (params.v as VerdictVariant | undefined) ?? (state ? currentVerdict(state, seen) : null) ?? 'waitlist';
  const plan = PLANS[variant] ?? PLANS.waitlist;
  const key = state ? (variant === 'rejected' || variant === 'needs_more' ? submissionVerdictKey(state) : tierVerdictKey(state)) : null;
  // Verdict déjà vu : on rejoue en version courte, sans secousse.
  const replay = useRef(key ? seen.has(key) : false).current;
  const k = replay ? 0.35 : 1;

  const [inverted, setInverted] = useState(false);
  const [flash, setFlash] = useState(false);
  const base: Tone = inverted ? plan.to : plan.from;
  const tone: Tone = flash ? invert(base) : base;
  const { bg } = palette(tone);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!plan.stamp && plan.from !== plan.to) {
      timers.push(setTimeout(() => setInverted(true), T.impact * k));
    }
    if (plan.stamp && plan.from !== plan.to) {
      timers.push(setTimeout(() => setInverted(true), (T.impact + 500) * k));
    }
    // Les paliers sans accès au feed n'ont rien à valider : le verdict est considéré comme vu.
    if (key && !state?.can_browse) timers.push(setTimeout(() => markSeen(key), T.actions));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLand = () => {
    if (replay || !plan.stamp?.shake) return;
    shake();
    // Inversion de 50 ms à l'impact, comme dans la vidéo.
    setFlash(true);
    setTimeout(() => setFlash(false), 50);
  };

  const text = t(`verdict.${variant}`);
  const [v1, v2] = splitVerdict(text);
  // Chute longue (textes réglables dans app_copy) : corps réduit pour garder les actions à l'écran.
  const v2Size = !v1 ? 54 : v2.length > 70 ? 26 : v2.length > 40 ? 30 : 36;
  const sub = state?.latest_submission;
  const left = state?.submissions_left ?? 0;
  const canBrowse = !!state?.can_browse;
  const panelTone = invert(plan.to);

  const enter = async () => {
    if (key) await markSeen(key);
    router.replace('/feed');
  };

  const actions = useMemo(() => {
    const list: { label: string; onPress: () => void; variant?: 'solid' | 'outline'; testID: string; disabled?: boolean }[] = [];
    if (variant === 'unlimited' || variant === 'standard') {
      list.push({ label: 'Entrer', onPress: enter, testID: 'verdict-enter' });
      return list;
    }
    const resubmit = variant === 'rejected' || variant === 'needs_more' ? 'Soumettre un autre document' : 'Soumettre un diplôme supérieur';
    list.push({
      label: left > 0 ? resubmit : 'Tentatives épuisées (30 jours)',
      onPress: async () => {
        if (key) await markSeen(key);
        router.push('/diploma');
      },
      testID: 'verdict-resubmit',
      disabled: left <= 0,
    });
    if (canBrowse) list.push({ label: 'Continuer', onPress: enter, variant: 'outline', testID: 'verdict-continue' });
    else list.push({ label: 'Compte', onPress: () => router.push('/settings'), variant: 'outline', testID: 'verdict-account' });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, left, canBrowse, key]);

  return (
    <ToneProvider tone={tone}>
      <StatusBar style={tone === 'light' ? 'dark' : 'light'} />
      <View testID={`verdict-${variant}`} style={{ flex: 1, backgroundColor: bg }}>
        <Animated.View style={[{ flex: 1, width: '100%', maxWidth: column, alignSelf: 'center' }, shakeStyle]}>
          <ScrollView contentContainerStyle={{ paddingTop: insets.top + (wide ? 32 : 0), paddingBottom: insets.bottom + (wide ? 48 : space.l), flexGrow: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.gutter, height: 52, alignItems: 'center' }}>
              <Reveal delay={100 * k}>
                <Label>{plan.grid ? 'Grille d’admission' : 'Vérification'}</Label>
              </Reveal>
              <Reveal delay={160 * k}>
                <Label>{state?.level ? `${levelLabel(state.level)} validé` : 'Saison 2026'}</Label>
              </Reveal>
            </View>

            <View style={{ paddingHorizontal: space.gutter, gap: 18 }}>
              {plan.grid ? (
                <>
                  <View>
                    <Reveal delay={120 * k}>
                      <Title size={44}>Qui a le droit</Title>
                    </Reveal>
                    <Reveal delay={200 * k}>
                      <Title size={44}>
                        <Em>d’aimer ?</Em>
                      </Title>
                    </Reveal>
                  </View>
                  <View>
                    <AdmissionGrid rows={policy} level={state?.level ?? null} delay={T.grid * k} emphasis={T.emphasis * k} />
                    {plan.stamp ? (
                      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 70, alignItems: 'center' }}>
                        <Stamp testID="stamp" word={plan.stamp.word} sub={plan.stamp.sub} size={54} delay={T.impact * k - 160} onLand={onLand} />
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  <View>
                    <Reveal delay={120 * k}>
                      <Title size={44}>Votre</Title>
                    </Reveal>
                    <Reveal delay={200 * k}>
                      <Title size={44}>
                        <Em>document.</Em>
                      </Title>
                    </Reveal>
                  </View>
                  <View>
                    <ScanCard
                      scanning={!replay}
                      delay={300}
                      content={{
                        issuer: 'Sapios · Comité d’admission',
                        number: `N° ${(sub?.id ?? '0042').slice(0, 4).toUpperCase()}`,
                        kicker: 'Document soumis',
                        degree: 'DIPLÔME',
                        lines: [variant === 'rejected' ? 'Décision : refus' : 'Décision : à compléter', 'Mention : —'],
                        seal: 'S·A·P',
                        signatory: 'Le comité d’admission',
                      }}
                    />
                    {plan.stamp ? (
                      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 50, alignItems: 'center' }}>
                        <Stamp testID="stamp" word={plan.stamp.word} sub={plan.stamp.sub} size={46} delay={T.impact * k - 160} onLand={onLand} />
                      </View>
                    ) : null}
                  </View>
                </>
              )}
            </View>

            <View style={{ flex: 1, minHeight: 16 }} />

            <ClipReveal delay={T.panel * k} duration={500} style={{ marginTop: 8 }}>
              <ToneProvider tone={panelTone}>
                <View style={{ backgroundColor: palette(panelTone).bg, paddingHorizontal: space.gutter, paddingVertical: 22, gap: 8 }} testID="verdict-panel">
                  <Reveal delay={(T.panel + 180) * k}>
                    <Label>{plan.label}</Label>
                  </Reveal>
                  {v1 ? (
                    <Reveal delay={(T.panel + 250) * k}>
                      <Strong size={30}>{v1}</Strong>
                    </Reveal>
                  ) : null}
                  <Reveal delay={(T.panel + 320) * k}>
                    <Title size={v2Size} style={{ lineHeight: v2Size * 1.08 }}>
                      <Em>{v2}</Em>
                    </Title>
                  </Reveal>
                  {(variant === 'rejected' || variant === 'needs_more') && sub?.rejection_reason ? (
                    <Reveal delay={(T.panel + 400) * k}>
                      <Body size={15} style={{ marginTop: 6 }}>
                        Motif : {sub.rejection_reason}
                      </Body>
                    </Reveal>
                  ) : null}
                  {variant !== 'unlimited' && variant !== 'standard' ? (
                    <Label size={9} style={{ marginTop: 6, opacity: 0.7 }}>
                      Tentatives restantes : {left} / 3
                    </Label>
                  ) : null}
                </View>
              </ToneProvider>
            </ClipReveal>

            <View style={{ paddingHorizontal: space.gutter, marginTop: 16 }}>
              <Reveal delay={T.actions * k}>
                <View style={{ gap: 10 }}>
                  {actions.map((a) => (
                    <Button key={a.testID} testID={a.testID} label={a.label} variant={a.variant} disabled={a.disabled} onPress={a.onPress} trailing={a.variant ? undefined : '→'} />
                  ))}
                </View>
              </Reveal>
            </View>
          </ScrollView>
        </Animated.View>
        {wide ? <CropMarks /> : null}
      </View>
    </ToneProvider>
  );
}

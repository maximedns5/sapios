import { levelLabel } from '@sapios/shared';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AdmissionBars, firstOpenLevel, TIER_LABEL, usePolicy } from '@/components/AdmissionGrid';
import { Button, IconButton } from '@/components/Button';
import { CheckIcon, FileIcon, GearIcon, HourglassIcon, ReplayIcon } from '@/components/Icons';
import { Confetti, haptic, MaskUp, PopIn, Ripple, Rise, useJolt, useReplay } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { splitHeadline, useCopy } from '@/lib/copy';
import { CONTACT_EMAIL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { useLayout } from '@/lib/layout';
import { currentVerdict, submissionVerdictKey, tierVerdictKey } from '@/lib/routing';
import { alpha, colors, ease, radius, shadow, space } from '@/lib/theme';
import type { VerdictVariant } from '@/lib/types';

const CARD_W = 236;
const CARD_H = 290;

/** Carte d'accès qui se retourne, tampon « VALIDÉ » qui tombe, secousse et confettis. */
function AdmittedCard({ level, tierLabel, k, onLand }: { level: number | null; tierLabel: string; k: number; onLand: () => void }) {
  const reduced = useReducedMotion();
  const flip = useSharedValue(reduced ? 1 : 0);
  const stamp = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    flip.value = withDelay(200 * k, withTiming(1, { duration: 900, easing: ease.out }));
    stamp.value = withDelay(1000 * k, withTiming(1, { duration: 450, easing: ease.in }));
    const timer = setTimeout(onLand, 1000 * k + 330);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: flip.value,
    transform: [{ perspective: 900 }, { rotateY: `${(1 - flip.value) * 95}deg` }, { scale: 0.9 + flip.value * 0.1 }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value > 0 ? 1 : 0,
    transform: [{ rotate: '-10deg' }, { scale: 2.8 - 1.8 * stamp.value }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityLabel={`Diplôme vérifié${level ? `, ${levelLabel(level)}` : ''}, ${tierLabel}`}
      style={[{ width: CARD_W, height: CARD_H, borderRadius: radius.sheet, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0px 24px 50px rgba(26,25,24,0.22)' }, cardStyle]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CheckIcon size={16} stroke={2.6} color="#FFFFFF" />
        <Body weight="bold" size={14} color="#FFFFFF">
          Diplôme vérifié
        </Body>
      </View>
      <Body weight="extrabold" size={68} color="#FFFFFF" style={{ letterSpacing: -2, lineHeight: 72 }}>
        {level ? levelLabel(level) : '—'}
      </Body>
      <Body weight="semibold" size={15} color="rgba(255,255,255,0.92)">
        {tierLabel}
      </Body>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', right: -22, bottom: 26, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6, boxShadow: '0px 10px 26px rgba(26,25,24,0.2)' }, stampStyle]}
      >
        <Body weight="extrabold" size={26} color={colors.accent} style={{ letterSpacing: 2, lineHeight: 32 }}>
          VALIDÉ
        </Body>
      </Animated.View>
    </Animated.View>
  );
}

/** Sablier qui se retourne lentement (liste d'attente). */
function Hourglass() {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    r.value = withRepeat(withSequence(withTiming(0, { duration: 2100 }), withTiming(180, { duration: 900, easing: ease.inOut }), withTiming(180, { duration: 2100 }), withTiming(360, { duration: 900, easing: ease.inOut })), -1, false);
  }, [r, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: shadow.soft }}>
      <Animated.View style={style}>
        <HourglassIcon size={30} color={colors.accent} stroke={2} />
      </Animated.View>
    </View>
  );
}

/**
 * Verdict : admis (carte et tampon), liste d'attente (sablier), refusé (grille vraie), document refusé ou
 * à compléter (motif mis en avant). Le titre vient d'app_copy ; la suite est factuelle.
 */
export default function Verdict() {
  const params = useLocalSearchParams<{ v?: string }>();
  const { state, seen, markSeen, signOut } = useApp();
  const { t } = useCopy();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const { columnWidth } = useLayout();
  const policy = usePolicy();
  const { style: joltStyle, trigger: jolt } = useJolt(5);
  const [key, replay] = useReplay();

  const variant = (params.v as VerdictVariant | undefined) ?? (state ? currentVerdict(state, seen) : null) ?? 'waitlist';
  const seenKey = state ? (variant === 'rejected' || variant === 'needs_more' ? submissionVerdictKey(state) : tierVerdictKey(state)) : null;
  // Verdict déjà vu : version courte des animations.
  const already = useRef(seenKey ? seen.has(seenKey) : false).current;
  const k = already && key === 0 ? 0.35 : 1;

  const admitted = variant === 'unlimited' || variant === 'standard';
  const refused = variant === 'refused' || variant === 'uninstall';
  const docIssue = variant === 'rejected' || variant === 'needs_more';
  const level = state?.level ?? null;
  const sub = state?.latest_submission;
  const left = state?.submissions_left ?? 0;
  const canBrowse = !!state?.can_browse;
  const [title, rest] = splitHeadline(t(`verdict.${variant}`));

  useEffect(() => {
    // Les paliers sans accès au feed n'ont rien à valider : le verdict est considéré comme vu.
    if (!seenKey || canBrowse) return;
    const timer = setTimeout(() => markSeen(seenKey), 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = async () => {
    if (seenKey) await markSeen(seenKey);
    router.replace('/feed');
  };
  const resubmit = async () => {
    if (seenKey) await markSeen(seenKey);
    router.push('/diploma');
  };
  const deleteData = async () => {
    const ok = await overlay.confirm({
      label: 'Suppression définitive',
      title: 'Supprimer toutes vos données ?',
      message: 'Profil, photos, diplôme et compte sont effacés immédiatement. C’est définitif.',
      confirm: 'Tout supprimer',
      destructive: true,
      typeToConfirm: 'SUPPRIMER',
    });
    if (!ok) return;
    try {
      await api.deleteAccount();
      await signOut({ local: true });
    } catch (e) {
      overlay.toast(errorMessage(e));
    }
  };

  const onLand = () => {
    jolt();
    haptic.success();
  };

  const quota = state?.daily_like_quota;
  const firstOpen = firstOpenLevel(policy);
  let body: string;
  if (admitted) body = `${rest ? `${rest} ` : ''}Votre diplôme est validé. ${quota == null ? 'Likes illimités, et vous voyez qui vous a liké.' : `${quota} likes par jour pour commencer.`}`;
  else if (variant === 'waitlist') body = 'Votre profil est prêt, et invisible pour l’instant. Les admissions depuis la liste d’attente se font par vagues : vous le verrez ici.';
  else if (refused) body = `Votre diplôme a bien été validé${level ? ` : ${levelLabel(level)}` : ''}. Notre grille n’ouvre l’accès qu’à partir du ${firstOpen ? levelLabel(firstOpen) : 'niveau requis'} : c’est elle qui est sévère.`;
  else if (variant === 'rejected') body = 'Ce document n’a pas pu être retenu. Envoyez-en un autre : lisible, en entier, à votre nom légal.';
  else body = 'Notre équipe a besoin d’un complément pour valider votre dossier. Envoyez le document demandé : il sera relu par notre équipe.';

  const stampX = columnWidth / 2 + CARD_W / 2 - 10;

  return (
    <View testID={`verdict-${variant}`} style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      <View style={{ position: 'absolute', top: insets.top + 8, right: 12, zIndex: 5, flexDirection: 'row', gap: 8 }}>
        {!admitted ? (
          <IconButton label="Compte" onPress={() => router.push('/settings')}>
            <GearIcon size={20} />
          </IconButton>
        ) : null}
        {variant !== 'refused' && variant !== 'uninstall' && variant !== 'rejected' ? (
          <IconButton label="Rejouer l’animation" onPress={replay} testID="verdict-replay">
            <ReplayIcon size={20} />
          </IconButton>
        ) : null}
      </View>
      <ScrollView key={key} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.l, paddingHorizontal: space.gutter, gap: 20 }}>
        {admitted ? (
          <Animated.View style={[{ alignItems: 'center', paddingTop: 12 }, joltStyle]}>
            <AdmittedCard level={level} tierLabel={state?.tier ? TIER_LABEL[state.tier] : TIER_LABEL.standard} k={k} onLand={onLand} />
          </Animated.View>
        ) : null}

        {variant === 'waitlist' ? (
          <Rise delay={150 * k} style={{ backgroundColor: alpha(colors.accent, 0.08), borderRadius: radius.sheet, paddingVertical: 26, paddingHorizontal: 22, alignItems: 'center', gap: 10 }}>
            <PopIn delay={300 * k}>
              <Hourglass />
            </PopIn>
            <Body weight="bold" size={15} color={colors.accent}>
              Liste d’attente
            </Body>
            {level ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <CheckIcon size={14} stroke={2.8} color={colors.accent} />
                <Body weight="bold" size={13.5}>
                  {levelLabel(level)} validé
                </Body>
              </View>
            ) : null}
          </Rise>
        ) : null}

        {refused ? (
          <Rise delay={100 * k} style={{ backgroundColor: colors.surface, borderRadius: radius.sheet, padding: 22, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Small weight="semibold" size={14}>
                Votre diplôme
              </Small>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                <CheckIcon size={13} stroke={2.8} color={colors.accent} />
                <Body weight="bold" size={13}>
                  Validé
                </Body>
              </View>
            </View>
            <Body weight="extrabold" size={56} style={{ letterSpacing: -1.6, lineHeight: 60 }}>
              {level ? levelLabel(level) : '—'}
            </Body>
            <View style={{ marginTop: 14 }}>
              <AdmissionBars rows={policy} level={level} delay={500 * k} />
            </View>
          </Rise>
        ) : null}

        {docIssue ? (
          <Rise delay={100 * k} style={{ gap: 14 }}>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: alpha(colors.accent, 0.08), borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
              <Body weight="bold" size={13.5} color={colors.accent}>
                {variant === 'needs_more' ? 'Dossier à compléter' : 'Document non retenu'}
              </Body>
            </View>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                {variant === 'needs_more' ? <Ripple size={44} delay={600 * k} duration={1600} /> : null}
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <FileIcon size={20} color={colors.accent} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Small weight="semibold" size={13.5}>
                  {variant === 'needs_more' ? 'Ce qu’il nous faut' : 'Motif'}
                </Small>
                <Body weight="bold" size={15.5} testID="verdict-reason">
                  {sub?.rejection_reason || (variant === 'needs_more' ? 'Un document complémentaire, à votre nom.' : 'Document illisible ou incomplet.')}
                </Body>
              </View>
            </View>
          </Rise>
        ) : null}

        <View style={{ gap: 10 }}>
          <MaskUp delay={(admitted ? 1450 : 900) * k}>
            <Title size={36} align={admitted ? 'center' : 'left'}>
              {title}
            </Title>
          </MaskUp>
          <Rise delay={(admitted ? 1600 : 1050) * k}>
            <Body secondary size={16.5} align={admitted ? 'center' : 'left'}>
              {body}
            </Body>
          </Rise>
          {refused ? (
            <Rise delay={1150 * k}>
              <Body muted size={14.5}>
                Une erreur de lecture ? Écrivez à{' '}
                <Body size={14.5} weight="bold" color={colors.text} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} accessibilityRole="link">
                  {CONTACT_EMAIL}
                </Body>{' '}
                : un membre de l’équipe relira votre dossier.
              </Body>
            </Rise>
          ) : null}
          {variant === 'waitlist' && left > 0 ? (
            <Rise delay={1150 * k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, marginTop: 4 }}>
              <Body size={14.5} weight="semibold" style={{ flex: 1 }}>
                Pour entrer tout de suite : un diplôme supérieur.
              </Body>
              <Button label="Soumettre" variant="secondary" size="md" onPress={resubmit} testID="verdict-resubmit" />
            </Rise>
          ) : null}
        </View>

        <View style={{ flex: 1, minHeight: 12 }} />

        <Rise delay={(admitted ? 1800 : 1250) * k} style={{ gap: 6 }}>
          {admitted ? <Button testID="verdict-enter" label="Découvrir les profils" onPress={enter} /> : null}
          {variant === 'waitlist' ? <Button testID="verdict-profile" label="Compléter mon profil" onPress={() => router.push('/settings/profile')} /> : null}
          {refused || docIssue ? (
            <Button
              testID="verdict-resubmit"
              label={left > 0 ? (refused ? 'Soumettre un autre diplôme' : variant === 'needs_more' ? 'Envoyer le complément' : 'Soumettre un autre document') : 'Tentatives épuisées pour 30 jours'}
              disabled={left <= 0}
              onPress={resubmit}
            />
          ) : null}
          {docIssue && canBrowse ? <Button testID="verdict-continue" label="Continuer la découverte" variant="secondary" onPress={enter} /> : null}
          {!admitted ? (
            <Small align="center" size={13}>
              {left > 0 ? `${left} tentative${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''} sur 30 jours` : 'Trois tentatives par période de 30 jours.'}
            </Small>
          ) : null}
          {refused || variant === 'waitlist' ? <Button testID="verdict-delete" label="Supprimer mes données" variant="danger" onPress={deleteData} /> : null}
        </Rise>
      </ScrollView>
      {admitted && k === 1 ? <Confetti key={`c${key}`} x={stampX} y={insets.top + 64 + 12 + CARD_H - 40} palette={[colors.accent, colors.gold, colors.text]} delay={1220} seed={5} reach={[110, 170, 240]} count={30} /> : null}
    </View>
  );
}

import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { splitHeadline } from '@/lib/copy';
import { colors, ease, radius } from '@/lib/theme';
import { Button } from './Button';
import { CheckIcon, ChevronRightIcon, HeartIcon, ReplayIcon, SlidersIcon, UserIcon, WifiIcon } from './Icons';
import { MaskUp, PopIn, Rise } from './motion';
import { Body, Small, Title } from './Text';

/** Carte empilée qui se pose (fin de sélection). */
function StackedCard({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(index * 120, withTiming(1, { duration: 700, easing: ease.spring }));
  }, [index, p, reduced]);
  const rest = [-9, 7, 0][index];
  const shift = [-22, 20, 0][index];
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2),
    transform: [{ translateX: shift * p.value }, { translateY: (1 - p.value) * -60 }, { rotate: `${rest * p.value}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: 120, height: 150, borderRadius: 20, backgroundColor: index === 2 ? colors.photo : index === 1 ? '#D3CCD8' : '#CFD8D2', borderWidth: 4, borderColor: '#FFFFFF', boxShadow: '0px 10px 26px rgba(26,25,24,0.14)' },
        style,
      ]}
    />
  );
}

function Option({ icon, title, sub, onPress, testID }: { icon: ReactNode; title: string; sub: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress}>
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: pressed ? colors.line : colors.surface }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
          <View style={{ flex: 1 }}>
            <Body weight="bold" size={15}>
              {title}
            </Body>
            <Small>{sub}</Small>
          </View>
          <ChevronRightIcon size={18} color={colors.muted} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Fin de sélection : tout a été vu, ou les critères excluent tout le monde (`tooStrict`, d'après
 * count_discovery). Des leviers réels (critères, profil, likes), jamais une impasse.
 */
export function EndOfSelection({ text, seesLikers, onRefresh, tooStrict }: { text: string; seesLikers: boolean; onRefresh: () => void; tooStrict?: boolean }) {
  // « Personne ne remplit vos critères. Ils sont peut-être trop élevés. » : titre, puis la suite.
  const [head, rest] = splitHeadline(text);
  return (
    <View style={{ gap: 18, paddingTop: 12 }} testID="feed-empty">
      <View style={{ height: 190, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => (
          <StackedCard key={i} index={i} />
        ))}
        <PopIn delay={650} style={{ position: 'absolute' }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FFFFFF' }}>
            {tooStrict ? <SlidersIcon size={24} color="#FFFFFF" /> : <CheckIcon size={26} stroke={2.8} color="#FFFFFF" />}
          </View>
        </PopIn>
      </View>
      <View style={{ gap: 8 }}>
        <MaskUp delay={300}>
          <Title size={28} align="center">
            {tooStrict ? head : 'Vous avez tout vu pour aujourd’hui'}
          </Title>
        </MaskUp>
        <Rise delay={420}>
          <Body secondary align="center">
            {tooStrict ? rest : text}
          </Body>
        </Rise>
      </View>
      {tooStrict ? (
        <Rise delay={480}>
          <Button testID="empty-widen" label="Élargir mes critères" onPress={() => router.push('/criteria')} icon={<SlidersIcon size={20} color="#FFFFFF" />} />
        </Rise>
      ) : null}
      <Rise delay={520} style={{ gap: 10 }}>
        {tooStrict ? null : (
          <Option testID="empty-criteria" icon={<SlidersIcon size={20} color={colors.accent} />} title="Élargir mes critères" sub="Âge, distance, niveaux, domaines" onPress={() => router.push('/criteria')} />
        )}
        <Option testID="empty-profile" icon={<UserIcon size={20} color={colors.accent} />} title="Compléter mon profil" sub="Réponses, bibliothèque, photos" onPress={() => router.navigate('/account')} />
        {seesLikers ? <Option icon={<HeartIcon size={20} color={colors.accent} />} title="Voir qui vous a liké" sub="Un like en retour, et c’est un match" onPress={() => router.navigate('/likes')} /> : null}
      </Rise>
      <Button label="Actualiser" variant="ghost" onPress={onRefresh} icon={<ReplayIcon size={18} color={colors.muted} />} />
    </View>
  );
}

/** Arcs du Wi-Fi qui s'allument l'un après l'autre. */
function WifiPulse() {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <WifiIcon size={56} color={colors.accent} stroke={2} />
      </Animated.View>
    </View>
  );
}

/** Panne réseau ou serveur : distincte de la fin de sélection (rien n'est perdu, on réessaie). */
export function LoadError({ network, message, onRetry }: { network: boolean; message: string; onRetry: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await Promise.all([onRetry(), new Promise((r) => setTimeout(r, 700))]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 18, alignItems: 'center', paddingTop: 40 }} testID="feed-error">
      <PopIn>
        <WifiPulse />
      </PopIn>
      <MaskUp delay={150}>
        <Title size={28} align="center">
          {network ? 'Connexion perdue' : 'Chargement impossible'}
        </Title>
      </MaskUp>
      <Rise delay={280}>
        <Body secondary align="center">
          {network ? 'Impossible de charger les profils pour le moment. Votre sélection est intacte.' : message}
        </Body>
      </Rise>
      {network ? (
        <Rise delay={360}>
          <Small align="center">Vérifiez le Wi-Fi ou les données mobiles.</Small>
        </Rise>
      ) : null}
      <Rise delay={420} style={{ alignSelf: 'stretch' }}>
        <Button testID="feed-retry" label={busy ? 'Connexion…' : 'Réessayer'} loading={busy} onPress={retry} />
      </Rise>
    </View>
  );
}

/** Squelette de chargement : blocs qui respirent. */
export function FeedSkeleton() {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.6);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.6, { duration: 650 })), -1, false);
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ gap: 14 }, style]} accessibilityLabel="Chargement des profils" accessibilityRole="progressbar">
      <View style={{ width: 160, height: 32, borderRadius: 10, backgroundColor: colors.surface }} />
      <View style={{ width: 120, height: 16, borderRadius: 8, backgroundColor: colors.surface }} />
      <View style={{ height: 380, borderRadius: radius.card, backgroundColor: colors.surface }} />
    </Animated.View>
  );
}

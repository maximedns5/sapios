import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/Button';
import { BellIcon, CapIcon, CheckIcon, ReplayIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise, Spinner, useReplay } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Body, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { formatBytes } from '@/lib/diploma';
import { loadLegalName } from '@/lib/profile';
import { colors, ease, radius } from '@/lib/theme';

const CARD = 210;

/** Carte du document, balayée deux fois par la ligne de scan. */
function DocumentCard({ legal }: { legal: string | null }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withDelay(300, withRepeat(withTiming(1, { duration: 1100, easing: ease.inOut }), 2, false));
  }, [reduced, y]);
  const scan = useAnimatedStyle(() => ({ opacity: y.value > 0 && y.value < 1 ? 1 : 0, transform: [{ translateY: -20 + y.value * (CARD + 20) }] }));
  return (
    <View
      accessible
      accessibilityLabel={`Votre diplôme${legal ? `, au nom de ${legal}` : ''}`}
      style={{ height: CARD, borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <View style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, borderWidth: 1.5, borderColor: '#E2DDD7', borderRadius: 16 }} />
      <Small weight="semibold">Document reçu</Small>
      <Body weight="extrabold" size={38} style={{ letterSpacing: -0.8, lineHeight: 44 }}>
        Diplôme
      </Body>
      <Body weight="semibold" size={15} secondary numberOfLines={1}>
        {legal ?? ' '}
      </Body>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ width: 90, height: 6, borderRadius: 3, backgroundColor: '#E2DDD7' }} />
        <View style={{ width: 50, height: 6, borderRadius: 3, backgroundColor: '#E2DDD7' }} />
      </View>
      <View style={{ position: 'absolute', right: 24, bottom: 22, width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <CapIcon size={20} color={colors.accent} stroke={1.9} />
      </View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: colors.accent, boxShadow: `0px 0px 16px ${colors.accent}` }, scan]} />
    </View>
  );
}

/** Étape vérifiée : roue, puis coche qui surgit à l'heure dite. */
function CheckStep({ title, sub, at, last }: { title: string; sub: string; at: number; last?: boolean }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(!!reduced);
  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setDone(true), at);
    return () => clearTimeout(timer);
  }, [at, reduced]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderColor: colors.line }}>
      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        {done ? (
          <PopIn duration={450}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon size={15} stroke={3} color="#FFFFFF" />
            </View>
          </PopIn>
        ) : (
          <Spinner size={28} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Body weight="bold" size={15.5} color={done ? colors.text : colors.muted}>
          {title}
        </Body>
        <Small>{sub}</Small>
      </View>
    </View>
  );
}

/**
 * Après l'envoi : ce qui a réellement eu lieu (reçu, conforme, transmis), sans faux contrôle
 * d'authenticité ni faux échec. La relecture est humaine.
 */
export default function Analysis() {
  const { t } = useCopy();
  const { userId } = useApp();
  const { kind = 'image', name = '', size = '' } = useLocalSearchParams<{ submission: string; kind: string; name?: string; size?: string }>();
  const [legal, setLegal] = useState<string | null>(null);
  const [key, replay] = useReplay();

  useEffect(() => {
    if (userId) loadLegalName(userId).then(setLegal);
  }, [userId]);

  const file = [name || (kind === 'pdf' ? 'PDF' : 'Image'), size ? formatBytes(Number(size)) : null].filter(Boolean).join(' · ');

  return (
    <Screen
      scroll
      testID="analysis"
      header={
        <View style={{ height: 60, paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
          <IconButton label="Rejouer l’animation" onPress={replay}>
            <ReplayIcon size={20} />
          </IconButton>
        </View>
      }
      footer={
        <Rise delay={2600} key={`f${key}`}>
          <Button testID="analysis-continue" label="Continuer" onPress={() => router.replace('/diploma/review')} />
        </Rise>
      }
    >
      <View key={key} style={{ gap: 20, paddingTop: 4 }}>
        <Rise>
          <DocumentCard legal={legal} />
        </Rise>
        <View style={{ gap: 8 }}>
          <MaskUp delay={150}>
            <Title size={34}>C’est envoyé.</Title>
          </MaskUp>
          <Rise delay={300}>
            <Body secondary>Einstein n’était pas disponible : c’est une personne de notre équipe qui relit votre diplôme.</Body>
          </Rise>
        </View>
        <Rise delay={400} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingHorizontal: 20, paddingVertical: 4 }}>
          <View accessibilityRole="list" accessibilityLabel="Avancement">
            <CheckStep title="Document reçu" sub={file} at={1000} />
            <CheckStep title="Fichier conforme" sub="Format et taille vérifiés" at={1600} />
            <CheckStep title="Transmis à notre équipe" sub={t('review.delay')} at={2200} last />
          </View>
        </Rise>
        <Rise delay={2500} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <BellIcon size={18} color={colors.secondary} />
          <Body weight="semibold" size={14.5} secondary>
            Le verdict s’affichera ici dès qu’il tombe.
          </Body>
        </Rise>
      </View>
    </Screen>
  );
}

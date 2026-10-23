import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { alpha, colors, ease, fonts, radius } from '@/lib/theme';
import { haptic } from './motion';
import { Body, Small } from './Text';

/*
 * Pièces visuelles du lot 2 (maquettes L2-*) : sceau de cire des lettres de recommandation, pavé de
 * date des événements, billet (le QR code est dans QrCode.tsx, chargé avec le seul écran du billet).
 */

/** Contour irrégulier d'un sceau de cire, dans une boîte de 84. */
function sealPath(): string {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r = 37 + 2.4 * Math.sin(a * 9) + 1.2 * Math.sin(a * 5 + 1);
    return `${(42 + r * Math.cos(a)).toFixed(1)} ${(42 + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join(' L')} Z`;
}

const SEAL = sealPath();

/**
 * Sceau de cire à la couleur d'accent, frappé d'un « S » italique. Il tombe sur la lettre (grand, tourné,
 * puis à sa place avec un léger rebond) à chaque changement de `playKey` ; `playKey = 0` : posé, immobile.
 */
export function WaxSeal({ size = 84, playKey = 1, delay = 0, style }: { size?: number; playKey?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced || !playKey ? 1 : 2.4);
  const rotate = useSharedValue(reduced || !playKey ? -8 : -28);
  const opacity = useSharedValue(reduced || !playKey ? 1 : 0);
  useEffect(() => {
    if (reduced || !playKey) return;
    scale.value = 2.4;
    rotate.value = -28;
    opacity.value = 0;
    opacity.value = withDelay(delay, withTiming(1, { duration: 260 }));
    scale.value = withDelay(delay, withSequence(withTiming(0.92, { duration: 420, easing: ease.in }), withTiming(1.04, { duration: 140 }), withTiming(1, { duration: 160, easing: ease.out })));
    rotate.value = withDelay(delay, withSequence(withTiming(4, { duration: 420, easing: ease.in }), withTiming(-10, { duration: 140 }), withTiming(-8, { duration: 160 })));
    const thud = setTimeout(() => haptic.heavy(), delay + 420);
    return () => clearTimeout(thud);
  }, [delay, opacity, playKey, reduced, rotate, scale]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style, animated]}>
      <Svg width={size} height={size} viewBox="0 0 84 84">
        <Path d={SEAL} fill={colors.accent} />
        <Circle cx={42} cy={42} r={27} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} />
        <SvgText x={42} y={53} textAnchor="middle" fontFamily={fonts.wordmark} fontStyle="italic" fontSize={34} fill="#FFFFFF">
          S
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

/** Pavé de date : jour abrégé, quantième, mois (« JEU · 6 · NOV »). */
export function DateBlock({ weekday, day, month, muted, size = 'md' }: { weekday: string; day: string; month: string; muted?: boolean; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 48 : 58;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: w, borderRadius: 16, backgroundColor: muted ? colors.surface : alpha(colors.accent, 0.08), alignItems: 'center', paddingVertical: size === 'sm' ? 6 : 9 }}
    >
      <Body size={11} weight="bold" color={muted ? colors.muted : colors.accent} style={{ letterSpacing: 0.8, lineHeight: 14 }}>
        {weekday}
      </Body>
      <Body size={size === 'sm' ? 20 : 24} weight="extrabold" color={muted ? colors.muted : colors.text} style={{ lineHeight: size === 'sm' ? 24 : 29 }}>
        {day}
      </Body>
      <Body size={11} weight="bold" color={muted ? colors.muted : colors.secondary} style={{ letterSpacing: 0.8, lineHeight: 14 }}>
        {month}
      </Body>
    </View>
  );
}

/** Ligne prédécoupée du billet : deux encoches et un pointillé. */
function Perforation({ notch = colors.bg }: { notch?: string }) {
  return (
    <View style={{ height: 24, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: notch, borderWidth: 1, borderColor: colors.line }} />
      <View style={{ position: 'absolute', right: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: notch, borderWidth: 1, borderColor: colors.line }} />
      <View style={{ marginHorizontal: 18, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.disabled }} />
    </View>
  );
}

/**
 * Billet : en-tête (« SAPIOS · DÎNER », titre, informations), ligne prédécoupée, pied (code ou QR).
 * `notch` = couleur du fond derrière le billet, pour les encoches.
 */
export function Ticket({ eyebrow, title, info, footer, notch, style, testID }: { eyebrow: string; title: string; info: ReactNode; footer: ReactNode; notch?: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[{ backgroundColor: '#FFFFFF', borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: '0px 18px 40px rgba(26,25,24,0.12)' }, style]}>
      <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14, gap: 6 }}>
        <Small size={12} weight="bold" color={colors.accent} style={{ letterSpacing: 1.4 }}>
          {eyebrow}
        </Small>
        <Body weight="extrabold" size={24} style={{ letterSpacing: -0.5, lineHeight: 29 }}>
          {title}
        </Body>
        {info}
      </View>
      <Perforation notch={notch} />
      <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20, gap: 8 }}>{footer}</View>
    </View>
  );
}

/** Couple « libellé / valeur » du billet (Date, Accueil, Places). */
export function TicketFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Small size={12} weight="semibold">
        {label}
      </Small>
      <Body weight="bold" size={15}>
        {value}
      </Body>
    </View>
  );
}

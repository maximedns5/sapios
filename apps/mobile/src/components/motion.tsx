import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, ease } from '@/lib/theme';

/*
 * Primitives d'animation des maquettes (direction simple). Chaque primitive respecte le réglage
 * « réduire les animations » : l'état final s'affiche directement.
 */

const NATIVE = Platform.OS !== 'web';

/** Retours haptiques (téléphone uniquement) : léger au like, succès au match. */
export const haptic = {
  selection: () => NATIVE && Haptics.selectionAsync().catch(() => {}),
  light: () => NATIVE && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => NATIVE && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => NATIVE && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};

/** Ancien nom, gardé pour les contrôles : retour de sélection. */
export const tapFeedback = haptic.selection;

/** Relance : changer la clé remonte le sous-arbre animé. */
export function useReplay(): [number, () => void] {
  const [key, setKey] = useState(0);
  return [key, useCallback(() => setKey((k) => k + 1), [])];
}

type EnterProps = { children?: ReactNode; delay?: number; duration?: number; style?: StyleProp<ViewStyle>; play?: boolean };

/** Montée en fondu (« rise ») : 18 px, courbe douce. Base de toutes les entrées échelonnées. */
export function Rise({ children, delay = 0, duration = 550, distance = 18, style, play = true }: EnterProps & { distance?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.value = 1;
      return;
    }
    if (!play) {
      p.value = 0;
      return;
    }
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: ease.out }));
  }, [delay, duration, p, play, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * distance }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Glissé depuis la droite (changement d'étape). */
export function SlideIn({ children, delay = 0, duration = 500, style }: EnterProps) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(delay, withTiming(1, { duration, easing: ease.out }));
  }, [delay, duration, p, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateX: (1 - p.value) * 36 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Apparition à ressort : 0 → 1,25 → 1 (coches, médaillons, pastilles). */
export function PopIn({ children, delay = 0, duration = 500, overshoot = 1.25, style }: EnterProps & { overshoot?: number }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    s.value = withDelay(
      delay,
      withSequence(withTiming(overshoot, { duration: duration * 0.6, easing: ease.out }), withTiming(1, { duration: duration * 0.4, easing: ease.inOut })),
    );
  }, [delay, duration, overshoot, reduced, s]);
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, s.value * 1.6), transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Titre révélé par masque : le texte monte de sous sa ligne de base. */
export function MaskUp({ children, delay = 0, duration = 750, style }: EnterProps) {
  const reduced = useReducedMotion();
  const height = useSharedValue(60);
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: ease.out }));
  }, [delay, duration, p, reduced]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * height.value * 1.1 }] }));
  const onLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height || 60;
  };
  return (
    <View style={[{ overflow: 'hidden', paddingBottom: 4, marginBottom: -4 }, style]}>
      <Animated.View onLayout={onLayout} style={animated}>
        {children}
      </Animated.View>
    </View>
  );
}

/** Entrées échelonnées : délai de l'élément `i` (base + i × pas). */
export const stagger = (i: number, base = 0, step = 70) => base + i * step;

/** Onde de choc : anneau qui s'élargit et s'efface une fois. */
export function Shockwave({ size = 120, color = '#FFFFFF', delay = 0, duration = 1000, width = 3, style }: { size?: number; color?: string; delay?: number; duration?: number; width?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(delay, withTiming(1, { duration, easing: ease.out }));
  }, [delay, duration, p, reduced]);
  const animated = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 0.9 * (1 - p.value),
    transform: [{ scale: 0.35 + p.value * 3.25 }],
  }));
  if (reduced) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color }, style, animated]} />;
}

/** Ondes en boucle (attente) : l'anneau grandit de 1 à 1,7 en s'effaçant. */
export function Ripple({ size, color = colors.accent, delay = 0, duration = 2200, filled, style }: { size: number; color?: string; delay?: number; duration?: number; filled?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: ease.out }), -1, false));
    return () => cancelAnimation(p);
  }, [delay, duration, p, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.7 }] }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2 },
        filled ? { backgroundColor: color } : { borderWidth: 2, borderColor: color },
        style,
        animated,
      ]}
    />
  );
}

/** Battement de cœur en boucle (médaillon du match). */
export function Heartbeat({ children, delay = 0, style }: EnterProps) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    const beat = withSequence(
      withTiming(1.14, { duration: 260 }),
      withTiming(1, { duration: 260 }),
      withTiming(1.08, { duration: 260 }),
      withTiming(1, { duration: 260 }),
      withTiming(1, { duration: 1560 }),
    );
    s.value = withDelay(delay, withRepeat(beat, -1, false));
    return () => cancelAnimation(s);
  }, [delay, reduced, s]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Roue de chargement (anneau dont un quart est coloré). */
export function Spinner({ size = 24, color = colors.accent, track = colors.line, width = 3 }: { size?: number; color?: string; track?: string; width?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [r]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
      style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: track, borderTopColor: color }, animated]}
    />
  );
}

/** Points de suspension animés (« En cours… »). */
export function Dots({ color = colors.muted, size = 13.5 }: { color?: string; size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row' }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 200} color={color} size={size} />
      ))}
    </View>
  );
}

function Dot({ delay, color, size }: { delay: number; color: string; size: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(reduced ? 1 : 0.2);
  useEffect(() => {
    if (reduced) return;
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 560 }), withTiming(0.2, { duration: 840 })), -1, false));
    return () => cancelAnimation(o);
  }, [delay, o, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.Text style={[{ color, fontSize: size, lineHeight: size * 1.45 }, animated]}>.</Animated.Text>;
}

/** Compteur qui monte jusqu'à `target` (courbe cubique), après `delay`. */
export function useCountUp(target: number, { delay = 0, duration = 1100, play = true }: { delay?: number; duration?: number; play?: boolean } = {}) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (!play) return;
    if (reduced) {
      setValue(target);
      return;
    }
    setValue(0);
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const k = Math.min(Math.max((Date.now() - start) / duration, 0), 1);
      setValue(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [delay, duration, play, reduced, target]);
  return value;
}

/** Secousse brève (impact d'un tampon) : style animé et déclencheur. */
export function useJolt(amplitude = 5) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const trigger = useCallback(() => {
    const lin = Easing.linear;
    x.value = withSequence(withTiming(-amplitude, { duration: 70, easing: lin }), withTiming(amplitude * 0.8, { duration: 80, easing: lin }), withTiming(-amplitude * 0.4, { duration: 90, easing: lin }), withTiming(0, { duration: 110, easing: lin }));
    y.value = withSequence(withTiming(amplitude * 0.6, { duration: 70, easing: lin }), withTiming(-amplitude * 0.4, { duration: 80, easing: lin }), withTiming(amplitude * 0.2, { duration: 90, easing: lin }), withTiming(0, { duration: 110, easing: lin }));
    haptic.heavy();
  }, [amplitude, x, y]);
  return { style, trigger };
}

/** Coup de cœur : agrandissement bref (1 → 1,32 → 0,9 → 1). */
export function usePop() {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const trigger = useCallback(() => {
    s.value = withSequence(withTiming(1.32, { duration: 160, easing: ease.out }), withTiming(0.9, { duration: 130 }), withTiming(1, { duration: 160, easing: ease.out }));
  }, [s]);
  return { style, trigger };
}

type Piece = { angle: number; size: [number, number]; round: boolean; color: string; distance: number; spin: number; delay: number; duration: number };

/** Générateur pseudo-aléatoire déterministe (la même gerbe à chaque rejeu). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Gerbe de confettis depuis un point : chaque pièce part dans sa direction (rayon de 110 à 290 px),
 * tourne et s'efface. `colors` alterne les teintes ; `delay` en ms.
 */
export function Confetti({
  x,
  y,
  count = 34,
  palette = ['#FFFFFF', colors.gold, 'rgba(255,255,255,0.55)'],
  delay = 740,
  seed = 11,
  reach = [120, 190, 260],
}: {
  x: number;
  y: number;
  count?: number;
  palette?: string[];
  delay?: number;
  seed?: number;
  reach?: [number, number, number];
}) {
  const reduced = useReducedMotion();
  const pieces = useMemo<Piece[]>(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => {
      const round = i % 3 === 0;
      return {
        angle: Math.round(i * (360 / count) + rnd() * 8),
        size: round ? [8, 8] : [6, 14],
        round,
        color: palette[i % palette.length],
        distance: reach[i % 3] + rnd() * 20,
        spin: 160 + (i % 3) * 60 + rnd() * 120,
        delay: delay + rnd() * 120,
        duration: 1500 + rnd() * 500,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, delay, seed]);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: ease.burst }));
  }, [p, piece]);
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 0.7, 1], [0, -piece.distance, -piece.distance * 1.1]) },
      { rotate: `${interpolate(p.value, [0, 1], [0, piece.spin])}deg` },
      { scale: interpolate(p.value, [0, 0.7, 1], [0.3, 1, 0.8]) },
    ],
  }));
  const [w, h] = piece.size;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: [{ rotate: `${piece.angle}deg` }] }}>
      <Animated.View
        style={[{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: piece.round ? w / 2 : 2, backgroundColor: piece.color }, animated]}
      />
    </View>
  );
}

/** Étincelles autour d'un bouton aimé : 8 points qui s'écartent et s'effacent. */
export function Sparks({ color = colors.accent, alt = colors.gold, radius = 30, playKey }: { color?: string; alt?: string; radius?: number; playKey: number }) {
  const reduced = useReducedMotion();
  if (reduced || playKey === 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <Spark key={`${playKey}-${i}`} angle={i * 45} color={i % 2 ? alt : color} radius={radius} />
      ))}
    </View>
  );
}

function Spark({ angle, color, radius }: { angle: number; color: string; radius: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 550, easing: ease.out });
  }, [p]);
  const animated = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateY: -radius - p.value * 22 }, { scale: 1 - p.value * 0.6 }],
  }));
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: [{ rotate: `${angle}deg` }] }}>
      <Animated.View style={[{ position: 'absolute', left: -3, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: color }, animated]} />
    </View>
  );
}

/** Ligne de scan qui balaie une zone en boucle (vérification du diplôme). */
export function ScanLine({ height, color = colors.accent, from = 0.22, to = 0.72, duration = 1200 }: { height: number; color?: string; from?: number; to?: number; duration?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(withTiming(1, { duration, easing: ease.inOut }), -1, true);
    return () => cancelAnimation(p);
  }, [duration, p, reduced]);
  const animated = useAnimatedStyle(() => ({ top: height * (from + (to - from) * p.value) }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: '14%', right: '14%', height: 3, borderRadius: 2, backgroundColor: color, boxShadow: `0px 0px 12px ${color}` }, animated]}
    />
  );
}

/** Valeur animée de 0 à 1 après `delay` (barres de progression, jauges, anneaux). */
export function useProgress(target: number, { delay = 0, duration = 900 }: { delay?: number; duration?: number } = {}) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? target : 0);
  const first = useRef(true);
  useEffect(() => {
    if (reduced) {
      v.value = target;
      return;
    }
    v.value = withDelay(first.current ? delay : 0, withTiming(target, { duration, easing: ease.out }));
    first.current = false;
  }, [delay, duration, reduced, target, v]);
  return v;
}

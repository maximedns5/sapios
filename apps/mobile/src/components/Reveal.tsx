import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ease } from '@/lib/theme';

type Props = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  /** Relance l'animation quand la clé change. */
  playKey?: unknown;
  style?: StyleProp<ViewStyle>;
  /** false : reste masqué (pour piloter l'entrée plus tard). */
  play?: boolean;
};

/** Apparition par masque : le contenu monte de sous sa ligne de base (courbe expo.out). */
export function Reveal({ children, delay = 0, duration = 800, playKey, style, play = true }: Props) {
  const reduced = useReducedMotion();
  const height = useSharedValue(reduced ? 0 : 4000);
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    if (!play) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration, easing: ease.expoOut }));
  }, [delay, duration, play, playKey, progress, reduced]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height.value * 1.12 }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height || 4000;
  };

  return (
    <View style={style}>
      <View style={{ overflow: 'hidden', paddingBottom: 4, marginBottom: -4, paddingRight: 8, marginRight: -8 }}>
        <Animated.View onLayout={onLayout} style={animated}>
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

/** Lignes révélées en cascade (stagger de la vidéo : 70 à 90 ms). */
export function RevealLines({
  lines,
  delay = 0,
  stagger = 80,
  duration,
  play,
  playKey,
}: {
  lines: ReactNode[];
  delay?: number;
  stagger?: number;
  duration?: number;
  play?: boolean;
  playKey?: unknown;
}) {
  // Conteneur propre : un `gap` parent ne doit pas écarter les lignes d'un même titre.
  return (
    <View>
      {lines.map((line, i) => (
        <Reveal key={i} delay={delay + i * stagger} duration={duration} play={play} playKey={playKey}>
          {line}
        </Reveal>
      ))}
    </View>
  );
}

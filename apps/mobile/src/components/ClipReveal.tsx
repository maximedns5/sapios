import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type EasingFunction,
} from 'react-native-reanimated';

import { ease } from '@/lib/theme';

/** Révélation horizontale par la gauche : le contenu reste fixe, seul le bord du masque avance. */
export function ClipReveal({
  children,
  delay = 0,
  duration = 500,
  easing = ease.expoInOut,
  steps,
  play = true,
  style,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  /** Révélation par paliers (effet machine à écrire des journaux de scan). */
  steps?: number;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const p = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced || !play) return;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: steps ? Easing.steps(steps, true) : easing }));
  }, [delay, duration, easing, p, play, reduced, steps]);

  const animated = useAnimatedStyle(() => ({ width: p.value * width }));

  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ overflow: 'hidden' }, animated]}>
        <View style={{ width: width || undefined }}>{children}</View>
      </Animated.View>
    </View>
  );
}

import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { ease } from '@/lib/theme';

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Volet plein écran de la couleur de la scène précédente qui s'efface (équivalent du clip-path
 * inset(100% 0 0 0) → inset(0) de la vidéo, courbe expo.inOut).
 */
export function Volet({
  color,
  direction = 'up',
  delay = 0,
  duration = 650,
  style,
  onDone,
}: {
  color: string;
  direction?: Direction;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  onDone?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    p.value = withDelay(delay, withTiming(1, { duration, easing: ease.expoInOut }));
    const timer = setTimeout(() => onDone?.(), delay + duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => {
    const v = p.value;
    switch (direction) {
      case 'up':
        return { transform: [{ translateY: -v * height }] };
      case 'down':
        return { transform: [{ translateY: v * height }] };
      case 'left':
        return { transform: [{ translateX: -v * width }] };
      default:
        return { transform: [{ translateX: v * width }] };
    }
  });

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, zIndex: 50 }, animated, style]} />;
}

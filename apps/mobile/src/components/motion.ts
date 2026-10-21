import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';

/** Secousse de la vidéo à l'impact du tampon, mise à l'échelle d'un écran de téléphone. */
const SHAKE: [number, number, number][] = [
  [-24, 14, 35],
  [20, -12, 35],
  [-14, 8, 40],
  [9, -5, 45],
  [-4, 2, 50],
  [0, 0, 60],
];

export function useShake(scale = 0.5) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const trigger = () => {
    const lin = Easing.linear;
    x.value = withSequence(...SHAKE.map(([dx, , d]) => withTiming(dx * scale, { duration: d, easing: lin })));
    y.value = withSequence(...SHAKE.map(([, dy, d]) => withTiming(dy * scale, { duration: d, easing: lin })));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };
  return { style, trigger };
}

export function tapFeedback() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

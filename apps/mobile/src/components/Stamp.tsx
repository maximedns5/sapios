import { useEffect } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ease, fonts, tracking } from '@/lib/theme';
import { Label } from './Text';
import { useTone } from './Tone';

/** Tampon « REFUSÉ » : double filet intérieur, rotation -9°, chute de ×2,8 à ×1 en 160 ms (power4.in). */
export function Stamp({
  word,
  sub,
  delay = 0,
  size = 52,
  rotate = -9,
  onLand,
  play = true,
  style,
  testID,
}: {
  word: string;
  sub?: string;
  delay?: number;
  size?: number;
  rotate?: number;
  onLand?: () => void;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { fg, bg } = useTone();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!play) return;
    if (reduced) {
      onLand?.();
      return;
    }
    p.value = withDelay(
      delay,
      withTiming(1, { duration: 160, easing: ease.power4In }, (done) => {
        if (done && onLand) scheduleOnRN(onLand);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value > 0 ? 1 : 0,
    transform: [{ rotate: `${rotate}deg` }, { scale: 2.8 - 1.8 * p.value }],
  }));

  const border = Math.max(4, size / 13);
  return (
    <Animated.View testID={testID} pointerEvents="none" style={[{ alignSelf: 'center' }, animated, style]}>
      <View style={{ borderWidth: border, borderColor: fg, backgroundColor: bg, padding: border * 0.6 }}>
        <View style={{ borderWidth: 1.5, borderColor: fg, paddingHorizontal: size * 0.32, paddingTop: size * 0.18, paddingBottom: size * 0.14, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: fonts.sansBold,
              fontSize: size,
              lineHeight: size * 0.98,
              letterSpacing: size * 0.03,
              color: fg,
            }}
          >
            {word}
          </Text>
          {sub ? (
            <Label size={Math.max(9, size * 0.16)} style={{ marginTop: size * 0.12, letterSpacing: tracking(Math.max(9, size * 0.16), 0.32) }}>
              {sub}
            </Label>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

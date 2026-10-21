import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ease, palette, type Tone } from '@/lib/theme';
import { Signature } from './Icons';
import { Label, Title } from './Text';
import { ToneProvider, useTone } from './Tone';

export type DiplomaContent = {
  issuer: string;
  number: string;
  kicker: string;
  degree: string;
  lines: string[];
  seal: string;
  signatory: string;
};

const RATIO = 560 / 820;

function Card({ content, width }: { content: DiplomaContent; width: number }) {
  const { fg, bg } = useTone();
  const height = width * RATIO;
  const k = width / 342;
  return (
    <View style={{ width, height, backgroundColor: bg, borderWidth: 1.5, borderColor: fg, padding: 18 * k, justifyContent: 'space-between' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 0.75, borderColor: fg }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Label size={7.5 * k} numberOfLines={1} style={{ flexShrink: 1, letterSpacing: 7.5 * k * 0.18 }}>
          {content.issuer}
        </Label>
        <Label size={7.5 * k} style={{ letterSpacing: 7.5 * k * 0.18 }}>
          {content.number}
        </Label>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Label size={8 * k} style={{ letterSpacing: 8 * k * 0.36 }}>
          {content.kicker}
        </Label>
        <Title size={40 * k} numberOfLines={1} adjustsFontSizeToFit style={{ letterSpacing: 40 * k * 0.07, lineHeight: 40 * k * 1.3, marginTop: -2 * k, marginBottom: 0, textAlign: 'center' }}>
          {content.degree}
        </Title>
        {content.lines.map((line, i) => (
          <Title key={i} size={11 * k} numberOfLines={1} style={{ lineHeight: 11 * k * 1.4, textAlign: 'center' }}>
            {line}
          </Title>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View
          style={{
            width: 40 * k,
            height: 40 * k,
            borderRadius: 20 * k,
            borderWidth: 1,
            borderColor: fg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: 3 * k,
              left: 3 * k,
              right: 3 * k,
              bottom: 3 * k,
              borderRadius: 20 * k,
              borderWidth: 0.6,
              borderColor: fg,
            }}
          />
          <Title size={7.5 * k} style={{ letterSpacing: 7.5 * k * 0.12 }}>
            {content.seal}
          </Title>
        </View>
        <View style={{ width: 96 * k, alignItems: 'center' }}>
          <Signature width={88 * k} />
          <View style={{ borderTopWidth: 0.75, borderColor: fg, paddingTop: 3, alignSelf: 'stretch', alignItems: 'center' }}>
            <Label size={5.5 * k} numberOfLines={1} style={{ letterSpacing: 5.5 * k * 0.2 }}>
              {content.signatory}
            </Label>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Carte de diplôme avec barre de scan : la barre est une fenêtre sur la copie inversée de la carte,
 * ce qui reproduit le mix-blend-mode: difference de la vidéo avec deux couleurs seulement.
 */
export function ScanCard({
  content,
  tone = 'light',
  scanning = true,
  loop = false,
  delay = 0,
  style,
}: {
  content: DiplomaContent;
  tone?: Tone;
  scanning?: boolean;
  loop?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const height = width * RATIO;
  const band = Math.max(40, height * 0.27);
  const reduced = useReducedMotion();
  const y = useSharedValue(-band - 10);

  useEffect(() => {
    if (!width || !scanning || reduced) return;
    const down = withTiming(height, { duration: 450 * 1.6, easing: ease.power2InOut });
    const up = withTiming(-band - 10, { duration: 450 * 1.6, easing: ease.power2InOut });
    y.value = withDelay(delay, loop ? withRepeat(withSequence(down, up), -1) : withSequence(down, up));
    return () => cancelAnimation(y);
  }, [band, delay, height, loop, reduced, scanning, width, y]);

  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -y.value }] }));
  const inverted = tone === 'light' ? 'dark' : 'light';

  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View style={{ width, height, overflow: 'hidden' }}>
          <ToneProvider tone={tone}>
            <Card content={content} width={width} />
          </ToneProvider>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height: band, overflow: 'hidden' }, windowStyle]}>
            <Animated.View style={[{ width, height, backgroundColor: palette(inverted).bg }, innerStyle]}>
              <ToneProvider tone={inverted}>
                <Card content={content} width={width} />
              </ToneProvider>
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

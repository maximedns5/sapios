import { Text } from 'react-native';

import { fonts } from '@/lib/theme';
import { useTone } from './Tone';

/** Logotype « sapios » : Bodoni Moda italique, seul usage de la serif dans l'app. */
export function Wordmark({ size = 30, color }: { size?: number; color?: string }) {
  const { fg } = useTone();
  return (
    <Text
      accessibilityLabel="Sapios"
      style={{ fontFamily: fonts.wordmark, fontSize: size, lineHeight: Math.round(size * 1.25), letterSpacing: -size * 0.01, color: color ?? fg }}
    >
      sapios
    </Text>
  );
}

import { Text as RNText, type TextProps, type TextStyle, type StyleProp } from 'react-native';

import { fonts, tracking } from '@/lib/theme';
import { useTone } from './Tone';

type Props = TextProps & { style?: StyleProp<TextStyle>; color?: string };

function useColor(color?: string) {
  const { fg } = useTone();
  return color ?? fg;
}

/** Étiquette : monospace, capitales, interlettrage 0,2em. */
export function Label({ style, color, size = 11, children, ...rest }: Props & { size?: number }) {
  const c = useColor(color);
  return (
    <RNText
      {...rest}
      style={[
        { fontFamily: fonts.mono, fontSize: size, letterSpacing: tracking(size), textTransform: 'uppercase', color: c, lineHeight: size * 1.5 },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** Titre Didone (Bodoni Moda). L'italique d'accent passe par <Em>. */
export function Title({ style, color, size = 44, children, ...rest }: Props & { size?: number }) {
  const c = useColor(color);
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: fonts.serif, fontSize: size, lineHeight: size * 1.04, color: c, letterSpacing: -size * 0.005 }, style]}
    >
      {children}
    </RNText>
  );
}

export function Em({ style, children, ...rest }: Props) {
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.serifItalic }, style]}>
      {children}
    </RNText>
  );
}

/** Accroche sans-serif grasse, serrée (ligne « v1 » des verdicts). */
export function Strong({ style, color, size = 26, children, ...rest }: Props & { size?: number }) {
  const c = useColor(color);
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: fonts.sansBold, fontSize: size, lineHeight: size * 1.08, letterSpacing: -size * 0.02, color: c }, style]}
    >
      {children}
    </RNText>
  );
}

export function Body({ style, color, size = 16, children, ...rest }: Props & { size?: number }) {
  const c = useColor(color);
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.sans, fontSize: size, lineHeight: size * 1.5, color: c }, style]}>
      {children}
    </RNText>
  );
}

export function Mono({ style, color, size = 13, children, ...rest }: Props & { size?: number }) {
  const c = useColor(color);
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.mono, fontSize: size, lineHeight: size * 1.4, color: c }, style]}>
      {children}
    </RNText>
  );
}

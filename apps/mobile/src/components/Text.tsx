import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/lib/theme';
import { useTone } from './Tone';

type Props = TextProps & { style?: StyleProp<TextStyle>; color?: string; size?: number; align?: TextStyle['textAlign'] };

/** Titre de niveau h1/h2 pour les lecteurs d'écran (role="heading", aria-level sur le web). */
export function heading(level: 1 | 2 | 3): object {
  return { role: 'heading', 'aria-level': level };
}

/** Grand titre d'écran : extra-gras, serré. Annoncé comme titre de niveau 1. */
export function Title({ style, color, size = 32, align, children, ...rest }: Props) {
  const { fg } = useTone();
  return (
    <RNText
      {...heading(1)}
      {...rest}
      style={[
        { fontFamily: fonts.extrabold, fontSize: size, lineHeight: Math.round(size * 1.14), letterSpacing: -size * 0.02, color: color ?? fg, textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** Titre de section (h2). */
export function Heading({ style, color, size = 20, align, children, ...rest }: Props) {
  const { fg } = useTone();
  return (
    <RNText
      {...heading(2)}
      {...rest}
      style={[{ fontFamily: fonts.extrabold, fontSize: size, lineHeight: Math.round(size * 1.3), letterSpacing: -size * 0.01, color: color ?? fg, textAlign: align }, style]}
    >
      {children}
    </RNText>
  );
}

type Weight = 'regular' | 'semibold' | 'bold' | 'extrabold';

/** Texte courant (16 px par défaut). `secondary` et `muted` adoucissent la couleur sur fond clair. */
export function Body({
  style,
  color,
  size = 16,
  align,
  weight = 'regular',
  secondary,
  muted,
  children,
  ...rest
}: Props & { weight?: Weight; secondary?: boolean; muted?: boolean }) {
  const tone = useTone();
  const ink = color ?? (muted ? tone.muted : secondary && tone.tone === 'light' ? colors.secondary : tone.fg);
  return (
    <RNText {...rest} style={[{ fontFamily: fonts[weight], fontSize: size, lineHeight: Math.round(size * 1.5), color: ink, textAlign: align }, style]}>
      {children}
    </RNText>
  );
}

/** Texte d'appoint (13,5 px, atténué) : aides, horodatages, mentions. Jamais sous 13 px. */
export function Small({ style, color, size = 13.5, align, weight = 'regular', children, ...rest }: Props & { weight?: Weight }) {
  const { muted } = useTone();
  return (
    <RNText {...rest} style={[{ fontFamily: fonts[weight], fontSize: Math.max(13, size), lineHeight: Math.round(Math.max(13, size) * 1.45), color: color ?? muted, textAlign: align }, style]}>
      {children}
    </RNText>
  );
}

/** Surtitre en couleur d'accent (« Bienvenue chez Sapios »). */
export function Eyebrow({ style, color, size = 15, align, children, ...rest }: Props) {
  const { tone, fg } = useTone();
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.bold, fontSize: size, lineHeight: Math.round(size * 1.4), color: color ?? (tone === 'accent' ? fg : colors.accent), textAlign: align }, style]}>
      {children}
    </RNText>
  );
}

/** Étiquette de champ ou de réglage (14 px, demi-gras). */
export function Label({ style, color, size = 14, align, children, ...rest }: Props) {
  const { fg } = useTone();
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.semibold, fontSize: size, lineHeight: Math.round(size * 1.4), color: color ?? fg, textAlign: align }, style]}>
      {children}
    </RNText>
  );
}

/** Gras dans un paragraphe. */
export function Strong({ style, color, children, ...rest }: Props) {
  return (
    <RNText {...rest} style={[{ fontFamily: fonts.bold, color }, style]}>
      {children}
    </RNText>
  );
}

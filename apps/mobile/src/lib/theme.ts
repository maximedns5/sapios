import { Easing } from 'react-native-reanimated';

/** Les deux seules couleurs de la charte. Les accents passent par l'inversion. */
export const INK = '#0B0B0B';
export const PAPER = '#F4F3EF';

export type Tone = 'light' | 'dark';

export type Palette = { bg: string; fg: string; tone: Tone };

export function palette(tone: Tone): Palette {
  return tone === 'light' ? { bg: PAPER, fg: INK, tone } : { bg: INK, fg: PAPER, tone };
}

export function invert(tone: Tone): Tone {
  return tone === 'light' ? 'dark' : 'light';
}

/** Variante transparente d'une des deux couleurs (filets, pointillés). */
export function alpha(color: string, a: number): string {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const fonts = {
  serif: 'BodoniModa_400Regular',
  serifItalic: 'BodoniModa_400Regular_Italic',
  serifMedium: 'BodoniModa_500Medium',
  sansLight: 'Inter_300Light',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_700Bold',
} as const;

/** Interlettrage 0,2em des étiquettes. */
export const tracking = (size: number, em = 0.2) => size * em;

/** Courbes de la vidéo de lancement. */
export const ease = {
  expoOut: Easing.out(Easing.exp),
  expoInOut: Easing.inOut(Easing.exp),
  power4In: Easing.in(Easing.poly(4)),
  power2InOut: Easing.inOut(Easing.quad),
  power3Out: Easing.out(Easing.cubic),
};

export const space = { gutter: 24, xs: 4, s: 8, m: 16, l: 24, xl: 40 };

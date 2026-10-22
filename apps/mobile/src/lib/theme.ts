import { Easing } from 'react-native-reanimated';

/**
 * Direction simple : fond blanc, surfaces chaudes, une seule couleur d'accent. Changer `ACCENT` suffit à
 * recolorer toute l'app (boutons, onglet actif, badges, animations).
 */
export const ACCENT = '#4338E0';

export const colors = {
  bg: '#FFFFFF',
  surface: '#F4F2EF',
  surfaceSoft: '#FAF9F7',
  text: '#1A1918',
  secondary: '#4A4744',
  muted: '#6B6762',
  line: '#ECE8E3',
  disabled: '#DDD8D2',
  gold: '#F2C14E',
  danger: '#B3261E',
  accent: ACCENT,
  onAccent: '#FFFFFF',
  /** Fond des photos absentes ou en chargement. */
  photo: '#DCD5CD',
  photoInk: '#CBC2B8',
} as const;

export type Tone = 'light' | 'accent';

export type Palette = { bg: string; fg: string; muted: string; tone: Tone };

export function palette(tone: Tone): Palette {
  return tone === 'accent'
    ? { bg: colors.accent, fg: colors.onAccent, muted: 'rgba(255,255,255,0.82)', tone }
    : { bg: colors.bg, fg: colors.text, muted: colors.muted, tone };
}

/** Variante transparente d'une couleur hexadécimale (#RRGGBB). */
export function alpha(color: string, a: number): string {
  const n = parseInt(color.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  /** Logotype « sapios » uniquement. */
  wordmark: 'BodoniModa_500Medium_Italic',
} as const;

export const radius = { card: 24, sheet: 28, tile: 18, field: 16, pill: 999 } as const;

export const space = { gutter: 20, xs: 4, s: 8, m: 16, l: 24, xl: 40 } as const;

/** Ombres portées (boxShadow, rendu natif et web). */
export const shadow = {
  button: '0px 4px 14px rgba(26, 25, 24, 0.18)',
  floating: '0px 6px 18px rgba(26, 25, 24, 0.22)',
  card: '0px 18px 40px rgba(26, 25, 24, 0.18)',
  soft: '0px 2px 8px rgba(26, 25, 24, 0.12)',
} as const;

/** Courbes des maquettes : sortie douce (entrées), ressort (pop), symétrique (boucles). */
export const ease = {
  out: Easing.bezier(0.2, 0.8, 0.2, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  inOut: Easing.inOut(Easing.cubic),
  in: Easing.bezier(0.55, 0, 0.75, 0.2),
  burst: Easing.bezier(0.15, 0.75, 0.3, 1),
};

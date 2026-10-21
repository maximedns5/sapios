import { Dimensions, useWindowDimensions } from 'react-native';

/** Au-delà, mise en page « ordinateur » : navigation latérale, messages en deux colonnes. */
export const WIDE = 960;

/** Largeur des colonnes de lecture (parcours, compte) ; la découverte et les listes en ont une à elles. */
export const COLUMN = 560;
export const COLUMN_WIDE = 600;
/** Largeur de la navigation latérale (grand écran). */
export const SIDE_NAV = 236;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE;
  return { width, height, wide, column: wide ? COLUMN_WIDE : COLUMN };
}

/** Pour les fonctions hors composant (navigation). */
export function isWideNow(): boolean {
  return Dimensions.get('window').width >= WIDE;
}

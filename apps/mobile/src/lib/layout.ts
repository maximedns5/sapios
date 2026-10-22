import { useWindowDimensions } from 'react-native';

/** Au-delà, l'app reste une colonne de téléphone centrée sur un fond chaud. */
export const WIDE = 760;

/** Largeur de la colonne de l'app (toutes les pages, onglets compris). */
export const COLUMN = 520;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE;
  return { width, height, wide, column: COLUMN, columnWidth: Math.min(width, COLUMN) };
}

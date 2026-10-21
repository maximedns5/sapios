import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Vrai quand l'app est au premier plan (sur le web : onglet visible). */
export function isForeground(): boolean {
  return AppState.currentState === 'active' || AppState.currentState == null;
}

export function useForeground(): boolean {
  const [foreground, setForeground] = useState(isForeground());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => sub.remove();
  }, []);
  return foreground;
}

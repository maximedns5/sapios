import * as Location from 'expo-location';

import { api } from './api';

/**
 * Position approximative : permission « pendant l'utilisation », arrondi à 0,01° (environ 1 km) avant
 * l'envoi. La position précise ne quitte jamais l'appareil.
 */
export async function shareApproxLocation(): Promise<'done' | 'denied'> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return 'denied';
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const round = (v: number) => Math.round(v * 100) / 100;
  await api.setLocation(round(pos.coords.latitude), round(pos.coords.longitude));
  return 'done';
}

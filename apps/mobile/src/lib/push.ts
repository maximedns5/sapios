import type { PushData as SharedPushData } from '@sapios/shared';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { EAS_PROJECT_ID } from './env';
import { INK } from './theme';
import { supabase } from './supabase';

export type PushResult = 'registered' | 'denied' | 'unavailable';

/** Le web n'a pas de push Expo : le module natif est neutralisé, pas supprimé. */
export const PUSH_SUPPORTED = Platform.OS !== 'web';

if (PUSH_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as PushData | undefined;
      // Pas de bannière pour un message de la conversation déjà ouverte.
      const silent = data?.type === 'message' && data.match_id != null && data.match_id === activeChatId;
      return { shouldShowBanner: !silent, shouldShowList: !silent, shouldPlaySound: !silent, shouldSetBadge: false };
    },
  });
}

/** Champ data des notifications (contrat partagé), lu de façon tolérante. */
export type PushData = Partial<SharedPushData & { match_id: string; message_id: string; copy_key: string }>;

let activeChatId: string | null = null;
export function setActiveChat(matchId: string | null) {
  activeChatId = matchId;
}
export function getActiveChat(): string | null {
  return activeChatId;
}

export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
  if (!PUSH_SUPPORTED) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

/** Demande la permission, récupère le jeton Expo et l'enregistre dans push_tokens. */
export async function registerForPush(userId: string, ask = true): Promise<PushResult> {
  if (!PUSH_SUPPORTED || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Sapios',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: INK,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  if (!EAS_PROJECT_ID) return 'unavailable';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    const { error } = await supabase.from('push_tokens').upsert({ user_id: userId, token, platform }, { onConflict: 'token' });
    if (error && error.code !== '23505') return 'unavailable';
    return 'registered';
  } catch {
    return 'unavailable';
  }
}

/** Route ouverte au tap sur une notification. */
export function routeForPush(data: PushData | undefined): string | null {
  if (!data?.type) return null;
  if ((data.type === 'message' || data.type === 'match') && data.match_id) return `/chat/${data.match_id}`;
  if (data.type === 'verdict') return '/';
  return null;
}

import type { EmploiNotifyEvent } from '@sapios/shared';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { EAS_PROJECT_ID } from './env';
import { ACCENT } from './theme';
import { supabase } from './supabase';

export type PushResult = 'registered' | 'denied' | 'unavailable';

/** Le web n'a pas de push Expo : le module natif est neutralisé, pas supprimé. */
export const PUSH_SUPPORTED = Platform.OS !== 'web';

/**
 * Champ data des notifications, lu de façon tolérante : `{ type: "emploi", event, id }` (candidature,
 * invitation ou offre selon l'événement), `{ type: "verdict" }` pour le badge diplôme.
 */
export type PushData = Partial<{
  type: string;
  event: EmploiNotifyEvent;
  id: string;
  application_id: string;
  offer_id: string;
  invitation_id: string;
}>;

if (PUSH_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as PushData | undefined;
      // Pas de bannière pour un message de la conversation déjà ouverte.
      const silent = data?.type === 'emploi' && data.event === 'message' && !!activeChatId && applicationOf(data) === activeChatId;
      return { shouldShowBanner: !silent, shouldShowList: !silent, shouldPlaySound: !silent, shouldSetBadge: false };
    },
  });
}

let activeChatId: string | null = null;
export function setActiveChat(applicationId: string | null) {
  activeChatId = applicationId;
}
export function getActiveChat(): string | null {
  return activeChatId;
}

function applicationOf(data: PushData): string | null {
  return data.application_id ?? (data.event && data.event !== 'invitation_received' ? data.id ?? null : null);
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
      lightColor: ACCENT,
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
  if (data.type === 'verdict') return '/profile';
  if (data.type !== 'emploi') return null;
  if (data.event === 'invitation_received') return '/applications';
  const application = applicationOf(data);
  if (!application) return '/applications';
  if (data.event === 'message' || data.event === 'interview_proposed') return `/chat/${application}`;
  if (data.event === 'application_interested') return `/match/${application}`;
  return `/applications/${application}`;
}

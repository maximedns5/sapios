import 'react-native-url-polyfill/auto';
import type { Database } from '@sapios/shared';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { chunkedSecureStore } from './secureStorage';

const webStorage = {
  getItem: (key: string) => (typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

/** Client typé par les types générés depuis la base locale (packages/shared/src/database.types.ts). */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

let channelSeq = 0;
/**
 * Nom de canal Realtime unique par abonnement : supabase.channel() renvoie le canal existant pour un même
 * sujet, et un écran remonté avant la fin de removeChannel() ne pourrait plus y ajouter ses écouteurs.
 */
export function channelName(prefix: string): string {
  channelSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${channelSeq}`;
}

import 'react-native-url-polyfill/auto';
import type { Database } from '@sapios/shared';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { chunkedSecureStore } from './secureStorage';

// Session web dans localStorage : elle survit au rechargement et à la fermeture de l'onglet.
// Navigation privée stricte ou stockage plein : on retombe sur une session en mémoire.
const memory = new Map<string, string>();
const webStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // rien à effacer
    }
    memory.delete(key);
  },
};

const missing = [
  ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
].filter(([, v]) => !v);
if (missing.length) {
  throw new Error(`Variable(s) manquante(s) : ${missing.map(([k]) => k).join(', ')} (voir apps/mobile/.env.example).`);
}

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

import Constants from 'expo-constants';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Connexion par mot de passe : comptes de test du seed, jamais proposée en production. */
export const PASSWORD_LOGIN = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_PASSWORD_LOGIN === 'true';

const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
export const EAS_PROJECT_ID: string | undefined =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID || extra.eas?.projectId || Constants.easConfig?.projectId || undefined;

export const CONTACT_EMAIL = process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'contact@sapios.app';

/** Site public (landing) : pages légales et contact. À régler sur l'hébergeur (EXPO_PUBLIC_SITE_URL). */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://sapios.app').replace(/\/$/, '');

/** Espace recruteur (site Next) : un compte recruteur qui ouvre l'app y est renvoyé. */
export const RECRUITER_URL = `${SITE_URL}/recruteur`;

/**
 * Adresse de l'app candidat. Sur le web, l'origine de la page ; sur téléphone, EXPO_PUBLIC_APP_URL
 * (repli : le site public).
 */
export const APP_URL = (
  process.env.EXPO_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '') ||
  SITE_URL
).replace(/\/$/, '');

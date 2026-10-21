import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { AppError } from './errors';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Retour d'authentification (lien magique, Google) : sapios://auth/callback sur natif ; sur le web, l'origine
 * de la page (préproduction, production ou local), à déclarer dans les Redirect URLs de Supabase.
 */
export const OAUTH_REDIRECT =
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback');

export type Providers = { apple: boolean; google: boolean; email: boolean };

/** Fournisseurs activés côté GoTrue (/auth/v1/settings) : un bouton non configuré est désactivé. */
export async function fetchProviders(): Promise<Providers> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    const json = (await res.json()) as { external?: Record<string, boolean> };
    const ext = json.external ?? {};
    return { apple: !!ext.apple, google: !!ext.google, email: ext.email !== false };
  } catch {
    return { apple: false, google: false, email: true };
  }
}

export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function authError(error: { message?: string; code?: string; status?: number } | null): AppError {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login/i.test(message)) return new AppError('invalid_credentials');
  if (code === 'otp_expired' || /token has expired|invalid/i.test(message)) return new AppError('otp_invalid');
  if (code === 'over_email_send_rate_limit' || error?.status === 429) return new AppError('over_email_send_rate_limit');
  if (code === 'email_address_invalid' || /email/i.test(message)) return new AppError('email_invalid');
  if (/fetch|network/i.test(message)) return new AppError('network');
  return new AppError('unknown', message);
}

/** Code à 6 chiffres (si le modèle d'email le contient) et lien magique PKCE vers /auth/callback. */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: OAUTH_REDIRECT } });
  if (error) throw authError(error);
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw authError(error);
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
}

/** Apple : jeton d'identité natif + nonce, échangé par signInWithIdToken. */
export async function signInWithApple() {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) throw new AppError('unknown');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
    if (error) throw authError(error);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AppError('cancelled');
    throw e instanceof AppError ? e : new AppError('unknown');
  }
}

/** Google : OAuth PKCE dans un navigateur système, retour sur sapios://auth/callback. */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new AppError('provider_unavailable');
  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
  if (result.type !== 'success') throw new AppError('cancelled');
  await completeOAuth(result.url);
}

export async function completeOAuth(url: string) {
  const parsed = new URL(url);
  const err = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (err) throw new AppError('unknown', err);
  await exchangeCode(parsed.searchParams.get('code'));
}

/** Échange PKCE ; sans effet si la session existe déjà (le lien profond peut arriver deux fois). */
export async function exchangeCode(code: string | null | undefined) {
  if ((await supabase.auth.getSession()).data.session) return;
  if (!code) throw new AppError('unknown');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error && !(await supabase.auth.getSession()).data.session) throw authError(error);
}

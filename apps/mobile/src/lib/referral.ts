import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeReferralCode, referralLink, REFERRAL_CODE_PATTERN } from '@sapios/shared';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { APP_URL } from './env';

/*
 * Lien de recommandation (`<app>/?ref=CODE`) : le code est lu à l'ouverture, gardé pendant la connexion
 * (aller-retour par email compris), puis utilisé une seule fois par `claim_referral` et oublié. Un code
 * expiré ou déjà utilisé ne bloque jamais l'inscription.
 */

const KEY = 'sapios.referral';
/** Un lien oublié dans un onglet ne doit pas resurgir des mois plus tard. */
const TTL = 30 * 24 * 3600 * 1000;

type Stored = { code: string; at: number };

/** Code valide lu dans une adresse (`?ref=`), normalisé comme en base ; sinon null. */
export function refFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /[?&]ref=([^&#]+)/i.exec(url);
  if (!match) return null;
  const code = normalizeReferralCode(decodeURIComponent(match[1]));
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export async function rememberReferral(raw: string): Promise<string | null> {
  const code = normalizeReferralCode(raw);
  if (!REFERRAL_CODE_PATTERN.test(code)) return null;
  await AsyncStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies Stored)).catch(() => {});
  return code;
}

export async function pendingReferral(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (!stored?.code || Date.now() - stored.at > TTL) {
      await forgetReferral();
      return null;
    }
    return stored.code;
  } catch {
    return null;
  }
}

export async function forgetReferral() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/**
 * Sur le web, l'adresse est lue tout de suite, au chargement du module : le portail de routage remplace
 * l'adresse par /sign-in dès le premier rendu, et le paramètre serait perdu.
 */
export const initialWebRef: string | null = Platform.OS === 'web' && typeof window !== 'undefined' ? refFromUrl(window.location.href) : null;
if (initialWebRef) void rememberReferral(initialWebRef);

/** Téléphone : lien d'ouverture de l'app et liens reçus pendant qu'elle tourne. */
export function listenForReferralLinks(onCode: (code: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  Linking.getInitialURL()
    .then((url) => {
      const code = refFromUrl(url);
      if (code) rememberReferral(code).then(() => onCode(code));
    })
    .catch(() => {});
  const sub = Linking.addEventListener('url', ({ url }) => {
    const code = refFromUrl(url);
    if (code) rememberReferral(code).then(() => onCode(code));
  });
  return () => sub.remove();
}

export function myReferralLink(code: string): string {
  return referralLink(APP_URL, code);
}

/** Lien affiché sans le protocole : « sapios.app/?ref=K7QM2XPA9D ». */
export function displayLink(link: string): string {
  return link.replace(/^https?:\/\//, '');
}

const SHARE_TEXT = (name: string) => `${name} se porte garant·e de vous sur Sapios. Le diplôme reste obligatoire, mais votre dossier passera en premier.`;

/** Partage du navigateur ou du téléphone ; sans partage disponible, le lien est copié. */
export async function shareReferral(link: string, name: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = SHARE_TEXT(name);
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: 'Une lettre de recommandation', text, url: link });
        return 'shared';
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      }
    }
    await copyReferral(link);
    return 'copied';
  }
  const res = await Share.share({ message: `${text} ${link}`, url: link, title: 'Une lettre de recommandation' });
  return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

export async function copyReferral(link: string) {
  await Clipboard.setStringAsync(link);
}

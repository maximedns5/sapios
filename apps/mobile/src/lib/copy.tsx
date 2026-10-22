import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PROMPTS, promptCopyKey } from '@sapios/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

/** Valeurs de repli locales : la source de vérité est la table app_copy (locale fr). */
export const FALLBACK_COPY: Record<string, string> = {
  'verdict.unlimited': 'Accès illimité. Bienvenue chez vous.',
  'verdict.standard': 'Accès toléré.',
  'verdict.waitlist': 'Vous y êtes presque.',
  'verdict.refused': 'Pas cette fois.',
  'verdict.uninstall': 'Pas cette fois.',
  'verdict.rejected': 'Document non retenu.',
  'verdict.needs_more': 'Il manque une pièce.',
  'review.delay': 'Réponse sous 48 h, souvent plus tôt.',
  'review.notice': 'Inutile de rester sur cette page : le verdict s’affichera ici à votre prochaine visite.',
  'feed.empty': 'Tous les profils qui vous correspondent sont passés. Revenez demain, ou lisez un livre.',
  'feed.empty_filters': 'Personne ne remplit vos critères. Ils sont peut-être trop élevés. Même pour nous.',
  'feed.ranking':
    'L’âge et la distance filtrent. Les niveaux et domaines choisis passent ensuite en premier, puis vos affinités (même domaine, livres et questions en commun), puis l’activité récente. Aucun profil n’est mis en avant contre paiement.',
  'intellect.sensitive':
    'Visibles par les membres admis. Évitez la santé, la religion, la politique et tout ce qui permettrait de vous retrouver (téléphone, réseaux sociaux).',
  'intellect.thesis_warning': 'Un sujet de thèse permet souvent de retrouver un nom complet en ligne. D’où « après un match » par défaut.',
  'likes.teaser': 'Elles sont déjà dans votre découverte. Likez-les en retour pour faire match.',
  'quiz.badge': 'QI : non communiqué. Par modestie.',
  'match.title': 'Intellectuellement compatibles.',
  'onboarding.consent':
    'Les genres que vous recherchez révèlent votre orientation sexuelle, une donnée sensible. Nous ne l’utilisons que pour composer votre feed, jamais pour autre chose. Votre consentement est facultatif, séparé et révocable à tout moment depuis votre compte ; sans lui, vous ne pourrez pas apparaître dans le feed.',
  'push.match': 'Nouveau match. Quelqu’un vous trouve à la hauteur.',
  'push.message': 'Nouveau message. Probablement sans faute d’orthographe.',
  'push.verdict': 'Votre verdict est tombé. Asseyez-vous.',
};

// Questions du profil : le texte du back-office (`prompt.<key>`) prime, le catalogue livré sert de repli.
for (const [key, text] of Object.entries(DEFAULT_PROMPTS)) FALLBACK_COPY[promptCopyKey(key)] = text;

const CACHE_KEY = 'sapios.copy.fr';

type CopyContext = { t: (key: string) => string; reload: () => Promise<void> };

const Ctx = createContext<CopyContext>({ t: (key) => FALLBACK_COPY[key] ?? key, reload: async () => {} });

export function CopyProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const [remote, setRemote] = useState<Record<string, string>>({});

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => raw && setRemote((current) => ({ ...JSON.parse(raw), ...current })))
      .catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('app_copy').select('key, text').eq('locale', 'fr');
    if (error || !data) return;
    const next: Record<string, string> = {};
    for (const row of data as { key: string; text: string }[]) next[row.key] = row.text;
    setRemote(next);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    // app_copy n'est lisible qu'une fois connecté : avant, les valeurs de repli suffisent.
    if (userId) reload();
  }, [reload, userId]);

  const value = useMemo<CopyContext>(
    () => ({ t: (key) => remote[key] ?? FALLBACK_COPY[key] ?? key, reload }),
    [remote, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopy() {
  return useContext(Ctx);
}

/** « Accès illimité. Bienvenue chez vous. » → [« Accès illimité. », « Bienvenue chez vous. »] : titre et suite. */
export function splitHeadline(text: string): [string, string] {
  const clean = text.trim();
  const dot = clean.search(/[.!?…](\s|$)/);
  if (dot > 0 && dot < clean.length - 1) return [clean.slice(0, dot + 1).trim(), clean.slice(dot + 1).trim()];
  return [clean, ''];
}

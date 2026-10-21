import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

/** Valeurs de repli locales : la source de vérité est la table app_copy (locale fr). */
export const FALLBACK_COPY: Record<string, string> = {
  'verdict.unlimited': 'Accès illimité. Bienvenue chez vous.',
  'verdict.standard': 'Accès toléré.',
  'verdict.waitlist': 'Liste d’attente. On vous rappellera. Peut-être.',
  'verdict.refused': 'Diplôme non validé = pas assez intelligent.',
  'verdict.uninstall': 'Désinstallez.',
  'verdict.rejected': 'Document refusé. Nous l’avons lu deux fois. Par politesse.',
  'verdict.needs_more': 'Illisible. Même pour nous. Renvoyez une version nette, en entier, à votre nom.',
  'scan.title': 'Analyse du profil',
  'scan.log.authenticity': 'Vérification de l’authenticité du document…',
  'scan.log.level': 'Calcul du niveau d’études…',
  'scan.log.einstein': 'Comparaison avec Einstein… écart significatif.',
  'scan.pending': 'Un humain dûment diplômé relit votre dossier. La patience est une vertu des esprits supérieurs.',
  'feed.empty': 'Plus personne à votre hauteur dans les parages. Revenez demain, ou lisez un livre.',
  'match.title': 'Intellectuellement compatibles.',
  'onboarding.consent':
    'Les genres que vous recherchez révèlent votre orientation sexuelle, une donnée sensible. Nous ne l’utilisons que pour composer votre feed, jamais pour autre chose. Votre consentement est facultatif, séparé et révocable à tout moment depuis votre compte ; sans lui, vous ne pourrez pas apparaître dans le feed.',
  'push.match': 'Nouveau match. Quelqu’un vous trouve à la hauteur.',
  'push.message': 'Nouveau message. Probablement sans faute d’orthographe.',
  'push.verdict': 'Votre verdict est tombé. Asseyez-vous.',
};

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

/** Coupe un texte de verdict en accroche (sans-serif grasse) et chute (serif italique), comme la vidéo. */
export function splitVerdict(text: string): [string, string] {
  const eq = text.indexOf('= ');
  if (eq > 0) return [text.slice(0, eq + 1).trim(), text.slice(eq + 1).trim()];
  const dot = text.search(/[.!?…](\s|$)/);
  if (dot > 0 && dot < text.length - 1) return [text.slice(0, dot + 1).trim(), text.slice(dot + 1).trim()];
  return ['', text.trim()];
}

/** « Analyse du profil » → [« Analyse du », « profil. »] : le dernier mot passe en italique. */
export function splitTitle(text: string): [string, string] {
  const clean = text.trim().replace(/\.$/, '');
  const i = clean.lastIndexOf(' ');
  return i > 0 ? [clean.slice(0, i), `${clean.slice(i + 1)}.`] : ['', `${clean}.`];
}

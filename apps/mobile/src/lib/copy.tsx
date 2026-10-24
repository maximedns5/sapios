import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

/**
 * Valeurs de repli locales : la source de vérité est la table app_copy (locale fr), éditable dans le
 * back-office. Les clés de l'emploi sont préfixées `emploi.` pour ne jamais reprendre un texte du dating.
 */
export const FALLBACK_COPY: Record<string, string> = {
  'review.delay': 'Réponse sous 48 h, souvent plus tôt.',
  'emploi.terms.title': 'Avant de commencer.',
  'emploi.terms.lead': 'Nos conditions d’utilisation, en trois points. Le texte complet est à un clic.',
  'emploi.terms.point.free': 'Sapios Emploi est gratuit pour les candidats, entièrement et pour toujours.',
  'emploi.terms.point.blind': 'Votre CV reste anonyme jusqu’au match : ni nom, ni âge, ni photo. Les recruteurs décident, jamais un algorithme.',
  'emploi.terms.point.data': 'Vos données sont hébergées en Europe. Vous pouvez les exporter ou tout supprimer, à tout moment, depuis l’app.',
  'emploi.terms.checkbox': 'J’ai lu et j’accepte les conditions générales d’utilisation et la politique de confidentialité.',
  'emploi.terms.cta': 'Accepter et continuer',
  'emploi.terms.update.title': 'Nos conditions évoluent.',
  'emploi.terms.update.lead':
    'Nous avons mis à jour nos conditions d’utilisation. Pour continuer, il faut accepter la nouvelle version. Vous pouvez aussi supprimer votre compte, sans frais.',
  'emploi.terms.update.cta': 'Accepter les nouvelles conditions',
  'emploi.terms.update.delete': 'Supprimer mon compte',
  'emploi.ranking':
    'Les offres affichées sont celles de votre zone de recherche et de vos contrats. Elles sont classées par nombre de points en commun avec votre CV, puis par date de publication, puis par distance. Aucune offre n’est mise en avant contre paiement, et aucune intelligence artificielle ne trie les candidatures.',
  'emploi.feed.empty': 'Vous avez vu toutes les offres de votre zone. De nouvelles arrivent chaque semaine.',
  'notice.inactivity.title': 'Votre compte dort depuis longtemps.',
  'notice.inactivity.body': 'Sans connexion d’ici le {date}, il sera supprimé, avec toutes vos données. Vous venez de vous connecter : il est conservé.',
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

  const value = useMemo<CopyContext>(() => ({ t: (key) => remote[key] ?? FALLBACK_COPY[key] ?? key, reload }), [remote, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopy() {
  return useContext(Ctx);
}

/**
 * Remplit les emplacements d'un texte du back-office : « Sans connexion d’ici le {date}… ».
 * Un emplacement inconnu reste tel quel, pour qu'une faute de frappe se voie au lieu de disparaître.
 */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

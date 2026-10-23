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
  'affinity.book_one': 'Vous avez tous deux lu « {title} ». Ou prétendu.',
  'affinity.books_many': '{count} livres en commun, dont « {title} ».',
  'affinity.same_field': 'Même domaine : {field}. L’interdisciplinarité attendra.',
  'affinity.prompt_one': 'Vous avez répondu à la même question : « {prompt} ».',
  'affinity.prompts_many': '{count} questions en commun.',
  'affinity.same_institution': 'Même établissement : {institution}.',
  'profile.thesis_footnote': 'Les autres en ont fait 400 pages.',
  'library.empty': 'Aucun livre pour l’instant. Les titres en commun rapprochent les esprits.',
  'match.title': 'Intellectuellement compatibles.',
  'onboarding.consent':
    'Les genres que vous recherchez révèlent votre orientation sexuelle, une donnée sensible. Nous ne l’utilisons que pour composer votre feed, jamais pour autre chose. Votre consentement est facultatif, séparé et révocable à tout moment depuis votre compte ; sans lui, vous ne pourrez pas apparaître dans le feed.',
  'push.match': 'Nouveau match. Quelqu’un vous trouve à la hauteur.',
  'push.message': 'Nouveau message. Probablement sans faute d’orthographe.',
  'push.verdict': 'Votre verdict est tombé. Asseyez-vous.',
  // Lot 2 : lettres de recommandation
  'verdict.waitlist.referred': 'Liste d’attente. Mais on vous a recommandé·e : vous passez devant. Un peu.',
  'verdict.waitlist.referred.detail':
    'Les admissions se font par vagues, décidées par notre équipe. Les personnes recommandées y sont examinées en premier ; votre diplôme reste le seul critère d’accès.',
  'referral.title': 'Mes lettres de recommandation',
  'referral.lead': 'Vous vous portez garant·e de quelqu’un. Ça ne vaut pas un diplôme, mais ça aide.',
  'referral.counter': '{used} lettre(s) utilisée(s) sur {quota} ce mois-ci.',
  'referral.privacy': 'Vous ne saurez ni qui a utilisé votre lien, ni son verdict. La discrétion fait partie de la lettre.',
  'referral.banner': 'Recommandé·e par {name}.',
  // Lot 2 : événements
  'events.title': 'Agenda',
  'events.lead': 'Dîners de thèse, débats contradictoires, conférences suivies d’un verre. Tenue correcte et arguments sourcés exigés.',
  'events.empty': 'Rien à l’agenda pour l’instant. Nous préparons la suite ; vous serez prévenu·e.',
  'events.privacy': 'La liste des inscrits n’est jamais publiée : seul le nombre de places restantes est affiché.',
  'events.address_hidden': 'L’adresse exacte est donnée aux inscrits.',
  'events.charter':
    'En m’inscrivant, je m’engage à respecter chaque participant, à accepter un refus, à ne prendre ni publier aucune photo sans accord, à consommer de l’alcool avec modération et à libérer ma place si je ne peux plus venir. L’équipe présente sur place peut exclure toute personne qui manque à ces règles.',
  // Conformité : acceptation des CGU, conseils de sécurité, avis d'inactivité
  'terms.title': 'Les règles du jeu.',
  'terms.lead': 'Avant d’aller plus loin, nos conditions d’utilisation. Le ton de Sapios est volontairement excessif ; ces conditions, elles, ne le sont pas.',
  'terms.point.access': 'Sapios est réservé aux majeurs dont le diplôme a été vérifié par une personne de l’équipe.',
  'terms.point.data': 'Votre profil, vos photos et vos messages sont hébergés en Europe. Vous pouvez les exporter ou tout supprimer, à tout moment, depuis l’app.',
  'terms.point.conduct': 'Respect, aucune coordonnée sur le profil, un signalement au moindre doute.',
  'terms.checkbox': 'J’ai lu et j’accepte les conditions générales d’utilisation et la politique de confidentialité.',
  'terms.cta': 'Accepter et continuer',
  'terms.update.title': 'Nos conditions évoluent.',
  'terms.update.lead':
    'Nous avons mis à jour nos conditions d’utilisation. Pour continuer, il faut accepter la nouvelle version. Vous pouvez aussi supprimer votre compte, sans frais.',
  'terms.update.cta': 'Accepter les nouvelles conditions',
  'terms.update.delete': 'Supprimer mon compte',
  'safety.title': 'Conseils de sécurité',
  'safety.lead': 'Un dîner avec quelqu’un qui a lu Spinoza reste un premier rendez-vous. Quelques réflexes.',
  'safety.tip.public': 'Premier rendez-vous dans un lieu public et animé, que vous connaissez.',
  'safety.tip.friend': 'Prévenez un proche : où, quand, avec qui. Donnez des nouvelles après.',
  'safety.tip.transport': 'Venez et repartez par vos propres moyens.',
  'safety.tip.money': 'N’envoyez jamais d’argent, quelle que soit l’histoire. Aucun diplôme ne la rend vraie.',
  'safety.tip.instinct': 'Fiez-vous à votre instinct : partir est toujours une option.',
  'safety.tip.report': 'Au moindre doute, signalez. Chaque signalement est lu par une personne.',
  'safety.card.title': 'Avant de vous voir',
  'safety.card.body': 'Un lieu public, un proche prévenu, vos propres moyens de transport. Et un signalement au moindre doute.',
  'safety.card.more': 'Tous nos conseils',
  'safety.event.title': 'Avant l’événement',
  'safety.event.body':
    'Une personne de l’équipe Sapios est sur place. Si quelque chose vous gêne, allez la voir, ou signalez-le depuis l’app, même après.',
  'notice.inactivity.title': 'Votre compte dort depuis longtemps.',
  'notice.inactivity.body': 'Sans connexion d’ici le {date}, il sera supprimé, avec toutes vos données. Vous venez de vous connecter : il est conservé.',
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

/**
 * Remplit les emplacements d'un texte du back-office : « Vous avez tous deux lu « {title} ». »
 * Un emplacement inconnu reste tel quel, pour qu'une faute de frappe se voie au lieu de disparaître.
 */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** « Accès illimité. Bienvenue chez vous. » → [« Accès illimité. », « Bienvenue chez vous. »] : titre et suite. */
export function splitHeadline(text: string): [string, string] {
  const clean = text.trim();
  const dot = clean.search(/[.!?…](\s|$)/);
  if (dot > 0 && dot < clean.length - 1) return [clean.slice(0, dot + 1).trim(), clean.slice(dot + 1).trim()];
  return [clean, ''];
}

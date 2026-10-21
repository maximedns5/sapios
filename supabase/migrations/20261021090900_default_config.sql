-- Configuration par défaut : paliers (brief §2.2), réglages et textes (contrat §6).
-- En migration pour être appliquée partout (local, staging, prod) par `supabase db push`.
-- `do nothing` : ne remplace jamais une valeur déjà présente ou modifiée depuis le back-office.

insert into public.access_policy (min_level, tier, daily_like_quota, can_browse, sees_likers, copy_key)
values
  (8, 'unlimited', null, true,  true,  'verdict.unlimited'),
  (7, 'standard',  20,   true,  false, 'verdict.standard'),
  (6, 'waitlist',  0,    false, false, 'verdict.waitlist'),
  (4, 'refused',   0,    false, false, 'verdict.refused'),
  (1, 'refused',   0,    false, false, 'verdict.uninstall')
on conflict (min_level) do nothing;

insert into public.app_settings (key, value, description)
values
  ('feed_radius_km', '50', 'Rayon de recherche du feed, en kilomètres'),
  ('diploma_retention_days', '30', 'Jours de conservation du fichier diplôme après la décision'),
  ('max_submissions_per_30_days', '3', 'Soumissions de diplôme autorisées par période glissante de 30 jours')
on conflict (key) do nothing;

insert into public.app_copy (key, locale, text)
values
  ('verdict.unlimited', 'fr', 'Accès illimité. Bienvenue chez vous.'),
  ('verdict.standard', 'fr', 'Accès toléré.'),
  ('verdict.waitlist', 'fr', 'Liste d''attente. On vous rappellera. Peut-être.'),
  ('verdict.refused', 'fr', 'Diplôme non validé = pas assez intelligent.'),
  ('verdict.uninstall', 'fr', 'Désinstallez.'),
  ('verdict.rejected', 'fr', 'Document refusé. Nous l''avons lu deux fois. Par politesse.'),
  ('verdict.needs_more', 'fr', 'Illisible. Même pour nous. Renvoyez une version nette, en entier, à votre nom.'),
  ('scan.title', 'fr', 'Analyse du profil'),
  ('scan.log.authenticity', 'fr', 'Vérification de l''authenticité du document…'),
  ('scan.log.level', 'fr', 'Calcul du niveau d''études…'),
  ('scan.log.einstein', 'fr', 'Comparaison avec Einstein… écart significatif.'),
  ('scan.pending', 'fr', 'Un humain dûment diplômé relit votre dossier. La patience est une vertu des esprits supérieurs.'),
  ('feed.empty', 'fr', 'Plus personne à votre hauteur dans les parages. Revenez demain, ou lisez un livre.'),
  ('match.title', 'fr', 'Intellectuellement compatibles.'),
  ('onboarding.consent', 'fr', 'Les genres que vous recherchez révèlent votre orientation sexuelle, une donnée sensible. Nous ne l''utilisons que pour composer votre feed, jamais pour autre chose. Votre consentement est facultatif, séparé et révocable à tout moment depuis votre compte ; sans lui, vous ne pourrez pas apparaître dans le feed.'),
  -- {name} : prénom affiché de l'autre personne, remplacé par l'Edge Function notify.
  ('push.match', 'fr', 'Match avec {name}. Quelqu''un vous trouve enfin à la hauteur.'),
  ('push.message', 'fr', '{name} vous a écrit. Probablement sans faute d''orthographe.'),
  ('push.verdict', 'fr', 'Votre verdict est tombé. Asseyez-vous.')
on conflict (key, locale) do nothing;

-- Conformité : textes de l'acceptation des CGU, des conseils de sécurité, de l'avis et de l'email
-- d'inactivité, réglables depuis le back-office (« Textes »). L'app garde les mêmes textes en repli.
-- Variables : {date} (date de suppression, « 14 décembre 2028 »), {name} (prénom du destinataire).
-- `do nothing` : ne remplace jamais un texte modifié depuis le back-office.

insert into public.app_copy (key, locale, text)
values
  ('terms.title', 'fr', 'Les règles du jeu.'),
  ('terms.lead', 'fr', 'Avant d’aller plus loin, nos conditions d’utilisation. Le ton de Sapios est volontairement excessif ; ces conditions, elles, ne le sont pas.'),
  ('terms.point.access', 'fr', 'Sapios est réservé aux majeurs dont le diplôme a été vérifié par une personne de l’équipe.'),
  ('terms.point.data', 'fr', 'Vos données restent en Europe. Vous pouvez les exporter ou tout supprimer, à tout moment, depuis l’app.'),
  ('terms.point.conduct', 'fr', 'Respect, aucune coordonnée sur le profil, un signalement au moindre doute.'),
  ('terms.checkbox', 'fr', 'J’ai lu et j’accepte les conditions générales d’utilisation et la politique de confidentialité.'),
  ('terms.cta', 'fr', 'Accepter et continuer'),
  ('terms.update.title', 'fr', 'Nos conditions évoluent.'),
  ('terms.update.lead', 'fr', 'Nous avons mis à jour nos conditions d’utilisation. Pour continuer, il faut accepter la nouvelle version. Vous pouvez aussi supprimer votre compte, sans frais.'),
  ('terms.update.cta', 'fr', 'Accepter les nouvelles conditions'),
  ('terms.update.delete', 'fr', 'Supprimer mon compte'),
  ('safety.title', 'fr', 'Conseils de sécurité'),
  ('safety.lead', 'fr', 'Un dîner avec quelqu’un qui a lu Spinoza reste un premier rendez-vous. Quelques réflexes.'),
  ('safety.tip.public', 'fr', 'Premier rendez-vous dans un lieu public et animé, que vous connaissez.'),
  ('safety.tip.friend', 'fr', 'Prévenez un proche : où, quand, avec qui. Donnez des nouvelles après.'),
  ('safety.tip.transport', 'fr', 'Venez et repartez par vos propres moyens.'),
  ('safety.tip.money', 'fr', 'N’envoyez jamais d’argent, quelle que soit l’histoire. Aucun diplôme ne la rend vraie.'),
  ('safety.tip.instinct', 'fr', 'Fiez-vous à votre instinct : partir est toujours une option.'),
  ('safety.tip.report', 'fr', 'Au moindre doute, signalez. Chaque signalement est lu par une personne.'),
  ('safety.card.title', 'fr', 'Avant de vous voir'),
  ('safety.card.body', 'fr', 'Un lieu public, un proche prévenu, vos propres moyens de transport. Et un signalement au moindre doute.'),
  ('safety.card.more', 'fr', 'Tous nos conseils'),
  ('safety.event.title', 'fr', 'Avant l’événement'),
  ('safety.event.body', 'fr', 'Une personne de l’équipe Sapios est sur place. Si quelque chose vous gêne, allez la voir, ou signalez-le depuis l’app, même après.'),
  ('notice.inactivity.title', 'fr', 'Votre compte dort depuis longtemps.'),
  ('notice.inactivity.body', 'fr', 'Sans connexion d’ici le {date}, il sera supprimé, avec toutes vos données. Vous venez de vous connecter : il est conservé.'),
  ('email.inactivity.subject', 'fr', 'Votre compte Sapios sera supprimé le {date}'),
  ('email.inactivity.title', 'fr', 'Vous nous manquez. Un peu.'),
  ('email.inactivity.body', 'fr', '{name}, vous ne vous êtes pas connecté·e depuis longtemps. Sans connexion d’ici le {date}, votre compte et toutes vos données seront supprimés. Pour le garder, il suffit d’ouvrir l’application.'),
  ('email.inactivity.cta', 'fr', 'Garder mon compte')
on conflict (key, locale) do nothing;

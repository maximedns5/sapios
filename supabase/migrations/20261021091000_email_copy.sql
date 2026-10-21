-- Textes des emails transactionnels (Edge Function notify, docs/EMAILS.md), réglables depuis le back-office.
-- {name} : prénom affiché du destinataire (« Bonjour » à défaut) ; {verdict} : texte de son verdict
-- (clé copy_key de user_access). Jamais le prénom de l'autre personne d'un match.
-- `do nothing` : ne remplace jamais un texte déjà présent ou modifié depuis le back-office.

insert into public.app_copy (key, locale, text)
values
  ('email.verdict.subject', 'fr', 'Votre verdict est tombé.'),
  ('email.verdict.title', 'fr', '{verdict}'),
  ('email.verdict.body', 'fr', '{name}, le jury a délibéré. Le détail, et la suite des opérations, vous attendent dans l''application.'),
  ('email.verdict.cta', 'fr', 'Voir mon verdict'),
  ('email.match.subject', 'fr', 'Nouveau match. Quelqu''un vous trouve à la hauteur.'),
  ('email.match.title', 'fr', 'Intellectuellement compatibles.'),
  ('email.match.body', 'fr', '{name}, quelqu''un vous a liké en retour. Nous ne dirons pas qui par email : la discrétion est aussi une forme d''intelligence.'),
  ('email.match.cta', 'fr', 'Ouvrir la conversation'),
  ('email.footer', 'fr', 'Vous recevez cet email parce que vous avez un compte Sapios. Pour ne plus en recevoir, supprimez votre compte depuis l''application. Inutile de répondre : personne ne corrige les copies à cette adresse.')
on conflict (key, locale) do nothing;

-- Lot 2 : textes des notifications d'événement (push et email, Edge Function notify) et de l'app,
-- réglables depuis le back-office (« Textes »).
-- Variables remplies par notify : {name} (prénom du destinataire), {title}, {date} (« samedi 14
-- novembre à 19 h 30 », heure de Paris), {reason} (motif d'annulation). Jamais le lieu exact ni les
-- autres inscrits. `do nothing` : ne remplace jamais un texte modifié depuis le back-office.

insert into public.app_copy (key, locale, text)
values
  ('push.event.registered', 'fr', 'Place confirmée : {title}, {date}.'),
  ('push.event.promoted', 'fr', 'Une place s''est libérée : vous êtes inscrit·e à {title}.'),
  ('push.event.cancelled', 'fr', '{title} est annulé. {reason}'),
  ('push.event.reminder', 'fr', 'C''est demain : {title}, {date}. Tenue correcte et arguments sourcés.'),
  ('email.event.registered.subject', 'fr', 'Place confirmée : {title}'),
  ('email.event.registered.title', 'fr', 'Votre place est réservée.'),
  ('email.event.registered.body', 'fr', '{name}, rendez-vous {date}. L''adresse exacte et votre billet vous attendent dans l''application.'),
  ('email.event.promoted.subject', 'fr', 'Une place s''est libérée : {title}'),
  ('email.event.promoted.title', 'fr', 'La patience paie.'),
  ('email.event.promoted.body', 'fr', '{name}, une place s''est libérée pour « {title} », {date}. Elle est à vous. L''adresse exacte et votre billet vous attendent dans l''application.'),
  ('email.event.cancelled.subject', 'fr', 'Annulé : {title}'),
  ('email.event.cancelled.title', 'fr', 'Événement annulé.'),
  ('email.event.cancelled.body', 'fr', '{name}, « {title} », prévu {date}, est annulé. Nous en sommes désolés.

{reason}'),
  ('email.event.reminder.subject', 'fr', 'C''est demain : {title}'),
  ('email.event.reminder.title', 'fr', 'C''est demain.'),
  ('email.event.reminder.body', 'fr', '{name}, « {title} » a lieu {date}. L''adresse exacte et votre billet sont dans l''application. Si vous ne pouvez plus venir, libérez votre place : quelqu''un attend.'),
  ('email.event.cta', 'fr', 'Voir l''événement'),
  ('events.title', 'fr', 'Agenda'),
  ('events.lead', 'fr', 'Dîners de thèse, débats contradictoires, conférences suivies d''un verre. Tenue correcte et arguments sourcés exigés.'),
  ('events.empty', 'fr', 'Rien à l''agenda pour l''instant. Nous préparons la suite ; vous serez prévenu·e.'),
  ('events.privacy', 'fr', 'La liste des inscrits n''est jamais publiée : seul le nombre de places restantes est affiché.'),
  ('events.address_hidden', 'fr', 'L''adresse exacte est donnée aux inscrits.'),
  ('events.charter', 'fr', 'En m''inscrivant, je m''engage à respecter chaque participant, à accepter un refus, à ne prendre ni publier aucune photo sans accord, à consommer de l''alcool avec modération et à libérer ma place si je ne peux plus venir. L''équipe présente sur place peut exclure toute personne qui manque à ces règles.')
on conflict (key, locale) do nothing;

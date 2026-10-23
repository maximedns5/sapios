-- Sapios : données de démarrage (rejouées par `supabase db reset`).
--
-- Sections :
--   A. access_policy, app_settings, app_copy : désormais dans la migration
--      20261021090900_default_config.sql, donc déployés avec `supabase db push`.
--   B. Comptes de test (contrat §7) : LOCAL UNIQUEMENT. Mot de passe commun `sapios-test-password`.
--   C. Secrets Vault locaux pour pg_net (notify, process-diploma, purge-diplomas).
--
-- Vault en staging/prod (une fois par projet, SQL editor ou psql en tant que postgres) :
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url',
--                              'URL de base des Edge Functions appelées par pg_net');
--   select vault.create_secret('<valeur longue et aléatoire>', 'internal_secret',
--                              'Secret partagé envoyé dans l''en-tête x-sapios-secret');
--   -- Facultatif, seulement si notify / process-diploma / purge-diplomas gardent verify_jwt = true :
--   select vault.create_secret('<clé anon (JWT legacy)>', 'anon_key', 'Authorization pour la passerelle');
-- puis, côté Edge Functions, la même valeur : `supabase secrets set SAPIOS_INTERNAL_SECRET=<valeur>`.
-- Rotation : select vault.update_secret((select id from vault.secrets where name = 'internal_secret'), '<nouvelle>');
-- Sans ces secrets, les triggers et les tâches cron ne font rien (ils journalisent et continuent).

------------------------------------------------------------------------------------------------
-- A. Configuration
------------------------------------------------------------------------------------------------

-- Déplacée dans la migration 20261021090900_default_config.sql (appliquée aussi en staging/prod).

------------------------------------------------------------------------------------------------
-- B. Comptes de test (local uniquement)
------------------------------------------------------------------------------------------------

-- Compte auth utilisable par mot de passe via l'API locale (POST /auth/v1/token?grant_type=password).
create function pg_temp.seed_user(p_id uuid, p_email text)
returns void
language sql
as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('sapios-test-password', extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}', '{}', now() - interval '60 days', now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
$$;

-- Profil complet et actif (sauf p_status), identité, consentement, 2 photos approuvées et,
-- si p_level est fourni, une soumission approuvée + user_access + audit.
create function pg_temp.seed_profile(
  p_id uuid, p_name text, p_legal text, p_gender public.gender, p_seeking public.gender[],
  p_birthdate date, p_age_min int, p_age_max int, p_bio text, p_city text,
  p_lat double precision, p_lng double precision, p_active_ago interval,
  p_status public.profile_status, p_level int, p_reviewed_ago interval default interval '10 days'
)
returns void
language plpgsql
as $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-000000000001';
  v_policy public.access_policy;
  v_sub uuid;
begin
  update public.profiles
     set display_name = p_name, gender = p_gender, seeking_genders = p_seeking,
         age_min = p_age_min, age_max = p_age_max, bio = p_bio, city = p_city,
         location = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
         status = p_status, last_active_at = now() - p_active_ago
   where id = p_id;
  update public.profile_private
     set legal_name = p_legal, birthdate = p_birthdate,
         consent_sensitive_at = now() - interval '30 days', consent_version = '2026-10'
   where user_id = p_id;
  -- CGU de la version en vigueur acceptées à l'inscription (sinon l'app bloque sur « Nos conditions évoluent »).
  insert into public.terms_acceptances (user_id, version, accepted_at)
  values (p_id, private.terms_version(), now() - interval '30 days')
  on conflict (user_id, version) do nothing;
  insert into public.profile_photos (user_id, storage_path, position, moderation_status)
  values (p_id, p_id::text || '/seed-1.jpg', 0, 'approved'),
         (p_id, p_id::text || '/seed-2.jpg', 1, 'approved');

  if p_level is not null then
    insert into public.degree_submissions (
      user_id, storage_path, mime, doc_sha256, status, extracted, confidence, signals,
      level_verified, reviewer_id, reviewed_at, created_at
    ) values (
      p_id, p_id::text || '/seed-diploma.pdf', 'application/pdf',
      encode(extensions.digest('sapios-seed-diploma-' || p_id::text, 'sha256'), 'hex'),
      'approved',
      jsonb_build_object('is_diploma', true, 'holder_full_name', p_legal, 'level_estimate', p_level),
      0.95, '{}', p_level, v_admin, now() - p_reviewed_ago, now() - p_reviewed_ago - interval '1 day'
    ) returning id into v_sub;

    select * into v_policy from public.access_policy ap
     where ap.min_level <= p_level order by ap.min_level desc limit 1;
    insert into public.user_access (user_id, level, tier, copy_key, source_submission_id, granted_at, granted_by)
    values (p_id, p_level, v_policy.tier, v_policy.copy_key, v_sub, now() - p_reviewed_ago, v_admin);
    insert into public.audit_log (actor_id, action, entity, entity_id, payload, created_at)
    values (v_admin, 'diploma.approve', 'degree_submissions', v_sub::text,
            jsonb_build_object('user_id', p_id, 'level', p_level, 'tier', v_policy.tier, 'seed', true),
            now() - p_reviewed_ago);
  end if;
end;
$$;

-- Comptes du contrat §7 (uuid fixes, pratiques pour les tests manuels).
select pg_temp.seed_user('11111111-1111-4111-8111-000000000001', 'admin@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000002', 'unlimited@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000003', 'standard@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000004', 'standard2@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000005', 'waitlist@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000006', 'refused@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000007', 'uninstall@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000008', 'pending@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000009', 'onboarding@sapios.test');

insert into public.admins (user_id, role) values ('11111111-1111-4111-8111-000000000001', 'owner');

select pg_temp.seed_profile('11111111-1111-4111-8111-000000000001', 'Ada', 'Ada Lovelace-Martin', 'nonbinary',
  '{woman,man,nonbinary}', '1985-03-14', 25, 55, 'Modère les diplômes. Et les ego.', 'Paris',
  48.8566, 2.3522, interval '1 hour', 'active', 8);
-- Fichier décidé il y a 45 jours : sort dans diplomas_to_purge(30).
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000002', 'Hippolyte', 'Hippolyte Durand', 'man',
  '{woman}', '1987-06-02', 25, 45, 'Thèse en philosophie analytique. Je cite Wittgenstein au premier rendez-vous.', 'Paris',
  48.8606, 2.3376, interval '2 hours', 'active', 8, interval '45 days');
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000003', 'Camille', 'Camille Bernard', 'woman',
  '{man}', '1994-09-21', 25, 45, 'Ingénieure. J''aime les preuves, pas les promesses.', 'Paris',
  48.8530, 2.3499, interval '30 minutes', 'active', 7);
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000004', 'Louis', 'Louis Moreau', 'man',
  '{woman}', '1992-01-11', 25, 40, 'Master d''économie. Je calcule l''addition au centime près.', 'Paris',
  48.8667, 2.3833, interval '3 hours', 'active', 7);
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000005', 'Jules', 'Jules Petit', 'man',
  '{woman}', '1996-04-04', 22, 40, 'Licence d''histoire. J''attends mon tour, comme en 1789.', 'Paris',
  48.8448, 2.3735, interval '1 day', 'active', 6);
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000006', 'Kévin', 'Kévin Robert', 'man',
  '{woman}', '1995-07-07', 22, 40, 'BTS. On m''a dit que c''était suffisant.', 'Paris',
  48.8738, 2.2950, interval '2 days', 'active', 5);
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000007', 'Brandon', 'Brandon Richard', 'man',
  '{woman}', '1998-12-12', 18, 40, 'Brevet des collèges, mention passable.', 'Paris',
  48.8350, 2.3200, interval '5 days', 'active', 3);
select pg_temp.seed_profile('11111111-1111-4111-8111-000000000008', 'Inès', 'Inès Garcia', 'woman',
  '{man}', '1993-05-05', 27, 45, 'Doctorante. Mon diplôme est en cours de relecture, comme ma thèse.', 'Paris',
  48.8584, 2.2945, interval '4 hours', 'active', null);

-- pending@ : soumission en attente de revue humaine, extraction déjà faite.
insert into public.degree_submissions (user_id, storage_path, mime, doc_sha256, status, extracted, confidence, signals, attempts)
values (
  '11111111-1111-4111-8111-000000000008', '11111111-1111-4111-8111-000000000008/seed-diploma.pdf', 'application/pdf',
  encode(extensions.digest('sapios-seed-diploma-pending', 'sha256'), 'hex'), 'needs_review',
  '{"is_diploma": true, "holder_full_name": "Ines Garcia", "institution": "Sorbonne Université", "country": "FR",
    "degree_title": "Master Sciences cognitives", "degree_type": "master", "field_of_study": "Sciences cognitives",
    "year_awarded": 2018, "honors": "Mention bien", "level_estimate": 7, "confidence": 0.86,
    "fraud_signals": ["Sceau peu net, à comparer avec un original"]}',
  0.86, '{"model:Sceau peu net, à comparer avec un original"}', 1
);
-- onboarding@ : uniquement le profil vide créé par le trigger.

-- Membres pour remplir le feed (contrat §7). Paris, sauf member12 (Lyon, hors rayon).
select pg_temp.seed_user(('22222222-2222-4222-8222-0000000000' || lpad(n::text, 2, '0'))::uuid,
                         'member' || lpad(n::text, 2, '0') || '@sapios.test')
from generate_series(1, 13) as n;

select pg_temp.seed_profile('22222222-2222-4222-8222-000000000001', 'Gaspard', 'Gaspard Lefèvre', 'man',
  '{woman}', '1990-02-17', 25, 40, 'Polytechnicien repenti. Je fais des gâteaux au rapport nombre d''or.', 'Paris',
  48.8490, 2.3470, interval '20 minutes', 'active', 8);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000002', 'Basile', 'Basile Fontaine', 'man',
  '{woman}', '1988-11-03', 28, 42, 'Architecte. Je juge les gens à leurs étagères.', 'Paris',
  48.8800, 2.3550, interval '1 hour', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000003', 'Sixtine', 'Sixtine de Rohan', 'woman',
  '{man}', '1992-08-25', 28, 45, 'Agrégée de lettres. Votre orthographe sera évaluée.', 'Paris',
  48.8400, 2.3600, interval '2 hours', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000004', 'Apolline', 'Apolline Girard', 'woman',
  '{woman,nonbinary}', '1995-01-30', 25, 38, 'Neurologue. Je sais exactement ce que vous pensez.', 'Paris',
  48.8650, 2.3300, interval '6 hours', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000005', 'Octave', 'Octave Lambert', 'man',
  '{man}', '1991-06-12', 25, 45, 'Docteur en astrophysique. Je préfère les trous noirs aux lumières vives.', 'Paris',
  48.8700, 2.3100, interval '3 hours', 'active', 8);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000006', 'Sacha', 'Sacha Bonnet', 'nonbinary',
  '{woman,man,nonbinary}', '1993-10-09', 25, 45, 'Data scientist. Notre compatibilité est statistiquement significative.', 'Paris',
  48.8550, 2.3700, interval '1 day', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000007', 'Edmond', 'Edmond Mercier', 'man',
  '{woman,man}', '1985-04-22', 30, 45, 'Avocat fiscaliste. Je déduis tout, même vos sentiments.', 'Paris',
  48.8620, 2.3420, interval '2 days', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000008', 'Joséphine', 'Joséphine Faure', 'woman',
  '{man}', '1997-03-15', 24, 45, 'Doctorat de mathématiques. Je résous les équations, pas vos problèmes.', 'Paris',
  48.8450, 2.3400, interval '40 minutes', 'active', 8);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000009', 'Augustin', 'Augustin Rousseau', 'man',
  '{woman}', '1996-07-01', 22, 35, 'École de commerce. Je négocie même les compliments.', 'Paris',
  48.8760, 2.3650, interval '5 hours', 'active', 7);
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000010', 'Clémence', 'Clémence Blanc', 'woman',
  '{man,nonbinary}', '1989-12-05', 30, 45, 'Chercheuse en biologie. Je cherche, littéralement.', 'Paris',
  48.8300, 2.3550, interval '8 hours', 'active', 7);
-- 50 ans : hors de la tranche d'âge de standard@ (25–45).
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000011', 'Anatole', 'Anatole Guérin', 'man',
  '{woman}', '1976-02-02', 30, 50, 'Professeur des universités. J''ai corrigé plus de copies que vous n''avez écrit de SMS.', 'Paris',
  48.8510, 2.3440, interval '3 hours', 'active', 8);
-- Lyon : hors du rayon de 50 km.
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000012', 'Victor', 'Victor Chevalier', 'man',
  '{woman}', '1991-09-19', 25, 40, 'Ingénieur à Lyon. Prêt à prendre le TGV pour une bonne conversation.', 'Lyon',
  45.7640, 4.8357, interval '1 hour', 'active', 7);
-- En pause : exclu du feed.
select pg_temp.seed_profile('22222222-2222-4222-8222-000000000013', 'Aristide', 'Aristide Perrin', 'man',
  '{woman}', '1989-05-28', 25, 45, 'En pause pour finir ma thèse.', 'Paris',
  48.8580, 2.3480, interval '10 days', 'paused', 7);

-- Profil intellectuel (lot 1) : domaines, établissements vérifiés, réponses, livres, thèses.
-- Écrit en postgres : le filtre de modération ne s'applique pas aux données de démonstration.
update public.profiles p set study_field = v.field::public.study_field
from (values
  ('11111111-1111-4111-8111-000000000001', 'computing'),
  ('11111111-1111-4111-8111-000000000002', 'philosophy'),
  ('11111111-1111-4111-8111-000000000003', 'engineering'),
  ('11111111-1111-4111-8111-000000000004', 'economics'),
  ('22222222-2222-4222-8222-000000000001', 'engineering'),
  ('22222222-2222-4222-8222-000000000002', 'engineering'),
  ('22222222-2222-4222-8222-000000000003', 'letters'),
  ('22222222-2222-4222-8222-000000000004', 'health'),
  ('22222222-2222-4222-8222-000000000005', 'sciences'),
  ('22222222-2222-4222-8222-000000000006', 'computing'),
  ('22222222-2222-4222-8222-000000000007', 'law'),
  ('22222222-2222-4222-8222-000000000008', 'mathematics'),
  ('22222222-2222-4222-8222-000000000009', 'economics'),
  ('22222222-2222-4222-8222-000000000010', 'sciences'),
  ('22222222-2222-4222-8222-000000000011', 'history')
) as v (id, field)
where p.id = v.id::uuid;

update public.user_access ua set institution = v.institution, study_field = p.study_field
from (values
  ('11111111-1111-4111-8111-000000000002', 'Sorbonne Université'),
  ('11111111-1111-4111-8111-000000000003', 'École des ponts ParisTech'),
  ('11111111-1111-4111-8111-000000000004', 'Sciences Po'),
  ('22222222-2222-4222-8222-000000000001', 'École polytechnique'),
  ('22222222-2222-4222-8222-000000000003', 'École normale supérieure'),
  ('22222222-2222-4222-8222-000000000008', 'Sorbonne Université')
) as v (id, institution), public.profiles p
where ua.user_id = v.id::uuid and p.id = ua.user_id;

update public.profiles set show_institution = true, show_quiz_badge = true
where id in ('11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000003');

insert into public.profile_answers (user_id, position, prompt_key, answer) values
  ('11111111-1111-4111-8111-000000000002', 0, 'three_hours', 'La querelle des universaux. Personne ne m''arrête avant le dessert.'),
  ('11111111-1111-4111-8111-000000000002', 1, 'winning_debate', 'Le Paris-Brest est une démonstration, pas un dessert.'),
  ('11111111-1111-4111-8111-000000000003', 0, 'three_hours', 'Le cadastre napoléonien. Si, si.'),
  ('11111111-1111-4111-8111-000000000003', 1, 'secret_reread', 'Les Trois Mousquetaires. Pour la méthode, évidemment.'),
  ('11111111-1111-4111-8111-000000000004', 0, 'first_date', 'Un café, puis un débat sur la TVA. Je paie, au centime près.'),
  ('22222222-2222-4222-8222-000000000001', 0, 'three_hours', 'Les ponts suspendus. Tous. Surtout celui de Tancarville.'),
  ('22222222-2222-4222-8222-000000000002', 0, 'conversation_crush', 'Quelqu''un qui range ses livres par couleur, et qui l''assume.'),
  ('22222222-2222-4222-8222-000000000003', 0, 'typo_peeve', '« Au jour d''aujourd''hui ». Je ne m''en remets pas.'),
  ('22222222-2222-4222-8222-000000000003', 1, 'secret_reread', 'La Princesse de Clèves. En version annotée, évidemment.'),
  ('22222222-2222-4222-8222-000000000005', 0, 'useless_fact', 'Une cuillère d''étoile à neutrons pèse un milliard de tonnes.'),
  ('22222222-2222-4222-8222-000000000006', 0, 'teach_me', 'Les p-values. Promis, c''est romantique.'),
  ('22222222-2222-4222-8222-000000000008', 0, 'useless_fact', 'Le nombre de Graham ne tient pas dans l''univers observable.'),
  ('22222222-2222-4222-8222-000000000008', 1, 'three_hours', 'La conjecture de Collatz. Elle est fausse, je le sens.'),
  ('22222222-2222-4222-8222-000000000011', 0, 'winning_debate', 'Le Moyen Âge n''était pas si sombre.');

insert into public.profile_books (user_id, position, title, author) values
  ('11111111-1111-4111-8111-000000000002', 0, 'Les Essais', 'Montaigne'),
  ('11111111-1111-4111-8111-000000000002', 1, 'La Montagne magique', 'Thomas Mann'),
  ('11111111-1111-4111-8111-000000000002', 2, 'Le Deuxième Sexe', 'Simone de Beauvoir'),
  ('11111111-1111-4111-8111-000000000003', 0, 'Les Essais', 'Montaigne'),
  ('22222222-2222-4222-8222-000000000001', 0, 'Les Essais', 'Montaigne'),
  ('22222222-2222-4222-8222-000000000003', 0, 'La Princesse de Clèves', 'Madame de La Fayette'),
  ('22222222-2222-4222-8222-000000000003', 1, 'Les Trois Mousquetaires', 'Alexandre Dumas'),
  ('22222222-2222-4222-8222-000000000008', 0, 'Gödel, Escher, Bach', 'Douglas Hofstadter');

insert into public.profile_theses (user_id, line, visibility) values
  ('11111111-1111-4111-8111-000000000002', 'Wittgenstein et les jeux de langage du quotidien.', 'matches'),
  ('22222222-2222-4222-8222-000000000008', 'Une conjecture sur les graphes, et beaucoup de café.', 'everyone');

-- Interactions de démonstration :
--  * standard@ et standard2@ sont matchés, avec une conversation ;
--  * member01 et member02 ont liké standard@ (un like de sa part crée un match) ;
--  * member03 et member08 ont liké unlimited@ (visibles via get_likers) ;
--  * un signalement ouvert pour le back-office.
insert into public.swipes (swiper_id, target_id, direction, created_at) values
  ('11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004', 'like', now() - interval '2 days'),
  ('11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000003', 'like', now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000003', 'like', now() - interval '1 day'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000003', 'like', now() - interval '3 hours'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002', 'like', now() - interval '5 hours'),
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000002', 'like', now() - interval '1 hour');

-- Likes ciblés (lot 1) : Gaspard a aimé une réponse de Camille, Sixtine une photo d'Hippolyte.
update public.swipes set liked_item = 'answer:0', comment = 'Je veux la version de 3 h. Avec les annexes.'
 where swiper_id = '22222222-2222-4222-8222-000000000001' and target_id = '11111111-1111-4111-8111-000000000003';
update public.swipes s set liked_item = 'photo:' || ph.id, comment = 'Cette bibliothèque derrière vous, elle est rangée par auteur ou par humeur ?'
  from public.profile_photos ph
 where s.swiper_id = '22222222-2222-4222-8222-000000000003' and s.target_id = '11111111-1111-4111-8111-000000000002'
   and ph.user_id = s.target_id and ph.position = 0;

insert into public.matches (id, user_a, user_b, created_at)
values ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000003',
        '11111111-1111-4111-8111-000000000004', now() - interval '2 days');

insert into public.messages (match_id, sender_id, body, created_at, read_at) values
  ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000004',
   'Bonjour Camille. Votre bio m''a convaincu, preuve à l''appui.', now() - interval '47 hours', now() - interval '46 hours'),
  ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000003',
   'Bonjour Louis. Démonstration acceptée, à vérifier autour d''un café.', now() - interval '46 hours', now() - interval '45 hours'),
  ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000004',
   'Jeudi, 19 h, à la bibliothèque Sainte-Geneviève ? C''est là que je brille.', now() - interval '2 hours', null);

insert into public.reports (reporter_id, target_id, reason, details, created_at)
values ('22222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-000000000013', 'fake_profile',
        'Prétend finir sa thèse depuis 2014.', now() - interval '1 day');

insert into public.waitlist_signups (email, source, created_at) values
  ('curieuse@example.com', 'landing', now() - interval '3 days'),
  ('sceptique@example.com', 'landing', now() - interval '1 day');

-- Lot 2 : lettres de recommandation et événements de démonstration.
--  * standard@ a un code ; member05 (Octave) l'a utilisé avant son verdict ;
--  * un dîner publié dans 10 jours (4 places, 2 prises, 1 en file), un débat en brouillon.
insert into public.referral_codes (code, owner_id, created_at)
values ('CAM1SAP0X7', '11111111-1111-4111-8111-000000000003', now() - interval '10 days');
insert into public.referrals (referee_id, referrer_id, code, claimed_at)
values ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000003', 'CAM1SAP0X7', now() - interval '9 days');

insert into public.events (id, title, kind, description, city, neighbourhood, venue_name, venue_address,
                           starts_at, ends_at, capacity, status, created_by, published_at)
values
  ('44444444-4444-4444-8444-000000000001', 'Dîner de thèse : trois sujets, un dessert', 'dinner',
   'Trois docteur·es présentent leur thèse en dix minutes chacun·e. Le dessert départage.', 'Paris', '6e',
   'Le Procope', '13 rue de l''Ancienne-Comédie, 75006 Paris',
   date_trunc('day', now()) + interval '10 days 19 hours', date_trunc('day', now()) + interval '10 days 22 hours', 4,
   'published', '11111111-1111-4111-8111-000000000001', now() - interval '2 days'),
  ('44444444-4444-4444-8444-000000000002', 'Débat contradictoire : faut-il lire les préfaces ?', 'debate',
   'Deux camps, un arbitre, aucune préface lue en public.', 'Paris', '5e', null, null,
   date_trunc('day', now()) + interval '20 days 19 hours', date_trunc('day', now()) + interval '20 days 21 hours', 30,
   'draft', '11111111-1111-4111-8111-000000000001', null);

insert into public.event_registrations (event_id, user_id, status, ticket_code, charter_accepted_at, status_changed_at)
values
  ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000004', 'registered', 'TKT0000000A1', now() - interval '2 days', now() - interval '2 days'),
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000001', 'registered', 'TKT0000000B2', now() - interval '1 day', now() - interval '1 day'),
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000002', 'registered', 'TKT0000000C3', now() - interval '20 hours', now() - interval '20 hours'),
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000003', 'registered', 'TKT0000000D4', now() - interval '10 hours', now() - interval '10 hours'),
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000006', 'waitlisted', 'TKT0000000E5', now() - interval '5 hours', now() - interval '5 hours');

-- Les soumissions seedées ne doivent pas partir à l'extraction.
select pgmq.purge_queue('diploma_extraction');

------------------------------------------------------------------------------------------------
-- C. Vault local : le conteneur Postgres joint la passerelle Kong par le réseau Docker de la
--    stack (alias `kong`, port 8000) ; /functions/v1/* y est routé vers l'Edge Runtime.
------------------------------------------------------------------------------------------------

create function pg_temp.upsert_secret(p_name text, p_value text, p_description text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select s.id into v_id from vault.secrets s where s.name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, p_description);
  else
    perform vault.update_secret(v_id, p_value, p_name, p_description);
  end if;
end;
$$;

select pg_temp.upsert_secret('project_url', 'http://kong:8000',
  'URL de base des Edge Functions vue depuis Postgres (local : passerelle Kong du réseau Docker)');
select pg_temp.upsert_secret('internal_secret', 'sapios-local-internal-secret',
  'Secret partagé x-sapios-secret (= SAPIOS_INTERNAL_SECRET côté Edge Functions)');
-- Clé anon de démonstration de la stack locale (publique) : permet de passer la passerelle même
-- si une fonction garde verify_jwt = true.
select pg_temp.upsert_secret('anon_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  'Authorization facultative pour /functions/v1 (local)');

-- Sapios : données de démarrage (rejouées par `supabase db reset`).
--
-- Sections :
--   A. access_policy, app_settings, app_copy : désormais dans la migration
--      20261021090900_default_config.sql, donc déployés avec `supabase db push`.
--   B. Comptes de test (docs/CONTRACT.md §7) : LOCAL UNIQUEMENT. Mot de passe commun `sapios-test-password`.
--   B2. Sapios Emploi (docs/EMPLOI_CONTRACT.md §9).
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

-- Comptes de la plateforme (uuid fixes) : l'admin, et une candidate dont le diplôme attend la revue.
select pg_temp.seed_user('11111111-1111-4111-8111-000000000001', 'admin@sapios.test');
select pg_temp.seed_user('11111111-1111-4111-8111-000000000008', 'pending@sapios.test');

insert into public.admins (user_id, role) values ('11111111-1111-4111-8111-000000000001', 'owner');

-- pending@ : candidate (compte, CGU, identité chiffrée), sans profil de recherche.
insert into public.emploi_accounts (user_id, kind) values ('11111111-1111-4111-8111-000000000008', 'candidate');
insert into public.terms_acceptances (user_id, version)
values ('11111111-1111-4111-8111-000000000008', private.emploi_terms_version('candidate'));
insert into public.candidate_identities (user_id, first_name, last_name_enc)
values ('11111111-1111-4111-8111-000000000008', 'Inès', private.encrypt_text('Garcia'));

-- Soumission en attente de revue humaine, extraction déjà faite ; une autre refusée il y a 45 jours,
-- dont le fichier sort dans diplomas_to_purge(30).
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
insert into public.degree_submissions (user_id, storage_path, mime, doc_sha256, status, rejection_reason,
                                       reviewer_id, reviewed_at, created_at)
values (
  '11111111-1111-4111-8111-000000000008', '11111111-1111-4111-8111-000000000008/ancien-diplome.pdf', 'application/pdf',
  encode(extensions.digest('sapios-seed-diploma-old', 'sha256'), 'hex'), 'rejected', 'Document illisible',
  '11111111-1111-4111-8111-000000000001', now() - interval '45 days', now() - interval '46 days'
);

-- Les soumissions seedées ne doivent pas partir à l'extraction.
select pgmq.purge_queue('diploma_extraction');

------------------------------------------------------------------------------------------------
-- B2. Sapios Emploi (docs/EMPLOI_CONTRACT.md §9), local uniquement.
--   Candidats 5555…, entreprises 6666…, offres 7777…, candidatures 8888….
--   Photos des offres : ./seed/offer-photos/{company_id}/*.jpg, envoyées dans le bucket
--   offer-photos par `supabase db reset` (config.toml, [storage.buckets.offer-photos]).
------------------------------------------------------------------------------------------------

select pg_temp.seed_user('55555555-5555-4555-8555-000000000001', 'camille@sapios.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000002', 'candidat2@sapios.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000003', 'candidat3@sapios.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000004', 'nouveau@sapios.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000011', 'thomas@maisonverte.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000012', 'rh@ateliernova.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000013', 'rh@atelierlumen.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000014', 'rh@railco.test');
select pg_temp.seed_user('55555555-5555-4555-8555-000000000015', 'rh@nordia.test');

insert into public.emploi_accounts (user_id, kind, created_at)
select u.id, case when u.email like '%@sapios.test' then 'candidate' else 'recruiter' end::public.emploi_account_kind,
       now() - interval '20 days'
  from auth.users u where u.id::text like '55555555-%';

insert into public.terms_acceptances (user_id, version, accepted_at)
select ea.user_id, private.emploi_terms_version(ea.kind), now() - interval '20 days'
  from public.emploi_accounts ea
 where ea.user_id::text like '55555555-%' and ea.user_id <> '55555555-5555-4555-8555-000000000004';

-- Identités (nom chiffré comme par set_candidate_identity).
insert into public.candidate_identities (user_id, first_name, last_name_enc) values
  ('55555555-5555-4555-8555-000000000001', 'Camille', private.encrypt_text('Laurent')),
  ('55555555-5555-4555-8555-000000000002', 'Yanis', private.encrypt_text('Benali')),
  ('55555555-5555-4555-8555-000000000003', 'Nathan', private.encrypt_text('Morel'));

-- Diplômes vérifiés (revue humaine), échelle européenne de user_access.level (7 = Bac+5, 6 = Bac+3) :
-- Camille Master Économétrie, Yanis Master Statistique, Nathan Licence.
create function pg_temp.seed_diploma(p_id uuid, p_level int, p_institution text, p_field public.study_field)
returns void
language plpgsql
as $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-000000000001';
  v_policy public.access_policy;
  v_sub uuid;
begin
  insert into public.degree_submissions (user_id, storage_path, mime, doc_sha256, status, level_verified,
                                         reviewer_id, reviewed_at, created_at, institution_verified, field_verified,
                                         file_deleted_at)
  values (p_id, p_id::text || '/seed-diploma.pdf', 'application/pdf',
          encode(extensions.digest('sapios-emploi-seed-' || p_id::text, 'sha256'), 'hex'), 'approved', p_level,
          v_admin, now() - interval '15 days', now() - interval '16 days', p_institution, p_field,
          now() - interval '10 days')
  returning id into v_sub;
  select * into v_policy from public.access_policy ap where ap.min_level <= p_level order by ap.min_level desc limit 1;
  insert into public.user_access (user_id, level, tier, copy_key, source_submission_id, granted_at, granted_by,
                                  institution, study_field)
  values (p_id, p_level, v_policy.tier, v_policy.copy_key, v_sub, now() - interval '15 days', v_admin,
          p_institution, p_field);
end;
$$;
select pg_temp.seed_diploma('55555555-5555-4555-8555-000000000001', 7, 'Université Paris-Dauphine', 'economics');
select pg_temp.seed_diploma('55555555-5555-4555-8555-000000000002', 7, 'Sorbonne Université', 'mathematics');
select pg_temp.seed_diploma('55555555-5555-4555-8555-000000000003', 6, 'Université Paris Cité', 'mathematics');

-- Profils de recherche (Paris : centre 48.857, 2.352).
insert into public.candidates (user_id, number, target_role, search_city, search_postcode, search_location,
                               search_radius_km, contract_types, salary_min_k, salary_max_k, remote_days_min,
                               available_from, experience_band, work_authorization, looking_for,
                               open_to_opportunities, show_institution, created_at)
values
  ('55555555-5555-4555-8555-000000000001', 427, 'Data analyst', 'Paris', '75011',
   extensions.st_setsrid(extensions.st_makepoint(2.352, 48.857), 4326)::extensions.geography, 20, '{cdi}', 40, 46, 2,
   '2027-01-01', 'y0_1', true, 'Une équipe data qui décide avec des chiffres, pas avec des intuitions.', true, false,
   now() - interval '20 days'),
  ('55555555-5555-4555-8555-000000000002', 431, 'Data analyst', 'Paris', '75014',
   extensions.st_setsrid(extensions.st_makepoint(2.326, 48.833), 4326)::extensions.geography, 15, '{cdi,cdd}', 44, 48, 0,
   null, 'y1_3', true, 'Comprendre pourquoi un chiffre bouge avant de le présenter.', false, true,
   now() - interval '12 days'),
  ('55555555-5555-4555-8555-000000000003', 388, 'Analyste BI', 'Paris', '75018',
   extensions.st_setsrid(extensions.st_makepoint(2.344, 48.892), 4326)::extensions.geography, 25, '{cdi}', 42, 45, 1,
   '2026-12-01', 'y3_5', true, 'Des tableaux de bord que les équipes ouvrent vraiment le lundi matin.', true, false,
   now() - interval '9 days');
select setval('private.candidate_number_seq', 1000);

insert into public.cv_experiences (user_id, position, title, employer, employer_hidden, start_month, end_month, summary) values
  ('55555555-5555-4555-8555-000000000001', 0, 'Data analyst en alternance', 'Groupe Hexa Retail', true, '2025-09-01', '2026-08-01',
   'Tableaux de bord des ventes de 120 magasins, tests A/B sur les promotions.'),
  ('55555555-5555-4555-8555-000000000001', 1, 'Stage chargée d’études', 'Institut Statistiques Conseil', false, '2025-03-01', '2025-08-01',
   'Enquêtes de satisfaction et modèles de régression.'),
  ('55555555-5555-4555-8555-000000000002', 0, 'Data analyst', 'Mutuelle Horizon', false, '2024-09-01', null,
   'Pilotage des indicateurs de sinistralité.'),
  ('55555555-5555-4555-8555-000000000003', 0, 'Analyste BI', 'Transports Ligne Verte', false, '2023-06-01', null,
   'Reporting d’exploitation et migration vers Power BI.'),
  ('55555555-5555-4555-8555-000000000003', 1, 'Assistant contrôle de gestion', 'Cabinet Delmas', false, '2022-01-01', '2023-05-01', null);

insert into public.cv_skills (user_id, position, label) values
  ('55555555-5555-4555-8555-000000000001', 0, 'Python'), ('55555555-5555-4555-8555-000000000001', 1, 'SQL'),
  ('55555555-5555-4555-8555-000000000001', 2, 'Power BI'), ('55555555-5555-4555-8555-000000000001', 3, 'Statistiques'),
  ('55555555-5555-4555-8555-000000000001', 4, 'A/B tests'),
  ('55555555-5555-4555-8555-000000000002', 0, 'SQL'), ('55555555-5555-4555-8555-000000000002', 1, 'Python'),
  ('55555555-5555-4555-8555-000000000002', 2, 'R'), ('55555555-5555-4555-8555-000000000002', 3, 'dbt'),
  ('55555555-5555-4555-8555-000000000003', 0, 'SQL'), ('55555555-5555-4555-8555-000000000003', 1, 'Power BI'),
  ('55555555-5555-4555-8555-000000000003', 2, 'Excel avancé'), ('55555555-5555-4555-8555-000000000003', 3, 'Python');

insert into public.cv_languages (user_id, language, level) values
  ('55555555-5555-4555-8555-000000000001', 'Anglais', 'c1'), ('55555555-5555-4555-8555-000000000001', 'Espagnol', 'b1'),
  ('55555555-5555-4555-8555-000000000002', 'Anglais', 'b2'),
  ('55555555-5555-4555-8555-000000000003', 'Anglais', 'c1');

-- Entreprises (SIREN fictifs en 999…, clé de Luhn valide).
insert into public.companies (id, siren, legal_name, display_name, naf_code, naf_label, headcount_band, city, postcode,
                              sirene, description, website, email_domain, email_domain_generic, status, verified_at,
                              verified_by, created_by, created_at)
values
  ('66666666-6666-4666-8666-000000000001', '999012347', 'MAISON VERTE SAS', 'Maison Verte', '35.11Z',
   'Production d’électricité', '100 à 199 salariés', 'Paris', '75011',
   '{"siren": "999012347", "legal_name": "MAISON VERTE SAS", "naf_code": "35.11Z", "naf_label": "Production d’électricité",
     "headcount_band": "100 à 199 salariés", "address": "14 rue de la Roquette", "city": "Paris", "postcode": "75011",
     "created_on": "2014-03-12", "active": true, "diffusion": "O"}',
   'Producteur d’énergies renouvelables : parcs éoliens et solaires en France, une équipe data qui pilote la production au quart d’heure.',
   'https://maisonverte.example', 'maisonverte.test', false, 'verified', now() - interval '18 days',
   '11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-000000000011', now() - interval '19 days'),
  ('66666666-6666-4666-8666-000000000002', '999023450', 'ATELIER LUMEN', 'Atelier Lumen', '20.42Z',
   'Fabrication de parfums et de produits pour la toilette', '50 à 99 salariés', 'Lyon', '69002',
   '{"siren": "999023450", "legal_name": "ATELIER LUMEN", "naf_code": "20.42Z", "city": "Lyon", "postcode": "69002", "active": true, "diffusion": "O"}',
   'Cosmétique fabriquée à Lyon.', null, 'atelierlumen.test', false, 'verified', now() - interval '18 days',
   '11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-000000000013', now() - interval '19 days'),
  ('66666666-6666-4666-8666-000000000003', '999034564', 'RAIL ET CO', 'Rail&Co', '49.10Z',
   'Transport ferroviaire interurbain de voyageurs', '1 000 à 1 999 salariés', 'Courbevoie', '92400',
   '{"siren": "999034564", "legal_name": "RAIL ET CO", "naf_code": "49.10Z", "city": "Courbevoie", "postcode": "92400", "active": true, "diffusion": "O"}',
   'Opérateur ferroviaire régional.', null, 'railco.test', false, 'verified', now() - interval '18 days',
   '11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-000000000014', now() - interval '19 days'),
  ('66666666-6666-4666-8666-000000000004', '999045677', 'NORDIA', 'Nordia', '70.22Z',
   'Conseil pour les affaires et autres conseils de gestion', '20 à 49 salariés', 'Paris', '75009',
   '{"siren": "999045677", "legal_name": "NORDIA", "naf_code": "70.22Z", "city": "Paris", "postcode": "75009", "active": true, "diffusion": "O"}',
   null, null, 'nordia.test', false, 'verified', now() - interval '30 days',
   '11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-000000000015', now() - interval '31 days'),
  ('66666666-6666-4666-8666-000000000005', '999056781', 'ATELIER NOVA', 'Atelier Nova', '62.01Z',
   'Programmation informatique', '0 salarié', 'Paris', '75010',
   '{"siren": "999056781", "legal_name": "ATELIER NOVA", "naf_code": "62.01Z", "headcount_band": "0 salarié", "city": "Paris", "postcode": "75010", "active": true, "diffusion": "O"}',
   null, null, 'ateliernova.test', false, 'pending', null, null, '55555555-5555-4555-8555-000000000012', now() - interval '1 day');

insert into public.company_members (company_id, user_id, role, job_title, first_name) values
  ('66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000011', 'owner', 'Responsable RH', 'Thomas'),
  ('66666666-6666-4666-8666-000000000005', '55555555-5555-4555-8555-000000000012', 'owner', 'Fondatrice', 'Léa'),
  ('66666666-6666-4666-8666-000000000002', '55555555-5555-4555-8555-000000000013', 'owner', 'Chargée de recrutement', 'Julie'),
  ('66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000014', 'owner', 'Talent acquisition', 'Marc'),
  ('66666666-6666-4666-8666-000000000004', '55555555-5555-4555-8555-000000000015', 'owner', 'Associé', 'Paul');

-- Offres.
insert into public.offers (id, company_id, title, contract, city, postcode, address_label, location, remote_days,
                           salary_min_k, salary_max_k, start_label, experience_band, missions, must_have, nice_to_have,
                           language_justification, team_description, manager_name, manager_title, interviews_count,
                           response_days, status, submitted_at, published_at, expires_at, created_by, created_at)
values
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', 'Data analyst junior', 'cdi',
   'Paris 11e', '75011', '14 rue de la Roquette, 75011 Paris',
   extensions.st_setsrid(extensions.st_makepoint(2.373, 48.854), 4326)::extensions.geography, 2, 42, 48, 'Janvier 2027', 'y0_1',
   array['Suivre la production de 40 parcs éoliens et solaires, au quart d’heure',
         'Construire les tableaux de bord des équipes d’exploitation',
         'Tester des prévisions de production avec l’équipe data science'],
   array['Bac+5 en data, statistiques ou économie', 'SQL', 'Python'], array['dbt', 'Power BI'], null,
   'Six personnes entre la data, l’exploitation et la finance, au troisième étage, côté cour.',
   'Inès Moreau', 'Head of Data', 2, 7, 'published', now() - interval '4 days', now() - interval '3 days',
   now() + interval '57 days', '55555555-5555-4555-8555-000000000011', now() - interval '6 days'),
  ('77777777-7777-4777-8777-000000000002', '66666666-6666-4666-8666-000000000001', 'Product designer', 'cdi',
   'Paris 11e', '75011', '14 rue de la Roquette, 75011 Paris',
   extensions.st_setsrid(extensions.st_makepoint(2.373, 48.854), 4326)::extensions.geography, 2, 48, 55, 'Février 2027', 'y3_5',
   array['Concevoir l’application des techniciens de maintenance', 'Mener les tests avec les équipes sur site',
         'Tenir la bibliothèque de composants'],
   array['Portfolio d’applications métier', 'Figma'], array['Recherche utilisateur'], null, null,
   'Inès Moreau', 'Head of Data', 2, 7, 'published', now() - interval '9 days', now() - interval '8 days',
   now() + interval '52 days', '55555555-5555-4555-8555-000000000011', now() - interval '10 days'),
  ('77777777-7777-4777-8777-000000000003', '66666666-6666-4666-8666-000000000001', 'Chef·fe de projet éolien', 'cdi',
   'Paris 11e', '75011', null, extensions.st_setsrid(extensions.st_makepoint(2.373, 48.854), 4326)::extensions.geography,
   1, null, null, null, 'y3_5',
   array['Piloter 3 à 4 parcs éoliens, du permis à la mise en service', 'Coordonner bureaux d’études, élus et riverains',
         'Tenir le budget et le planning de chaque projet'],
   array['Bac+5 ingénieur ou équivalent', 'Gestion de projet'], array['Expérience ICPE'], null, null,
   'Hugo Bernard', 'Directeur des projets', 2, 7, 'draft', null, null, null,
   '55555555-5555-4555-8555-000000000011', now() - interval '1 day'),
  ('77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000002', 'Chargé·e d’études marketing', 'cdi',
   'Lyon 2e', '69002', null, extensions.st_setsrid(extensions.st_makepoint(4.827, 45.749), 4326)::extensions.geography,
   1, 38, 42, 'Dès que possible', 'y3_5',
   array['Mener les études consommateurs', 'Suivre les lancements de gamme', 'Présenter les résultats au comité produit'],
   array['Études quantitatives', 'Excel'], array['SPSS'], null, null, null, null, 2, 7, 'published',
   now() - interval '15 days', now() - interval '14 days', now() + interval '46 days',
   '55555555-5555-4555-8555-000000000013', now() - interval '16 days'),
  ('77777777-7777-4777-8777-000000000005', '66666666-6666-4666-8666-000000000003', 'Analyste pricing', 'cdi',
   'La Défense', '92400', null, extensions.st_setsrid(extensions.st_makepoint(2.238, 48.892), 4326)::extensions.geography,
   2, 45, 50, 'Janvier 2027', 'y1_3',
   array['Construire les grilles tarifaires des lignes régionales', 'Mesurer l’effet des promotions',
         'Préparer les dossiers pour les autorités organisatrices'],
   array['SQL', 'Python', 'Statistiques'], array['Anglais courant'], null, null, null, null, 2, 7, 'published',
   now() - interval '6 days', now() - interval '5 days', now() + interval '55 days',
   '55555555-5555-4555-8555-000000000014', now() - interval '7 days'),
  ('77777777-7777-4777-8777-000000000006', '66666666-6666-4666-8666-000000000004', 'Contrôleur·se de gestion junior', 'cdi',
   'Paris 9e', '75009', null, extensions.st_setsrid(extensions.st_makepoint(2.338, 48.876), 4326)::extensions.geography,
   1, 40, 44, 'Dès que possible', 'y0_1',
   array['Préparer la clôture mensuelle', 'Suivre les budgets des missions', 'Automatiser les reportings'],
   array['Excel', 'Contrôle de gestion'], array['SQL'], null, null, null, null, 2, 7, 'published',
   now() - interval '25 days', now() - interval '24 days', now() + interval '36 days',
   '55555555-5555-4555-8555-000000000015', now() - interval '26 days'),
  ('77777777-7777-4777-8777-000000000007', '66666666-6666-4666-8666-000000000005', 'Développeur·se full stack', 'cdi',
   'Paris 10e', '75010', null, extensions.st_setsrid(extensions.st_makepoint(2.360, 48.876), 4326)::extensions.geography,
   3, 45, 55, 'Dès que possible', 'y1_3',
   array['Développer l’application de réservation', 'Écrire les tests', 'Participer aux choix d’architecture'],
   array['TypeScript', 'PostgreSQL'], array['React Native'], null, null, null, null, 1, 3, 'pending_review',
   now() - interval '5 hours', null, null, '55555555-5555-4555-8555-000000000012', now() - interval '20 hours');

insert into public.offer_photos (offer_id, company_id, kind, storage_path, position, consent_certified, moderation) values
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', 'workplace',
   '66666666-6666-4666-8666-000000000001/plateau.jpg', 0, false, 'approved'),
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', 'workplace',
   '66666666-6666-4666-8666-000000000001/reunion.jpg', 1, false, 'approved'),
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', 'team',
   '66666666-6666-4666-8666-000000000001/equipe.jpg', 2, true, 'approved'),
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', 'area',
   '66666666-6666-4666-8666-000000000001/quartier.jpg', 3, false, 'approved'),
  ('77777777-7777-4777-8777-000000000002', '66666666-6666-4666-8666-000000000001', 'workplace',
   '66666666-6666-4666-8666-000000000001/studio.jpg', 0, false, 'approved'),
  ('77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000002', 'workplace',
   '66666666-6666-4666-8666-000000000002/atelier.jpg', 0, false, 'approved'),
  ('77777777-7777-4777-8777-000000000005', '66666666-6666-4666-8666-000000000003', 'workplace',
   '66666666-6666-4666-8666-000000000003/plateau.jpg', 0, false, 'approved'),
  ('77777777-7777-4777-8777-000000000006', '66666666-6666-4666-8666-000000000004', 'workplace',
   '66666666-6666-4666-8666-000000000004/plateau.jpg', 0, false, 'approved'),
  ('77777777-7777-4777-8777-000000000007', '66666666-6666-4666-8666-000000000005', 'workplace',
   '66666666-6666-4666-8666-000000000005/bureau.jpg', 0, false, 'pending');

-- Candidatures.
--  * Camille → Maison Verte : match, 3 créneaux proposés, conversation ouverte ;
--  * Camille → Rail&Co : vue, réponse attendue sous 3 jours ;
--  * Camille → Atelier Lumen : refus motivé ; Camille → Nordia : close sans réponse ;
--  * Yanis et Nathan → Maison Verte : dans la pile, anonymes.
insert into public.applications (id, offer_id, company_id, candidate_id, status, note, note_target, note_target_label,
                                 created_at, seen_at, due_at, decided_at, decided_by, interested_at, closed_at,
                                 refusal_reason, refusal_message)
values
  ('88888888-8888-4888-8888-000000000001', '77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001',
   '55555555-5555-4555-8555-000000000001', 'interested',
   'Les prévisions au quart d’heure, c’est exactement ce que je fais en alternance avec les ventes.', 'mission:0',
   'Suivre la production de 40 parcs éoliens et solaires, au quart d’heure',
   now() - interval '3 days', now() - interval '2 days', now() + interval '4 days', now() - interval '1 day',
   '55555555-5555-4555-8555-000000000011', now() - interval '1 day', null, null, null),
  ('88888888-8888-4888-8888-000000000002', '77777777-7777-4777-8777-000000000005', '66666666-6666-4666-8666-000000000003',
   '55555555-5555-4555-8555-000000000001', 'seen', null, null, null,
   now() - interval '4 days', now() - interval '1 day', now() + interval '3 days', null, null, null, null, null, null),
  ('88888888-8888-4888-8888-000000000003', '77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000002',
   '55555555-5555-4555-8555-000000000001', 'rejected', null, null, null,
   now() - interval '12 days', now() - interval '11 days', now() - interval '5 days', now() - interval '10 days',
   '55555555-5555-4555-8555-000000000013', null, now() - interval '10 days', 'experience',
   'Merci pour votre candidature. Le poste demande trois ans d’expérience en études marketing ; nous avons retenu un profil plus expérimenté.'),
  ('88888888-8888-4888-8888-000000000004', '77777777-7777-4777-8777-000000000006', '66666666-6666-4666-8666-000000000004',
   '55555555-5555-4555-8555-000000000001', 'closed_no_response', null, null, null,
   now() - interval '11 days', null, now() - interval '4 days', null, null, null, now() - interval '4 days', null, null),
  ('88888888-8888-4888-8888-000000000005', '77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001',
   '55555555-5555-4555-8555-000000000002', 'sent', 'J’ai déjà mis dbt en production chez mon employeur actuel.', 'nice:0', 'dbt',
   now() - interval '2 days', null, now() + interval '5 days', null, null, null, null, null, null),
  ('88888888-8888-4888-8888-000000000006', '77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001',
   '55555555-5555-4555-8555-000000000003', 'sent', null, null, null,
   now() - interval '6 days', null, now() + interval '1 day', null, null, null, null, null, null);

insert into public.interview_slots (application_id, starts_at, duration_min, mode, location, with_whom, created_by, created_at)
select '88888888-8888-4888-8888-000000000001', date_trunc('day', now()) + d, 45, 'onsite',
       '14 rue de la Roquette, 75011 Paris', 'Inès Moreau, Head of Data', '55555555-5555-4555-8555-000000000011',
       now() - interval '20 hours'
  from (values (interval '6 days 9 hours 30 minutes'), (interval '7 days 14 hours'), (interval '8 days 11 hours')) s(d);

insert into public.application_messages (application_id, sender_id, from_candidate, body, context, created_at, read_at) values
  ('88888888-8888-4888-8888-000000000001', '55555555-5555-4555-8555-000000000011', false,
   'Bonjour Camille, votre réponse sur les prévisions au quart d’heure a beaucoup plu à Inès. Je vous propose trois créneaux pour un premier entretien.',
   'Les prévisions au quart d’heure, c’est exactement ce que je fais en alternance avec les ventes.',
   now() - interval '20 hours', null);

insert into public.application_notes (application_id, author_id, body, created_at) values
  ('88888888-8888-4888-8888-000000000001', '55555555-5555-4555-8555-000000000011',
   'Très bon échange par écrit, à confirmer en entretien sur la partie prévision.', now() - interval '20 hours');

insert into public.member_notices (user_id, kind, payload, created_at) values
  ('55555555-5555-4555-8555-000000000001', 'application_interested',
   '{"application_id": "88888888-8888-4888-8888-000000000001", "offer_title": "Data analyst junior", "company_name": "Maison Verte"}',
   now() - interval '1 day'),
  ('55555555-5555-4555-8555-000000000001', 'interview_proposed',
   '{"application_id": "88888888-8888-4888-8888-000000000001", "offer_title": "Data analyst junior", "company_name": "Maison Verte"}',
   now() - interval '20 hours');

-- Approche directe : Rail&Co a invité Nathan (n° 0388), ouvert aux opportunités.
insert into public.invitations (offer_id, company_id, candidate_id, message, created_by, created_at) values
  ('77777777-7777-4777-8777-000000000005', '66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000003',
   'Votre parcours en BI sur des données de transport nous intéresse beaucoup pour ce poste.',
   '55555555-5555-4555-8555-000000000014', now() - interval '2 days');

-- Un signalement ouvert pour le back-office.
insert into public.offer_reports (offer_id, reporter_id, reason, details, created_at) values
  ('77777777-7777-4777-8777-000000000006', '55555555-5555-4555-8555-000000000002', 'misleading_salary',
   'Au téléphone, on m’a parlé de 34 k€, pas de 40.', now() - interval '3 hours');

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

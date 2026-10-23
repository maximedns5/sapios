-- Sécurité : nom légal, date de naissance et texte libre des signalements chiffrés en base.
-- Plus de colonne en clair ; le chiffré ne sort jamais vers un client ; seuls le membre (pour lui-même),
-- un admin en aal2 et le serveur obtiennent le clair, par des fonctions.
begin;
\ir _helpers.psql
select plan(32);

do $$
begin
  perform pg_temp.new_user(1);                                       -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2, 'standard', 'woman', '{man}', 30, 25, 35);  -- membre qui consulte
  perform pg_temp.new_member(3, 'standard', 'man', '{woman}', 31, 18, 99);  -- dans la tranche d'âge
  perform pg_temp.new_member(4, 'standard', 'man', '{woman}', 50, 18, 99);  -- hors tranche
end;
$$;

-- 1. Schéma : plus de clair -----------------------------------------------------------------------
select hasnt_column('public', 'profile_private', 'legal_name', 'profile_private.legal_name supprimée');
select hasnt_column('public', 'profile_private', 'birthdate', 'profile_private.birthdate supprimée');
select hasnt_column('public', 'reports', 'details', 'reports.details supprimée');
select col_type_is('public', 'profile_private', 'legal_name_enc', 'bytea', 'nom légal chiffré (bytea)');
select col_type_is('public', 'profile_private', 'birthdate_enc', 'bytea', 'date de naissance chiffrée (bytea)');
select col_type_is('public', 'reports', 'details_enc', 'bytea', 'texte du signalement chiffré (bytea)');
select ok(exists (select 1 from vault.secrets where name = 'field_key'), 'clé field_key présente dans Vault');

-- 2. Le chiffré n'est ni le clair, ni identique d'une ligne à l'autre ---------------------------------
select ok(position(convert_to('Membre Test 2', 'UTF8') in legal_name_enc) = 0,
  'le nom légal n''apparaît pas dans le chiffré')
  from public.profile_private where user_id = pg_temp.uid(2);
do $$ begin perform pg_temp.new_user(6); perform private.store_identity(pg_temp.uid(6), 'Membre Test 3', '1995-03-14'); end $$;
select isnt((select legal_name_enc from public.profile_private where user_id = pg_temp.uid(3)),
            (select legal_name_enc from public.profile_private where user_id = pg_temp.uid(6)),
  'même nom légal, deux chiffrés différents');
select is((select private.decrypt_text(legal_name_enc) from public.profile_private where user_id = pg_temp.uid(6)),
  'Membre Test 3', 'déchiffrement côté serveur');
select is((select birth_month from public.profile_private where user_id = pg_temp.uid(6)), '1995-03-01'::date,
  'seul le mois de naissance reste en clair');

-- 3. Le membre : sa propre identité, jamais le chiffré, jamais celle d'un autre -------------------------
select pg_temp.login(pg_temp.uid(2));
select is((public.get_my_identity() ->> 'legal_name'), 'Membre Test 2', 'get_my_identity : nom légal déchiffré');
select ok((public.get_my_identity() ->> 'birthdate')::date < current_date - interval '29 years',
  'get_my_identity : date de naissance déchiffrée');
select is((public.export_my_data() -> 'identity' ->> 'legal_name'), 'Membre Test 2', 'export : identité déchiffrée');
select ok(not (public.export_my_data() -> 'identity') ? 'legal_name_enc', 'export : pas de chiffré');
select throws_ok($$select legal_name_enc from public.profile_private$$, '42501', null,
  'membre : colonne chiffrée illisible');
select throws_ok($$select birthdate_enc from public.profile_private$$, '42501', null,
  'membre : date chiffrée illisible');
select is_empty($$select 1 from public.profile_private where user_id = pg_temp.uid(3)$$,
  'membre : ligne d''un autre invisible');
select throws_ok($$select * from public.admin_list_identities(array[pg_temp.uid(3)])$$, 'P0001', 'forbidden',
  'membre : noms légaux des autres refusés');
select throws_ok($$select * from public.server_get_identity(pg_temp.uid(3))$$, '42501', null,
  'membre : identité serveur refusée');

-- 4. L'âge reste calculé pour la découverte -------------------------------------------------------
select results_eq($$select id, age from public.get_feed(50) order by id$$,
  $$values (pg_temp.uid(3), 31)$$, 'découverte : filtre d''âge et âge affiché conservés');

-- 5. Signalement : texte chiffré, lisible par un admin en aal2 seulement -----------------------------
select lives_ok($$select public.report_user(pg_temp.uid(3), 'harassment', 'Insultes répétées en message.')$$,
  'signalement avec texte libre');
select throws_ok($$select details_enc from public.reports$$, '42501', null, 'membre : texte chiffré illisible');
select is((public.export_my_data() -> 'reports' -> 0 ->> 'details'), 'Insultes répétées en message.',
  'export : texte de mes signalements déchiffré');
select pg_temp.logout();
select ok(position(convert_to('Insultes', 'UTF8') in details_enc) = 0, 'le texte n''apparaît pas dans le chiffré')
  from public.reports where reporter_id = pg_temp.uid(2);

select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select * from public.admin_list_reports('open')$$, 'P0001', 'forbidden',
  'admin aal1 : signalements refusés');
select throws_ok($$select * from public.admin_list_identities(array[pg_temp.uid(3)])$$, 'P0001', 'forbidden',
  'admin aal1 : noms légaux refusés');

select pg_temp.login(pg_temp.uid(1), 'aal2');
select results_eq($$select details from public.admin_list_reports('open') where reporter_id = pg_temp.uid(2)$$,
  $$values ('Insultes répétées en message.'::text)$$, 'admin aal2 : texte du signalement déchiffré');
select results_eq($$select user_id, legal_name from public.admin_list_identities(array[pg_temp.uid(3)])$$,
  $$values (pg_temp.uid(3), 'Membre Test 3'::text)$$, 'admin aal2 : nom légal déchiffré');
select throws_ok($$select legal_name_enc from public.profile_private$$, '42501', null,
  'admin : chiffré illisible même en aal2');

-- 6. Serveur (process-diploma) -------------------------------------------------------------------
select pg_temp.login_service();
select results_eq($$select legal_name from public.server_get_identity(pg_temp.uid(6))$$,
  $$values ('Membre Test 3'::text)$$, 'clé de service : identité déchiffrée');
select pg_temp.logout();

-- 7. Saisie : contrôles sur le clair, avant chiffrement ---------------------------------------------
do $$ begin perform pg_temp.new_user(5); end $$;
select pg_temp.login(pg_temp.uid(5));
select throws_ok(format($$select public.set_identity(%L, '1990-01-01')$$, repeat('a', 201)), 'P0001', 'invalid_input',
  'nom légal de plus de 200 caractères refusé');
select pg_temp.logout();

select * from finish();
rollback;

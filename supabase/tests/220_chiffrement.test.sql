-- Sécurité : le nom du candidat est chiffré en base (candidate_identities.last_name_enc). Le chiffré ne
-- sort jamais vers un client ; seuls le candidat (pour lui-même), un admin en aal2 (file des diplômes)
-- et le serveur (process-diploma) obtiennent le clair, par des fonctions.
begin;
\ir _helpers.psql
select plan(16);

do $$
begin
  perform pg_temp.new_user(1);                 -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2, 'standard');   -- candidat qui consulte
  perform pg_temp.new_member(3, 'standard');
  perform pg_temp.new_member(6);
  update public.candidate_identities set last_name_enc = private.encrypt_text('Test 3') where user_id = pg_temp.uid(6);
  insert into public.degree_submissions (id, user_id, storage_path, mime, status)
  values (pg_temp.uid(903), pg_temp.uid(3), pg_temp.uid(3)::text || '/d.pdf', 'application/pdf', 'needs_review');
end;
$$;

-- 1. Schéma : plus de clair -----------------------------------------------------------------------
select hasnt_column('public', 'candidate_identities', 'last_name', 'pas de nom en clair');
select col_type_is('public', 'candidate_identities', 'last_name_enc', 'bytea', 'nom chiffré (bytea)');
select ok(exists (select 1 from vault.secrets where name = 'field_key'), 'clé field_key présente dans Vault');

-- 2. Le chiffré n'est ni le clair, ni identique d'une ligne à l'autre ---------------------------------
select ok(position(convert_to('Test 2', 'UTF8') in last_name_enc) = 0, 'le nom n''apparaît pas dans le chiffré')
  from public.candidate_identities where user_id = pg_temp.uid(2);
select isnt((select last_name_enc from public.candidate_identities where user_id = pg_temp.uid(3)),
            (select last_name_enc from public.candidate_identities where user_id = pg_temp.uid(6)),
  'même nom, deux chiffrés différents');
select is((select private.decrypt_text(last_name_enc) from public.candidate_identities where user_id = pg_temp.uid(6)),
  'Test 3', 'déchiffrement côté serveur');

-- 3. Le candidat : sa propre identité, jamais le chiffré, jamais celle d'un autre ----------------------
select pg_temp.login(pg_temp.uid(2));
select is(public.get_my_candidate_identity() ->> 'last_name', 'Test 2', 'get_my_candidate_identity : nom déchiffré');
select throws_ok($$select last_name_enc from public.candidate_identities$$, '42501', null,
  'candidat : colonne chiffrée illisible');
select throws_ok($$select * from public.admin_list_submissions()$$, 'P0001', 'forbidden',
  'candidat : noms de la file des diplômes refusés');
select throws_ok($$select * from public.server_get_identity(pg_temp.uid(3))$$, '42501', null,
  'candidat : identité serveur refusée');
select throws_ok($$select public.set_candidate_identity('Prénom', repeat('a', 81))$$, 'P0001', 'invalid_input',
  'nom de plus de 80 caractères refusé, contrôlé avant chiffrement');

-- 4. Admin : clair en aal2 seulement -----------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select * from public.admin_get_submission(pg_temp.uid(903))$$, 'P0001', 'forbidden',
  'admin aal1 : identité refusée');
select pg_temp.login(pg_temp.uid(1), 'aal2');
select results_eq($$select legal_name from public.admin_get_submission(pg_temp.uid(903))$$,
  $$values ('Membre Test 3'::text)$$, 'admin aal2 : nom déchiffré dans la file des diplômes');
select throws_ok($$select last_name_enc from public.candidate_identities$$, '42501', null,
  'admin : chiffré illisible même en aal2');

-- 5. Serveur (process-diploma) -------------------------------------------------------------------
select pg_temp.login_service();
select results_eq($$select legal_name, birthdate from public.server_get_identity(pg_temp.uid(6))$$,
  $$values ('Membre Test 3'::text, null::date)$$, 'clé de service : identité déchiffrée, sans date de naissance');
select pg_temp.logout();
select is_empty($$select 1 from information_schema.columns
                   where table_schema = 'public' and column_name in ('legal_name_enc', 'birthdate_enc', 'details_enc')$$,
  'plus aucune colonne chiffrée du dating');

select * from finish();
rollback;

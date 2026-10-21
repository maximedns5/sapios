-- §10 test 3 (concurrence réelle) : deux likes croisés simultanés donnent exactement un match.
-- Deux sessions indépendantes (dblink) : A like B dans une transaction encore ouverte, B like A
-- en parallèle. Sans verrou, B ne verrait pas le like non validé de A et aucun match ne serait
-- créé ; avec le verrou de paire, B attend le commit de A puis crée le match.
-- Les comptes de ce test sont validés (hors transaction du test) puis supprimés à la fin.
-- Connexion locale : hôte `db` du réseau Docker de la stack, mot de passe local `postgres`.
begin;
\ir _helpers.psql
create extension if not exists dblink with schema extensions;
select plan(6);

select dblink_connect('sapios_setup', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
select dblink_connect('sapios_a', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
select dblink_connect('sapios_b', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

select dblink_exec('sapios_setup', $setup$
  delete from auth.users where id in ('aaaaaaaa-0000-4000-8000-000000009001', 'aaaaaaaa-0000-4000-8000-000000009002');
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, '', now(),
         '{"provider": "email", "providers": ["email"]}', '{}', now(), now()
  from (values ('aaaaaaaa-0000-4000-8000-000000009001'::uuid, 'pgtap-race-a@sapios.test'),
               ('aaaaaaaa-0000-4000-8000-000000009002'::uuid, 'pgtap-race-b@sapios.test')) as v(id, email);
  update public.profiles
     set display_name = 'Race', city = 'Reykjavik', status = 'active',
         gender = case when id = 'aaaaaaaa-0000-4000-8000-000000009001' then 'woman' else 'man' end::public.gender,
         seeking_genders = case when id = 'aaaaaaaa-0000-4000-8000-000000009001' then '{man}' else '{woman}' end::public.gender[]
   where id in ('aaaaaaaa-0000-4000-8000-000000009001', 'aaaaaaaa-0000-4000-8000-000000009002');
  update public.profile_private set legal_name = 'Race Test', birthdate = '1990-01-01'
   where user_id in ('aaaaaaaa-0000-4000-8000-000000009001', 'aaaaaaaa-0000-4000-8000-000000009002');
  insert into public.user_access (user_id, level, tier, copy_key)
  values ('aaaaaaaa-0000-4000-8000-000000009001', 7, 'standard', 'verdict.standard'),
         ('aaaaaaaa-0000-4000-8000-000000009002', 7, 'standard', 'verdict.standard');
$setup$);

-- Session A : transaction ouverte, like vers B.
select dblink_exec('sapios_a', 'begin');
select dblink_exec('sapios_a', $q$set local request.jwt.claims =
  '{"sub": "aaaaaaaa-0000-4000-8000-000000009001", "role": "authenticated"}'; set local role authenticated$q$);
select is(
  (select r from dblink('sapios_a', $q$select public.swipe('aaaaaaaa-0000-4000-8000-000000009002', 'like')::text$q$) as t(r text)),
  '{"matched": false, "match_id": null}',
  'A like B (non validé) : pas encore de match');

-- Session B : like vers A en parallèle, asynchrone.
select dblink_exec('sapios_b', 'begin');
select dblink_exec('sapios_b', $q$set local request.jwt.claims =
  '{"sub": "aaaaaaaa-0000-4000-8000-000000009002", "role": "authenticated"}'; set local role authenticated$q$);
select dblink_send_query('sapios_b', $q$select public.swipe('aaaaaaaa-0000-4000-8000-000000009001', 'like')::text$q$);
select pg_sleep(0.5);
select is(dblink_is_busy('sapios_b'), 1, 'B like A simultanément : attend le verrou de la paire');

select dblink_exec('sapios_a', 'commit');
select is(
  (select (r::jsonb ->> 'matched') from dblink_get_result('sapios_b') as t(r text)),
  'true', 'après la validation de A, le like de B voit celui de A et crée le match');
select is((select count(*)::int from dblink_get_result('sapios_b') as t(r text)), 0, 'résultat de B entièrement lu');
select dblink_exec('sapios_b', 'commit');

select is(
  (select count(*)::int from public.matches
    where user_a = 'aaaaaaaa-0000-4000-8000-000000009001' and user_b = 'aaaaaaaa-0000-4000-8000-000000009002'),
  1, 'exactement un match pour la paire');

select dblink_exec('sapios_setup', $q$
  delete from auth.users where id in ('aaaaaaaa-0000-4000-8000-000000009001', 'aaaaaaaa-0000-4000-8000-000000009002')$q$);
select is(
  (select count(*)::int from public.matches
    where user_a = 'aaaaaaaa-0000-4000-8000-000000009001' and user_b = 'aaaaaaaa-0000-4000-8000-000000009002'),
  0, 'nettoyage : comptes de test supprimés');

select dblink_disconnect('sapios_a');
select dblink_disconnect('sapios_b');
select dblink_disconnect('sapios_setup');

select * from finish();
rollback;

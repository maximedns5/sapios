-- Structure : extensions, RLS partout, fonctions durcies, publication, buckets, file, cron.
begin;
\ir _helpers.psql
select plan(23);

select has_extension('postgis', 'postgis installée');
select has_extension('pgmq', 'pgmq installée');
select has_extension('pg_cron', 'pg_cron installée');
select has_extension('pg_net', 'pg_net installée');
select has_extension('citext', 'citext installée');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'RLS activée sur toutes les tables du schéma public');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'toutes les fonctions security definer ont search_path vide');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon n''exécute aucune fonction du schéma public');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon n''exécute aucune fonction interne');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('apply_diploma_review', 'diploma_queue_read', 'diploma_queue_delete',
                        'diplomas_to_purge', 'mark_diploma_purged')),
  null, 'authenticated n''exécute aucune fonction réservée à service_role');

select ok(
  (select bool_and(has_function_privilege('service_role', p.oid, 'execute')) and count(*) = 5
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('apply_diploma_review', 'diploma_queue_read',
          'diploma_queue_delete', 'diplomas_to_purge', 'mark_diploma_purged')),
  'service_role exécute les fonctions serveur');

select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
  array['matches', 'messages'], 'publication supabase_realtime limitée à messages et matches');

select results_eq(
  $$select id, public from storage.buckets where id in ('diplomas', 'photos') order by id$$,
  $$values ('diplomas'::text, false), ('photos'::text, false)$$,
  'buckets diplomas et photos privés');

select is((select file_size_limit from storage.buckets where id = 'diplomas'), 15728640::bigint,
  'diplômes limités à 15 Mo');

select ok(exists (select 1 from pgmq.list_queues() q where q.queue_name = 'diploma_extraction'),
  'file pgmq diploma_extraction créée');

select results_eq(
  $$select jobname::text, schedule::text from cron.job where jobname in ('process-diploma', 'purge-diplomas') order by jobname$$,
  $$values ('process-diploma', '* * * * *'), ('purge-diplomas', '17 3 * * *')$$,
  'tâches pg_cron planifiées');

select has_trigger('auth', 'users', 'on_auth_user_created', 'trigger de création de profil sur auth.users');
select has_trigger('public', 'degree_submissions', 'degree_submissions_enqueue', 'trigger d''envoi dans la file');
select has_trigger('public', 'messages', 'messages_notify', 'trigger notify sur les messages');
select has_trigger('public', 'matches', 'matches_notify', 'trigger notify sur les matches');

select is(
  (select array_agg(distinct cl.relname::text order by cl.relname::text)
     from pg_constraint con
     join pg_class cl on cl.oid = con.conrelid
     join pg_namespace n on n.oid = cl.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
      and con.confrelid = 'auth.users'::regclass and con.confdeltype <> 'c'),
  null, 'toutes les clés étrangères vers auth.users sont en on delete cascade');

select is(
  (select count(*)::int from pg_constraint con where con.conrelid = 'public.audit_log'::regclass and con.contype = 'f'),
  0, 'audit_log sans clé étrangère (survit à la suppression de compte)');

-- Un compte créé par l'API auth reçoit profil (onboarding) et ligne privée.
select pg_temp.new_user(1);
select results_eq(
  $$select p.status::text, (pp.user_id is not null) from public.profiles p
      left join public.profile_private pp on pp.user_id = p.id where p.id = pg_temp.uid(1)$$,
  $$values ('onboarding'::text, true)$$,
  'trigger after insert on auth.users : profil onboarding + profile_private');

select * from finish();
rollback;

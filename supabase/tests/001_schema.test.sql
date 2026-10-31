-- Structure : extensions, RLS partout, fonctions durcies, publication, buckets, file, cron, et plus
-- aucun objet du dating (migration 20261031090000_nettoyage_dating).
begin;
\ir _helpers.psql
select plan(26);

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
  array['application_messages', 'interview_slots'],
  'publication supabase_realtime limitée aux messages et créneaux d''entretien');

select results_eq(
  $$select id, public from storage.buckets where id in ('diplomas', 'offer-photos') order by id$$,
  $$values ('diplomas'::text, false), ('offer-photos'::text, false)$$,
  'buckets diplomas et offer-photos privés');

select is((select file_size_limit from storage.buckets where id = 'diplomas'), 15728640::bigint,
  'diplômes limités à 15 Mo');

select ok(exists (select 1 from pgmq.list_queues() q where q.queue_name = 'diploma_extraction'),
  'file pgmq diploma_extraction créée');

select results_eq(
  $$select jobname::text, schedule::text from cron.job where jobname in ('process-diploma', 'purge-diplomas') order by jobname$$,
  $$values ('process-diploma', '* * * * *'), ('purge-diplomas', '17 3 * * *')$$,
  'tâches pg_cron planifiées');
select is_empty($$select 1 from cron.job where jobname = 'event-reminders'$$, 'plus de rappel d''événement');

select hasnt_trigger('auth', 'users', 'on_auth_user_created', 'plus de profil créé à l''inscription');
select has_trigger('public', 'degree_submissions', 'degree_submissions_enqueue', 'trigger d''envoi dans la file');

-- Emploi (docs/EMPLOI_CONTRACT.md §2) : les auteurs côté entreprise ou modération (recruteur, admin,
-- signaleur) passent à null ; l'offre, la candidature et l'historique du candidat restent.
select is(
  (select array_agg(cl.relname::text || '.' || a.attname::text order by cl.relname::text || '.' || a.attname::text)
     from pg_constraint con
     join pg_class cl on cl.oid = con.conrelid
     join pg_namespace n on n.oid = cl.relnamespace
     join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.contype = 'f' and n.nspname = 'public'
      and con.confrelid = 'auth.users'::regclass and con.confdeltype <> 'c'),
  array['application_messages.sender_id', 'application_notes.author_id', 'applications.decided_by',
        'companies.created_by', 'companies.verified_by', 'interview_slots.created_by', 'invitations.created_by',
        'offer_reports.handled_by', 'offer_reports.reporter_id', 'offers.created_by'],
  'clés étrangères vers auth.users en cascade, sauf les auteurs listés (set null)');

select is(
  (select count(*)::int from pg_constraint con where con.conrelid = 'public.audit_log'::regclass and con.contype = 'f'),
  0, 'audit_log sans clé étrangère (survit à la suppression de compte)');

-- Plus aucune table ni aucun type du dating.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind = 'r'
      and c.relname in ('profiles', 'profile_private', 'profile_photos', 'swipes', 'matches', 'messages', 'blocks',
                        'reports', 'profile_prompts', 'profile_answers', 'profile_books', 'profile_theses',
                        'discovery_prefs', 'content_flags', 'referral_codes', 'referrals', 'events',
                        'event_registrations', 'user_pseudonyms', 'banned_identities')),
  null, 'tables du dating supprimées');
select is(
  (select array_agg(t.typname::text order by t.typname) from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname in ('gender', 'profile_status', 'swipe_direction', 'content_kind',
          'content_flag_status', 'discovery_sort', 'thesis_visibility', 'event_kind', 'event_status',
          'registration_status')),
  null, 'types du dating supprimés');

-- La liste d'attente de l'ancienne landing reste (décision à venir), sans collecte.
select has_table('public', 'waitlist_signups', 'waitlist_signups conservée');
select ok(not has_table_privilege('anon', 'public.waitlist_signups', 'insert')
          and not has_any_column_privilege('anon', 'public.waitlist_signups', 'insert'),
  'anon ne peut plus s''inscrire sur la liste d''attente');

-- Un compte créé par l'API auth n'a plus de profil : rien n'est créé à côté.
select pg_temp.new_user(1);
select is_empty($$select 1 from public.emploi_accounts where user_id = pg_temp.uid(1)$$,
  'inscription : aucun compte emploi créé avant le choix du type');

select * from finish();
rollback;

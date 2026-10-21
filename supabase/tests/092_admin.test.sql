-- RPC du back-office : réservées aux admins, admission par lot, signalement + bannissement,
-- statistiques, détail d'une soumission.
begin;
\ir _helpers.psql
select plan(17);

do $$
begin
  perform pg_temp.new_member(1, 'unlimited');                    -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2, 'waitlist', 'man', '{woman}');
  perform pg_temp.new_member(3, 'waitlist', 'man', '{woman}');
  perform pg_temp.new_member(4, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(5, 'standard', 'man', '{woman}');
  insert into public.matches (id, user_a, user_b)
  values (pg_temp.uid(500), least(pg_temp.uid(4), pg_temp.uid(5)), greatest(pg_temp.uid(4), pg_temp.uid(5)));
  insert into public.reports (id, reporter_id, target_id, reason) values (pg_temp.uid(600), pg_temp.uid(4), pg_temp.uid(5), 'harassment');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, signals)
  values (pg_temp.uid(901), pg_temp.uid(2), pg_temp.uid(2)::text || '/d.pdf', 'application/pdf', 'needs_review', '{name_mismatch}');
end;
$$;

-- Non-admin : tout est refusé.
select pg_temp.login(pg_temp.uid(4));
select throws_ok($$select public.admin_stats()$$, 'P0001', 'forbidden', 'admin_stats refusé à un membre');
select throws_ok($$select * from public.admin_get_submission(pg_temp.uid(901))$$, 'P0001', 'forbidden', 'admin_get_submission refusé');
select throws_ok($$select * from public.admin_list_submissions()$$, 'P0001', 'forbidden', 'admin_list_submissions refusé');
select throws_ok($$select * from public.admin_list_waitlist()$$, 'P0001', 'forbidden', 'admin_list_waitlist refusé');

select pg_temp.login(pg_temp.uid(1));
select ok(public.admin_stats() ?& array['users_total', 'profiles_by_status', 'submissions_by_status', 'members_by_tier',
          'matches_total', 'matches_active', 'messages_total', 'waitlist_signups', 'reports_open'],
  'admin_stats : toutes les clés');
select ok((public.admin_stats() ->> 'matches_total')::int >= 1 and (public.admin_stats() -> 'members_by_tier' ->> 'waitlist')::int >= 2,
  'admin_stats compte matches et paliers malgré la RLS');
select results_eq(
  $$select id, signals, email from public.admin_get_submission(pg_temp.uid(901))$$,
  $$values (pg_temp.uid(901), '{name_mismatch}'::text[], 'pgtap-2@sapios.test'::text)$$,
  'admin_get_submission : ligne complète avec signaux et e-mail');
select ok(exists (select 1 from public.admin_list_waitlist() where user_id = pg_temp.uid(2) and email = 'pgtap-2@sapios.test'),
  'admin_list_waitlist : membre en attente avec e-mail');

-- Admission par lot : seuls les membres en liste d'attente changent de palier.
select is(public.admin_admit_waitlist(array[pg_temp.uid(2), pg_temp.uid(4)], 'standard'), 1, 'admission : un membre admis');
select results_eq($$select tier::text, copy_key from public.user_access where user_id = pg_temp.uid(2)$$,
  $$values ('standard'::text, 'verdict.standard'::text)$$, 'admis : palier standard');
select results_eq($$select tier::text from public.user_access where user_id = pg_temp.uid(4)$$,
  $$values ('standard'::text)$$, 'non concerné : inchangé');
select throws_ok($$select public.admin_admit_waitlist(array[pg_temp.uid(3)], 'refused')$$, 'P0001', 'invalid_tier',
  'admission vers un palier sans accès refusée');
select is((select count(*)::int from public.audit_log where action = 'waitlist.admit' and entity_id = pg_temp.uid(2)::text), 1,
  'admission tracée dans audit_log');

-- Signalement traité avec bannissement.
select lives_ok($$select public.admin_set_report_status(pg_temp.uid(600), 'actioned', true)$$, 'signalement traité + ban');
select results_eq($$select status::text from public.reports where id = pg_temp.uid(600)$$, $$values ('actioned'::text)$$,
  'statut du signalement mis à jour');
select pg_temp.logout();
select results_eq(
  $$select p.status::text, m.unmatched_at is not null from public.profiles p, public.matches m
     where p.id = pg_temp.uid(5) and m.id = pg_temp.uid(500)$$,
  $$values ('banned'::text, true)$$, 'membre banni et dé-matché');
select pg_temp.login(pg_temp.uid(4));
select is_empty($$select id from public.profiles where id = pg_temp.uid(5)$$, 'un membre banni n''est plus visible');

select * from finish();
rollback;

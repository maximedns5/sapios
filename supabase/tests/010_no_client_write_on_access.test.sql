-- §10 test 1 : un utilisateur authentifié ne peut écrire ni user_access, ni son palier, ni son
-- niveau, par aucun chemin (écriture directe, statut du profil, soumission, RPC réservées).
begin;
\ir _helpers.psql
select plan(21);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'waitlist');
  -- Soumission en attente du membre 1 et photo en attente de modération.
  insert into public.degree_submissions (id, user_id, storage_path, mime, status)
  values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/d.pdf', 'application/pdf', 'needs_review');
  insert into public.profile_photos (user_id, storage_path, position, moderation_status)
  values (pg_temp.uid(1), pg_temp.uid(1)::text || '/pending.jpg', 2, 'pending');
end;
$$;

select pg_temp.login(pg_temp.uid(1));

select throws_ok(
  $$insert into public.user_access (user_id, level, tier) values (pg_temp.uid(1), 8, 'unlimited')$$,
  '42501', null, 'insert direct dans user_access refusé');
select throws_ok(
  $$insert into public.user_access (user_id, level, tier) values (pg_temp.uid(1), 8, 'unlimited')
    on conflict (user_id) do update set tier = 'unlimited', level = 8$$,
  '42501', null, 'upsert dans user_access refusé');
select throws_ok(
  $$update public.user_access set tier = 'unlimited', level = 8 where user_id = pg_temp.uid(1)$$,
  '42501', null, 'update de user_access refusé');
select throws_ok(
  $$delete from public.user_access where user_id = pg_temp.uid(1)$$,
  '42501', null, 'delete de user_access refusé');

select throws_ok(
  $$update public.profiles set status = 'banned' where id = pg_temp.uid(1)$$,
  '42501', null, 'profiles.status non modifiable par le client');
select lives_ok(
  $$update public.profiles set bio = 'Je relis Kant le dimanche.' where id = pg_temp.uid(1)$$,
  'les champs ordinaires du profil restent modifiables');

select throws_ok(
  $$insert into public.degree_submissions (user_id, storage_path, mime, status, level_verified)
    values (pg_temp.uid(1), pg_temp.uid(1)::text || '/x.pdf', 'application/pdf', 'approved', 8)$$,
  '42501', null, 'insert direct dans degree_submissions refusé');
select throws_ok(
  $$update public.degree_submissions set status = 'approved', level_verified = 8 where id = pg_temp.uid(901)$$,
  '42501', null, 'update de sa soumission (statut, niveau) refusé');

select throws_ok(
  $$select public.apply_diploma_review(pg_temp.uid(901), pg_temp.uid(1), 'approve', 8, null)$$,
  '42501', null, 'apply_diploma_review non exécutable par authenticated');
select throws_ok(
  $$select public.admin_admit_waitlist(array[pg_temp.uid(1), pg_temp.uid(2)], 'unlimited')$$,
  'P0001', 'forbidden', 'admin_admit_waitlist refusé à un non-admin');
select throws_ok(
  $$select public.admin_set_report_status(gen_random_uuid(), 'actioned', true)$$,
  'P0001', 'forbidden', 'admin_set_report_status refusé à un non-admin');
select throws_ok(
  $$select public.diploma_queue_read(10, 30)$$,
  '42501', null, 'lecture de la file réservée au serveur');

select throws_ok(
  $$insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner')$$,
  '42501', null, 'impossible de se déclarer admin');
select throws_ok(
  $$insert into public.access_policy (min_level, tier, can_browse, copy_key) values (2, 'unlimited', true, 'x')$$,
  '42501', null, 'access_policy non modifiable par un membre (RLS)');
select results_eq(
  $$with u as (update public.access_policy set daily_like_quota = null where tier = 'standard' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$, 'update de access_policy sans effet pour un membre');

select throws_ok(
  $$update public.profile_photos set moderation_status = 'approved' where storage_path like '%/pending.jpg'$$,
  '42501', 'forbidden', 'modération de ses propres photos refusée');
select throws_ok(
  $$insert into public.swipes (swiper_id, target_id, direction) values (pg_temp.uid(1), pg_temp.uid(2), 'like')$$,
  '42501', null, 'insert direct dans swipes refusé');
select throws_ok(
  $$insert into public.matches (user_a, user_b) values (pg_temp.uid(1), pg_temp.uid(2))$$,
  '42501', null, 'insert direct dans matches refusé');

select results_eq(
  $$select tier::text, level from public.user_access where user_id = pg_temp.uid(1)$$,
  $$values ('standard'::text, 7)$$,
  'le palier et le niveau sont inchangés après toutes les tentatives');

-- Le membre en liste d'attente ne s'admet pas lui-même.
select pg_temp.login(pg_temp.uid(2));
select throws_ok(
  $$select public.admin_admit_waitlist(array[pg_temp.uid(2)], 'standard')$$,
  'P0001', 'forbidden', 'un membre en liste d''attente ne peut pas s''admettre');
select results_eq(
  $$select tier::text from public.user_access where user_id = pg_temp.uid(2)$$,
  $$values ('waitlist'::text)$$,
  'le palier waitlist est inchangé');

select * from finish();
rollback;

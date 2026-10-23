-- Conformité : le back-office exige la double authentification (session aal2).
-- Un admin connecté par email seulement (aal1) n'a aucun droit d'admin, ni par RPC, ni par la RLS,
-- ni sur les photos des autres membres ; il peut seulement savoir qu'il est un compte admin.
begin;
\ir _helpers.psql
select plan(16);

do $$
begin
  perform pg_temp.new_user(1);                                   -- admin, sans profil de membre
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');   -- membre
  perform pg_temp.new_member(3, 'standard', 'woman', '{man}');
  insert into public.reports (id, reporter_id, target_id, reason)
  values (pg_temp.uid(600), pg_temp.uid(3), pg_temp.uid(2), 'harassment');
  insert into storage.objects (bucket_id, name, owner_id)
  values ('photos', pg_temp.uid(2)::text || '/a.jpg', pg_temp.uid(2)::text);
  perform private.audit(pg_temp.uid(1), 'test.mfa', 'test', null, '{}'::jsonb);
end;
$$;

-- Admin en aal1 : compte reconnu, aucun droit.
select pg_temp.login(pg_temp.uid(1), 'aal1');
select is(public.is_admin(), false, 'admin aal1 : is_admin() = false');
select is(public.is_admin_account(), true, 'admin aal1 : is_admin_account() = true (aiguillage seulement)');
select throws_ok($$select public.admin_stats()$$, 'P0001', 'forbidden', 'admin aal1 : admin_stats refusé');
select throws_ok($$select * from public.admin_list_submissions()$$, 'P0001', 'forbidden', 'admin aal1 : file des diplômes refusée');
select throws_ok($$select public.admin_update_settings('{"feed_radius_km": 60}'::jsonb)$$, 'P0001', 'forbidden',
  'admin aal1 : réglages refusés');
select is((select count(*)::int from public.reports where id = pg_temp.uid(600)), 0, 'admin aal1 : la RLS cache les signalements');
select is((select count(*)::int from public.audit_log), 0, 'admin aal1 : la RLS cache le journal d''audit');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like pg_temp.uid(2)::text || '/%'), 0,
  'admin aal1 : photos d''un membre illisibles');

-- Absence de claim aal (ancien JWT) : traité comme aal1.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.uid(1), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select is(public.is_admin(), false, 'admin sans claim aal : is_admin() = false');

-- Admin en aal2 : droits complets.
select pg_temp.login(pg_temp.uid(1), 'aal2');
select is(public.is_admin(), true, 'admin aal2 : is_admin() = true');
select lives_ok($$select public.admin_stats()$$, 'admin aal2 : admin_stats autorisé');
select is((select count(*)::int from public.reports where id = pg_temp.uid(600)), 1, 'admin aal2 : signalements lisibles');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like pg_temp.uid(2)::text || '/%'), 1,
  'admin aal2 : photos lisibles par la règle d''admin');

-- Membre, même en aal2 : ni admin, ni compte admin.
select pg_temp.login(pg_temp.uid(2), 'aal2');
select is(public.is_admin(), false, 'membre aal2 : is_admin() = false');
select is(public.is_admin_account(), false, 'membre : is_admin_account() = false');

-- Anonyme : pas d'accès à la fonction d'aiguillage.
select pg_temp.login_anon();
select throws_ok($$select public.is_admin_account()$$, '42501', null, 'anon : is_admin_account non exécutable');

select * from finish();
rollback;

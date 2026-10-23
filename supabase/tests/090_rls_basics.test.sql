-- RLS de base : anon ne lit rien et ne peut que s'inscrire sur la liste d'attente ; un membre ne
-- lit pas le profile_private d'un autre ; tables de configuration en lecture seule.
begin;
\ir _helpers.psql
select plan(26);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(3, 'unlimited', 'woman', '{man}');
  insert into public.admins (user_id, role) values (pg_temp.uid(3), 'owner');
end;
$$;

-- anon -----------------------------------------------------------------------------------------
select pg_temp.login_anon();
select throws_ok($$select 1 from public.profiles limit 1$$, '42501', null, 'anon : profiles illisible');
select throws_ok($$select 1 from public.profile_private limit 1$$, '42501', null, 'anon : profile_private illisible');
select throws_ok($$select 1 from public.profile_photos limit 1$$, '42501', null, 'anon : profile_photos illisible');
select throws_ok($$select 1 from public.user_access limit 1$$, '42501', null, 'anon : user_access illisible');
select throws_ok($$select 1 from public.messages limit 1$$, '42501', null, 'anon : messages illisible');
select throws_ok($$select 1 from public.app_copy limit 1$$, '42501', null, 'anon : app_copy illisible');
select throws_ok($$select 1 from public.access_policy limit 1$$, '42501', null, 'anon : access_policy illisible');
select throws_ok($$select 1 from public.waitlist_signups limit 1$$, '42501', null, 'anon : waitlist_signups illisible');
select throws_ok($$select 1 from public.my_submissions limit 1$$, '42501', null, 'anon : my_submissions illisible');
select throws_ok($$select * from public.get_feed(10)$$, '42501', null, 'anon : get_feed non exécutable');
select throws_ok($$select public.is_admin()$$, '42501', null, 'anon : is_admin non exécutable');
select lives_ok($$insert into public.waitlist_signups (email, source) values ('Curieux@Example.com', 'landing')$$,
  'anon : inscription sur la liste d''attente');
select throws_ok($$insert into public.waitlist_signups (email, source) values ('curieux@example.com', 'landing')$$,
  '23505', null, 'anon : e-mail unique, insensible à la casse');
select throws_ok($$insert into public.waitlist_signups (email) values ('pas-un-email')$$,
  '23514', null, 'anon : e-mail invalide refusé');
select throws_ok($$insert into public.reports (reporter_id, target_id, reason) values (pg_temp.uid(1), pg_temp.uid(2), 'x')$$,
  '42501', null, 'anon : aucune autre insertion');
select is_empty($$select id from storage.objects where bucket_id = 'photos'$$, 'anon : aucune photo en storage');

-- membres -------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select results_eq($$select user_id from public.profile_private$$, $$values (pg_temp.uid(1))$$,
  'membre : lit uniquement sa ligne profile_private');
select is_empty($$select 1 from public.profile_private where user_id = pg_temp.uid(2)$$,
  'membre : profile_private d''un autre illisible');
select results_eq(
  $$with u as (update public.profile_private set consent_version = 'usurpation' where user_id = pg_temp.uid(2) returning 1)
    select count(*)::int from u$$,
  $$values (0)$$, 'membre : aucune écriture sur le profile_private d''un autre');
select results_eq(
  $$with u as (update public.profiles set bio = 'piraté' where id = pg_temp.uid(2) returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'membre : aucune écriture sur le profil d''un autre');
select ok(exists (select 1 from public.profiles where id = pg_temp.uid(2)), 'membre éligible : lit le profil public d''un éligible');
select is_empty($$select 1 from public.waitlist_signups$$, 'membre : liste d''attente illisible');
select ok((select count(*) from public.app_copy) > 0, 'membre : lit app_copy');
select is(public.is_admin(), false, 'membre : is_admin() = false');

-- admin -----------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3));
select is(public.is_admin(), true, 'admin : is_admin() = true');
select ok((select count(*) from public.profile_private where user_id in (pg_temp.uid(1), pg_temp.uid(2))) = 2,
  'admin : lit les profile_private');

select * from finish();
rollback;

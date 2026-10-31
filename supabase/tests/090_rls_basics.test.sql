-- RLS de base : anon ne lit ni n'écrit rien ; un membre ne lit que ses propres lignes de la plateforme
-- commune ; tables de configuration en lecture seule ; l'admin lit la liste d'attente conservée.
begin;
\ir _helpers.psql
select plan(19);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'standard');
  perform pg_temp.new_member(3, 'unlimited');
  insert into public.admins (user_id, role) values (pg_temp.uid(3), 'owner');
  insert into public.waitlist_signups (email, source) values ('ancienne@example.com', 'landing');
  insert into public.member_notices (user_id, kind, payload)
  values (pg_temp.uid(2), 'inactivity_warning', '{"delete_after": "2030-01-01"}');
end;
$$;

-- anon -----------------------------------------------------------------------------------------
select pg_temp.login_anon();
select throws_ok($$select 1 from public.user_access limit 1$$, '42501', null, 'anon : user_access illisible');
select throws_ok($$select 1 from public.candidate_identities limit 1$$, '42501', null, 'anon : candidate_identities illisible');
select throws_ok($$select 1 from public.app_copy limit 1$$, '42501', null, 'anon : app_copy illisible');
select throws_ok($$select 1 from public.access_policy limit 1$$, '42501', null, 'anon : access_policy illisible');
select throws_ok($$select 1 from public.waitlist_signups limit 1$$, '42501', null, 'anon : waitlist_signups illisible');
select throws_ok($$select 1 from public.my_submissions limit 1$$, '42501', null, 'anon : my_submissions illisible');
select throws_ok($$select public.is_admin()$$, '42501', null, 'anon : is_admin non exécutable');
select throws_ok($$insert into public.waitlist_signups (email, source) values ('curieux@example.com', 'landing')$$,
  '42501', null, 'anon : plus d''inscription sur la liste d''attente');
select is_empty($$select id from storage.objects where bucket_id = 'diplomas'$$, 'anon : aucun diplôme en storage');

-- membres -------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select is_empty($$select 1 from public.member_notices where user_id = pg_temp.uid(2)$$,
  'membre : avis d''un autre illisibles');
select throws_ok($$update public.member_notices set read_at = now() where user_id = pg_temp.uid(2)$$,
  '42501', null, 'membre : aucune écriture directe sur les avis (ack_notice seulement)');
select results_eq($$select user_id from public.user_access$$, $$values (pg_temp.uid(1))$$,
  'membre : lit uniquement son diplôme vérifié');
select throws_ok($$insert into public.waitlist_signups (email, source) values ('membre@example.com', 'app')$$,
  '42501', null, 'membre : plus d''inscription sur la liste d''attente');
select is_empty($$select 1 from public.waitlist_signups$$, 'membre : liste d''attente illisible');
select ok((select count(*) from public.app_copy) > 0, 'membre : lit app_copy');
select is(public.is_admin(), false, 'membre : is_admin() = false');

-- admin -----------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3));
select is(public.is_admin(), true, 'admin : is_admin() = true');
select results_eq($$select email::text from public.waitlist_signups$$, $$values ('ancienne@example.com'::text)$$,
  'admin : lit la liste d''attente conservée');
select lives_ok($$delete from public.waitlist_signups where email = 'ancienne@example.com'$$,
  'admin : peut supprimer une inscription de la liste d''attente');

select * from finish();
rollback;

-- Conformité : le back-office exige la double authentification (session aal2).
-- Un admin connecté par email seulement (aal1) n'a aucun droit d'admin, ni par RPC, ni par la RLS ;
-- il peut seulement savoir qu'il est un compte admin.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(15);

do $$
declare
  v_company uuid;
begin
  perform pg_temp.new_user(1);                                   -- admin, sans compte emploi
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2, 'standard');                     -- membre
  v_company := pg_temp.new_company(3, 'pending');                -- entreprise en attente de vérification
  perform private.audit(pg_temp.uid(1), 'test.mfa', 'test', null, '{}'::jsonb);
end;
$$;

-- Admin en aal1 : compte reconnu, aucun droit.
select pg_temp.login(pg_temp.uid(1), 'aal1');
select is(public.is_admin(), false, 'admin aal1 : is_admin() = false');
select is(public.is_admin_account(), true, 'admin aal1 : is_admin_account() = true (aiguillage seulement)');
select throws_ok($$select public.admin_emploi_stats()$$, 'P0001', 'forbidden', 'admin aal1 : statistiques refusées');
select throws_ok($$select * from public.admin_list_submissions()$$, 'P0001', 'forbidden', 'admin aal1 : file des diplômes refusée');
select throws_ok($$select public.admin_update_settings('{"offer_lifetime_days": 30}'::jsonb)$$, 'P0001', 'forbidden',
  'admin aal1 : réglages refusés');
select is((select count(*)::int from public.companies where display_name = 'Entreprise 3'), 0,
  'admin aal1 : la RLS cache les entreprises en attente');
select is((select count(*)::int from public.audit_log), 0, 'admin aal1 : la RLS cache le journal d''audit');

-- Absence de claim aal (ancien JWT) : traité comme aal1.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.uid(1), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select is(public.is_admin(), false, 'admin sans claim aal : is_admin() = false');

-- Admin en aal2 : droits complets.
select pg_temp.login(pg_temp.uid(1), 'aal2');
select is(public.is_admin(), true, 'admin aal2 : is_admin() = true');
select lives_ok($$select public.admin_emploi_stats()$$, 'admin aal2 : statistiques autorisées');
select is((select count(*)::int from public.companies where display_name = 'Entreprise 3'), 1,
  'admin aal2 : entreprises en attente lisibles');
select ok((select count(*)::int from public.audit_log) >= 1, 'admin aal2 : journal d''audit lisible');

-- Membre, même en aal2 : ni admin, ni compte admin.
select pg_temp.login(pg_temp.uid(2), 'aal2');
select is(public.is_admin(), false, 'membre aal2 : is_admin() = false');
select is(public.is_admin_account(), false, 'membre : is_admin_account() = false');

-- Anonyme : pas d'accès à la fonction d'aiguillage.
select pg_temp.login_anon();
select throws_ok($$select public.is_admin_account()$$, '42501', null, 'anon : is_admin_account non exécutable');

select * from finish();
rollback;

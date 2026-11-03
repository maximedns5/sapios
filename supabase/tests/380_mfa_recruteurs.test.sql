-- Double authentification facultative des recruteurs (20261103100000_mfa_recruteurs) : un recruteur qui a un
-- facteur TOTP vérifié doit être en session aal2 pour toute RPC recruteur et toute lecture directe de son
-- entreprise ; sans facteur (ou avec un facteur jamais validé), rien ne change ; les candidats ne sont pas concernés.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(30);

create function pg_temp.add_factor(p_uid uuid, p_status auth.factor_status default 'verified')
returns void
language sql
as $$
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), p_uid, 'Test ' || p_status, 'totp', p_status, now(), now());
$$;

do $$
declare
  v_company uuid := pg_temp.new_company(10);
  v_offer uuid := pg_temp.new_offer(v_company);
begin
  perform pg_temp.new_company(20);
  perform pg_temp.new_candidate(2);
  perform pg_temp.new_candidate(3);
  perform set_config('t.offer', v_offer::text, true);
end;
$$;

-- Préparation sans facteur : une candidature appariée (message, note) et une candidature à examiner.
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'candidat 2 postule');
select pg_temp.login(pg_temp.uid(3), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'candidat 3 postule');
select pg_temp.logout();
select set_config('t.app', (select a.id::text from public.applications a where a.candidate_id = pg_temp.uid(2)), true);

select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.mfa_session_ok(), true, 'sans facteur : la session aal1 suffit');
select lives_ok($$select public.decide_application(current_setting('t.app')::uuid, 'interested')$$, 'sans facteur : match en aal1');
select lives_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Bonjour')$$, 'sans facteur : message en aal1');

-- Le recruteur active la double authentification -------------------------------------------------------
select pg_temp.logout();
select pg_temp.add_factor(pg_temp.uid(10));

select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.mfa_session_ok(), false, 'facteur vérifié : la session aal1 ne suffit plus');
select throws_ok($$select public.get_my_company()$$, 'P0001', 'mfa_required', 'aal1 : get_my_company refusée');
select throws_ok($$select * from public.list_company_offers()$$, 'P0001', 'mfa_required', 'aal1 : offres refusées');
select throws_ok($$select public.get_recruiter_application(current_setting('t.app')::uuid)$$, 'P0001', 'mfa_required',
  'aal1 : candidature refusée');
select throws_ok($$select * from public.get_offer_pile(current_setting('t.offer')::uuid)$$, 'P0001', 'mfa_required',
  'aal1 : pile refusée');
select throws_ok($$select * from public.get_application_messages(current_setting('t.app')::uuid)$$, 'P0001', 'mfa_required',
  'aal1 : messages refusés');
select throws_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Encore')$$, 'P0001', 'mfa_required',
  'aal1 : envoi refusé');
select throws_ok($$select * from public.get_my_conversations()$$, 'P0001', 'mfa_required', 'aal1 : conversations refusées');
select throws_ok($$select public.export_my_emploi_data()$$, 'P0001', 'mfa_required', 'aal1 : export refusé');
select throws_ok($$select private.member_company(pg_temp.uid(10))$$, 'P0001', 'mfa_required',
  'aal1 : dépôt de photos (Storage) refusé');
select is(private.is_company_member((select company_id from public.company_members where user_id = pg_temp.uid(10))), false,
  'aal1 : règles d''accès des membres fermées');
select is((select count(*)::int from public.applications), 0, 'aal1 : aucune candidature lisible directement');
select is((select count(*)::int from public.company_members), 0, 'aal1 : membres illisibles');
select is((select count(*)::int from public.interview_slots), 0, 'aal1 : créneaux illisibles');
select isnt(public.get_emploi_state() -> 'recruiter' ->> 'company_name', null, 'aal1 : l''état garde l''entreprise (aiguillage)');
select is((public.get_emploi_state() -> 'counts' ->> 'applications_open')::int, 0, 'aal1 : pas de compteurs');

select pg_temp.login(pg_temp.uid(10), 'aal2');
select is(public.mfa_session_ok(), true, 'aal2 : session suffisante');
select lives_ok($$select public.get_my_company()$$, 'aal2 : get_my_company');
select is((select count(*)::int from public.get_application_messages(current_setting('t.app')::uuid)), 1, 'aal2 : messages lus');
select ok((select count(*)::int from public.applications) >= 2, 'aal2 : candidatures lisibles');
select is((public.get_emploi_state() -> 'counts' ->> 'applications_open')::int, 1, 'aal2 : compteurs');
select lives_ok($$select public.export_my_emploi_data()$$, 'aal2 : export');

-- Un facteur jamais validé ne compte pas.
select pg_temp.logout();
select pg_temp.add_factor(pg_temp.uid(20), 'unverified');
select pg_temp.login(pg_temp.uid(20), 'aal1');
select lives_ok($$select public.get_my_company()$$, 'facteur non validé : aal1 suffit');

-- Candidats : jamais concernés, même avec un facteur.
select pg_temp.logout();
select pg_temp.add_factor(pg_temp.uid(2));
select pg_temp.login(pg_temp.uid(2), 'aal1');
select is((select count(*)::int from public.get_application_messages(current_setting('t.app')::uuid)), 1,
  'candidat avec facteur : messagerie en aal1');
select lives_ok($$select public.export_my_emploi_data()$$, 'candidat avec facteur : export en aal1');

select * from finish();
rollback;

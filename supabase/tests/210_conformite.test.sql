-- Conformité : acceptation des CGU (emploi), comptes inactifs (activité sans profils), purge des
-- signalements d'offres traités, du journal d'audit et des avis, réglages de conservation.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(33);

-- Admin connecté avec la double authentification (aal2).
create function pg_temp.login_admin(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aud', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

do $$
begin
  perform pg_temp.new_user(1);                 -- CGU
  insert into public.emploi_accounts (user_id, kind) values (pg_temp.uid(1), 'candidate');
  perform pg_temp.new_member(2, 'standard');   -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(2), 'owner');
  perform pg_temp.new_member(3, 'standard');   -- inactif
  perform pg_temp.new_member(4, 'standard');   -- membre ordinaire
  perform pg_temp.new_member(9, 'standard');   -- inactif, mais revient
end;
$$;

-- 1. CGU ------------------------------------------------------------------------------------------
select has_table('public', 'terms_acceptances', 'table des acceptations des CGU');
select private.emploi_terms_version('candidate') as cgu \gset

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select public.get_emploi_state() -> 'terms' ->> 'required_version', public.get_emploi_state() -> 'terms' ->> 'accepted'$$,
  format($$values (%L::text, 'false'::text)$$, :'cgu'), 'CGU : version en vigueur, pas encore acceptées');
select throws_ok($$select public.accept_emploi_terms('2025-01')$$, 'P0001', 'terms_version_mismatch',
  'acceptation d''une autre version refusée');
select lives_ok(format($$select public.accept_emploi_terms(%L)$$, :'cgu'), 'CGU acceptées');
select lives_ok(format($$select public.accept_emploi_terms(%L)$$, :'cgu'), 'acceptation idempotente');
select is(public.get_emploi_state() -> 'terms' ->> 'accepted', 'true', 'CGU acceptées dans get_emploi_state');
select throws_ok(
  format($$insert into public.terms_acceptances (user_id, version) values (%L, 'x')$$, pg_temp.uid(1)),
  '42501', null, 'écriture directe dans terms_acceptances refusée');
select is((select count(*)::int from public.terms_acceptances), 1, 'le membre ne lit que ses propres acceptations');
select is(jsonb_array_length(public.export_my_emploi_data() -> 'terms_acceptances'), 1, 'export : acceptations incluses');

select pg_temp.login_anon();
select throws_ok($$select public.accept_emploi_terms('x')$$, '42501', null, 'anon : aucune acceptation');
select pg_temp.logout();

delete from auth.users where id = pg_temp.uid(1);
select is((select count(*)::int from public.terms_acceptances where user_id = pg_temp.uid(1)), 0,
  'acceptations supprimées avec le compte');

-- 2. Réglages de conservation --------------------------------------------------------------------
select pg_temp.login_admin(pg_temp.uid(2));
select lives_ok($$select public.admin_update_settings('{"inactive_warning_days": 365, "notice_retention_days": 90}')$$,
  'réglages de conservation enregistrés');
select throws_ok($$select public.admin_update_settings('{"inactive_grace_days": 2}')$$, 'P0001', 'invalid_value',
  'délai de grâce hors bornes refusé');
select throws_ok($$select public.admin_update_settings('{"banned_identity_retention_days": 365}')$$, 'P0001',
  'unknown_setting', 'empreintes de bannis : réglage supprimé');
select pg_temp.logout();
select is((select (value #>> '{}')::int from public.app_settings where key = 'inactive_warning_days'), 365,
  'durée enregistrée');
update public.app_settings set value = '730' where key = 'inactive_warning_days';

-- 3. Comptes inactifs ----------------------------------------------------------------------------
update auth.users set last_sign_in_at = now() - interval '3 years', created_at = now() - interval '4 years'
 where id in (pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(9));
select lives_ok($$select private.warn_inactive_accounts()$$, 'avertissement des comptes inactifs');
select is((select count(*)::int from private.inactivity_warnings where user_id in (pg_temp.uid(3), pg_temp.uid(9))), 2,
  'deux comptes inactifs avertis');
select ok(not exists (select 1 from private.inactivity_warnings where user_id = pg_temp.uid(2)),
  'un admin n''est jamais averti');
select is((select kind from public.member_notices where user_id = pg_temp.uid(3) order by created_at desc limit 1),
  'inactivity_warning', 'avis d''inactivité dans l''app');

select pg_temp.login(pg_temp.uid(9));
select lives_ok($$select public.get_emploi_state()$$, 'le membre averti revient');
select pg_temp.logout();
select ok(not exists (select 1 from private.inactivity_warnings where user_id = pg_temp.uid(9)),
  'toute activité efface l''avertissement');

update private.inactivity_warnings set warned_at = now() - interval '40 days', delete_after = now() - interval '10 days'
 where user_id = pg_temp.uid(3);
select pg_temp.login(pg_temp.uid(4));
select throws_ok($$select * from public.inactive_accounts_to_purge()$$, '42501', null,
  'comptes à supprimer : liste réservée au serveur');
select pg_temp.login_service();
select results_eq($$select user_id from public.inactive_accounts_to_purge()$$, $$values (pg_temp.uid(3))$$,
  'compte averti depuis plus du délai de grâce : à supprimer');
select ok(public.inactive_purge_eligible(pg_temp.uid(3)), 'revérifié juste avant la suppression');
select pg_temp.logout();
insert into private.account_activity (user_id, last_active_at) values (pg_temp.uid(3), now())
on conflict (user_id) do update set last_active_at = now();
select pg_temp.login_service();
select ok(not public.inactive_purge_eligible(pg_temp.uid(3)), 'activité après l''avertissement : plus supprimable');
select pg_temp.logout();

select ok(exists (select 1 from cron.job where jobname = 'retention-daily'), 'tâche quotidienne de conservation');
select ok(exists (select 1 from cron.job where jobname = 'purge-inactive'), 'tâche de suppression des comptes inactifs');

-- 4. Signalements d'offres traités ----------------------------------------------------------------
do $$
declare
  v_offer uuid := pg_temp.new_offer(pg_temp.new_company(20));
begin
  insert into public.offer_reports (id, offer_id, reporter_id, reason, status, handled_at, created_at)
  values (pg_temp.uid(700), v_offer, pg_temp.uid(4), 'fake', 'dismissed', now() - interval '400 days', now() - interval '401 days'),
         (pg_temp.uid(701), v_offer, pg_temp.uid(4), 'fake', 'open', null, now() - interval '500 days');
end;
$$;

-- 5. Journal d'audit et avis ----------------------------------------------------------------------
insert into public.audit_log (action, entity, created_at)
values ('test.old', 'test', now() - interval '6 years'), ('test.recent', 'test', now());
select throws_ok($$delete from public.audit_log where action = 'test.old'$$, '42501', 'audit_log_append_only',
  'journal : suppression directe refusée, même ancienne');
select throws_ok($$update public.audit_log set action = 'x' where action = 'test.old'$$, '42501', 'audit_log_append_only',
  'journal : modification toujours refusée');

insert into public.member_notices (user_id, kind, payload, read_at, created_at)
values (pg_temp.uid(4), 'inactivity_warning', '{}', now() - interval '400 days', now() - interval '401 days'),
       (pg_temp.uid(4), 'inactivity_warning', '{}', null, now() - interval '500 days');
select lives_ok($$select private.run_retention()$$, 'tâche quotidienne de conservation');
select results_eq(
  $$select count(*) filter (where action = 'test.old')::int, count(*) filter (where action = 'test.recent')::int
      from public.audit_log$$,
  $$values (0, 1)$$, 'purge serveur du journal : seules les entrées expirées partent');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(4) and kind = 'inactivity_warning'), 1,
  'avis lus purgés, avis non lus gardés');
select results_eq($$select id from public.offer_reports where id in (pg_temp.uid(700), pg_temp.uid(701))$$,
  $$values (pg_temp.uid(701))$$, 'signalement d''offre traité purgé, signalement ouvert gardé');

select * from finish();
rollback;

-- Conformité : acceptation des CGU, comptes inactifs, signalements pseudonymisés, identités exclues,
-- purges du journal d'audit et des avis, réglages de conservation.
begin;
\ir _helpers.psql
select plan(50);

-- Admin connecté avec la double authentification (aal2) : ces tests restent valables si
-- require_admin exige un jour aal2.
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
  perform pg_temp.new_member(2, 'standard');   -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(2), 'owner');
  perform pg_temp.new_member(3, 'standard');   -- inactif
  perform pg_temp.new_member(4, 'standard');   -- auteur d'un signalement
  perform pg_temp.new_member(5, 'standard');   -- signalé, puis supprimé
  perform pg_temp.new_member(6, 'standard');   -- banni, puis supprimé
  perform pg_temp.new_member(9, 'standard');   -- inactif, mais revient
  perform pg_temp.new_member(10, 'standard');  -- banni supprimé sans poivre
  perform pg_temp.new_member(11, 'standard');  -- banni et inactif
  update public.profiles set status = 'banned' where id = pg_temp.uid(11);
  insert into public.terms_acceptances (user_id, version) values (pg_temp.uid(4), '2026-10-brouillon');
end;
$$;

-- 1. CGU ------------------------------------------------------------------------------------------
select has_table('public', 'terms_acceptances', 'table des acceptations des CGU');

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select public.get_my_state() -> 'terms' ->> 'current_version', public.get_my_state() -> 'terms' ->> 'accepted'$$,
  $$values ('2026-10-brouillon'::text, 'false'::text)$$, 'CGU : version en vigueur, pas encore acceptées');
select throws_ok($$select public.accept_terms('2025-01')$$, 'P0001', 'terms_version_mismatch',
  'acceptation d''une autre version refusée');
select lives_ok($$select public.accept_terms('2026-10-brouillon')$$, 'CGU acceptées');
select lives_ok($$select public.accept_terms('2026-10-brouillon')$$, 'acceptation idempotente');
select is(public.get_my_state() -> 'terms' ->> 'accepted', 'true', 'CGU acceptées dans get_my_state');
select throws_ok(
  format($$insert into public.terms_acceptances (user_id, version) values (%L, 'x')$$, pg_temp.uid(1)),
  '42501', null, 'écriture directe dans terms_acceptances refusée');
select is((select count(*)::int from public.terms_acceptances), 1, 'le membre ne lit que ses propres acceptations');
select is(jsonb_array_length(public.export_my_data() -> 'terms_acceptances'), 1, 'export : acceptations incluses');

select pg_temp.logout();
update public.app_settings set value = to_jsonb('2026-11'::text) where key = 'terms_version';
select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select public.get_my_state() -> 'terms' ->> 'accepted', public.get_my_state() -> 'terms' ->> 'last_accepted_version'$$,
  $$values ('false'::text, '2026-10-brouillon'::text)$$, 'nouvelle version : acceptation redemandée');
select pg_temp.logout();
update public.app_settings set value = to_jsonb('2026-10-brouillon'::text) where key = 'terms_version';

select pg_temp.login_anon();
select throws_ok($$select public.accept_terms('2026-10-brouillon')$$, '42501', null, 'anon : aucune acceptation');
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
select throws_ok($$select public.admin_update_settings('{"terms_version": "x"}')$$, 'P0001', 'invalid_value',
  'version des CGU invalide refusée');
select lives_ok($$select public.admin_update_settings('{"terms_version": "2026-10-brouillon"}')$$,
  'version des CGU réglable');
select pg_temp.logout();
select is((select (value #>> '{}')::int from public.app_settings where key = 'inactive_warning_days'), 365,
  'durée enregistrée');
update public.app_settings set value = '730' where key = 'inactive_warning_days';

-- 3. Comptes inactifs ----------------------------------------------------------------------------
update public.profiles set last_active_at = now() - interval '3 years'
 where id in (pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(9), pg_temp.uid(11));
update auth.users set last_sign_in_at = now() - interval '3 years', created_at = now() - interval '4 years'
 where id in (pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(9), pg_temp.uid(11));
select lives_ok($$select private.warn_inactive_accounts()$$, 'avertissement des comptes inactifs');
select is((select count(*)::int from private.inactivity_warnings where user_id in (pg_temp.uid(3), pg_temp.uid(9))), 2,
  'deux comptes inactifs avertis');
select ok(not exists (select 1 from private.inactivity_warnings where user_id = pg_temp.uid(2)),
  'un admin n''est jamais averti');
select is((select kind from public.member_notices where user_id = pg_temp.uid(3) order by created_at desc limit 1),
  'inactivity_warning', 'avis d''inactivité dans l''app');
select ok(exists (select 1 from private.inactivity_warnings where user_id = pg_temp.uid(11)),
  'compte banni inactif : supprimé au même terme');
select ok(not exists (select 1 from public.member_notices where user_id = pg_temp.uid(11) and kind = 'inactivity_warning'),
  'compte banni : ni avis ni email d''inactivité');

select pg_temp.login(pg_temp.uid(9));
select lives_ok($$select public.get_my_state()$$, 'le membre averti revient');
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
update public.profiles set last_active_at = now() where id = pg_temp.uid(3);
select pg_temp.login_service();
select ok(not public.inactive_purge_eligible(pg_temp.uid(3)), 'activité après l''avertissement : plus supprimable');
select pg_temp.logout();

select ok(exists (select 1 from cron.job where jobname = 'retention-daily'), 'tâche quotidienne de conservation');
select ok(exists (select 1 from cron.job where jobname = 'purge-inactive'), 'tâche de suppression des comptes inactifs');

-- 4. Signalements pseudonymisés -------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(4));
select lives_ok(format($$select public.report_user(%L, 'Harcèlement ou menaces', 'Messages insistants.')$$, pg_temp.uid(5)),
  'signalement');
select pg_temp.logout();
select ok((select target_pseudonym is not null and reporter_pseudonym is not null
             from public.reports where target_id = pg_temp.uid(5)), 'pseudonymes posés à l''insertion');
select id as rep_id, target_pseudonym as rep_ps from public.reports where target_id = pg_temp.uid(5) \gset

delete from auth.users where id = pg_temp.uid(5);
select results_eq(
  format($$select target_id is null, target_deleted_at is not null, target_pseudonym = %L from public.reports where id = %L$$,
         :'rep_ps', :'rep_id'),
  $$values (true, true, true)$$, 'signalement conservé, pseudonymisé, après la suppression du compte visé');

select pg_temp.login_admin(pg_temp.uid(2));
select results_eq(
  format($$select (public.admin_get_report_context(%L) -> 'reports_against' ->> 'total')::int,
                  public.admin_get_report_context(%L) -> 'target' = 'null'::jsonb$$, :'rep_id', :'rep_id'),
  $$values (1, true)$$, 'contexte d''un signalement dont la cible est supprimée');
select pg_temp.logout();

update public.reports set target_deleted_at = now() - interval '400 days' where id = :'rep_id';
select lives_ok($$select private.run_retention()$$, 'tâche quotidienne de conservation');
select is((select count(*)::int from public.reports where id = :'rep_id'), 0,
  'signalement purgé après la durée de conservation');

-- 5. Identités exclues ---------------------------------------------------------------------------
update public.profiles set status = 'banned' where id = pg_temp.uid(10);
delete from auth.users where id = pg_temp.uid(10);
select is((select count(*)::int from private.banned_identities), 0, 'sans poivre dans Vault : aucune empreinte');

do $$ begin perform vault.create_secret('poivre-de-test-pgtap', 'identity_pepper'); end $$;
select birthdate as b6 from public.profile_private where user_id = pg_temp.uid(6) \gset
update public.profiles set status = 'banned' where id = pg_temp.uid(6);
delete from auth.users where id = pg_temp.uid(6);
select is((select count(*)::int from private.banned_identities), 2,
  'empreintes de l''email et de l''identité du compte banni supprimé');
select ok(not exists (select 1 from private.banned_identities where hash ilike '%pgtap%' or hash ilike '%membre%'),
  'empreintes seulement, jamais l''email ni le nom en clair');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', pg_temp.uid(7), 'authenticated', 'authenticated',
        ' PGTAP-6@Sapios.test', '', now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now());
select is((select status::text from public.profiles where id = pg_temp.uid(7)), 'banned',
  'même email : compte banni dès sa création');

do $$ begin perform pg_temp.new_user(8); end $$;
select pg_temp.login(pg_temp.uid(8));
select lives_ok(format($$select public.set_identity('MEMBRE  test 6', %L::date)$$, :'b6'),
  'identité saisie par une personne exclue');
select pg_temp.logout();
select results_eq(
  $$select p.status::text, pp.legal_name from public.profiles p join public.profile_private pp on pp.user_id = p.id
     where p.id = pg_temp.uid(8)$$,
  $$values ('banned'::text, null::text)$$, 'même identité : compte banni, identité non enregistrée');

update private.banned_identities set created_at = now() - interval '4 years';
select lives_ok($$select private.run_retention()$$, 'tâche quotidienne de conservation');
select is((select count(*)::int from private.banned_identities), 0, 'empreintes purgées après la durée de conservation');

-- 6. Journal d'audit et avis ----------------------------------------------------------------------
insert into public.audit_log (action, entity, created_at)
values ('test.old', 'test', now() - interval '6 years'), ('test.recent', 'test', now());
select throws_ok($$delete from public.audit_log where action = 'test.old'$$, '42501', 'audit_log_append_only',
  'journal : suppression directe refusée, même ancienne');
select throws_ok($$update public.audit_log set action = 'x' where action = 'test.old'$$, '42501', 'audit_log_append_only',
  'journal : modification toujours refusée');

insert into public.member_notices (user_id, kind, payload, read_at, created_at)
values (pg_temp.uid(4), 'content_removed', '{}', now() - interval '400 days', now() - interval '401 days'),
       (pg_temp.uid(4), 'content_removed', '{}', null, now() - interval '500 days');
select lives_ok($$select private.run_retention()$$, 'tâche quotidienne de conservation');
select results_eq(
  $$select count(*) filter (where action = 'test.old')::int, count(*) filter (where action = 'test.recent')::int
      from public.audit_log$$,
  $$values (0, 1)$$, 'purge serveur du journal : seules les entrées expirées partent');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(4) and kind = 'content_removed'), 1,
  'avis lus purgés, avis non lus gardés');

select * from finish();
rollback;

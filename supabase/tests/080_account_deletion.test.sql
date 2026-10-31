-- §10 test 8 : la suppression du compte (auth.users, comme le fait delete-account via l'API
-- admin) efface identité, soumissions, diplôme vérifié, avis, activité, acceptations des CGU et
-- jetons push ; audit_log est conservé.
begin;
\ir _helpers.psql
select plan(11);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'standard');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, level_verified, reviewer_id, reviewed_at)
  values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/d.pdf', 'application/pdf', 'approved', 7, pg_temp.uid(2), now());
  insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[test-1]', pg_temp.uid(1), 'ios');
  insert into public.member_notices (user_id, kind, payload)
  values (pg_temp.uid(1), 'inactivity_warning', '{"delete_after": "2030-01-01"}');
  insert into public.terms_acceptances (user_id, version) values (pg_temp.uid(1), 'cgu-test');
  perform private.touch_activity(pg_temp.uid(1));
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (pg_temp.uid(2), 'diploma.approve', 'degree_submissions', pg_temp.uid(901)::text,
          jsonb_build_object('user_id', pg_temp.uid(1)));
end;
$$;

-- Le membre se voit lui-même avant suppression (accès client réel).
select pg_temp.login(pg_temp.uid(1));
select results_eq($$select count(*)::int from public.push_tokens$$, $$values (1)$$, 'avant : jeton push visible');

-- Suppression du compte d'authentification (rôle serveur).
select pg_temp.logout();
delete from auth.users where id = pg_temp.uid(1);

select is((select count(*)::int from public.candidate_identities where user_id = pg_temp.uid(1)), 0, 'identité effacée');
select is((select count(*)::int from public.emploi_accounts where user_id = pg_temp.uid(1)), 0, 'compte emploi effacé');
select is((select count(*)::int from public.degree_submissions where user_id = pg_temp.uid(1)), 0, 'soumissions effacées');
select is((select count(*)::int from public.user_access where user_id = pg_temp.uid(1)), 0, 'diplôme vérifié effacé');
select is((select count(*)::int from public.push_tokens where user_id = pg_temp.uid(1)), 0, 'jetons push effacés');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(1)), 0, 'avis effacés');
select is((select count(*)::int from public.terms_acceptances where user_id = pg_temp.uid(1)), 0, 'acceptations des CGU effacées');
select is((select count(*)::int from private.account_activity where user_id = pg_temp.uid(1)), 0, 'activité effacée');
select is((select count(*)::int from public.audit_log where entity_id = pg_temp.uid(901)::text), 1, 'audit_log conservé');
select is((select count(*)::int from public.candidate_identities where user_id = pg_temp.uid(2)), 1, 'l''autre compte est intact');

select * from finish();
rollback;

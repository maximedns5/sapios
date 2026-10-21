-- §10 test 8 : la suppression du compte (auth.users, comme le fait delete-account via l'API
-- admin) efface profil, données privées, photos, soumissions, palier, swipes, matches,
-- messages, blocages, signalements et jetons push ; audit_log est conservé.
begin;
\ir _helpers.psql
select plan(15);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, level_verified, reviewer_id, reviewed_at)
  values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/d.pdf', 'application/pdf', 'approved', 7, pg_temp.uid(2), now());
  insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[test-1]', pg_temp.uid(1), 'ios');
  insert into public.swipes (swiper_id, target_id, direction)
  values (pg_temp.uid(1), pg_temp.uid(2), 'like'), (pg_temp.uid(2), pg_temp.uid(1), 'like');
  insert into public.matches (id, user_a, user_b)
  values (pg_temp.uid(500), least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2)));
  insert into public.messages (match_id, sender_id, body) values (pg_temp.uid(500), pg_temp.uid(1), 'Bonjour');
  insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(1), pg_temp.uid(2));
  insert into public.reports (reporter_id, target_id, reason) values (pg_temp.uid(1), pg_temp.uid(2), 'spam');
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (pg_temp.uid(2), 'diploma.approve', 'degree_submissions', pg_temp.uid(901)::text,
          jsonb_build_object('user_id', pg_temp.uid(1)));
end;
$$;

-- Le membre se voit lui-même avant suppression (accès client réel).
select pg_temp.login(pg_temp.uid(1));
select results_eq($$select count(*)::int from public.push_tokens$$, $$values (1)$$, 'avant : jeton push visible');
select results_eq($$select count(*)::int from public.profile_photos where user_id = pg_temp.uid(1)$$, $$values (2)$$,
  'avant : photos visibles');

-- Suppression du compte d'authentification (rôle serveur).
select pg_temp.logout();
delete from auth.users where id = pg_temp.uid(1);

select is((select count(*)::int from public.profiles where id = pg_temp.uid(1)), 0, 'profil effacé');
select is((select count(*)::int from public.profile_private where user_id = pg_temp.uid(1)), 0, 'données privées effacées');
select is((select count(*)::int from public.profile_photos where user_id = pg_temp.uid(1)), 0, 'photos (lignes) effacées');
select is((select count(*)::int from public.degree_submissions where user_id = pg_temp.uid(1)), 0, 'soumissions effacées');
select is((select count(*)::int from public.user_access where user_id = pg_temp.uid(1)), 0, 'palier effacé');
select is((select count(*)::int from public.push_tokens where user_id = pg_temp.uid(1)), 0, 'jetons push effacés');
select is((select count(*)::int from public.swipes where pg_temp.uid(1) in (swiper_id, target_id)), 0, 'swipes effacés');
select is((select count(*)::int from public.matches where id = pg_temp.uid(500)), 0, 'match effacé');
select is((select count(*)::int from public.messages where match_id = pg_temp.uid(500)), 0, 'messages effacés');
select is((select count(*)::int from public.blocks where blocker_id = pg_temp.uid(1)), 0, 'blocages effacés');
select is((select count(*)::int from public.reports where reporter_id = pg_temp.uid(1)), 0, 'signalements effacés');
select is((select count(*)::int from public.audit_log where entity_id = pg_temp.uid(901)::text), 1, 'audit_log conservé');
select is((select count(*)::int from public.profiles where id = pg_temp.uid(2)), 1, 'l''autre membre est intact');

select * from finish();
rollback;

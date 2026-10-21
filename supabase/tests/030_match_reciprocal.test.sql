-- §10 test 3 : un match n'existe que si les deux personnes se sont likées ; les likes répétés
-- sont idempotents et ne créent jamais un second match. La concurrence réelle est testée dans
-- 031_match_concurrency.test.sql.
begin;
\ir _helpers.psql
select plan(15);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(3, 'unlimited', 'man', '{woman}');
end;
$$;

-- A like B : pas de match.
select pg_temp.login(pg_temp.uid(1));
select is(public.swipe(pg_temp.uid(2), 'like'), '{"matched": false, "match_id": null}'::jsonb,
  'like non réciproque : pas de match');
select is(public.swipe(pg_temp.uid(2), 'like'), '{"matched": false, "match_id": null}'::jsonb,
  'like répété : toujours pas de match');
select is((public.get_my_state() ->> 'likes_left_today')::int, 19, 'le like répété ne consomme pas de quota');
select is_empty($$select * from public.matches$$, 'aucun match visible pour A');

-- B passe sur A : pas de match.
select pg_temp.login(pg_temp.uid(2));
select is(public.swipe(pg_temp.uid(1), 'pass'), '{"matched": false, "match_id": null}'::jsonb,
  'pass : pas de match');
-- B revient sur sa décision (pass -> like) : match.
select is((public.swipe(pg_temp.uid(1), 'like') ->> 'matched')::boolean, true, 'like réciproque : match');
select is((select count(*)::int from public.matches), 1, 'B voit un match');
select is(
  (public.swipe(pg_temp.uid(1), 'like') ->> 'match_id')::uuid,
  (select id from public.matches),
  'like répété de B : même match_id');

select pg_temp.login(pg_temp.uid(1));
select is(
  (public.swipe(pg_temp.uid(2), 'like') ->> 'match_id')::uuid,
  (select id from public.matches),
  'like répété de A : même match_id');
select results_eq(
  $$select user_a, user_b from public.matches$$,
  $$values (least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2)))$$,
  'match ordonné user_a < user_b');

-- A like C sans retour : pas de match ; C ne voit aucun match.
select is((public.swipe(pg_temp.uid(3), 'like') ->> 'matched')::boolean, false, 'like vers C sans retour');
select pg_temp.login(pg_temp.uid(3));
select is_empty($$select * from public.matches$$, 'C ne voit aucun match');
select is_empty($$select * from public.swipes$$, 'C ne voit pas les swipes des autres');

-- Garde-fous au niveau des contraintes (données préparées en postgres).
select pg_temp.logout();
select throws_ok(
  format('insert into public.matches (user_a, user_b) values (%L, %L)',
         least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2))),
  '23505', null, 'contrainte unique : un seul match par paire');
select throws_ok(
  format('insert into public.matches (user_a, user_b) values (%L, %L)',
         greatest(pg_temp.uid(1), pg_temp.uid(2)), least(pg_temp.uid(1), pg_temp.uid(2))),
  '23514', null, 'contrainte user_a < user_b');

select * from finish();
rollback;

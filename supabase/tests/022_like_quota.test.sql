-- Quota quotidien de likes (palier standard), calculé sur les swipes du jour à Paris.
begin;
\ir _helpers.psql
select plan(8);

do $$
declare
  i int;
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'unlimited', 'woman', '{man}');
  for i in 10..13 loop
    perform pg_temp.new_member(i, 'standard', 'man', '{woman}');
  end loop;
  -- Quota réduit à 2 pour le test ; un like d'avant-hier ne compte pas.
  update public.access_policy set daily_like_quota = 2 where tier = 'standard';
  insert into public.swipes (swiper_id, target_id, direction, created_at)
  values (pg_temp.uid(1), pg_temp.uid(13), 'like', now() - interval '2 days');
end;
$$;

select pg_temp.login(pg_temp.uid(1));
select is((public.get_my_state() ->> 'likes_left_today')::int, 2, 'deux likes disponibles aujourd''hui');
select lives_ok($$select public.swipe(pg_temp.uid(10), 'like')$$, 'premier like');
select lives_ok($$select public.swipe(pg_temp.uid(11), 'like')$$, 'deuxième like');
select throws_ok($$select public.swipe(pg_temp.uid(12), 'like')$$, 'P0001', 'quota_exceeded',
  'quota standard atteint : quota_exceeded');
select lives_ok($$select public.swipe(pg_temp.uid(12), 'pass')$$, 'un pass ne consomme pas de quota');
select lives_ok($$select public.swipe(pg_temp.uid(10), 'like')$$, 'rejouer un like déjà compté reste possible (idempotent)');
select is((public.get_my_state() ->> 'likes_left_today')::int, 0, 'get_my_state : plus aucun like');

-- Palier unlimited : quota null, pas de limite.
select pg_temp.login(pg_temp.uid(2));
select is(public.get_my_state() -> 'likes_left_today', 'null'::jsonb, 'unlimited : likes_left_today = null');

select * from finish();
rollback;

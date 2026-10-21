-- §10 test 2 : les paliers waitlist et refused (et l'absence de verdict) obtiennent un feed vide
-- et swipe les rejette ; ils ne lisent pas non plus les profils des autres.
begin;
\ir _helpers.psql
select plan(16);

-- Hommes cherchant des femmes ; candidates compatibles et éligibles.
do $$
begin
  perform pg_temp.new_member(1, 'waitlist', 'man', '{woman}');
  perform pg_temp.new_member(2, 'refused', 'man', '{woman}');
  perform pg_temp.new_member(3, null, 'man', '{woman}');       -- pas encore de verdict
  perform pg_temp.new_member(4, 'standard', 'man', '{woman}'); -- témoin
  perform pg_temp.new_member(10, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(11, 'unlimited', 'woman', '{man}');
  -- Copy du palier « Désinstallez. » : même palier refused, autre texte.
  update public.user_access set level = 3, copy_key = 'verdict.uninstall' where user_id = pg_temp.uid(2);
end;
$$;

-- Témoin : un standard voit les deux candidates et peut swiper.
select pg_temp.login(pg_temp.uid(4));
select results_eq(
  $$select id from public.get_feed(50) order by id$$,
  $$values (pg_temp.uid(10)), (pg_temp.uid(11))$$,
  'témoin standard : feed avec les deux candidates');
select lives_ok($$select public.swipe(pg_temp.uid(10), 'pass')$$, 'témoin standard : swipe accepté');

select pg_temp.login(pg_temp.uid(1));
select is_empty($$select * from public.get_feed(50)$$, 'waitlist : feed vide');
select throws_ok($$select public.swipe(pg_temp.uid(10), 'like')$$, 'P0001', 'not_eligible', 'waitlist : like rejeté');
select throws_ok($$select public.swipe(pg_temp.uid(10), 'pass')$$, 'P0001', 'not_eligible', 'waitlist : pass rejeté');
select is((select count(*)::int from public.profiles where id <> pg_temp.uid(1)), 0,
  'waitlist : aucun autre profil lisible');
select is((public.get_my_state() ->> 'can_browse')::boolean, false, 'waitlist : get_my_state.can_browse = false');

select pg_temp.login(pg_temp.uid(2));
select is_empty($$select * from public.get_feed(50)$$, 'refused : feed vide');
select throws_ok($$select public.swipe(pg_temp.uid(11), 'like')$$, 'P0001', 'not_eligible', 'refused : like rejeté');
select is((select count(*)::int from public.profile_photos where user_id <> pg_temp.uid(2)), 0,
  'refused : aucune photo d''autrui lisible');
select is(public.get_my_state() ->> 'copy_key', 'verdict.uninstall', 'refused niveau 3 : texte « Désinstallez. »');

select pg_temp.login(pg_temp.uid(3));
select is_empty($$select * from public.get_feed(50)$$, 'sans verdict : feed vide');
select throws_ok($$select public.swipe(pg_temp.uid(11), 'like')$$, 'P0001', 'not_eligible', 'sans verdict : swipe rejeté');

-- Les candidates ne voient pas non plus les membres non éligibles.
select pg_temp.login(pg_temp.uid(10));
select results_eq(
  $$select id from public.get_feed(50) order by id$$,
  $$values (pg_temp.uid(4))$$,
  'les membres waitlist/refused/sans verdict n''apparaissent dans aucun feed');
select throws_ok($$select public.swipe(pg_temp.uid(1), 'like')$$, 'P0001', 'target_unavailable',
  'swipe vers un membre waitlist refusé');

select pg_temp.logout();
select is((select count(*)::int from public.swipes where swiper_id in (pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(3))), 0,
  'aucun swipe enregistré pour les paliers non autorisés');

select * from finish();
rollback;

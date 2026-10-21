-- get_feed : préférences de genre et d'âge dans les deux sens, rayon, exclusions, photos.
begin;
\ir _helpers.psql
select plan(12);

-- Spectatrice : femme de 30 ans, cherche des hommes de 25 à 35 ans.
-- Candidats (n, genre, recherche, âge, tranche) :
--  10 homme→femme 30 [18-99]         : oui
--  11 homme→homme 30                 : non (ne cherche pas de femme)
--  12 femme→homme 30                 : non (la spectatrice ne cherche pas de femme)
--  13 homme→femme 40                 : non (hors de sa tranche 25-35)
--  14 homme→femme 30 [18-25]         : non (elle, 30 ans, hors de sa tranche à lui)
--  15 homme→femme 30, en pause       : non
--  16 homme→femme 30, à ~120 km      : non (rayon 50 km)
--  17 homme→femme,nonbinaire 33      : oui (à ~10 km)
--  18 homme→femme 30, onboarding     : non
--  19 homme→femme 30, banni          : non
--  20 homme→femme 30, déjà swipé     : non
do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}', 30, 25, 35);
  perform pg_temp.new_member(10, 'standard', 'man', '{woman}', 30);
  perform pg_temp.new_member(11, 'standard', 'man', '{man}', 30);
  perform pg_temp.new_member(12, 'standard', 'woman', '{man}', 30);
  perform pg_temp.new_member(13, 'standard', 'man', '{woman}', 40);
  perform pg_temp.new_member(14, 'standard', 'man', '{woman}', 30, 18, 25);
  perform pg_temp.new_member(15, 'standard', 'man', '{woman}', 30, p_status => 'paused');
  perform pg_temp.new_member(16, 'standard', 'man', '{woman}', 30, p_lat => 64.1466, p_lng => -19.70);
  perform pg_temp.new_member(17, 'unlimited', 'man', '{woman,nonbinary}', 33, p_lat => 64.2366, p_lng => -21.9426);
  perform pg_temp.new_member(18, 'standard', 'man', '{woman}', 30, p_status => 'onboarding');
  perform pg_temp.new_member(19, 'standard', 'man', '{woman}', 30, p_status => 'banned');
  perform pg_temp.new_member(20, 'standard', 'man', '{woman}', 30);
  insert into public.swipes (swiper_id, target_id, direction) values (pg_temp.uid(1), pg_temp.uid(20), 'pass');
  -- Photo refusée du candidat 10 : absente de photo_paths.
  insert into public.profile_photos (user_id, storage_path, position, moderation_status)
  values (pg_temp.uid(10), pg_temp.uid(10)::text || '/rejected.jpg', 2, 'rejected'),
         (pg_temp.uid(10), pg_temp.uid(10)::text || '/pending.jpg', 3, 'pending');
  -- Activité : 17 actif à l'instant, 10 il y a trois jours.
  update public.profiles set last_active_at = now() - interval '3 days' where id = pg_temp.uid(10);
  update public.profiles set last_active_at = now() where id = pg_temp.uid(17);
end;
$$;

select pg_temp.login(pg_temp.uid(1));

select results_eq(
  $$select id from public.get_feed(50)$$,
  $$values (pg_temp.uid(17)), (pg_temp.uid(10))$$,
  'feed = candidats compatibles dans les deux sens, triés par activité récente');

select results_eq(
  $$select age, distance_km between 9 and 11 from public.get_feed(50) where id = pg_temp.uid(17)$$,
  $$values (33, true)$$,
  'âge calculé et distance arrondie au km');

select is(
  (select photo_paths from public.get_feed(50) where id = pg_temp.uid(10)),
  array[pg_temp.uid(10)::text || '/a.jpg', pg_temp.uid(10)::text || '/b.jpg', pg_temp.uid(10)::text || '/pending.jpg'],
  'photo_paths : photos approved et pending, jamais rejected');

select is((select count(*)::int from public.get_feed(1)), 1, 'p_limit respecté');

-- Réciprocité : le candidat 14 (tranche 18-25) ne voit pas la spectatrice de 30 ans,
-- et le candidat 13 (40 ans) non plus, alors que lui la chercherait.
select pg_temp.login(pg_temp.uid(14));
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(1)),
  'âge hors de la tranche du spectateur : exclue');
select pg_temp.login(pg_temp.uid(13));
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(1)),
  'âge du spectateur hors de la tranche de la cible : exclu');
select pg_temp.login(pg_temp.uid(11));
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(1)),
  'genre non recherché par le spectateur : exclue');
select pg_temp.login(pg_temp.uid(10));
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(1)),
  'compatibilité réciproque : la spectatrice apparaît chez le candidat 10');

-- Rayon configurable : à 200 km, le candidat 16 apparaît.
select pg_temp.logout();
insert into public.app_settings (key, value) values ('feed_radius_km', '200')
on conflict (key) do update set value = excluded.value;
select pg_temp.login(pg_temp.uid(1));
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(16)),
  'rayon configurable via app_settings.feed_radius_km');

-- La spectatrice ne lit pas les profils non actifs ou non éligibles.
select is(
  (select count(*)::int from public.profiles where id in (pg_temp.uid(15), pg_temp.uid(18), pg_temp.uid(19))),
  0, 'profils en pause, onboarding ou bannis illisibles');
select is(
  (select count(*)::int from public.profile_photos where user_id = pg_temp.uid(10) and moderation_status = 'rejected'),
  0, 'photo refusée d''autrui illisible');

-- En pause, la spectatrice n'a plus de feed.
select public.set_paused(true);
select is_empty($$select * from public.get_feed(50)$$, 'profil en pause : feed vide');

select * from finish();
rollback;

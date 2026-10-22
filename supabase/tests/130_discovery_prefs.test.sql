-- Lot 1, découverte : critères (rayon, âge, niveaux, domaines, stricts ou préférences), tri par
-- activité ou par affinités, raisons d'affinité, compteurs « critères trop stricts » / « plus
-- personne ». Les critères ne contournent jamais l'éligibilité, les blocages ni les déjà vus.
begin;
\ir _helpers.psql
select plan(27);

-- Spectatrice : femme de 30 ans, cherche des hommes de 25 à 35 ans, à Reykjavik.
--  10 Bac+8, philosophie, ~10 km, actif il y a 3 jours
--  11 Bac+5, droit, même lieu, actif aujourd'hui
--  12 Bac+5, ~120 km
--  13 Bac+5, 40 ans (hors de sa tranche)
--  14 bloqué, 15 déjà passé
do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}', 30, 25, 35);
  perform pg_temp.new_member(10, 'unlimited', 'man', '{woman}', 30, p_lat => 64.2366, p_lng => -21.9426);
  perform pg_temp.new_member(11, 'standard', 'man', '{woman}', 31);
  perform pg_temp.new_member(12, 'standard', 'man', '{woman}', 30, p_lat => 64.1466, p_lng => -19.70);
  perform pg_temp.new_member(13, 'standard', 'man', '{woman}', 40);
  perform pg_temp.new_member(14, 'standard', 'man', '{woman}', 30);
  perform pg_temp.new_member(15, 'standard', 'man', '{woman}', 30);
  perform pg_temp.new_member(20, 'waitlist', 'woman', '{man}', 30);
  insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(1), pg_temp.uid(14));
  insert into public.swipes (swiper_id, target_id, direction) values (pg_temp.uid(1), pg_temp.uid(15), 'pass');
  update public.profiles set study_field = 'law' where id = pg_temp.uid(11);
  insert into public.profile_answers (user_id, position, prompt_key, answer)
  values (pg_temp.uid(11), 0, 'three_hours', 'Le cadastre napoléonien.');
end;
$$;

select pg_temp.login(pg_temp.uid(1));
select results_eq($$select id from public.get_feed(50)$$,
  $$values (pg_temp.uid(11)), (pg_temp.uid(10))$$,
  'sans critères : même jour d''activité, puis distance');
select results_eq(
  $$select level, study_field::text, preview_prompt_key, preview_answer, institution, field_verified
      from public.get_feed(50) where id = pg_temp.uid(11)$$,
  $$values (7, 'law'::text, 'three_hours'::text, 'Le cadastre napoléonien.'::text, null::text, false)$$,
  'le feed renvoie niveau, domaine et une réponse en aperçu');

-- Affinités ------------------------------------------------------------------------------------
select pg_temp.logout();
update public.profiles set last_active_at = now() - interval '3 days' where id = pg_temp.uid(10);
update public.profiles set study_field = 'philosophy' where id in (pg_temp.uid(1), pg_temp.uid(10));
insert into public.profile_books (user_id, position, title, author)
values (pg_temp.uid(1), 0, 'les essais', null),
       (pg_temp.uid(10), 0, 'Les Essais', 'Montaigne'),
       (pg_temp.uid(10), 1, 'La Montagne magique', 'Thomas Mann');
select pg_temp.login(pg_temp.uid(1));

select results_eq($$select id from public.get_feed(50)$$,
  $$values (pg_temp.uid(11)), (pg_temp.uid(10))$$,
  'tri par défaut : la fraîcheur d''abord');
select results_eq(
  $$select affinity_score, affinity_reasons from public.get_feed(50) where id = pg_temp.uid(10)$$,
  $$values (5, '[{"kind": "same_field", "field": "philosophy"},
                 {"kind": "shared_books", "count": 1, "titles": ["Les Essais"]}]'::jsonb)$$,
  'affinités : même domaine et livre en commun (titres comparés sans casse ni accents)');
select is((public.set_discovery_prefs(p_sort := 'affinity')) ->> 'sort', 'affinity', 'tri par affinités enregistré');
select results_eq($$select id from public.get_feed(50)$$,
  $$values (pg_temp.uid(10)), (pg_temp.uid(11))$$,
  'tri par affinités : le profil le plus proche intellectuellement d''abord');

-- Niveaux et domaines : préférences ou filtres stricts -----------------------------------------
select public.set_discovery_prefs(p_levels := '{7}');
select results_eq($$select id from public.get_feed(50)$$,
  $$values (pg_temp.uid(11)), (pg_temp.uid(10))$$,
  'niveau en préférence : il remonte, les autres restent');
select public.set_discovery_prefs(p_levels := '{8}', p_strict_levels := true);
select results_eq($$select id from public.get_feed(50)$$, $$values (pg_temp.uid(10))$$,
  'niveau strict : les autres sont exclus');
select public.set_discovery_prefs(p_levels := '{}', p_strict_levels := false, p_fields := '{law}', p_strict_fields := true);
select results_eq($$select id from public.get_feed(50)$$, $$values (pg_temp.uid(11))$$,
  'domaine strict');

-- Compteurs ------------------------------------------------------------------------------------
-- total compte aussi les membres seedés à Paris : sans critères, le rayon ne s'applique plus.
select ok((select (c ->> 'matching')::int = 1 and (c ->> 'total')::int >= 4 from public.count_discovery() c),
  'matching : critères enregistrés ; total : sans critères');
select ok((select (c ->> 'matching')::int = 0 and (c ->> 'total')::int > 0
             from public.count_discovery(p_fields := '{computing}') c),
  'critères trop stricts : matching nul, total non nul');
select public.set_discovery_prefs(p_fields := '{}', p_strict_fields := false);
select is((public.count_discovery(p_max_distance_km := 200)) -> 'matching', '3'::jsonb,
  'aperçu d''un rayon élargi (« + n profils »)');
select is((public.count_discovery()) -> 'matching', '2'::jsonb, 'sans enregistrer');

-- Rayon et âge ---------------------------------------------------------------------------------
select public.set_discovery_prefs(p_max_distance_km := 200);
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(12)), 'rayon personnel : 200 km');
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(13)), 'âge toujours strict');
select public.set_discovery_prefs(p_age_min := 25, p_age_max := 45);
select is((select age_max from public.profiles where id = pg_temp.uid(1)), 45,
  'la tranche d''âge s''enregistre au même endroit que les critères');
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(13)), 'tranche élargie : 40 ans visible');
select ok(not exists (select 1 from public.get_feed(50) where id in (pg_temp.uid(14), pg_temp.uid(15))),
  'ni bloqué ni déjà vu, quels que soient les critères');

select results_eq(
  $$select p ->> 'max_distance_km', p ->> 'default_distance_km', p ->> 'age_max', p ->> 'sort', p ->> 'saved'
      from public.get_discovery_prefs() p$$,
  $$values ('200'::text, '50'::text, '45'::text, 'affinity'::text, 'true'::text)$$,
  'get_discovery_prefs : valeurs effectives');

-- Entrées invalides ----------------------------------------------------------------------------
select throws_ok($$select public.set_discovery_prefs(p_max_distance_km := 300)$$, 'P0001', 'invalid_input',
  'rayon au-delà de 200 km : refusé');
select throws_ok($$select public.set_discovery_prefs(p_max_distance_km := 2)$$, 'P0001', 'invalid_input',
  'rayon en deçà de 5 km : refusé');
select throws_ok($$select public.set_discovery_prefs(p_age_min := 40, p_age_max := 30)$$, 'P0001', 'invalid_input',
  'tranche d''âge inversée : refusée');
select throws_ok($$select public.set_discovery_prefs(p_levels := '{9}')$$, 'P0001', 'invalid_input',
  'niveau inconnu : refusé');
select throws_ok($$select public.count_discovery(p_max_distance_km := 1)$$, 'P0001', 'invalid_input',
  'compteur : mêmes bornes');

-- Palier sans feed et accès aux critères des autres --------------------------------------------
select pg_temp.login(pg_temp.uid(20));
select is_empty($$select * from public.get_feed(50)$$, 'palier sans feed : feed vide, critères ou pas');
select is(public.count_discovery(), '{"matching": 0, "total": 0}'::jsonb, 'et compteurs nuls');
select is((public.get_discovery_prefs() ->> 'saved')::boolean, false, 'critères par défaut tant que rien n''est enregistré');

select * from finish();
rollback;

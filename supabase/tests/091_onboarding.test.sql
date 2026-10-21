-- Parcours d'onboarding par RPC : identité (18 ans, écriture unique), consentement, activation,
-- pause, localisation arrondie, photos, jetons push, export.
begin;
\ir _helpers.psql
select plan(26);

do $$
begin
  perform pg_temp.new_user(1);
  perform pg_temp.new_member(2, 'standard');
  insert into public.admins (user_id, role) values (pg_temp.uid(2), 'moderator');
  perform pg_temp.new_user(3);
end;
$$;

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select public.get_my_state() ->> 'profile_status', public.get_my_state() -> 'onboarding' ->> 'identity_set',
           public.get_my_state() -> 'tier'$$,
  $$values ('onboarding'::text, 'false'::text, 'null'::jsonb)$$, 'état initial : onboarding, sans identité ni palier');

select throws_ok($$select public.activate_profile()$$, 'P0001', 'identity_missing', 'activation : identité manquante');
select throws_ok($$select public.set_identity('Jeanne Mineure', (current_date - interval '17 years')::date)$$,
  'P0001', 'underage', 'moins de 18 ans refusé');
select lives_ok($$select public.set_identity('Jeanne Majeure', '1995-06-15')$$, 'identité enregistrée');
select throws_ok($$select public.set_identity('Autre Nom', '1990-01-01')$$, 'P0001', 'identity_already_set',
  'identité non réécrivable');
select results_eq(
  $$with u as (update public.profile_private set legal_name = 'Autre Nom' where user_id = pg_temp.uid(1) returning 1)
    select count(*)::int from u$$,
  $$values (0)$$, 'écriture directe du nom légal sans effet');
select results_eq($$select legal_name, birthdate from public.profile_private$$,
  $$values ('Jeanne Majeure'::text, '1995-06-15'::date)$$, 'nom légal et date de naissance inchangés');

select throws_ok($$select public.activate_profile()$$, 'P0001', 'profile_incomplete', 'activation : profil incomplet');
update public.profiles set display_name = 'Jeanne', gender = 'woman', seeking_genders = '{man}', city = 'Reykjavik'
 where id = pg_temp.uid(1);
select throws_ok($$select public.activate_profile()$$, 'P0001', 'photos_missing', 'activation : photos manquantes');
select lives_ok(
  format($$insert into public.profile_photos (user_id, storage_path, position) values (%L, %L, 0), (%L, %L, 1)$$,
         pg_temp.uid(1), pg_temp.uid(1)::text || '/1.jpg', pg_temp.uid(1), pg_temp.uid(1)::text || '/2.jpg'),
  'ajout de deux photos dans son dossier');
select is((select array_agg(distinct moderation_status::text) from public.profile_photos), array['pending'],
  'photos créées en attente de modération');
select throws_ok(
  format($$insert into public.profile_photos (user_id, storage_path, position) values (%L, %L, 2)$$,
         pg_temp.uid(1), pg_temp.uid(2)::text || '/vol.jpg'),
  '23514', null, 'photo hors de son dossier refusée');
select throws_ok($$select public.activate_profile()$$, 'P0001', 'consent_missing', 'activation : consentement manquant');
select lives_ok($$select public.set_sensitive_consent(true, '2026-10')$$, 'consentement donné');
select lives_ok($$select public.activate_profile()$$, 'activation');
select is(public.get_my_state() ->> 'profile_status', 'active', 'profil actif');

select lives_ok($$select public.set_location(64.14662, -21.94264)$$, 'localisation');
select results_eq(
  $$select extensions.st_y(location::extensions.geometry), extensions.st_x(location::extensions.geometry)
      from public.profiles where id = pg_temp.uid(1)$$,
  $$values (64.147::float8, -21.943::float8)$$, 'localisation arrondie à 3 décimales (~1 km)');

select lives_ok($$select public.set_paused(true)$$, 'pause');
select pg_temp.login(pg_temp.uid(3));
select throws_ok($$select public.set_paused(true)$$, 'P0001', 'invalid_status', 'set_paused refusé en onboarding');
select pg_temp.login(pg_temp.uid(1));

-- Retrait du consentement : genres recherchés effacés, retour en onboarding.
select lives_ok($$select public.set_sensitive_consent(false, null)$$, 'retrait du consentement');
select results_eq($$select status::text, cardinality(seeking_genders) from public.profiles where id = pg_temp.uid(1)$$,
  $$values ('onboarding'::text, 0)$$, 'retrait : profil en onboarding, genres recherchés effacés');

-- Jetons push : un jeton change de compte à la reconnexion.
select lives_ok($$insert into public.push_tokens (token, platform) values ('ExponentPushToken[device-1]', 'ios')$$,
  'enregistrement d''un jeton push');
select pg_temp.login(pg_temp.uid(3));
select lives_ok($$insert into public.push_tokens (token, platform) values ('ExponentPushToken[device-1]', 'android')
                  on conflict (token) do update set platform = excluded.platform$$,
  'le même appareil se connecte sur un autre compte');
select pg_temp.logout();
select results_eq($$select user_id from public.push_tokens where token = 'ExponentPushToken[device-1]'$$,
  $$values (pg_temp.uid(3))$$, 'le jeton appartient désormais au nouveau compte');

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select public.export_my_data() -> 'identity' ->> 'legal_name', jsonb_array_length(public.export_my_data() -> 'photos')$$,
  $$values ('Jeanne Majeure'::text, 2)$$, 'export RGPD : identité et photos');

select * from finish();
rollback;

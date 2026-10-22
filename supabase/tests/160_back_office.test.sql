-- Lot 1, back-office : liste d'attente enrichie, réglages validés et tracés, contexte d'un signalement.
begin;
\ir _helpers.psql
select plan(26);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(5, 'unlimited', 'woman', '{man}');
  insert into public.admins (user_id, role) values (pg_temp.uid(5), 'moderator');
end;
$$;

-- Liste d'attente : niveau et ville facultatifs ----------------------------------------------------
select pg_temp.login_anon();
select lives_ok(
  $$insert into public.waitlist_signups (email, source, level, city) values ('a@ens.fr', 'landing', 7, 'Lyon')$$,
  'anon : inscription avec niveau et ville');
select lives_ok(
  $$insert into public.waitlist_signups (email, source) values ('b@ens.fr', 'test')$$,
  'anon : inscription sans niveau ni ville (facultatifs)');
select throws_ok(
  $$insert into public.waitlist_signups (email, level) values ('c@ens.fr', 9)$$,
  '23514', null, 'niveau hors de l''échelle 1 à 8 : refusé');
select throws_ok(
  $$insert into public.waitlist_signups (email, city) values ('d@ens.fr', repeat('x', 81))$$,
  '23514', null, 'ville de plus de 80 caractères : refusée');
select throws_ok(
  $$insert into public.waitlist_signups (email, city) values ('e@ens.fr', '   ')$$,
  '23514', null, 'ville vide : refusée (laisser nul)');
select throws_ok($$select * from public.waitlist_signups$$, '42501', null, 'anon ne lit pas la liste d''attente');

select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select level::int, city from public.waitlist_signups where email = 'a@ens.fr'$$,
  $$values (7, 'Lyon'::text)$$,
  'l''admin lit niveau et ville');

-- Réglages -----------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select public.admin_update_settings('{"feed_radius_km": 80}')$$, 'P0001', 'forbidden',
  'un membre ne modifie pas les réglages');

select pg_temp.login(pg_temp.uid(5));
select lives_ok(
  $$select public.admin_update_settings('{"feed_radius_km": 80, "affinity_weight_book": 4}')$$,
  'admin : rayon et poids enregistrés');
select is((select value from public.app_settings where key = 'feed_radius_km'), '80'::jsonb, 'rayon par défaut à jour');
select is((select value from public.app_settings where key = 'affinity_weight_book'), '4'::jsonb,
  'poids enregistré pour la découverte');
select throws_ok($$select public.admin_update_settings('{"feed_radius_km": 3}')$$, 'P0001', 'invalid_value',
  'rayon sous 5 km : refusé');
select throws_ok($$select public.admin_update_settings('{"feed_radius_km": 250}')$$, 'P0001', 'invalid_value',
  'rayon au-delà de 200 km : refusé');
select throws_ok($$select public.admin_update_settings('{"affinity_weight_field": 2.5}')$$, 'P0001',
  'invalid_value', 'poids non entier : refusé');
select throws_ok($$select public.admin_update_settings('{"affinity_weight_field": 21}')$$, 'P0001',
  'invalid_value', 'poids au-delà de 20 : refusé');
select throws_ok($$select public.admin_update_settings('{"max_submissions_per_30_days": 10}')$$, 'P0001',
  'unknown_setting', 'clé hors du périmètre de l''écran : refusée');
select lives_ok(
  $$select public.admin_update_settings('{"moderation_blocklist": ["  Snap ", "snap", "", "Kik"]}')$$,
  'liste de mots enregistrée');
select is((select value from public.app_settings where key = 'moderation_blocklist'), '["snap", "kik"]'::jsonb,
  'mots nettoyés : minuscules, sans espaces, sans doublon ni vide');
reset role;
select is(private.content_flag_reasons('Ajoutez-moi sur kik'), array['word'], 'le filtre lit la nouvelle liste');
select pg_temp.login(pg_temp.uid(5));
select ok(
  exists (select 1 from public.audit_log
           where action = 'settings.update' and payload #> '{after,feed_radius_km}' = '80'::jsonb
             and payload #> '{before,feed_radius_km}' = '50'::jsonb),
  'chaque modification est tracée avec l''avant et l''après');

-- Contexte d'un signalement ------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2));
insert into public.profile_answers (position, prompt_key, answer)
values (0, 'three_hours', 'La querelle des universaux.');
select pg_temp.login(pg_temp.uid(1));
select public.report_user(pg_temp.uid(2), 'inappropriate_content', 'Ce texte me gêne', 'answer',
  (select id from public.profile_answers where user_id = pg_temp.uid(2) and position = 0));
select public.block_user(pg_temp.uid(2));

select throws_ok(
  $$select public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1)))$$,
  'P0001', 'forbidden', 'contexte réservé aux admins');

select pg_temp.login(pg_temp.uid(5));
select is(
  public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1))) #>> '{target,display_name}',
  'Membre 2', 'la personne signalée est identifiée');
select is(
  jsonb_array_length(public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1))) -> 'photos'),
  2, 'ses photos sont listées');
select is(
  public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1))) #>> '{content,text}',
  'La querelle des universaux.', 'le texte visé est montré');
select is(
  public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1))) #>> '{reports_against,open}',
  '1', 'nombre de signalements ouverts contre ce membre');
select is(
  public.admin_get_report_context((select id from public.reports where reporter_id = pg_temp.uid(1))) #>> '{relationship,reporter_blocked}',
  'true', 'le blocage par l''auteur du signalement est visible');

select * from finish();
rollback;

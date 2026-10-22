-- Lot 1, profil intellectuel : réponses, livres, thèse, catalogue des questions.
-- Lecture comme les photos (can_view_profile), écriture par le seul propriétaire, jamais le
-- statut de modération ; un palier sans feed ne lit aucune réponse ; la thèse « après un match »
-- n'est pas lisible hors match.
begin;
\ir _helpers.psql
select plan(27);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(3, 'waitlist', 'man', '{woman}');
  perform pg_temp.new_member(4, 'unlimited', 'woman', '{man}');
  update public.profile_prompts set active = false where key = 'ideal_sunday';
end;
$$;

-- Écriture par le propriétaire ------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2));
select lives_ok(
  $$insert into public.profile_answers (position, prompt_key, answer)
    values (0, 'three_hours', '  Le cadastre napoléonien. Si, si.  ')$$,
  'le membre ajoute une réponse');
select results_eq(
  $$select answer, moderation_status::text from public.profile_answers where user_id = pg_temp.uid(2)$$,
  $$values ('Le cadastre napoléonien. Si, si.'::text, 'approved'::text)$$,
  'réponse nettoyée et publiée (modération après publication)');
select throws_ok(
  $$insert into public.profile_answers (position, prompt_key, answer) values (1, 'ideal_sunday', 'Lire.')$$,
  'P0001', 'prompt_inactive', 'question désactivée : refusée');
select throws_ok(
  $$insert into public.profile_answers (position, prompt_key, answer) values (3, 'winning_debate', 'Tout.')$$,
  '23514', null, 'trois réponses au plus (positions 0 à 2)');
select throws_ok(
  $$insert into public.profile_answers (position, prompt_key, answer) values (1, 'three_hours', 'Encore.')$$,
  '23505', null, 'une même question une seule fois');
select throws_ok(
  format($$insert into public.profile_answers (position, prompt_key, answer) values (1, 'winning_debate', %L)$$,
         repeat('a', 251)),
  '23514', null, 'réponse limitée à 250 caractères');
select throws_ok(
  $$update public.profile_answers set moderation_status = 'approved' where user_id = pg_temp.uid(2)$$,
  '42501', null, 'le membre n''écrit pas le statut de modération');
select throws_ok(
  $$insert into public.profile_answers (position, prompt_key, answer, moderation_status)
    values (1, 'winning_debate', 'Tout.', 'approved')$$,
  '42501', null, 'ni à l''insertion');
select lives_ok(
  $$insert into public.profile_books (position, title, author) values (0, 'Les Essais', 'Montaigne'),
                                                                     (1, 'La Montagne magique', 'Thomas Mann')$$,
  'le membre ajoute des livres');
select throws_ok(
  $$insert into public.profile_books (position, title) values (5, 'Un sixième livre')$$,
  '23514', null, 'cinq livres au plus (positions 0 à 4)');
select lives_ok(
  $$insert into public.profile_theses (line) values ('Le cadastre comme roman national.')$$,
  'le membre écrit sa phrase de thèse');
select is((select visibility::text from public.profile_theses where user_id = pg_temp.uid(2)), 'matches',
  'thèse visible après un match par défaut (D3)');

-- Lecture par les autres ------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(2)), 1,
  'un membre qui voit le profil lit ses réponses');
select is((select count(*)::int from public.profile_books where user_id = pg_temp.uid(2)), 2,
  'et ses livres');
select is_empty($$select 1 from public.profile_theses where user_id = pg_temp.uid(2)$$,
  'thèse « après un match » illisible hors match');
update public.profile_answers set answer = 'Piraté' where user_id = pg_temp.uid(2);
select is((select answer from public.profile_answers where user_id = pg_temp.uid(2)),
  'Le cadastre napoléonien. Si, si.', 'personne ne modifie la réponse d''un autre');
select throws_ok(
  format($$insert into public.profile_answers (user_id, position, prompt_key, answer)
           values (%L, 1, 'winning_debate', 'Usurpé')$$, pg_temp.uid(2)),
  '42501', null, 'personne n''écrit une réponse au nom d''un autre');

select pg_temp.login(pg_temp.uid(3));
select is_empty($$select 1 from public.profile_answers where user_id = pg_temp.uid(2)$$,
  'un palier sans feed ne lit aucune réponse');
select is_empty($$select 1 from public.profile_books where user_id = pg_temp.uid(2)$$,
  'ni aucun livre');

-- Thèse : après un match, ou ouverte à tous -----------------------------------------------------
select pg_temp.logout();
insert into public.matches (user_a, user_b)
values (least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2)));
select pg_temp.login(pg_temp.uid(1));
select is((select line from public.profile_theses where user_id = pg_temp.uid(2)),
  'Le cadastre comme roman national.', 'thèse lisible après un match');
select pg_temp.login(pg_temp.uid(4));
select is_empty($$select 1 from public.profile_theses where user_id = pg_temp.uid(2)$$,
  'toujours illisible pour un autre membre sans match');
select pg_temp.login(pg_temp.uid(2));
update public.profile_theses set visibility = 'everyone';
select pg_temp.login(pg_temp.uid(4));
select is((select count(*)::int from public.profile_theses where user_id = pg_temp.uid(2)), 1,
  'thèse ouverte à tous : lisible sans match');

-- Texte retiré : invisible des autres, visible du propriétaire ------------------------------------
select pg_temp.logout();
update public.profile_answers set moderation_status = 'rejected' where user_id = pg_temp.uid(2);
select pg_temp.login(pg_temp.uid(1));
select is_empty($$select 1 from public.profile_answers where user_id = pg_temp.uid(2)$$,
  'réponse retirée invisible des autres');
select pg_temp.login(pg_temp.uid(2));
select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(2)), 1,
  'le propriétaire voit sa réponse retirée');

-- Catalogue et critères -------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select ok((select count(*) from public.profile_prompts where active) >= 19, 'catalogue lisible par les membres');
select throws_ok($$insert into public.profile_prompts (key) values ('free_for_all')$$,
  '42501', null, 'seuls les admins modifient le catalogue');
insert into public.discovery_prefs (max_distance_km) values (80);
select pg_temp.login(pg_temp.uid(2));
select is_empty($$select 1 from public.discovery_prefs where user_id = pg_temp.uid(1)$$,
  'les critères de découverte ne se lisent pas entre membres');

select * from finish();
rollback;

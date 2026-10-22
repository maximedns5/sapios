-- Finitions du lot 1 : identifiants des textes dans la fiche (signalement précis), quota des
-- appels sortants (recherche de livres), textes du lot 1 présents dans app_copy.
begin;
\ir _helpers.psql
select plan(18);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  insert into public.profile_answers (user_id, position, prompt_key, answer)
  values (pg_temp.uid(2), 0, 'three_hours', 'Le cadastre napoléonien.');
  insert into public.profile_books (user_id, position, title, author)
  values (pg_temp.uid(2), 0, 'Les Essais', 'Montaigne');
end;
$$;

-- Fiche : chaque réponse et chaque livre porte son identifiant ---------------------------------
select pg_temp.login(pg_temp.uid(1));
select is((public.get_profile(pg_temp.uid(2)) -> 'answers' -> 0 ->> 'id')::uuid,
  (select id from public.profile_answers where user_id = pg_temp.uid(2) and position = 0),
  'get_profile : identifiant de la réponse');
select is((public.get_profile(pg_temp.uid(2)) -> 'books' -> 0 ->> 'id')::uuid,
  (select id from public.profile_books where user_id = pg_temp.uid(2) and position = 0),
  'get_profile : identifiant du livre');

-- Signaler la réponse vue dans la fiche : le signalement vise ce texte précis.
select lives_ok(
  format($$select public.report_user(%L, 'inappropriate_content', null, 'answer', %L)$$,
         pg_temp.uid(2), public.get_profile(pg_temp.uid(2)) -> 'answers' -> 0 ->> 'id'),
  'signalement d''une réponse par son identifiant');
select pg_temp.logout();
select results_eq(
  $$select content_kind::text, content_item_id from public.reports where target_id = pg_temp.uid(2)$$,
  $$select 'answer'::text, id from public.profile_answers where user_id = pg_temp.uid(2) and position = 0$$,
  'le signalement porte le type et l''identifiant du texte');
select is((select moderation_status::text from public.profile_answers where user_id = pg_temp.uid(2) and position = 0),
  'pending', 'la réponse signalée passe en file de modération');

-- Quota des appels sortants -------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select throws_ok(format($$select public.consume_rate_limit(%L, 'book_search', 3, 60)$$, pg_temp.uid(1)),
  '42501', null, 'un membre n''appelle pas le quota lui-même');
select pg_temp.login_anon();
select throws_ok(format($$select public.consume_rate_limit(%L, 'book_search', 3, 60)$$, pg_temp.uid(1)),
  '42501', null, 'anon non plus');

select pg_temp.login_service();
select ok(public.consume_rate_limit(pg_temp.uid(1), 'book_search', 3, 60), 'serveur : 1er appel accepté');
select ok(public.consume_rate_limit(pg_temp.uid(1), 'book_search', 3, 60), 'serveur : 2e appel accepté');
select ok(public.consume_rate_limit(pg_temp.uid(1), 'book_search', 3, 60), 'serveur : 3e appel accepté');
select ok(not public.consume_rate_limit(pg_temp.uid(1), 'book_search', 3, 60), 'serveur : 4e appel refusé (quota)');
select ok(public.consume_rate_limit(pg_temp.uid(2), 'book_search', 3, 60), 'le quota est propre à chaque membre');
select pg_temp.logout();
update private.rate_limits set window_start = now() - interval '61 seconds' where user_id = pg_temp.uid(1);
select pg_temp.login_service();
select ok(public.consume_rate_limit(pg_temp.uid(1), 'book_search', 3, 60), 'nouvelle fenêtre : compteur remis à zéro');
select throws_ok(format($$select public.consume_rate_limit(%L, 'Bad bucket!', 3, 60)$$, pg_temp.uid(1)),
  'P0001', 'invalid_input', 'usage mal nommé : refusé');
select pg_temp.logout();

-- Suppression du compte : le compteur part avec lui.
delete from auth.users where id = pg_temp.uid(1);
select is((select count(*)::int from private.rate_limits where user_id = pg_temp.uid(1)), 0,
  'compteur supprimé avec le compte');

-- Textes du lot 1 modifiables -----------------------------------------------------------------
select is(
  (select count(*)::int from public.app_copy where locale = 'fr' and key = any (array[
    'feed.ranking', 'intellect.sensitive', 'intellect.thesis_warning', 'likes.teaser', 'quiz.badge',
    'affinity.book_one', 'affinity.books_many', 'affinity.same_field', 'affinity.prompt_one',
    'affinity.prompts_many', 'affinity.same_institution', 'profile.thesis_footnote', 'library.empty'])),
  13, 'les textes du lot 1 sont dans app_copy');
select ok((select text from public.app_copy where key = 'affinity.book_one' and locale = 'fr') like '%{title}%',
  'emplacement {title} présent dans la phrase des livres en commun');
select pg_temp.login(pg_temp.uid(2));
select is((select count(*)::int from public.app_copy where key like 'affinity.%' and locale = 'fr'), 6,
  'un membre connecté lit ces textes');

select * from finish();
rollback;

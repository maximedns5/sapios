-- Lot 1, RGPD : l'export contient les nouvelles données du membre, et la suppression du compte
-- efface réponses, livres, thèse, critères, avis et entrées de modération.
begin;
\ir _helpers.psql
select plan(13);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
end;
$$;

select pg_temp.login(pg_temp.uid(1));
insert into public.profile_answers (position, prompt_key, answer) values (0, 'three_hours', 'Mon 06 12 34 56 78');
insert into public.profile_books (position, title, author) values (0, 'Les Essais', 'Montaigne');
insert into public.profile_theses (line, visibility) values ('Le cadastre comme roman national.', 'everyone');
select public.set_discovery_prefs(p_max_distance_km := 80, p_sort := 'affinity');
select public.swipe(pg_temp.uid(2), 'like', null, 'Bonjour.');
select pg_temp.logout();
insert into public.member_notices (user_id, kind, payload) values (pg_temp.uid(1), 'content_removed', '{}');

select pg_temp.login(pg_temp.uid(1));
select ok(public.export_my_data() ?& array['answers', 'books', 'thesis', 'discovery_prefs', 'notices'],
  'export : nouvelles rubriques présentes');
select is(public.export_my_data() -> 'answers' -> 0 ->> 'answer', 'Mon 06 12 34 56 78', 'export : réponses');
select is(public.export_my_data() -> 'thesis' ->> 'visibility', 'everyone', 'export : thèse et sa visibilité');
select is((public.export_my_data() -> 'discovery_prefs' ->> 'max_distance_km')::int, 80, 'export : critères');
select is(public.export_my_data() -> 'swipes' -> 0 ->> 'comment', 'Bonjour.', 'export : mot joint au like');

select pg_temp.logout();
select is((select count(*)::int from public.content_flags where user_id = pg_temp.uid(1)), 1,
  'avant : une entrée de modération (numéro de téléphone)');
delete from auth.users where id = pg_temp.uid(1);

select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(1)), 0, 'réponses effacées');
select is((select count(*)::int from public.profile_books where user_id = pg_temp.uid(1)), 0, 'livres effacés');
select is((select count(*)::int from public.profile_theses where user_id = pg_temp.uid(1)), 0, 'thèse effacée');
select is((select count(*)::int from public.discovery_prefs where user_id = pg_temp.uid(1)), 0, 'critères effacés');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(1)), 0, 'avis effacés');
select is((select count(*)::int from public.content_flags where user_id = pg_temp.uid(1)), 0,
  'entrées de modération effacées');
select is((select count(*)::int from public.swipes where swiper_id = pg_temp.uid(1)), 0, 'likes ciblés effacés');

select * from finish();
rollback;

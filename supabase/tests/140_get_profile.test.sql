-- Lot 1, fiche profil complète (get_profile) : visibilité, contenus retirés exclus, thèse après
-- un match (D3), établissement seulement s'il est affiché (D2), domaine vérifié, affinités.
begin;
\ir _helpers.psql
select plan(18);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(3, 'waitlist', 'man', '{woman}');
  perform pg_temp.new_member(4, 'standard', 'man', '{woman}');
  update public.user_access set institution = 'Sorbonne Université', study_field = 'history'
   where user_id = pg_temp.uid(2);
  update public.profiles set study_field = 'history', show_institution = true, show_quiz_badge = true
   where id = pg_temp.uid(2);
  insert into public.profile_answers (user_id, position, prompt_key, answer)
  values (pg_temp.uid(2), 0, 'three_hours', 'Le cadastre napoléonien.'),
         (pg_temp.uid(2), 1, 'winning_debate', 'Texte retiré.');
  update public.profile_answers set moderation_status = 'rejected' where user_id = pg_temp.uid(2) and position = 1;
  insert into public.profile_books (user_id, position, title, author)
  values (pg_temp.uid(2), 0, 'Les Essais', 'Montaigne');
  insert into public.profile_theses (user_id, line) values (pg_temp.uid(2), 'Le cadastre comme roman national.');
  insert into public.profile_answers (user_id, position, prompt_key, answer)
  values (pg_temp.uid(1), 0, 'three_hours', 'La querelle des universaux.');
end;
$$;

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select p ->> 'display_name', (p ->> 'age')::int, (p ->> 'level')::int, p ->> 'study_field',
           (p ->> 'field_verified')::boolean, p ->> 'institution', (p ->> 'quiz_badge')::boolean,
           (p ->> 'is_self')::boolean
      from public.get_profile(pg_temp.uid(2)) p$$,
  $$values ('Membre 2'::text, 30, 7, 'history'::text, true, 'Sorbonne Université'::text, true, false)$$,
  'identité publique, niveau, domaine vérifié, établissement affiché, badge');
select is(jsonb_array_length(public.get_profile(pg_temp.uid(2)) -> 'photos'), 2, 'photos');
select is(public.get_profile(pg_temp.uid(2)) -> 'answers',
  '[{"position": 0, "prompt_key": "three_hours", "answer": "Le cadastre napoléonien."}]'::jsonb,
  'réponses, sans les textes retirés');
select is(public.get_profile(pg_temp.uid(2)) -> 'books',
  '[{"position": 0, "title": "Les Essais", "author": "Montaigne"}]'::jsonb, 'livres');
select is(public.get_profile(pg_temp.uid(2)) -> 'thesis', 'null'::jsonb, 'thèse « après un match » : absente sans match');
select is(public.get_profile(pg_temp.uid(2)) -> 'affinity',
  '{"score": 1, "reasons": [{"kind": "shared_prompts", "count": 1, "prompt_keys": ["three_hours"]}]}'::jsonb,
  'affinités avec la personne qui regarde');
select is(public.get_profile(pg_temp.uid(2)) ->> 'match_id', null, 'pas de match');
select is(public.get_profile(pg_temp.uid(2)) ->> 'my_swipe', null, 'pas encore de swipe');

select throws_ok(format($$select public.get_profile(%L)$$, pg_temp.uid(3)), 'P0001', 'not_found',
  'profil non visible (liste d''attente) : introuvable');

-- Match : la thèse apparaît.
select pg_temp.logout();
insert into public.matches (user_a, user_b)
values (least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2)));
select pg_temp.login(pg_temp.uid(1));
select is(public.get_profile(pg_temp.uid(2)) -> 'thesis', '{"line": "Le cadastre comme roman national."}'::jsonb,
  'thèse visible après un match');
select is((public.get_profile(pg_temp.uid(2)) ->> 'match_id')::uuid, (select id from public.matches),
  'identifiant du match');

-- Établissement masqué (option par défaut).
select pg_temp.login(pg_temp.uid(2));
update public.profiles set show_institution = false where id = pg_temp.uid(2);
select pg_temp.login(pg_temp.uid(4));
select is(public.get_profile(pg_temp.uid(2)) ->> 'institution', null, 'établissement masqué : absent');
select is(public.get_profile(pg_temp.uid(2)) -> 'thesis', 'null'::jsonb, 'thèse absente pour un autre membre sans match');

-- Soi-même : aperçu, avec le réglage de visibilité de la thèse.
select pg_temp.login(pg_temp.uid(2));
select results_eq(
  $$select (p ->> 'is_self')::boolean, p -> 'thesis', p ->> 'institution', p -> 'affinity'
      from public.get_profile(pg_temp.uid(2)) p$$,
  $$values (true, '{"line": "Le cadastre comme roman national.", "visibility": "matches"}'::jsonb,
            'Sorbonne Université'::text, 'null'::jsonb)$$,
  'aperçu de son propre profil');

-- Blocage : introuvable dans les deux sens.
select pg_temp.logout();
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(4), pg_temp.uid(2));
select pg_temp.login(pg_temp.uid(4));
select throws_ok(format($$select public.get_profile(%L)$$, pg_temp.uid(2)), 'P0001', 'not_found',
  'profil bloqué : introuvable');
select pg_temp.login(pg_temp.uid(2));
select throws_ok(format($$select public.get_profile(%L)$$, pg_temp.uid(4)), 'P0001', 'not_found',
  'dans les deux sens');

select pg_temp.login_anon();
select throws_ok(format($$select public.get_profile(%L)$$, pg_temp.uid(2)), '42501', null,
  'anon n''appelle pas get_profile');
select pg_temp.login(pg_temp.uid(3));
select throws_ok(format($$select public.get_profile(%L)$$, pg_temp.uid(2)), 'P0001', 'not_found',
  'palier sans feed : aucune fiche');

select * from finish();
rollback;

-- Lot 1, likes ciblés : like d'une photo ou d'une réponse, avec un mot ; likers avec l'élément
-- aimé ; nombre de likes reçus sans identité pour les paliers qui ne voient pas les likers ;
-- au match, les mots deviennent les premiers messages, avec l'élément cité.
begin;
\ir _helpers.psql
select plan(24);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'unlimited', 'man', '{woman}');
  perform pg_temp.new_member(3, 'standard', 'man', '{woman}');
  insert into public.profile_answers (user_id, position, prompt_key, answer)
  values (pg_temp.uid(2), 0, 'three_hours', 'La querelle des universaux.'),
         (pg_temp.uid(2), 1, 'winning_debate', 'Le Paris-Brest est une démonstration.');
  update public.profile_answers set moderation_status = 'rejected'
   where user_id = pg_temp.uid(2) and position = 1;
end;
$$;

create temp table ids as
select (select id from public.profile_photos where user_id = pg_temp.uid(1) and position = 0) as photo1,
       (select id from public.profile_photos where user_id = pg_temp.uid(3) and position = 0) as photo3;
grant select on ids to authenticated;

-- Validation ----------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select throws_ok(
  format($$select public.swipe(%L, 'like', 'photo:' || (select photo3 from ids), null)$$, pg_temp.uid(2)),
  'P0001', 'invalid_item', 'photo d''une autre personne : refusée');
select throws_ok(format($$select public.swipe(%L, 'like', 'answer:2', null)$$, pg_temp.uid(2)),
  'P0001', 'invalid_item', 'réponse absente : refusée');
select throws_ok(format($$select public.swipe(%L, 'like', 'answer:1', null)$$, pg_temp.uid(2)),
  'P0001', 'invalid_item', 'réponse retirée par la modération : refusée');
select throws_ok(format($$select public.swipe(%L, 'like', 'bio', null)$$, pg_temp.uid(2)),
  'P0001', 'invalid_item', 'format inconnu : refusé');
select throws_ok(format($$select public.swipe(%L, 'pass', null, 'Dommage.')$$, pg_temp.uid(2)),
  'P0001', 'invalid_input', 'un mot ne part pas avec un pass');
select throws_ok(format($$select public.swipe(%L, 'like', 'answer:0', %L)$$, pg_temp.uid(2), repeat('a', 141)),
  'P0001', 'comment_too_long', 'mot limité à 140 caractères');
select is((public.get_my_state() ->> 'likes_left_today')::int, 20, 'un like refusé ne consomme pas de quota');

-- Like ciblé avec un mot -------------------------------------------------------------------------
select is(public.swipe(pg_temp.uid(2), 'like', 'answer:0', '  Je veux la version de 3 h.  '),
  '{"matched": false, "match_id": null}'::jsonb, 'like d''une réponse avec un mot');
select results_eq(
  $$select liked_item, comment from public.swipes where target_id = pg_temp.uid(2)$$,
  $$values ('answer:0'::text, 'Je veux la version de 3 h.'::text)$$,
  'élément et mot enregistrés');
select is(public.swipe(pg_temp.uid(2), 'like', null, 'Autre mot'),
  '{"matched": false, "match_id": null}'::jsonb, 'like répété : sans effet');
select is((select comment from public.swipes where target_id = pg_temp.uid(2)), 'Je veux la version de 3 h.',
  'un like existant n''est jamais réécrit');
select is((public.swipe(pg_temp.uid(3), 'like') ->> 'matched')::boolean, false,
  'appel à 2 arguments toujours accepté');

-- Ce que voit la personne likée ------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3));
select throws_ok($$select * from public.get_likers()$$, 'P0001', 'not_allowed',
  'palier sans likers : get_likers refusé');
select is(public.get_likes_count(), 1, 'mais le nombre de likes reçus est disponible');
select is((public.get_my_state() ->> 'likes_received')::int, 1, 'aussi dans get_my_state');
select is_empty($$select 1 from public.swipes where target_id = pg_temp.uid(3)$$,
  'le like (et son mot) reste illisible en direct');

select pg_temp.login(pg_temp.uid(2));
select results_eq(
  $$select id, liked_item, comment, liked_prompt_key, liked_text, level from public.get_likers()$$,
  $$values (pg_temp.uid(1), 'answer:0'::text, 'Je veux la version de 3 h.'::text, 'three_hours'::text,
            'La querelle des universaux.'::text, 7)$$,
  'likers : élément aimé, mot, réponse citée et niveau');

-- Match : les mots deviennent les premiers messages ----------------------------------------------
select is((public.swipe(pg_temp.uid(1), 'like', 'photo:' || (select photo1 from ids),
                        'Bibliothèque rangée par humeur ?') ->> 'matched')::boolean,
  true, 'like en retour sur une photo : match');
select results_eq(
  $$select sender_id, body, context, liked_item, from_like from public.messages order by created_at$$,
  format($$values (%L::uuid, 'Je veux la version de 3 h.'::text, 'La querelle des universaux.'::text,
                   'answer:0'::text, true),
                  (%L::uuid, 'Bibliothèque rangée par humeur ?'::text, null::text, %L::text, true)$$,
         pg_temp.uid(1), pg_temp.uid(2), 'photo:' || (select photo1 from ids)),
  'les deux mots ouvrent la conversation, dans l''ordre des likes, avec l''élément cité');
select is(public.swipe(pg_temp.uid(1), 'like', null, 'Encore'),
  jsonb_build_object('matched', true, 'match_id', (select id from public.matches)),
  'like répété après le match : même match');
select is((select count(*)::int from public.messages), 2, 'aucun message en double');
select ok(
  (select pg_get_triggerdef(t.oid) from pg_trigger t where t.tgname = 'messages_notify') ~ 'NOT new.from_like',
  'les messages issus d''un like ne déclenchent pas la notification « nouveau message »');

select pg_temp.login(pg_temp.uid(1));
select is((public.get_my_state() ->> 'likes_received')::int, 0, 'like réciproque : plus en attente');

-- Un like sans mot ne crée aucun message.
select pg_temp.login(pg_temp.uid(3));
select is((select count(*)::int from public.messages), 0, 'un tiers ne lit pas ces messages');

select * from finish();
rollback;

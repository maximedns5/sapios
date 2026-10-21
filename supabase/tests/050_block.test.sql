-- §10 test 5 : après un blocage, les deux personnes disparaissent du feed l'une de l'autre,
-- ne lisent plus leurs profils et ne peuvent plus s'écrire.
begin;
\ir _helpers.psql
select plan(17);

-- 1/2 : matchés et en conversation. 3/4 : se voient dans le feed, sans interaction.
do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(3, 'unlimited', 'woman', '{man}');
  perform pg_temp.new_member(4, 'standard', 'man', '{woman}');
  insert into public.swipes (swiper_id, target_id, direction)
  values (pg_temp.uid(1), pg_temp.uid(2), 'like'), (pg_temp.uid(2), pg_temp.uid(1), 'like');
  insert into public.matches (id, user_a, user_b)
  values (pg_temp.uid(500), least(pg_temp.uid(1), pg_temp.uid(2)), greatest(pg_temp.uid(1), pg_temp.uid(2)));
end;
$$;

-- Avant blocage.
select pg_temp.login(pg_temp.uid(3));
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(4)), '3 voit 4 avant blocage');
select pg_temp.login(pg_temp.uid(4));
select ok(exists (select 1 from public.get_feed(50) where id = pg_temp.uid(3)), '4 voit 3 avant blocage');
select pg_temp.login(pg_temp.uid(1));
select lives_ok(
  $$insert into public.messages (match_id, sender_id, body) values (pg_temp.uid(500), pg_temp.uid(1), 'Bonjour, docteur.')$$,
  'message possible entre matchés');

-- 3 bloque 4 : disparition mutuelle.
select pg_temp.login(pg_temp.uid(3));
select lives_ok($$select public.block_user(pg_temp.uid(4))$$, '3 bloque 4');
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(4)), '4 a disparu du feed de 3');
select is_empty($$select id from public.profiles where id = pg_temp.uid(4)$$, '3 ne lit plus le profil de 4');
select throws_ok($$select public.swipe(pg_temp.uid(4), 'like')$$, 'P0001', 'target_unavailable', '3 ne peut plus swiper 4');
select pg_temp.login(pg_temp.uid(4));
select ok(not exists (select 1 from public.get_feed(50) where id = pg_temp.uid(3)), '3 a disparu du feed de 4 (symétrie)');
select is_empty($$select id from public.profiles where id = pg_temp.uid(3)$$, '4 ne lit plus le profil de 3');
select is_empty($$select blocker_id from public.blocks$$, '4 ne voit pas le blocage dont il fait l''objet');

-- Blocage seul (sans dé-match) entre 1 et 2 : plus d'écriture ni de lecture des messages.
select pg_temp.logout();
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(2), pg_temp.uid(1));
select pg_temp.login(pg_temp.uid(1));
select throws_ok(
  $$insert into public.messages (match_id, sender_id, body) values (pg_temp.uid(500), pg_temp.uid(1), 'Vous êtes là ?')$$,
  '42501', null, 'bloqué : 1 ne peut plus écrire à 2');
select is_empty($$select id from public.messages$$, 'bloqué : l''historique n''est plus lisible');
select is_empty($$select match_id from public.get_matches()$$, 'bloqué : la conversation disparaît de get_matches');
select pg_temp.login(pg_temp.uid(2));
select throws_ok(
  $$insert into public.messages (match_id, sender_id, body) values (pg_temp.uid(500), pg_temp.uid(2), 'Adieu.')$$,
  '42501', null, 'bloqueur : 2 ne peut pas écrire non plus');

-- block_user dé-matche aussi.
select lives_ok($$select public.block_user(pg_temp.uid(1))$$, 'block_user idempotent');
select isnt((select unmatched_at from public.matches where id = pg_temp.uid(500)), null, 'block_user dé-matche');

-- Et on ne peut pas écrire dans le match d'autrui.
select pg_temp.login(pg_temp.uid(3));
select throws_ok(
  $$insert into public.messages (match_id, sender_id, body) values (pg_temp.uid(500), pg_temp.uid(3), 'Intrus.')$$,
  '42501', null, 'non-participant : écriture refusée');

select * from finish();
rollback;

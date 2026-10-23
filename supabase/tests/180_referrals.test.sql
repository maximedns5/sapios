-- Lot 2, lettres de recommandation : qui recommande, combien de fois, jamais d'identité côté parrain,
-- priorité dans la file de revue et la liste d'attente, sans jamais contourner le diplôme.
begin;
\ir _helpers.psql
select plan(43);

-- 1 : parrain Bac+5 ; 2 : parrain Bac+8 ; 3 : liste d'attente (ne recommande pas) ; 4 : banni ;
-- 10 à 16 : filleuls sans palier ; 20 : admin.
do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'unlimited');
  perform pg_temp.new_member(3, 'waitlist');
  perform pg_temp.new_member(4, 'standard');
  update public.profiles set display_name = 'Camille' where id = pg_temp.uid(1);
  update public.profiles set display_name = 'Hector' where id = pg_temp.uid(2);
  update public.profiles set display_name = 'Bruno' where id = pg_temp.uid(4);
  for i in 10..16 loop
    perform pg_temp.new_member(i, null);
  end loop;
  perform pg_temp.new_member(20, 'unlimited');
  insert into public.admins (user_id, role) values (pg_temp.uid(20), 'moderator');
end;
$$;

-- Mon lien ------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select ok((select public.get_my_referral() ->> 'code') ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$',
  'parrain Bac+5 : un code de 10 caractères (base 32 de Crockford)');
select results_eq(
  $$select (r ->> 'eligible')::boolean, (r ->> 'quota')::int, (r ->> 'used')::int, (r ->> 'left')::int
      from public.get_my_referral() r$$,
  $$values (true, 3, 0, 3)$$,
  'Bac+5 : 3 lettres par période, aucune utilisée');
select is((select public.get_my_referral() ->> 'code'), (select public.get_my_referral() ->> 'code'),
  'le code reste le même d''un appel à l''autre');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.get_my_referral()) k),
  array['code', 'eligible', 'left', 'next_letter_at', 'quota', 'used'],
  'get_my_referral ne renvoie qu''un compteur, aucune identité');

select pg_temp.login(pg_temp.uid(2));
select is((select (public.get_my_referral() ->> 'quota')::int), 5, 'Bac+8 : 5 lettres par période');

select pg_temp.login(pg_temp.uid(3));
select results_eq(
  $$select (r ->> 'eligible')::boolean, r ->> 'code' from public.get_my_referral() r$$,
  $$values (false, null::text)$$,
  'liste d''attente : ne recommande pas, aucun code créé');

select pg_temp.login(pg_temp.uid(4));
select ok((select public.get_my_referral() ->> 'code') is not null, 'Bruno a un code avant son bannissement');

select pg_temp.logout();
create temp table codes as
  select owner_id, code from public.referral_codes where revoked_at is null;
grant select on codes to anon, authenticated;
update public.profiles set status = 'banned' where id = pg_temp.uid(4);

select is((select count(*)::int from public.referral_codes where owner_id in (pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(4))), 3,
  'trois codes créés (Camille, Hector, Bruno)');
-- Recommandations déjà présentes (données de démonstration du seed).
create temp table base as select count(*)::int as n from public.referrals;
grant select on base to authenticated;

-- Aperçu sur l'écran de connexion (anon) ------------------------------------------------------------
select pg_temp.login_anon();
select is(public.get_referral_preview((select code from codes where owner_id = pg_temp.uid(1))),
  '{"referrer_first_name": "Camille"}'::jsonb, 'anon : prénom du parrain pour un code valide');
select is(
  public.get_referral_preview(lower(substr((select code from codes where owner_id = pg_temp.uid(1)), 1, 5)) || '-'
                              || lower(substr((select code from codes where owner_id = pg_temp.uid(1)), 6))),
  '{"referrer_first_name": "Camille"}'::jsonb, 'saisie tolérante : minuscules et tiret acceptés');
select is(public.get_referral_preview('ZZZZZZZZZZ'), null, 'code inconnu : rien');
select is(public.get_referral_preview((select code from codes where owner_id = pg_temp.uid(4))), null,
  'parrain banni : rien');
select throws_ok($$select public.get_my_referral()$$, '42501', null, 'anon : get_my_referral non exécutable');
select throws_ok($$select public.claim_referral('ZZZZZZZZZZ')$$, '42501', null, 'anon : claim_referral non exécutable');

-- Utiliser un code -----------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10));
select throws_ok($$select public.claim_referral('ZZZZZZZZZZ')$$, 'P0001', 'invalid_code', 'code inconnu : refusé');
select throws_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(4)))$$,
  'P0001', 'invalid_code', 'parrain banni : refusé');
select is(public.claim_referral((select code from codes where owner_id = pg_temp.uid(1))),
  '{"referrer_first_name": "Camille"}'::jsonb, 'filleul : recommandé·e par Camille');
select throws_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(2)))$$,
  'P0001', 'already_referred', 'on n''est recommandé qu''une fois');
select results_eq(
  $$select (s ->> 'referred')::boolean, s ->> 'referred_by' from public.get_my_state() s$$,
  $$values (true, 'Camille'::text)$$,
  'get_my_state du filleul : recommandé·e par Camille');

select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(1)))$$,
  'P0001', 'self_referral', 'pas d''auto-recommandation');

-- Après une décision sur le diplôme : trop tard.
select pg_temp.logout();
insert into public.degree_submissions (user_id, storage_path, mime, status, reviewed_at)
values (pg_temp.uid(16), pg_temp.uid(16)::text || '/d.pdf', 'application/pdf', 'needs_more', now());
select pg_temp.login(pg_temp.uid(16));
select throws_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(1)))$$,
  'P0001', 'too_late', 'dossier déjà examiné : trop tard');

-- Quota : 3 lettres par période pour Camille.
select pg_temp.login(pg_temp.uid(11));
select lives_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(1)))$$,
  'deuxième lettre de Camille');
select pg_temp.login(pg_temp.uid(12));
select lives_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(1)))$$,
  'troisième lettre de Camille');
select pg_temp.login(pg_temp.uid(13));
select throws_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(1)))$$,
  'P0001', 'quota_exceeded', 'quatrième lettre : quota atteint');
select pg_temp.login_anon();
select is(public.get_referral_preview((select code from codes where owner_id = pg_temp.uid(1))), null,
  'aperçu vide quand le parrain n''a plus de lettre');

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select (r ->> 'used')::int, (r ->> 'left')::int, (r ->> 'next_letter_at') is not null from public.get_my_referral() r$$,
  $$values (3, 0, true)$$,
  'Camille : 3 lettres utilisées sur 3, date de la prochaine lettre');
select throws_ok($$select * from public.referrals$$, '42501', null, 'un membre ne lit pas la table referrals');
select throws_ok($$select * from public.referral_codes$$, '42501', null, 'un membre ne lit pas la table referral_codes');
select ok(not (public.export_my_data() -> 'referral')::text ~ (pg_temp.uid(10)::text),
  'export du parrain : aucun identifiant de filleul');
select is((public.export_my_data() -> 'referral' ->> 'letters_used_total')::int, 3,
  'export du parrain : nombre de lettres utilisées');

select pg_temp.login(pg_temp.uid(14));
select lives_ok($$select public.claim_referral((select code from codes where owner_id = pg_temp.uid(2)))$$,
  'lettre d''Hector');

-- Priorité dans le back-office -----------------------------------------------------------------------
select pg_temp.logout();
insert into public.degree_submissions (user_id, storage_path, mime, status, created_at)
values (pg_temp.uid(15), pg_temp.uid(15)::text || '/a.pdf', 'application/pdf', 'needs_review', now() - interval '3 days'),
       (pg_temp.uid(10), pg_temp.uid(10)::text || '/b.pdf', 'application/pdf', 'needs_review', now() - interval '1 hour');
insert into public.user_access (user_id, level, tier, copy_key, granted_at)
values (pg_temp.uid(13), 6, 'waitlist', 'verdict.waitlist', now() - interval '10 days'),
       (pg_temp.uid(11), 6, 'waitlist', 'verdict.waitlist', now() - interval '1 day');

select pg_temp.login(pg_temp.uid(20));
select results_eq(
  $$select user_id, referred, referred_by from public.admin_list_submissions('needs_review') limit 2$$,
  $$values (pg_temp.uid(10), true, 'Camille'::text), (pg_temp.uid(15), false, null::text)$$,
  'file de revue : la personne recommandée passe devant, avec le prénom du parrain');
select results_eq(
  $$select user_id, referred from public.admin_list_waitlist() where user_id in (pg_temp.uid(11), pg_temp.uid(13))$$,
  $$values (pg_temp.uid(11), true), (pg_temp.uid(13), false)$$,
  'liste d''attente Bac+3 : la personne recommandée passe devant');

select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select public.admin_referral_stats()$$, 'P0001', 'forbidden', 'un membre ne lit pas les statistiques');

-- Un filleul banni : signal pour l'admin, jamais de sanction automatique.
select pg_temp.logout();
update public.profiles set status = 'banned' where id = pg_temp.uid(12);
select pg_temp.login(pg_temp.uid(20));
select results_eq(
  $$select (x ->> 'referees_total')::int, (x ->> 'referees_banned')::int, (x ->> 'flagged')::boolean
      from jsonb_array_elements(public.admin_referral_stats() -> 'referrers') x
     where x ->> 'referrer_id' = pg_temp.uid(1)::text$$,
  $$values (3, 1, true)$$,
  'statistiques : Camille signalée (un filleul banni)');
select is((public.admin_referral_stats() ->> 'referrals_total')::int, (select n + 4 from base), 'quatre recommandations de plus au total');

-- Révocation : le code ne sert plus, et les recommandations de Camille sont coupées.
select lives_ok($$select public.admin_revoke_referral_code((select code from codes where owner_id = pg_temp.uid(1)), true, 'abus')$$,
  'admin : code révoqué et recommandations coupées');
select pg_temp.login(pg_temp.uid(1));
select is((select (public.get_my_referral() ->> 'eligible')::boolean), false,
  'recommandations coupées : plus de code pour Camille');
select pg_temp.logout();
select is((select count(*)::int from public.referral_codes where owner_id = pg_temp.uid(1) and revoked_at is null), 0,
  'aucun nouveau code créé après la coupure');
select ok(exists (select 1 from public.audit_log where action = 'referral.revoke'), 'révocation journalisée');

-- Suppressions -----------------------------------------------------------------------------------------
delete from auth.users where id = pg_temp.uid(2);
select is((select referrer_id from public.referrals where referee_id = pg_temp.uid(14)), null::uuid,
  'parrain supprimé : la recommandation reste, sans auteur');
select pg_temp.login(pg_temp.uid(14));
select results_eq(
  $$select (s ->> 'referred')::boolean, s ->> 'referred_by' from public.get_my_state() s$$,
  $$values (true, null::text)$$,
  'filleul : toujours recommandé, prénom du parrain effacé');
select pg_temp.logout();
delete from auth.users where id = pg_temp.uid(10);
select is((select count(*)::int from public.referrals where referee_id = pg_temp.uid(10)), 0,
  'filleul supprimé : sa ligne disparaît');

select * from finish();
rollback;

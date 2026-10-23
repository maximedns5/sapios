-- Lot 2, back-office : réglages des lettres de recommandation et palier du parrain dans les statistiques.
begin;
\ir _helpers.psql
select plan(11);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_user(2);
  perform pg_temp.new_member(5, 'unlimited', 'woman', '{man}');
  insert into public.admins (user_id, role) values (pg_temp.uid(5), 'moderator');
  insert into public.referral_codes (code, owner_id) values ('ABCDEFGH23', pg_temp.uid(1));
  insert into public.referrals (referee_id, referrer_id, code, claimed_at)
  values (pg_temp.uid(2), pg_temp.uid(1), 'ABCDEFGH23', now());
end;
$$;

-- Réglages des lettres -----------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select public.admin_update_settings('{"referral_letters_standard": 1}')$$, 'P0001', 'forbidden',
  'un membre ne modifie pas le nombre de lettres');

select pg_temp.login(pg_temp.uid(5));
select lives_ok(
  $$select public.admin_update_settings('{"referral_letters_standard": 2, "referral_letters_unlimited": 4, "referral_window_days": 14}')$$,
  'admin : lettres par palier et période enregistrées');
select is((select value from public.app_settings where key = 'referral_letters_standard'), '2'::jsonb,
  'lettres Bac+5 à jour');
select is((select value from public.app_settings where key = 'referral_window_days'), '14'::jsonb,
  'période glissante à jour');
select throws_ok($$select public.admin_update_settings('{"referral_letters_unlimited": 21}')$$, 'P0001',
  'invalid_value', 'plus de 20 lettres : refusé');
select throws_ok($$select public.admin_update_settings('{"referral_window_days": 5}')$$, 'P0001',
  'invalid_value', 'période de moins de 7 jours : refusée');
select throws_ok($$select public.admin_update_settings('{"referral_letters_standard": 1.5}')$$, 'P0001',
  'invalid_value', 'nombre de lettres non entier : refusé');
select ok(
  exists (select 1 from public.audit_log
           where action = 'settings.update' and payload #> '{after,referral_letters_standard}' = '2'::jsonb),
  'la modification est tracée');

select pg_temp.login(pg_temp.uid(1));
select is((select (public.get_my_referral() ->> 'quota')::int), 2, 'le membre voit le nouveau quota');
select throws_ok($$select public.admin_referral_stats()$$, 'P0001', 'forbidden',
  'un membre ne lit pas les statistiques des recommandations');

-- Statistiques : palier et niveau du parrain --------------------------------------------------------
select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select r ->> 'tier', (r ->> 'level')::int, (r ->> 'referees_total')::int
      from jsonb_array_elements(public.admin_referral_stats() -> 'referrers') r
     where (r ->> 'referrer_id')::uuid = pg_temp.uid(1)$$,
  $$values ('standard'::text, 7, 1)$$,
  'la ligne du parrain porte son palier et son niveau');

select * from finish();
rollback;

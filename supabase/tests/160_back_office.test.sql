-- Back-office, réglages : réservés aux admins, validés, nettoyés et tracés avec l'avant et l'après.
begin;
\ir _helpers.psql
select plan(11);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(5, 'unlimited');
  insert into public.admins (user_id, role) values (pg_temp.uid(5), 'moderator');
end;
$$;

select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select public.admin_update_settings('{"apply_daily_quota": 40}')$$, 'P0001', 'forbidden',
  'un membre ne modifie pas les réglages');

select pg_temp.login(pg_temp.uid(5));
select lives_ok(
  $$select public.admin_update_settings('{"apply_daily_quota": 40, "invitation_weekly_quota": 25}')$$,
  'admin : quotas enregistrés');
select is((select value from public.app_settings where key = 'apply_daily_quota'), '40'::jsonb, 'quota de candidatures à jour');
select throws_ok($$select public.admin_update_settings('{"apply_daily_quota": 0}')$$, 'P0001', 'invalid_value',
  'quota de candidatures nul : refusé');
select throws_ok($$select public.admin_update_settings('{"offer_lifetime_days": 2.5}')$$, 'P0001',
  'invalid_value', 'durée non entière : refusée');
select throws_ok($$select public.admin_update_settings('{"max_submissions_per_30_days": 10}')$$, 'P0001',
  'unknown_setting', 'clé hors du périmètre de l''écran : refusée');
select throws_ok($$select public.admin_update_settings('{"moderation_blocklist": ["kik"]}')$$, 'P0001',
  'unknown_setting', 'liste de mots du profil intellectuel : supprimée');
select lives_ok(
  $$select public.admin_update_settings('{"offer_banned_words": ["  Natif ", "natif", "", "Jeune"]}')$$,
  'mots interdits des offres enregistrés');
select is((select value from public.app_settings where key = 'offer_banned_words'), '["natif", "jeune"]'::jsonb,
  'mots nettoyés : minuscules, sans espaces, sans doublon ni vide');
select throws_ok($$select public.admin_update_settings('{"generic_email_domains": ["pas un domaine"]}')$$, 'P0001',
  'invalid_value', 'domaine d''email invalide : refusé');
select ok(
  exists (select 1 from public.audit_log
           where action = 'settings.update' and payload #> '{after,apply_daily_quota}' = '40'::jsonb
             and payload #> '{before,apply_daily_quota}' is not null),
  'chaque modification est tracée avec l''avant et l''après');

select * from finish();
rollback;

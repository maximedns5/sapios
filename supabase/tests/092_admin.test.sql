-- RPC du back-office communes : réservées aux admins, détail d'une soumission avec l'identité du
-- candidat (Sapios Emploi), sans parrainage.
begin;
\ir _helpers.psql
select plan(8);

do $$
begin
  perform pg_temp.new_member(1, 'unlimited');                    -- admin
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_member(2);
  perform pg_temp.new_member(4, 'standard');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, signals)
  values (pg_temp.uid(901), pg_temp.uid(2), pg_temp.uid(2)::text || '/d.pdf', 'application/pdf', 'needs_review', '{name_mismatch}');
end;
$$;

-- Non-admin : tout est refusé.
select pg_temp.login(pg_temp.uid(4));
select throws_ok($$select * from public.admin_get_submission(pg_temp.uid(901))$$, 'P0001', 'forbidden', 'admin_get_submission refusé');
select throws_ok($$select * from public.admin_list_submissions()$$, 'P0001', 'forbidden', 'admin_list_submissions refusé');
select throws_ok($$select public.admin_update_settings('{"offer_lifetime_days": 30}')$$, 'P0001', 'forbidden',
  'admin_update_settings refusé');

select pg_temp.login(pg_temp.uid(1));
select results_eq(
  $$select id, signals, email, legal_name, display_name, birthdate from public.admin_get_submission(pg_temp.uid(901))$$,
  $$values (pg_temp.uid(901), '{name_mismatch}'::text[], 'pgtap-2@sapios.test'::text, 'Membre Test 2'::text,
            'Membre'::text, null::date)$$,
  'admin_get_submission : signaux, e-mail et identité du candidat (sans date de naissance)');
select ok(not exists (select 1 from information_schema.routines r
                        join information_schema.parameters p on p.specific_name = r.specific_name
                       where r.routine_schema = 'public' and r.routine_name = 'admin_list_submissions'
                         and p.parameter_name in ('referred', 'referred_by')),
  'admin_list_submissions : plus de colonne de parrainage');

-- Réglages : les clés du dating n'existent plus.
select throws_ok($$select public.admin_update_settings('{"feed_radius_km": 50}')$$, 'P0001', 'unknown_setting',
  'feed_radius_km : réglage inconnu');
select throws_ok($$select public.admin_update_settings('{"referral_window_days": 30}')$$, 'P0001', 'unknown_setting',
  'referral_window_days : réglage inconnu');
select is(public.admin_update_settings('{"offer_lifetime_days": 45}'), '{"offer_lifetime_days": 45}'::jsonb,
  'réglage emploi enregistré');

select * from finish();
rollback;

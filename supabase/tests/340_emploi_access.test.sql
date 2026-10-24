-- Sapios Emploi : règles d'accès des nouvelles tables, droits d'exécution, types de compte, back-office
-- en double authentification, photos des offres dans le stockage.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(55);

-- Schéma : RLS partout, fonctions sûres ----------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
              and c.relname in ('emploi_accounts', 'candidates', 'candidate_identities', 'cv_experiences', 'cv_skills',
                                'cv_languages', 'companies', 'company_members', 'offers', 'offer_photos', 'offer_passes',
                                'applications', 'application_notes', 'application_messages', 'interview_slots',
                                'invitations', 'company_blocks', 'offer_reports')), 0, 'RLS activée sur les 18 tables');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'aucune fonction security definer sans search_path');
select is((select count(*)::int from information_schema.role_routine_grants g
            where g.grantee = 'anon' and g.routine_schema = 'public'
              and g.routine_name in ('get_emploi_state', 'apply_offer', 'get_offer_feed', 'register_company', 'save_offer',
                                     'decide_application', 'get_offer_pile', 'admin_list_companies', 'export_my_emploi_data',
                                     'server_emploi_notification', 'emploi_requirement_matches')), 0,
  'aucune RPC emploi exécutable par anon');
select is((select count(*)::int from information_schema.role_routine_grants g
            where g.grantee = 'authenticated' and g.routine_schema = 'public'
              and g.routine_name in ('server_emploi_notification', 'emploi_requirement_matches')), 0,
  'fonctions serveur non exécutables par un client');

select is((select array_agg(tablename::text order by tablename) from pg_publication_tables
            where pubname = 'supabase_realtime' and tablename in ('application_messages', 'interview_slots')),
  array['application_messages', 'interview_slots'], 'temps réel : messages et créneaux publiés');

do $$
declare
  v_company uuid;
begin
  perform pg_temp.new_user(1);
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_candidate(2, p_open => true, p_level => 7);
  perform pg_temp.new_candidate(3);
  v_company := pg_temp.new_company(10);
  perform set_config('t.company', v_company::text, true);
  perform set_config('t.offer', pg_temp.new_offer(v_company)::text, true);
  perform set_config('t.draft', pg_temp.new_offer(v_company, 'Brouillon', p_status => 'draft')::text, true);
  perform pg_temp.new_company(20);
  perform pg_temp.new_user(40); -- compte sans type
  insert into storage.objects (bucket_id, name, owner_id)
  select 'offer-photos', ph.storage_path, null from public.offer_photos ph where ph.company_id = v_company;
  insert into public.offer_photos (offer_id, company_id, kind, storage_path, moderation)
  values (current_setting('t.offer')::uuid, v_company, 'tools', v_company::text || '/pending.jpg', 'pending');
  insert into storage.objects (bucket_id, name) values ('offer-photos', v_company::text || '/pending.jpg');
  -- Données d'un candidat seedé du test : CV, langue, blocage.
  insert into public.cv_languages (user_id, language, level) values (pg_temp.uid(2), 'Anglais', 'c1');
  perform set_config('t.num2', (select number::text from public.candidates where user_id = pg_temp.uid(2)), true);
  perform set_config('t.num3', (select number::text from public.candidates where user_id = pg_temp.uid(3)), true);
end;
$$;

-- Type de compte ------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(40), 'aal1');
select is(public.get_emploi_state() ->> 'kind', null, 'compte neuf : sans type');
select throws_ok($$select public.accept_emploi_terms('cgu-emploi-2026-11-brouillon')$$, 'P0001', 'kind_required',
  'CGU : type de compte d''abord');
select throws_ok($$select public.save_candidate_profile('{}'::jsonb)$$, 'P0001', 'not_candidate', 'profil : candidat seulement');
select lives_ok($$select public.set_account_kind('candidate')$$, 'type candidat');
select lives_ok($$select public.set_account_kind('candidate')$$, 'idempotent');
select throws_ok($$select public.set_account_kind('recruiter')$$, 'P0001', 'kind_already_set', 'choisi une fois');
select throws_ok($$select public.save_candidate_profile('{"target_role": "Data analyst"}'::jsonb)$$, 'P0001', 'terms_required',
  'profil : CGU d''abord');
select lives_ok($$select public.accept_emploi_terms('cgu-emploi-2026-11-brouillon')$$, 'CGU acceptées');
select throws_ok($$select public.save_candidate_profile('{"target_role": "Data analyst"}'::jsonb)$$, 'P0001', 'invalid_input',
  'création : champs obligatoires');
select is(public.save_candidate_profile('{"target_role": "Data analyst", "search_city": "Reykjavik", "search_lat": 64.14662,
  "search_lng": -21.94261, "contract_types": ["cdi", "cdi"], "salary_min_k": 40, "salary_max_k": 46,
  "experience_band": "y0_1"}'::jsonb) ->> 'search_lat', '64.147', 'profil créé, position arrondie (~100 m)');
select is(public.get_my_cv() -> 'profile' -> 'work_authorization', 'false'::jsonb,
  'création sans autorisation de travail ni « Ce que je cherche » : défauts false et null');
select throws_ok($$select public.save_candidate_profile('{"salary_min_k": 60}'::jsonb)$$, 'P0001', 'invalid_input',
  'minimum supérieur au maximum refusé');
select is(public.save_cv('[{"title": "Analyste", "employer": "Acme", "start_month": "2024-03-15"}]'::jsonb,
  '{SQL, sql, Python, " ", Excel}', '[{"language": "Anglais", "level": "b2"}]'::jsonb) -> 'skills',
  '["SQL", "Python", "Excel"]'::jsonb, 'CV : compétences dédoublonnées, vides ignorés');
select is((select start_month from public.cv_experiences where user_id = pg_temp.uid(40)), '2024-03-01'::date,
  'CV : mois ramené au 1er');
select throws_ok($$select public.save_cv('[]'::jsonb, '{}', '[{"language": "Anglais", "level": "natif"}]'::jsonb)$$,
  'P0001', 'invalid_input', 'niveau de langue inconnu refusé');
select is((public.get_emploi_state() -> 'candidate' ->> 'complete')::boolean, true, 'complet avec 3 compétences');
select is(public.get_my_cv_preview() ->> 'number', (select number::text from public.candidates where user_id = pg_temp.uid(40)),
  'aperçu recruteur : mon numéro');

-- Lectures directes : chacun ses lignes -------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3), 'aal1');
select is((select count(*)::int from public.candidates), 1, 'candidat : seulement son profil');
select is((select count(*)::int from public.cv_languages), 0, 'candidat : langues des autres illisibles');
select is((select count(*)::int from public.offers where id = current_setting('t.offer')::uuid), 1, 'candidat : offre publiée lisible');
select is((select count(*)::int from public.offer_photos where offer_id = current_setting('t.offer')::uuid), 1,
  'candidat : seulement les photos approuvées');
select is((select count(*)::int from storage.objects where bucket_id = 'offer-photos' and name like current_setting('t.company') || '/%'),
  1, 'stockage : photo approuvée d''une offre publique lisible, pas la photo en attente');
select is((select count(*)::int from public.company_members), 0, 'candidat : membres des entreprises illisibles');
select is((select count(*)::int from public.offer_reports), 0, 'candidat : signalements illisibles');
select lives_ok($$select public.block_company(current_setting('t.company')::uuid)$$, 'candidat : bloque une entreprise');
select is((select count(*)::int from public.company_blocks), 1, 'candidat : voit son blocage');
select throws_ok($$insert into public.company_blocks (candidate_id, company_id) values (pg_temp.uid(2), current_setting('t.company')::uuid)$$,
  '42501', null, 'candidat : pas de blocage au nom d''un autre');
select ok(public.report_offer(current_setting('t.offer')::uuid, 'misleading_salary', 'Montant différent au téléphone') is not null,
  'candidat : signale une offre');

select pg_temp.login(pg_temp.uid(20), 'aal1');
select is((select count(*)::int from public.offers where id = current_setting('t.draft')::uuid), 0,
  'autre entreprise : brouillon illisible');
select is((select count(*)::int from storage.objects where bucket_id = 'offer-photos' and name like current_setting('t.company') || '/%'),
  1, 'autre entreprise : seulement la photo publique');
select is((select count(*)::int from public.company_blocks), 0, 'recruteur : blocages des candidats illisibles');

select pg_temp.login(pg_temp.uid(10), 'aal1');
select is((select count(*)::int from storage.objects where bucket_id = 'offer-photos' and name like current_setting('t.company') || '/%'),
  3, 'membre : toutes les photos de son entreprise, brouillon et attente compris');
select is((select count(*)::int from public.offers where company_id = current_setting('t.company')::uuid), 2,
  'membre : ses brouillons');

-- Approche directe -----------------------------------------------------------------------------------
select is((select count(*)::int from public.search_open_candidates(current_setting('t.offer')::uuid)), 1,
  'seul le candidat ouvert aux opportunités apparaît');
select is((select (c ->> 'number')::int from public.search_open_candidates(current_setting('t.offer')::uuid, 7, 'sql') c),
  current_setting('t.num2')::int, 'filtres niveau et compétence');
select is((select count(*)::int from public.search_open_candidates(current_setting('t.offer')::uuid, 8)), 0, 'filtre niveau');
select throws_ok($$select * from public.search_open_candidates(current_setting('t.draft')::uuid)$$, 'P0001', 'offer_not_published',
  'approche directe : offre publiée seulement');
select ok(public.invite_candidate(current_setting('t.offer')::uuid,
  current_setting('t.num2')::int, 'Votre profil nous intéresse.') is not null, 'invitation envoyée');
select throws_ok($$select public.invite_candidate(current_setting('t.offer')::uuid,
  current_setting('t.num2')::int, 'Encore')$$, 'P0001', 'already_invited', 'une invitation par offre');
select throws_ok($$select public.invite_candidate(current_setting('t.offer')::uuid,
  current_setting('t.num3')::int, 'Bonjour')$$, 'P0001', 'not_found',
  'un candidat fermé ou qui bloque l''entreprise est introuvable');
select is((select count(*)::int from public.search_open_candidates(current_setting('t.offer')::uuid) c where (c ->> 'already_invited')::boolean),
  1, 'déjà invité signalé');

-- Admin : double authentification exigée ------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select public.admin_emploi_stats()$$, 'P0001', 'forbidden', 'stats : aal2 exigé');
select throws_ok($$select * from public.admin_list_offer_reports()$$, 'P0001', 'forbidden', 'signalements : aal2 exigé');
select is((select count(*)::int from public.offer_reports), 0, 'admin aal1 : signalements illisibles');
select pg_temp.login(pg_temp.uid(1), 'aal2');
select ok((public.admin_emploi_stats() ->> 'candidates_total')::int >= 3, 'stats emploi');
select is((select count(*)::int from public.offers where id = current_setting('t.draft')::uuid), 1,
  'admin aal2 : compte les brouillons en direct');
select ok((select count(*) from public.companies where status = 'pending') >= 1 and (select count(id) from public.offer_reports) >= 1,
  'admin aal2 : compte les entreprises en attente et les signalements en direct');
select is((select count(*)::int from public.admin_list_offer_reports() r where r -> 'offer' ->> 'id' = current_setting('t.offer')), 1,
  'signalement dans la file');
select lives_ok($$select public.admin_update_settings('{"offer_lifetime_days": 45, "offer_banned_words": ["Jeune Diplômé"]}'::jsonb)$$,
  'réglages emploi');
select throws_ok($$select public.admin_update_settings('{"apply_daily_quota": 0}'::jsonb)$$, 'P0001', 'invalid_value', 'bornes');

select * from finish();
rollback;

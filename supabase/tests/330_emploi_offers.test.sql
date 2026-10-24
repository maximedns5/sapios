-- Sapios Emploi : offres et entreprises. Inscription par SIREN, brouillon, contrôles avant vérification
-- (salaire obligatoire, 3 missions, photo du lieu de travail réel, accord des personnes visibles,
-- justification d'une langue exigée, mots interdits), modération des photos et publication par un admin
-- en double authentification, clôture.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(57);

do $$
begin
  perform pg_temp.new_user(1);
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_recruiter(10);
  perform pg_temp.new_candidate(30);
  perform set_config('t.siren1', pg_temp.siren(1), true);
  perform set_config('t.siren2', pg_temp.siren(2), true);
  perform set_config('t.siren3', pg_temp.siren(3), true);
end;
$$;

-- Inscription de l'entreprise ----------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(30), 'aal1');
select throws_ok($$select public.register_company(current_setting('t.siren1'), 'X', 'RH', '{}'::jsonb)$$, 'P0001', 'not_recruiter',
  'un candidat ne crée pas d''entreprise');
select pg_temp.login(pg_temp.uid(10), 'aal1');
select throws_ok($$select public.register_company('123456789', 'Test', 'RH', '{}'::jsonb)$$, 'P0001', 'invalid_siren',
  'clé de Luhn vérifiée');
select throws_ok($$select public.register_company(current_setting('t.siren1'), 'Test', 'R', '{}'::jsonb)$$, 'P0001', 'invalid_input',
  'fonction trop courte');
select ok(public.register_company(current_setting('t.siren1'), 'Maison Test', 'Responsable RH',
  '{"legal_name": "MAISON TEST SAS", "naf_code": "35.11Z", "city": "Paris", "postcode": "75011"}'::jsonb, 'Thomas') is not null,
  'entreprise inscrite');
select throws_ok($$select public.register_company(current_setting('t.siren2'), 'Autre', 'RH', '{}'::jsonb)$$, 'P0001', 'already_member',
  'une seule entreprise par recruteur');
select set_config('t.company', (select company_id::text from public.company_members where user_id = pg_temp.uid(10)), true);
select is(public.get_my_company() -> 'company' ->> 'status', 'pending', 'en attente de vérification');
select is(public.get_my_company() -> 'company' ->> 'legal_name', 'MAISON TEST SAS', 'raison sociale de l''instantané Sirene');
select is(public.get_my_company() -> 'me' ->> 'first_name', 'Thomas', 'prénom du recruteur');
select is(public.get_my_company() -> 'company' ->> 'email_domain', 'sapios.test', 'domaine de l''email du compte');
select throws_ok($$select email_domain from public.companies$$, '42501', null, 'colonnes internes illisibles en direct');

select pg_temp.logout();
select pg_temp.new_recruiter(11);
select pg_temp.login(pg_temp.uid(11), 'aal1');
select throws_ok($$select public.register_company(current_setting('t.siren1'), 'Copie', 'RH', '{}'::jsonb)$$, 'P0001', 'company_exists',
  'SIREN déjà inscrit');
select pg_temp.logout();
update public.app_settings set value = '["sapios.test"]' where key = 'generic_email_domains';
select pg_temp.login(pg_temp.uid(11), 'aal1');
select lives_ok($$select public.register_company(current_setting('t.siren3'), 'Générique', 'RH', '{}'::jsonb)$$, 'domaine générique accepté');
select pg_temp.logout();
select is((select email_domain_generic from public.companies where siren = current_setting('t.siren3')), true,
  'domaine générique signalé pour la revue');

-- Brouillon et contrôles ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select throws_ok($$select public.save_offer(null, '{"contract": "cdi"}'::jsonb)$$, 'P0001', 'invalid_input',
  'un brouillon a un titre');
select throws_ok($$select public.save_offer(null, '{"title": "Analyste", "bonus": 1}'::jsonb)$$, 'P0001', 'invalid_input',
  'clé inconnue refusée');
select throws_ok($$select public.save_offer(null, '{"title": "Analyste", "salary_min_k": 50, "salary_max_k": 40}'::jsonb)$$,
  'P0001', 'invalid_input', 'minimum supérieur au maximum refusé');
select throws_ok($$select public.save_offer(null, '{"title": "Analyste", "contract": "stage"}'::jsonb)$$, 'P0001', 'invalid_input',
  'stage hors du pilote');
select throws_ok($$select public.save_offer(null, '{"title": "Analyste", "response_days": 5}'::jsonb)$$, 'P0001', 'invalid_input',
  'délai de réponse 3, 7 ou 10 jours');
select ok(public.save_offer(null, '{"title": "Brouillon minimal", "missions": ["", "Une seule mission"], "must_have": []}'::jsonb)
  is not null, 'brouillon incomplet accepté (sans salaire, une mission, aucun critère)');
select set_config('t.offer', public.save_offer(null, '{"title": "Data analyst junior", "must_have": ["Anglais courant", "SQL"],
  "missions": ["Suivre la production", "Construire les tableaux de bord"]}'::jsonb)::text, true);
select is(public.submit_offer(current_setting('t.offer')::uuid) -> 'missing',
  '["company_not_verified", "location", "salary", "missions", "workplace_photo", "language_justification"]'::jsonb,
  'contrôles : tout ce qui manque');
select is((select status::text from public.offers where id = current_setting('t.offer')::uuid), 'draft', 'reste en brouillon');

select lives_ok($$select public.save_offer(current_setting('t.offer')::uuid, '{"city": "Paris 11e", "lat": 48.854, "lng": 2.373,
  "salary_min_k": 42, "salary_max_k": 48, "missions": ["Suivre la production", "Construire les tableaux de bord",
  "Tester des prévisions"], "language_justification": "Réunions chaque semaine avec le turbinier danois.",
  "team_description": "Équipe jeune et dynamique"}'::jsonb)$$, 'brouillon complété');

-- Photos : membre seulement, offre modifiable, accord pour les personnes visibles.
select lives_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'workplace',
          current_setting('t.company') || '/plateau.jpg')$$, 'photo du lieu de travail ajoutée');
select throws_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'team', current_setting('t.company') || '/equipe.jpg')$$,
  '23514', null, 'photo d''équipe sans accord certifié refusée');
select throws_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path, moderation)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'tools', current_setting('t.company') || '/a.jpg', 'approved')$$,
  '42501', null, 'la modération n''est pas écrite par le client');
select throws_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'area', 'autre-dossier/a.jpg')$$,
  '23514', null, 'chemin hors du dossier de l''entreprise refusé');
select lives_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path, consent_certified)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'team', current_setting('t.company') || '/equipe.jpg', true)$$,
  'photo d''équipe avec accord certifié');

select is(public.submit_offer(current_setting('t.offer')::uuid) -> 'missing', '["company_not_verified", "banned_words"]'::jsonb,
  'mot interdit repéré (« jeune et dynamique »)');
select lives_ok($$select public.save_offer(current_setting('t.offer')::uuid, '{"team_description": "Six personnes, côté cour."}'::jsonb)$$,
  'texte corrigé');

-- Un autre recruteur ne touche pas à l'offre.
select pg_temp.login(pg_temp.uid(11), 'aal1');
select throws_ok($$select public.save_offer(current_setting('t.offer')::uuid, '{"title": "Piraté"}'::jsonb)$$, 'P0001', 'not_found',
  'autre entreprise : offre introuvable');
select throws_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'workplace', current_setting('t.company') || '/x.jpg')$$,
  '42501', null, 'autre entreprise : pas de photo sur cette offre');

-- Vérification de l'entreprise par un admin --------------------------------------------------------
select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select public.admin_decide_company(current_setting('t.company')::uuid, 'verify')$$, 'P0001', 'forbidden',
  'admin sans double authentification refusé');
select pg_temp.login(pg_temp.uid(1), 'aal2');
select ok((select count(*) from public.admin_list_companies()) >= 2, 'file des entreprises');
select throws_ok($$select public.admin_decide_company(current_setting('t.company')::uuid, 'reject')$$, 'P0001', 'reason_required',
  'refus motivé');
select throws_ok($$select public.admin_decide_company(current_setting('t.company')::uuid, 'maybe')$$, 'P0001', 'invalid_decision',
  'décision inconnue');
select lives_ok($$select public.admin_decide_company(current_setting('t.company')::uuid, 'verify')$$, 'entreprise vérifiée');
select pg_temp.logout();
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(10) and kind = 'company_verified'), 1,
  'avis au recruteur');
select is((select count(*)::int from public.audit_log where action = 'company.decide'), 1, 'décision journalisée');

-- Soumission et modération de l'offre ---------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.submit_offer(current_setting('t.offer')::uuid), '{"ok": true, "missing": []}'::jsonb, 'offre envoyée en vérification');
select throws_ok($$select public.save_offer(current_setting('t.offer')::uuid, '{"title": "Changé"}'::jsonb)$$, 'P0001', 'not_editable',
  'plus modifiable en vérification');
delete from public.offer_photos where offer_id = current_setting('t.offer')::uuid;
select is((select count(*)::int from public.offer_photos where offer_id = current_setting('t.offer')::uuid), 2,
  'photos figées pendant la vérification');

select pg_temp.login(pg_temp.uid(1), 'aal2');
select is((select count(*)::int from public.admin_list_offers_to_review() r where r -> 'offer' ->> 'id' = current_setting('t.offer')), 1,
  'offre dans la file de modération');
select throws_ok($$select public.admin_decide_offer(current_setting('t.offer')::uuid, 'publish')$$, 'P0001', 'photos_pending',
  'photos à modérer d''abord');
select lives_ok($$select public.admin_moderate_photo(id, 'reject', 'Banque d''images') from public.offer_photos
                   where offer_id = current_setting('t.offer')::uuid and kind = 'workplace'$$, 'photo du lieu refusée');
select lives_ok($$select public.admin_moderate_photo(id, 'approve') from public.offer_photos
                   where offer_id = current_setting('t.offer')::uuid and kind = 'team'$$, 'photo d''équipe approuvée');
select throws_ok($$select public.admin_decide_offer(current_setting('t.offer')::uuid, 'publish')$$, 'P0001', 'photo_required',
  'une photo du lieu de travail approuvée est obligatoire');
select throws_ok($$select public.admin_decide_offer(current_setting('t.offer')::uuid, 'reject')$$, 'P0001', 'reason_required',
  'refus d''offre motivé');
select lives_ok($$select public.admin_decide_offer(current_setting('t.offer')::uuid, 'reject', 'Photo du lieu à refaire')$$,
  'offre refusée');

select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.get_offer_for_edit(current_setting('t.offer')::uuid) ->> 'status_reason', 'Photo du lieu à refaire',
  'le recruteur voit le motif');
select lives_ok($$insert into public.offer_photos (offer_id, company_id, kind, storage_path)
  values (current_setting('t.offer')::uuid, current_setting('t.company')::uuid, 'workplace', current_setting('t.company') || '/vrai.jpg')$$,
  'nouvelle photo après refus');
select is(public.submit_offer(current_setting('t.offer')::uuid) ->> 'ok', 'true', 'nouvelle soumission');

select pg_temp.login(pg_temp.uid(1), 'aal2');
select lives_ok($$select public.admin_moderate_photo(id, 'approve') from public.offer_photos
                   where offer_id = current_setting('t.offer')::uuid and moderation = 'pending'$$, 'photo approuvée');
select lives_ok($$select public.admin_decide_offer(current_setting('t.offer')::uuid, 'publish')$$, 'offre publiée');
select ok((select expires_at between now() + interval '59 days' and now() + interval '61 days'
             from public.offers where id = current_setting('t.offer')::uuid), 'expire dans 60 jours');

-- Clôture : les candidatures en attente reçoivent une réponse.
select pg_temp.logout();
update public.candidates set search_location = pg_temp.point(48.854, 2.373) where user_id = pg_temp.uid(30);
select pg_temp.login(pg_temp.uid(30), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'un candidat postule');
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.close_offer(current_setting('t.offer')::uuid, 'filled'), 1, 'poste pourvu : une réponse envoyée');
select pg_temp.logout();
select is((select refusal_reason::text from public.applications where candidate_id = pg_temp.uid(30)), 'position_filled',
  'motif poste pourvu');

select * from finish();
rollback;

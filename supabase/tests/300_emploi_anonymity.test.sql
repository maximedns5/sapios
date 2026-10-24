-- Sapios Emploi, décision E9 et contrat §7 : avant le match, un recruteur ne peut obtenir ni le prénom,
-- ni le nom, ni l'email du candidat, ni aucune donnée de candidate_identities, par aucune RPC ni
-- lecture directe. Après « Intéressé », il obtient le prénom et le nom, rien d'autre.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(42);

do $$
declare
  v_company uuid;
  v_other uuid;
  v_offer uuid;
begin
  perform pg_temp.new_candidate(1, '{SQL,Python,Excel,Anglais}', 7, p_open => true,
                                p_first => 'Zéphirine', p_last => 'Quincampoix');
  v_company := pg_temp.new_company(10);
  v_other := pg_temp.new_company(20);
  v_offer := pg_temp.new_offer(v_company, 'Data analyst');
  perform set_config('test.company', v_company::text, true);
  perform set_config('test.other', v_other::text, true);
  perform set_config('test.offer', v_offer::text, true);
  perform set_config('test.offer2', pg_temp.new_offer(v_other, 'Analyste pricing')::text, true);
  update public.cv_experiences set employer_hidden = true where user_id = pg_temp.uid(1);
  insert into public.cv_experiences (user_id, position, title, employer, employer_hidden, start_month, end_month)
  values (pg_temp.uid(1), 0, 'Analyste', 'Employeur Secret', true, '2024-01-01', null);
end;
$$;

-- Candidate : postule avec un mot.
select pg_temp.login(pg_temp.uid(1), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('test.offer')::uuid, 'Bonjour', 'mission:0')$$,
  'candidate : postule');
select pg_temp.logout();
select set_config('test.app', (select a.id::text from public.applications a where a.candidate_id = pg_temp.uid(1)), true);

-- Recruteur de l'entreprise, avant le match ---------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');

-- Lectures directes.
select throws_ok($$select * from public.candidate_identities$$, '42501', null,
  'recruteur : candidate_identities illisible (aucun droit)');
select is((select count(*)::int from public.candidates), 0, 'recruteur : aucune ligne de candidates');
select is((select count(*)::int from public.cv_experiences), 0, 'recruteur : aucune expérience lisible directement');
select is((select count(*)::int from public.cv_skills), 0, 'recruteur : aucune compétence lisible directement');
select is((select count(*)::int from public.cv_languages), 0, 'recruteur : aucune langue lisible directement');
select is((select count(*)::int from public.emploi_accounts where user_id = pg_temp.uid(1)), 0,
  'recruteur : type de compte du candidat illisible');
select is((select count(*)::int from public.applications), 1, 'recruteur : voit la candidature reçue');
select throws_ok($$select candidate_id from public.applications$$, '42501', null,
  'recruteur : candidate_id illisible (droit par colonne)');
select is((select count(*)::int from public.application_messages), 0, 'recruteur : aucun message avant le match');

-- Tout ce que renvoient les RPC recruteur, concaténé : aucune trace de l'identité.
create temp table out_before (body text) on commit drop;
grant all on out_before to authenticated;
insert into out_before select p::text from public.get_offer_pile(current_setting('test.offer')::uuid) p;
insert into out_before select p::text from public.list_offer_applications(current_setting('test.offer')::uuid) p;
insert into out_before select public.get_recruiter_application(current_setting('test.app')::uuid)::text;
insert into out_before select c::text from public.get_my_conversations() c;
insert into out_before select c::text from public.search_open_candidates(current_setting('test.offer')::uuid) c;
insert into out_before select public.get_my_company()::text;
insert into out_before select public.export_my_emploi_data()::text;
insert into out_before select public.get_emploi_state()::text;
insert into out_before select o::text from public.list_company_offers() o;

select is((select count(*)::int from out_before where body ilike '%Zéphirine%' or body ilike '%Zephirine%'), 0,
  'avant le match : le prénom n''apparaît dans aucune réponse');
select is((select count(*)::int from out_before where body ilike '%Quincampoix%'), 0,
  'avant le match : le nom n''apparaît dans aucune réponse');
select is((select count(*)::int from out_before where body ilike '%pgtap-1@%'), 0,
  'avant le match : l''email n''apparaît dans aucune réponse');
select is((select count(*)::int from out_before where body ilike '%Employeur Secret%'), 0,
  'avant le match : un employeur masqué reste masqué');
select is((select count(*)::int from out_before where body ilike '%' || pg_temp.uid(1)::text || '%'), 0,
  'avant le match : l''identifiant du compte candidat n''est renvoyé par aucune RPC');
select ok((select count(*) from out_before where body like '%"number"%') >= 3, 'les réponses portent le numéro du candidat');

select is(public.get_recruiter_application(current_setting('test.app')::uuid) -> 'identity', 'null'::jsonb,
  'get_recruiter_application : identity null avant le match');
select is((select p ->> 'name' from public.list_offer_applications(current_setting('test.offer')::uuid) p), null,
  'list_offer_applications : name null avant le match');
select ok(not (public.get_recruiter_application(current_setting('test.app')::uuid) -> 'application' -> 'cv'
               ?| array['first_name', 'last_name', 'email', 'birthdate', 'age', 'gender', 'address', 'photo']),
  'CV anonyme : aucune clé d''identité');
select is(jsonb_typeof(public.get_recruiter_application(current_setting('test.app')::uuid) -> 'application' -> 'cv' -> 'experiences' -> 0 -> 'months'),
  'number', 'CV anonyme : durée en mois');
select ok(not (public.get_recruiter_application(current_setting('test.app')::uuid) -> 'application' -> 'cv' -> 'experiences' -> 0
               ?| array['start_month', 'end_month']), 'CV anonyme : jamais les dates des expériences');
select is(public.get_recruiter_application(current_setting('test.app')::uuid) -> 'application' -> 'cv' -> 'diploma' -> 'institution',
  'null'::jsonb, 'CV anonyme : établissement masqué par défaut');
select throws_ok($$select * from public.get_application_messages(current_setting('test.app')::uuid)$$, 'P0001', 'not_matched',
  'messagerie fermée avant le match');
select throws_ok($$select public.send_application_message(current_setting('test.app')::uuid, 'Bonjour')$$, 'P0001', 'not_matched',
  'envoi impossible avant le match');
select throws_ok($$select public.emploi_requirement_matches(current_setting('test.offer')::uuid, gen_random_uuid())$$,
  '42501', null, 'emploi_requirement_matches réservée au serveur');
select throws_ok($$select public.server_emploi_notification('application_interested', current_setting('test.app')::uuid)$$,
  '42501', null, 'server_emploi_notification réservée au serveur');
select throws_ok($$select private.candidate_identity_json(pg_temp.uid(1))$$, '42501', null,
  'fonction interne d''identité non exécutable');

-- Recruteur d'une autre entreprise : rien du tout.
select pg_temp.login(pg_temp.uid(20), 'aal1');
select is((select count(*)::int from public.applications), 0, 'autre entreprise : candidature invisible');
select throws_ok($$select public.get_recruiter_application(current_setting('test.app')::uuid)$$, 'P0001', 'not_found',
  'autre entreprise : candidature introuvable');
select throws_ok($$select public.decide_application(current_setting('test.app')::uuid, 'interested')$$, 'P0001', 'not_found',
  'autre entreprise : ne peut pas décider');
select throws_ok($$select * from public.get_offer_pile(current_setting('test.offer')::uuid)$$, 'P0001', 'not_found',
  'autre entreprise : pile d''une autre offre introuvable');

-- Un candidat ne lit pas l'identité d'un autre candidat.
select pg_temp.logout();
select pg_temp.new_candidate(2);
select pg_temp.login(pg_temp.uid(2), 'aal1');
select is(public.get_my_candidate_identity() ->> 'first_name', 'Prenomtest2', 'candidat : lit sa propre identité');
select is((select count(*)::int from public.candidates where user_id = pg_temp.uid(1)), 0,
  'candidat : profil d''un autre candidat illisible');
select is((select count(id)::int from public.applications), 0,
  'candidat : candidatures d''un autre illisibles');

-- Match : « Intéressé » révèle le prénom et le nom, et ouvre la messagerie ------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.decide_application(current_setting('test.app')::uuid, 'interested') -> 'identity',
  jsonb_build_object('first_name', 'Zéphirine', 'last_name', 'Quincampoix'), 'match : identité renvoyée au recruteur');
select is(public.get_recruiter_application(current_setting('test.app')::uuid) -> 'identity' ->> 'last_name', 'Quincampoix',
  'après le match : identité dans la fiche');
select is((select p ->> 'name' from public.list_offer_applications(current_setting('test.offer')::uuid) p),
  'Zéphirine Quincampoix', 'après le match : nom dans le suivi');
select ok(public.get_recruiter_application(current_setting('test.app')::uuid)::text not ilike '%pgtap-1@%',
  'après le match : toujours pas d''email');
select lives_ok($$select public.send_application_message(current_setting('test.app')::uuid, 'Bonjour, merci pour votre candidature.')$$,
  'après le match : le recruteur écrit');
select is((select count(*)::int from public.application_messages), 1, 'après le match : le message est lisible');
select throws_ok($$select * from public.candidate_identities$$, '42501', null,
  'après le match : la table reste illisible directement');

-- L'autre entreprise ne voit toujours rien.
select pg_temp.login(pg_temp.uid(20), 'aal1');
select is((select count(*)::int from public.application_messages), 0, 'autre entreprise : messages invisibles');

select * from finish();
rollback;

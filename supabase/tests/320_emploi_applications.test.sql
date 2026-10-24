-- Sapios Emploi : cycle d'une candidature. Postuler, réponse humaine (« Intéressé » ou refus motivé),
-- échéance sans réponse (close, jamais refusée, décision E10), entretien, messagerie, retrait.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(55);

do $$
declare
  v_company uuid := pg_temp.new_company(10);
begin
  perform pg_temp.new_candidate(1);
  perform pg_temp.new_candidate(2);
  perform set_config('t.company', v_company::text, true);
  perform set_config('t.offer', pg_temp.new_offer(v_company, 'Analyste', p_response_days => 3)::text, true);
  perform set_config('t.offer2', pg_temp.new_offer(v_company, 'Analyste 2')::text, true);
  perform set_config('t.offer3', pg_temp.new_offer(v_company, 'Analyste 3')::text, true);
  perform set_config('t.draft', pg_temp.new_offer(v_company, 'Brouillon', p_status => 'draft')::text, true);
end;
$$;

-- Postuler -------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select public.apply_offer(current_setting('t.offer')::uuid, repeat('x', 141))$$, 'P0001', 'note_too_long',
  'mot de plus de 140 caractères refusé');
select throws_ok($$select public.apply_offer(current_setting('t.offer')::uuid, 'Bonjour', 'mission:7')$$, 'P0001', 'invalid_target',
  'point inexistant refusé');
select throws_ok($$select public.apply_offer(current_setting('t.draft')::uuid)$$, 'P0001', 'not_found',
  'offre non publiée introuvable');
select ok((public.apply_offer(current_setting('t.offer')::uuid, 'Les prévisions, c''est mon sujet.', 'mission:1')
           ->> 'application_id') is not null, 'candidature envoyée');
select throws_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'P0001', 'already_applied',
  'une seule candidature par offre');
select set_config('t.app', (select id::text from public.applications where offer_id = current_setting('t.offer')::uuid), true);
select is((select note_target_label from public.applications where id = current_setting('t.app')::uuid), 'Mission deux',
  'le point visé est recopié');
select ok((select due_at between now() + interval '3 days' - interval '1 minute' and now() + interval '3 days' + interval '1 minute'
             from public.applications where id = current_setting('t.app')::uuid), 'échéance = délai de réponse de l''offre');
select is((select status::text from public.applications where id = current_setting('t.app')::uuid), 'sent', 'statut envoyée');
select is((select count(*)::int from public.get_my_applications()), 1, 'get_my_applications');
select is(public.get_my_application(current_setting('t.app')::uuid) ->> 'recruiter', null,
  'interlocuteur inconnu avant le match');

-- Conditions non acceptées.
select pg_temp.logout();
delete from public.terms_acceptances where user_id = pg_temp.uid(2);
select pg_temp.login(pg_temp.uid(2), 'aal1');
select throws_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'P0001', 'terms_required',
  'CGU non acceptées : candidature refusée');
select throws_ok($$select public.accept_emploi_terms('cgr-emploi-2026-11-brouillon')$$, 'P0001', 'terms_version_mismatch',
  'un candidat ne peut pas accepter la version recruteur');
select lives_ok($$select public.accept_emploi_terms('cgu-emploi-2026-11-brouillon')$$, 'acceptation des CGU candidats');

-- Quota quotidien.
select pg_temp.logout();
update public.app_settings set value = '1' where key = 'apply_daily_quota';
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer2')::uuid)$$, 'première candidature du jour');
select throws_ok($$select public.apply_offer(current_setting('t.offer3')::uuid)$$, 'P0001', 'rate_limited',
  'quota quotidien atteint');
select pg_temp.logout();
update public.app_settings set value = '30' where key = 'apply_daily_quota';

-- Recruteur : vue, refus motivé ----------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select lives_ok($$select public.mark_application_seen(current_setting('t.app')::uuid)$$, 'marquer vue');
select is((select status::text from public.applications where id = current_setting('t.app')::uuid), 'seen', 'statut vue');
select set_config('t.app2', (select id::text from public.applications where offer_id = current_setting('t.offer2')::uuid), true);
select throws_ok($$select public.decide_application(current_setting('t.app2')::uuid, 'rejected')$$, 'P0001', 'reason_required',
  'refus sans motif impossible');
select throws_ok($$select public.decide_application(current_setting('t.app2')::uuid, 'rejected', 'skills', 'Non.')$$,
  'P0001', 'message_required', 'refus sans vrai message impossible');
select is(public.decide_application(current_setting('t.app2')::uuid, 'rejected', 'skills',
            'Merci pour votre candidature, nous cherchons un profil plus orienté finance.') ->> 'status',
  'rejected', 'refus motivé');
select throws_ok($$select public.decide_application(current_setting('t.app2')::uuid, 'interested')$$, 'P0001', 'invalid_status',
  'décision unique');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(2) and kind = 'application_rejected'), 0,
  'les avis du candidat restent illisibles pour le recruteur');
select pg_temp.logout();
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(2) and kind = 'application_rejected'), 1,
  'avis de refus au candidat');

-- Échéance : close, jamais refusée ----------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer3')::uuid)$$, 'candidature qui va expirer');
select pg_temp.logout();
select set_config('t.app3', (select id::text from public.applications where offer_id = current_setting('t.offer3')::uuid), true);
update public.applications set due_at = now() - interval '1 minute' where id = current_setting('t.app3')::uuid;
select is((private.close_overdue_applications() ->> 'closed_no_response')::int >= 1, true, 'la tâche clôt les échéances passées');
select is((select status::text from public.applications where id = current_setting('t.app3')::uuid), 'closed_no_response',
  'statut close sans réponse');
select is((select refusal_reason from public.applications where id = current_setting('t.app3')::uuid), null,
  'aucun motif de refus inventé');
select is((select count(*)::int from public.applications where status = 'rejected' and refusal_reason is null), 0,
  'aucun refus sans motif en base');
select is((select count(*)::int from public.member_notices where user_id = pg_temp.uid(2) and kind = 'application_closed'), 1,
  'avis de clôture au candidat');
select is((select status::text from public.applications where id = current_setting('t.app')::uuid), 'seen',
  'une candidature dans les temps n''est pas touchée');
update public.offers set expires_at = now() - interval '1 minute' where id = current_setting('t.offer3')::uuid;
select is((private.close_overdue_applications() ->> 'offers_expired')::int, 1, 'offre échue passée expirée');

-- Match, entretien, messagerie --------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.decide_application(current_setting('t.app')::uuid, 'interested') ->> 'status', 'interested', 'intéressé');
select throws_ok($$select public.propose_interview_slots(current_setting('t.app')::uuid, '[]'::jsonb)$$, 'P0001', 'invalid_input',
  'au moins un créneau');
select throws_ok($$select public.propose_interview_slots(current_setting('t.app')::uuid,
                    jsonb_build_array(jsonb_build_object('starts_at', now() - interval '1 day')))$$, 'P0001', 'invalid_input',
  'pas de créneau dans le passé');
select is(public.propose_interview_slots(current_setting('t.app')::uuid, jsonb_build_array(
  jsonb_build_object('starts_at', now() + interval '3 days', 'mode', 'onsite', 'location', '1 rue Test', 'with_whom', 'Inès'),
  jsonb_build_object('starts_at', now() + interval '4 days', 'mode', 'visio'))), 2, 'deux créneaux proposés');
select throws_ok($$select public.move_application(current_setting('t.app')::uuid, 'interested')$$, 'P0001', 'invalid_transition',
  'pas de retour en arrière');

select pg_temp.login(pg_temp.uid(1), 'aal1');
select is((public.get_my_application(current_setting('t.app')::uuid) -> 'recruiter' ->> 'first_name'), 'Recruteur10',
  'après le match : prénom du recruteur');
select is((select (a ->> 'slots_to_answer')::int from public.get_my_applications() a where a ->> 'id' = current_setting('t.app')),
  2, 'deux créneaux à choisir');
select lives_ok($$select public.accept_interview_slot((select s.id from public.interview_slots s
                    where s.application_id = current_setting('t.app')::uuid order by s.starts_at limit 1))$$,
  'le candidat choisit un créneau');
select is((select status::text from public.applications where id = current_setting('t.app')::uuid), 'interview',
  'statut entretien');
select is((select array_agg(status::text order by starts_at) from public.interview_slots
            where application_id = current_setting('t.app')::uuid), array['accepted', 'declined'],
  'l''autre créneau est décliné');
select lives_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Merci, à jeudi.')$$,
  'le candidat écrit');
select is((select count(*)::int from public.get_my_conversations()), 1, 'une conversation');

select pg_temp.login(pg_temp.uid(10), 'aal1');
select is((public.get_recruiter_application(current_setting('t.app')::uuid) ->> 'unread_messages')::int, 1,
  'un message non lu côté entreprise');
select is((select bool_and(not (m ->> 'mine')::boolean) from public.get_application_messages(current_setting('t.app')::uuid) m),
  true, 'le message du candidat n''est pas « à moi » côté entreprise');
select is((public.get_recruiter_application(current_setting('t.app')::uuid) ->> 'unread_messages')::int, 0,
  'lu après ouverture');
select throws_ok($$select public.decide_application(current_setting('t.app')::uuid, 'interested')$$, 'P0001', 'invalid_status',
  '« Intéressé » une seule fois');
select lives_ok($$select public.move_application(current_setting('t.app')::uuid, 'hired')$$, 'embauche');
select throws_ok($$select public.decide_application(current_setting('t.app')::uuid, 'rejected', 'other',
  'Message de refus suffisamment long.')$$, 'P0001', 'invalid_status', 'pas de refus après l''embauche');

-- Refus après le match : motif et message exigés, créneaux annulés.
select pg_temp.logout();
select set_config('t.offer4', pg_temp.new_offer(current_setting('t.company')::uuid, 'Analyste 4')::text, true);
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer4')::uuid)$$, 'candidature qui sera refusée après le match');
select pg_temp.login(pg_temp.uid(10), 'aal1');
select set_config('t.app4', (select id::text from public.applications where offer_id = current_setting('t.offer4')::uuid), true);
select lives_ok($$select public.decide_application(current_setting('t.app4')::uuid, 'interested');
                  select public.propose_interview_slots(current_setting('t.app4')::uuid,
                    jsonb_build_array(jsonb_build_object('starts_at', now() + interval '2 days')))$$, 'match et créneau');
select throws_ok($$select public.decide_application(current_setting('t.app4')::uuid, 'rejected')$$, 'P0001', 'reason_required',
  'refus après le match : motif exigé');
select is(public.decide_application(current_setting('t.app4')::uuid, 'rejected', 'other_profile',
            'Merci pour l''échange, nous avons retenu un autre profil.') ->> 'status', 'rejected', 'refus après le match');
select is((select status::text from public.interview_slots where application_id = current_setting('t.app4')::uuid), 'cancelled',
  'créneau annulé');

-- Retrait.
select pg_temp.login(pg_temp.uid(1), 'aal1');
select throws_ok($$select public.withdraw_application(current_setting('t.app')::uuid)$$, 'P0001', 'invalid_status',
  'une embauche ne se retire pas');

select * from finish();
rollback;

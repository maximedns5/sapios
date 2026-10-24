-- Sapios Emploi : quotas, conservation, export RGPD, suppression de compte, données des notifications
-- (Edge Function notify) et file des diplômes pour un candidat sans profil de rencontre.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(37);

do $$
declare
  v_company uuid := pg_temp.new_company(10);
  v_offer uuid;
begin
  perform pg_temp.new_user(1);
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_candidate(2, p_open => true, p_first => 'Aurore', p_last => 'Valdès');
  perform pg_temp.new_candidate(3, p_open => true);
  perform pg_temp.new_candidate(4, p_open => true);
  v_offer := pg_temp.new_offer(v_company);
  perform set_config('t.company', v_company::text, true);
  perform set_config('t.offer', v_offer::text, true);
  perform set_config('t.num3', (select number::text from public.candidates where user_id = pg_temp.uid(3)), true);
  perform set_config('t.num4', (select number::text from public.candidates where user_id = pg_temp.uid(4)), true);
  update public.app_settings set value = '1' where key = 'invitation_weekly_quota';
end;
$$;

-- Quota d'invitations ---------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select lives_ok($$select public.invite_candidate(current_setting('t.offer')::uuid, current_setting('t.num3')::int, 'Bonjour')$$,
  'première invitation de la semaine');
select throws_ok($$select public.invite_candidate(current_setting('t.offer')::uuid, current_setting('t.num4')::int, 'Bonjour')$$,
  'P0001', 'quota_exceeded', 'quota hebdomadaire atteint');

-- Invitation : accepter ne postule pas, postuler marque l'invitation.
select pg_temp.login(pg_temp.uid(3), 'aal1');
select is((select count(*)::int from public.get_my_invitations()), 1, 'invitation reçue');
select is((public.get_emploi_state() -> 'counts' ->> 'invitations_pending')::int, 1, 'compteur d''invitations');
select is(public.respond_invitation((select (i ->> 'id')::uuid from public.get_my_invitations() i), true) ->> 'offer_id',
  current_setting('t.offer'), 'accepter renvoie l''offre');
select is((select count(*)::int from public.applications), 0, 'accepter ne postule pas');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid)$$, 'postule depuis l''invitation');
select is((select invited from public.applications where offer_id = current_setting('t.offer')::uuid), true, 'candidature invitée');
select is((select (i ->> 'status') from public.get_my_invitations() i), 'applied', 'invitation passée « postulé »');

-- Données des notifications -----------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid, 'Bonjour')$$, 'Aurore postule');
select pg_temp.logout();
select set_config('t.app', (select a.id::text from public.applications a where a.candidate_id = pg_temp.uid(2)), true);
select pg_temp.login_service();
select is(public.server_emploi_notification('application_interested', current_setting('t.app')::uuid), null,
  'notification périmée (pas encore de match) : rien à envoyer');
select pg_temp.login(pg_temp.uid(10), 'aal1');
select lives_ok($$select public.decide_application(current_setting('t.app')::uuid, 'interested')$$, 'match');
select pg_temp.login_service();
select is(public.server_emploi_notification('application_interested', current_setting('t.app')::uuid) -> 'recipients' -> 0 ->> 'name',
  'Aurore', 'destinataire : la candidate, par son prénom');
select is(public.server_emploi_notification('application_interested', current_setting('t.app')::uuid) ->> 'path',
  '/applications/' || current_setting('t.app'), 'lien vers la candidature');
select is(public.server_emploi_notification('application_rejected', current_setting('t.app')::uuid), null,
  'pas de refus annoncé pour une candidature appariée');
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Merci !')$$, 'message de la candidate');
select pg_temp.login_service();
select is(public.server_emploi_notification('message', (select id from public.application_messages where application_id = current_setting('t.app')::uuid)) ->> 'audience',
  'recruiter', 'message du candidat : vers l''entreprise');
select is(public.server_emploi_notification('message', (select id from public.application_messages where application_id = current_setting('t.app')::uuid)) -> 'vars' ->> 'candidate',
  'Aurore Valdès', 'après le match : nom du candidat dans le texte');
select is(public.server_emploi_notification('deadline_reminder', current_setting('t.company')::uuid) -> 'vars' ->> 'count', null,
  'rappel : rien sans échéance sous 48 h') ;
select is(public.server_emploi_notification('diploma_verdict', pg_temp.uid(1)), null,
  'verdict : texte de l''emploi seulement pour un compte emploi');
select is(public.server_emploi_notification('diploma_verdict', pg_temp.uid(2)) ->> 'event', 'diploma_verdict',
  'verdict d''un compte emploi');

-- Conservation : contenu effacé, statut gardé ---------------------------------------------------------
select pg_temp.logout();
update public.applications set status = 'rejected', refusal_reason = 'other', refusal_message = 'Message de refus assez long.',
       closed_at = now() - interval '200 days' where id = current_setting('t.app')::uuid;
insert into public.application_notes (application_id, author_id, body) values (current_setting('t.app')::uuid, pg_temp.uid(10), 'Note');
select ok((private.run_retention() -> 'emploi' ->> 'applications')::int >= 1, 'conservation : candidature purgée');
select is((select note from public.applications where id = current_setting('t.app')::uuid), null, 'mot effacé');
select is((select count(*)::int from public.application_messages where application_id = current_setting('t.app')::uuid), 0,
  'messages effacés');
select is((select count(*)::int from public.application_notes where application_id = current_setting('t.app')::uuid), 0,
  'notes effacées');
select is((select status::text from public.applications where id = current_setting('t.app')::uuid), 'rejected', 'statut gardé');

-- Export RGPD ----------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3), 'aal1');
select is(public.export_my_emploi_data() -> 'identity' ->> 'last_name', 'Nomtest3', 'export : identité déchiffrée');
select is(jsonb_array_length(public.export_my_emploi_data() -> 'applications'), 1, 'export : candidatures');
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is(public.export_my_emploi_data() -> 'membership' ->> 'role', 'owner', 'export recruteur : rôle');

-- File des diplômes : identité du candidat de l'emploi --------------------------------------------------
select pg_temp.logout();
insert into public.degree_submissions (user_id, storage_path, mime, status)
values (pg_temp.uid(2), pg_temp.uid(2)::text || '/d.pdf', 'application/pdf', 'needs_review');
select pg_temp.login(pg_temp.uid(1), 'aal2');
select is((select legal_name from public.admin_list_submissions() where user_id = pg_temp.uid(2)), 'Aurore Valdès',
  'file des diplômes : nom légal du candidat');

-- Suppression de compte : le candidat disparaît, l'entreprise reste --------------------------------------
select pg_temp.login(pg_temp.uid(10), 'aal1');
select throws_ok($$select public.server_prepare_account_deletion(pg_temp.uid(10))$$, '42501', null,
  'préparation de suppression réservée au serveur');
select pg_temp.login_service();
select is((public.server_prepare_account_deletion(pg_temp.uid(10)) -> 'photo_paths' ->> 0),
  current_setting('t.company') || '/' || current_setting('t.offer') || '.jpg', 'seul membre : photos à effacer renvoyées');
select is((select status::text from public.offers where id = current_setting('t.offer')::uuid), 'archived',
  'seul membre : offre archivée');
select is((select count(*)::int from public.offer_photos where company_id = current_setting('t.company')::uuid), 0,
  'seul membre : lignes de photos effacées');
select is(public.server_prepare_account_deletion(pg_temp.uid(2)) ->> 'sole_member', 'false', 'candidat : rien à préparer');
select pg_temp.logout();
delete from auth.users where id in (pg_temp.uid(2), pg_temp.uid(10));
select is((select count(*)::int from public.candidate_identities where user_id = pg_temp.uid(2)), 0,
  'suppression : identité effacée');
select is((select count(*)::int from public.offers where id = current_setting('t.offer')::uuid), 1,
  'suppression du recruteur : l''offre reste (historique des candidats)');

select * from finish();
rollback;

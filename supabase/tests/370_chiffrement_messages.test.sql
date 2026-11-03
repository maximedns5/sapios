-- Chiffrement des messages et des notes internes (20261103090000_chiffrement_messages_notes) :
-- plus de texte en clair dans les tables, colonnes chiffrées illisibles par les clients, texte déchiffré
-- par les RPC pour les seuls participants, rien pour les admins, effacement par la conservation.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(36);

do $$
declare
  v_company uuid;
  v_offer uuid;
begin
  perform pg_temp.new_user(1);
  insert into public.admins (user_id, role) values (pg_temp.uid(1), 'owner');
  perform pg_temp.new_candidate(2, p_first => 'Aurore', p_last => 'Valdès');
  perform pg_temp.new_candidate(3);
  v_company := pg_temp.new_company(10);
  perform pg_temp.new_company(20);
  v_offer := pg_temp.new_offer(v_company);
  perform set_config('t.offer', v_offer::text, true);
end;
$$;

-- Schéma et droits ------------------------------------------------------------------------------------
select has_column('public', 'application_messages', 'body_enc', 'messages : texte chiffré');
select has_column('public', 'application_messages', 'context_enc', 'messages : point cité chiffré');
select hasnt_column('public', 'application_messages', 'body', 'messages : plus de texte en clair');
select hasnt_column('public', 'application_messages', 'context', 'messages : plus de point cité en clair');
select has_column('public', 'application_notes', 'body_enc', 'notes : texte chiffré');
select hasnt_column('public', 'application_notes', 'body', 'notes : plus de texte en clair');
select col_type_is('public', 'application_messages', 'body_enc', 'bytea', 'messages : bytea');
select col_type_is('public', 'application_notes', 'body_enc', 'bytea', 'notes : bytea');
select ok(not has_column_privilege('authenticated', 'public.application_messages', 'body_enc', 'select')
          and not has_column_privilege('authenticated', 'public.application_messages', 'context_enc', 'select')
          and not has_column_privilege('anon', 'public.application_messages', 'body_enc', 'select'),
  'messages : colonnes chiffrées illisibles par les clients');
select ok(not has_column_privilege('authenticated', 'public.application_notes', 'body_enc', 'select')
          and not has_column_privilege('anon', 'public.application_notes', 'body_enc', 'select'),
  'notes : colonne chiffrée illisible par les clients');
select ok(has_column_privilege('authenticated', 'public.application_messages', 'read_at', 'select')
          and has_column_privilege('authenticated', 'public.application_notes', 'created_at', 'select'),
  'métadonnées toujours lisibles (temps réel, compteurs)');

-- Match puis échanges ------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2), 'aal1');
select lives_ok($$select public.apply_offer(current_setting('t.offer')::uuid, 'Bonjour')$$, 'Aurore postule');
select pg_temp.logout();
select set_config('t.app', (select a.id::text from public.applications a where a.candidate_id = pg_temp.uid(2)), true);

select pg_temp.login(pg_temp.uid(10), 'aal1');
select lives_ok($$select public.decide_application(current_setting('t.app')::uuid, 'interested')$$, 'match');
select lives_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Message confidentiel recruteur',
                                                         'Point cité confidentiel')$$, 'le recruteur écrit');
select lives_ok($$select public.add_application_note(current_setting('t.app')::uuid, 'Note interne confidentielle')$$,
  'le recruteur prend une note');
select throws_ok($$select body_enc from public.application_messages$$, '42501', null,
  'recruteur : lecture directe du message chiffré refusée');
select throws_ok($$select body_enc from public.application_notes$$, '42501', null,
  'recruteur : lecture directe de la note chiffrée refusée');
select is((select count(*)::int from public.application_messages), 1, 'recruteur : métadonnées du message lisibles');
select is(public.get_recruiter_application(current_setting('t.app')::uuid) -> 'notes' -> 0 ->> 'body',
  'Note interne confidentielle', 'recruteur : note déchiffrée par la fiche');
select is((select m ->> 'body' from public.get_application_messages(current_setting('t.app')::uuid) m),
  'Message confidentiel recruteur', 'recruteur : message déchiffré');

-- En base : ni le message, ni le point cité, ni la note en clair.
select pg_temp.logout();
select ok((select bool_and(position('confidentiel' in encode(m.body_enc, 'escape')) = 0
                           and position('confidentiel' in encode(m.context_enc, 'escape')) = 0)
             from public.application_messages m where m.application_id = current_setting('t.app')::uuid),
  'message et point cité illisibles dans la table');
select ok((select bool_and(position('confidentielle' in encode(n.body_enc, 'escape')) = 0) from public.application_notes n
           where n.application_id = current_setting('t.app')::uuid),
  'note illisible dans la table');
select is((select private.decrypt_text(m.body_enc) from public.application_messages m
             where m.application_id = current_setting('t.app')::uuid), 'Message confidentiel recruteur',
  'le serveur déchiffre avec field_key');

-- Candidate : lit et répond par les RPC.
select pg_temp.login(pg_temp.uid(2), 'aal1');
select is((select m ->> 'context' from public.get_application_messages(current_setting('t.app')::uuid) m),
  'Point cité confidentiel', 'candidate : point cité déchiffré');
select is((select c ->> 'last_message' from public.get_my_conversations() c), 'Message confidentiel recruteur',
  'candidate : aperçu de la conversation déchiffré');
select lives_ok($$select public.send_application_message(current_setting('t.app')::uuid, 'Réponse de la candidate')$$,
  'la candidate répond');
select throws_ok($$select body_enc from public.application_messages$$, '42501', null,
  'candidate : lecture directe refusée');
select ok(public.export_my_emploi_data()::text like '%Note interne confidentielle%'
          and public.export_my_emploi_data()::text like '%Réponse de la candidate%',
  'export : notes et messages déchiffrés pour la candidate');

-- Recruteur : l'aperçu montre la réponse.
select pg_temp.login(pg_temp.uid(10), 'aal1');
select is((select c ->> 'last_message' from public.get_my_conversations() c), 'Réponse de la candidate',
  'recruteur : aperçu déchiffré');

-- Tiers : rien.
select pg_temp.login(pg_temp.uid(20), 'aal1');
select throws_ok($$select * from public.get_application_messages(current_setting('t.app')::uuid)$$, 'P0001', 'not_found',
  'autre entreprise : messages introuvables');
select is((select count(*)::int from public.get_my_conversations()), 0, 'autre entreprise : aucune conversation');
select pg_temp.login(pg_temp.uid(3), 'aal1');
select throws_ok($$select * from public.get_application_messages(current_setting('t.app')::uuid)$$, 'P0001', 'not_found',
  'autre candidat : messages introuvables');

-- Admin (aal2) : aucun accès au contenu.
select pg_temp.login(pg_temp.uid(1), 'aal2');
select throws_ok($$select body_enc from public.application_notes$$, '42501', null, 'admin : note chiffrée illisible');
select is((select count(*)::int from public.application_messages), 0, 'admin : aucun message visible');

-- Conservation : le contenu chiffré part avec la candidature close.
select pg_temp.logout();
update public.applications set status = 'rejected', refusal_reason = 'other', refusal_message = 'Message de refus assez long.',
       closed_at = now() - interval '200 days' where id = current_setting('t.app')::uuid;
select lives_ok($$select private.run_retention()$$, 'conservation');
select is((select count(*)::int from public.application_messages m where m.application_id = current_setting('t.app')::uuid)
          + (select count(*)::int from public.application_notes n where n.application_id = current_setting('t.app')::uuid), 0,
  'conservation : messages et notes chiffrés effacés');

select * from finish();
rollback;

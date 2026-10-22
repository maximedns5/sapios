-- Lot 1, modération après publication (D6) : filtre automatique, file des contenus, décision
-- motivée envoyée au membre, signalement d'un texte précis, retrait par le membre.
begin;
\ir _helpers.psql
select plan(31);

do $$
begin
  perform pg_temp.new_member(1, 'standard', 'woman', '{man}');
  perform pg_temp.new_member(2, 'standard', 'man', '{woman}');
  perform pg_temp.new_member(5, 'unlimited', 'woman', '{man}');
  insert into public.admins (user_id, role) values (pg_temp.uid(5), 'moderator');
end;
$$;

-- Filtre automatique -----------------------------------------------------------------------------
select is(private.content_flag_reasons('Appelez-moi au 06 12 34 56 78'), array['phone'], 'téléphone repéré');
select is(private.content_flag_reasons('+33 6 12 34 56 78'), array['phone'], 'indicatif international repéré');
select is(private.content_flag_reasons('Écrivez à jean.dupont@example.com'), array['email'], 'email repéré');
select is(private.content_flag_reasons('Retrouvez-moi : @jean_dupont'), array['handle'], 'pseudo @ repéré');
select is(private.content_flag_reasons('Tout est sur www.mon-site.fr'), array['url'], 'lien repéré');
select is(private.content_flag_reasons('Ajoutez-moi sur Snap !'), array['word'], 'mot de la liste repéré');
select is(private.content_flag_reasons('La querelle des universaux, en 1277.'), '{}'::text[],
  'texte ordinaire : rien à signaler');

select pg_temp.login(pg_temp.uid(2));
insert into public.profile_answers (position, prompt_key, answer)
values (0, 'three_hours', 'Mon numéro : 06 12 34 56 78'),
       (1, 'winning_debate', 'Le Paris-Brest est une démonstration.');
select results_eq(
  $$select position::int, moderation_status::text from public.profile_answers
     where user_id = pg_temp.uid(2) order by position$$,
  $$values (0, 'pending'::text), (1, 'approved'::text)$$,
  'texte repéré : en attente (toujours publié) ; texte ordinaire : publié');

select pg_temp.login(pg_temp.uid(1));
select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(2)), 2,
  'un texte en attente reste visible jusqu''à la décision');
select is_empty($$select 1 from public.content_flags$$, 'un membre ne lit pas la file de modération');
select throws_ok($$select * from public.admin_list_flagged_content()$$, 'P0001', 'forbidden',
  'file réservée aux admins');

-- Décision de l'admin ----------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select user_id, kind::text, prompt_key, current_text, reasons, source from public.admin_list_flagged_content()$$,
  $$values (pg_temp.uid(2), 'answer'::text, 'three_hours'::text, 'Mon numéro : 06 12 34 56 78'::text,
            array['phone'], 'auto'::text)$$,
  'la file présente le texte, la question et le motif');
select throws_ok(
  $$select public.admin_moderate_content((select id from public.content_flags limit 1), 'remove', '  ')$$,
  'P0001', 'reason_required', 'retrait sans motif : refusé (obligation de motivation)');
select lives_ok(
  $$select public.admin_moderate_content((select id from public.content_flags limit 1), 'remove',
                                          'Pas de coordonnées dans le profil.')$$,
  'retrait motivé');
select throws_ok(
  $$select public.admin_moderate_content((select id from public.content_flags limit 1), 'keep')$$,
  'P0001', 'already_handled', 'une décision par entrée');
select ok(exists (select 1 from public.audit_log where action = 'content.remove'), 'décision tracée dans audit_log');

select pg_temp.login(pg_temp.uid(1));
select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(2)), 1,
  'texte retiré : invisible des autres membres');

select pg_temp.login(pg_temp.uid(2));
select is((select moderation_status::text from public.profile_answers where user_id = pg_temp.uid(2) and position = 0), 'rejected',
  'le membre voit son texte retiré');
select results_eq(
  $$select n ->> 'kind', n -> 'payload' ->> 'reason', n -> 'payload' ->> 'content_kind', n -> 'payload' ->> 'prompt_key'
      from jsonb_array_elements(public.get_my_state() -> 'notices') n$$,
  $$values ('content_removed'::text, 'Pas de coordonnées dans le profil.'::text, 'answer'::text, 'three_hours'::text)$$,
  'le membre reçoit le motif du retrait');
select public.ack_notice((select id from public.member_notices limit 1));
select is(jsonb_array_length(public.get_my_state() -> 'notices'), 0, 'avis lu : il disparaît de l''état');

-- Le membre corrige un texte retiré : il repasse en file.
update public.profile_answers set answer = 'Le cadastre napoléonien.' where user_id = pg_temp.uid(2) and position = 0;
select is((select moderation_status::text from public.profile_answers where user_id = pg_temp.uid(2) and position = 0), 'pending',
  'texte retiré puis modifié : de nouveau en attente');
select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select reasons from public.admin_list_flagged_content()$$,
  $$values (array['edited_after_removal'])$$,
  'nouvelle entrée dans la file');
select public.admin_moderate_content((select f.id from public.content_flags f where f.status = 'open'), 'keep');
select pg_temp.login(pg_temp.uid(1));
select is((select count(*)::int from public.profile_answers where user_id = pg_temp.uid(2)), 2,
  'texte gardé : de nouveau visible');

-- Signalement d'un texte précis ------------------------------------------------------------------
select lives_ok(
  format($$select public.report_user(%L, 'inappropriate_content', null, 'answer',
           (select id from public.profile_answers where user_id = %L and position = 1))$$,
         pg_temp.uid(2), pg_temp.uid(2)),
  'signalement d''une réponse');
select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select source, report_reason, reasons from public.admin_list_flagged_content()$$,
  $$values ('report'::text, 'inappropriate_content'::text, array['report:inappropriate_content'])$$,
  'la réponse signalée rejoint la file, liée au signalement');
select is((select content_kind::text from public.reports where reporter_id = pg_temp.uid(1)), 'answer',
  'le signalement garde le contenu visé');
select pg_temp.login(pg_temp.uid(1));
select throws_ok(
  format($$select public.report_user(%L, 'other', null, 'answer', gen_random_uuid())$$, pg_temp.uid(2)),
  'P0001', 'invalid_input', 'contenu inconnu : signalement refusé');
select throws_ok(
  format($$select public.report_user(%L, 'other', null, 'thesis', null)$$, pg_temp.uid(2)),
  'P0001', 'invalid_input', 'thèse absente : signalement refusé');
select lives_ok(format($$select public.report_user(%L, 'harassment', 'Message insistant')$$, pg_temp.uid(2)),
  'signalement à 3 arguments toujours accepté');

-- Le membre supprime le texte signalé : l'entrée est close.
select pg_temp.login(pg_temp.uid(2));
delete from public.profile_answers where user_id = pg_temp.uid(2) and position = 1;
select pg_temp.login(pg_temp.uid(5));
select is_empty($$select 1 from public.admin_list_flagged_content()$$, 'texte supprimé : file vide');
select is((select status::text from public.admin_list_flagged_content(null) where source = 'report'), 'withdrawn',
  'entrée close comme retirée par le membre');

select * from finish();
rollback;

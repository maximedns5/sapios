-- §10 test 6 : les fichiers diplômes décidés il y a plus de N jours sortent dans
-- diplomas_to_purge ; mark_diploma_purged les marque et l'audit est conservé (ajout seul).
begin;
\ir _helpers.psql
select plan(13);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'standard');
  insert into public.admins (user_id, role) values (pg_temp.uid(2), 'moderator');
  -- Décidées il y a 40 jours (approuvée et refusée), il y a 5 jours, et en attente depuis 60 jours.
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, level_verified, reviewer_id, reviewed_at, created_at)
  values
    (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/old-approved.pdf', 'application/pdf', 'approved', 7, pg_temp.uid(2), now() - interval '40 days', now() - interval '41 days'),
    (pg_temp.uid(902), pg_temp.uid(1), pg_temp.uid(1)::text || '/old-rejected.pdf', 'application/pdf', 'rejected', null, pg_temp.uid(2), now() - interval '40 days', now() - interval '41 days'),
    (pg_temp.uid(903), pg_temp.uid(1), pg_temp.uid(1)::text || '/recent.pdf', 'application/pdf', 'approved', 7, pg_temp.uid(2), now() - interval '5 days', now() - interval '6 days'),
    (pg_temp.uid(904), pg_temp.uid(1), pg_temp.uid(1)::text || '/pending.pdf', 'application/pdf', 'needs_review', null, null, null, now() - interval '60 days');
end;
$$;

-- Réservé au serveur.
select pg_temp.login(pg_temp.uid(2));
select throws_ok($$select * from public.diplomas_to_purge(30)$$, '42501', null, 'diplomas_to_purge refusé à authenticated (même admin)');
select throws_ok($$select public.mark_diploma_purged(pg_temp.uid(901))$$, '42501', null, 'mark_diploma_purged refusé à authenticated');

select pg_temp.login_service();
select results_eq(
  $$select id, storage_path from public.diplomas_to_purge(30) where id in (pg_temp.uid(901), pg_temp.uid(902), pg_temp.uid(903), pg_temp.uid(904)) order by id$$,
  $$values (pg_temp.uid(901), pg_temp.uid(1)::text || '/old-approved.pdf'), (pg_temp.uid(902), pg_temp.uid(1)::text || '/old-rejected.pdf')$$,
  'seuls les fichiers décidés il y a plus de 30 jours sont à purger');
select ok(exists (select 1 from public.diplomas_to_purge(3) where id = pg_temp.uid(903)), 'N configurable : à 3 jours, la décision récente sort aussi');
select ok(not exists (select 1 from public.diplomas_to_purge(0) where id = pg_temp.uid(904)), 'une soumission non décidée n''est jamais purgée');

select lives_ok($$select public.mark_diploma_purged(pg_temp.uid(901))$$, 'mark_diploma_purged');
select lives_ok($$select public.mark_diploma_purged(pg_temp.uid(901))$$, 'mark_diploma_purged idempotent');
select ok(not exists (select 1 from public.diplomas_to_purge(30) where id = pg_temp.uid(901)), 'fichier purgé : ne ressort plus');
select isnt((select file_deleted_at from public.degree_submissions where id = pg_temp.uid(901)), null, 'file_deleted_at renseigné');
select results_eq(
  $$select level_verified, status::text from public.degree_submissions where id = pg_temp.uid(901)$$,
  $$values (7, 'approved'::text)$$, 'le niveau et la décision restent après la purge');
select is((select count(*)::int from public.audit_log where action = 'diploma.file_purged' and entity_id = pg_temp.uid(901)::text),
  1, 'purge tracée une seule fois dans audit_log');

-- L'audit est en ajout seul, même pour service_role.
select throws_ok($$delete from public.audit_log where entity_id = pg_temp.uid(901)::text$$, '42501', 'audit_log_append_only',
  'audit_log : suppression refusée à service_role');
select throws_ok($$update public.audit_log set action = 'oops' where entity_id = pg_temp.uid(901)::text$$, '42501', 'audit_log_append_only',
  'audit_log : modification refusée à service_role');

select * from finish();
rollback;

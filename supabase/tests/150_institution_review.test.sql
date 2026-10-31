-- Établissement vérifié : saisi par le modérateur à la validation (apply_diploma_review), recopié dans
-- user_access (badge du candidat) ; rattrapage par admin_set_member_institution.
begin;
\ir _helpers.psql
select plan(11);

do $$
begin
  perform pg_temp.new_member(1);
  perform pg_temp.new_member(2, 'unlimited');   -- modérateur
  perform pg_temp.new_member(3, 'standard');
  insert into public.admins (user_id, role) values (pg_temp.uid(2), 'moderator');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status)
  values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/master.pdf', 'application/pdf', 'needs_review'),
         (pg_temp.uid(902), pg_temp.uid(1), pg_temp.uid(1)::text || '/licence.pdf', 'application/pdf', 'needs_review'),
         (pg_temp.uid(903), pg_temp.uid(1), pg_temp.uid(1)::text || '/autre.pdf', 'application/pdf', 'needs_review');
end;
$$;

select pg_temp.login_service();
select throws_ok(
  format($$select public.apply_diploma_review(%L, %L, 'approve', 7, null, %L, 'law')$$,
         pg_temp.uid(903), pg_temp.uid(2), repeat('x', 201)),
  'P0001', 'invalid_institution', 'établissement trop long : refusé');
select is(
  public.apply_diploma_review(pg_temp.uid(901), pg_temp.uid(2), 'approve', 7, null, '  Sciences Po  ', 'law') ->> 'level',
  '7', 'approbation avec établissement et domaine');
select results_eq(
  $$select institution_verified, field_verified::text from public.degree_submissions where id = pg_temp.uid(901)$$,
  $$values ('Sciences Po'::text, 'law'::text)$$,
  'soumission : établissement et domaine vérifiés');
select results_eq(
  $$select institution, study_field::text from public.user_access where user_id = pg_temp.uid(1)$$,
  $$values ('Sciences Po'::text, 'law'::text)$$,
  'recopiés dans user_access');
select is(public.apply_diploma_review(pg_temp.uid(902), pg_temp.uid(2), 'approve', 6, null, 'Université de Lille', 'history') ->> 'level',
  '7', 'diplôme inférieur : le niveau acquis reste');
select results_eq(
  $$select institution, study_field::text from public.user_access where user_id = pg_temp.uid(1)$$,
  $$values ('Sciences Po'::text, 'law'::text)$$,
  'et l''établissement du diplôme retenu aussi');
select lives_ok(
  format($$select public.apply_diploma_review(%L, %L, 'reject', null, 'Illisible')$$, pg_temp.uid(903), pg_temp.uid(2)),
  'appel à 5 arguments toujours accepté');

-- Back-office ---------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(2));
select results_eq(
  $$select institution_verified, field_verified::text from public.admin_get_submission(pg_temp.uid(901))$$,
  $$values ('Sciences Po'::text, 'law'::text)$$,
  'admin_get_submission renvoie établissement et domaine vérifiés');
select lives_ok(
  format($$select public.admin_set_member_institution(%L, 'École normale supérieure', 'philosophy')$$, pg_temp.uid(3)),
  'rattrapage d''un membre déjà validé');
select ok(exists (select 1 from public.audit_log where action = 'member.institution' and entity_id = pg_temp.uid(3)::text),
  'rattrapage tracé');
select pg_temp.login(pg_temp.uid(3));
select throws_ok(
  format($$select public.admin_set_member_institution(%L, 'Usurpée', null)$$, pg_temp.uid(3)),
  'P0001', 'forbidden', 'réservé aux admins');

select * from finish();
rollback;

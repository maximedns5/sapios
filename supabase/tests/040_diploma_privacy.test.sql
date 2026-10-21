-- §10 test 4 : personne ne lit la soumission ni le fichier diplôme d'un autre. Le propriétaire
-- lit ses soumissions sans signals / extracted / moderator_note, et ne relit pas son fichier.
begin;
\ir _helpers.psql
select plan(15);

do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'unlimited');
  insert into public.degree_submissions (id, user_id, storage_path, mime, status, extracted, confidence, signals, moderator_note)
  values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.uid(1)::text || '/diplome.pdf', 'application/pdf', 'needs_review',
          '{"holder_full_name": "Membre Test 1"}', 0.9, '{name_mismatch}', 'à vérifier');
  insert into storage.objects (bucket_id, name, owner_id)
  values ('diplomas', pg_temp.uid(1)::text || '/diplome.pdf', pg_temp.uid(1)::text);
end;
$$;

-- Un autre membre (même éligible, même palier supérieur) ne voit rien.
select pg_temp.login(pg_temp.uid(2));
select is_empty($$select id from public.degree_submissions where user_id = pg_temp.uid(1)$$,
  'autre membre : soumission illisible');
select is_empty($$select id from public.my_submissions$$, 'autre membre : my_submissions vide');
select is_empty($$select id from storage.objects where bucket_id = 'diplomas'$$,
  'autre membre : aucun objet du bucket diplomas lisible');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id) values ('diplomas', '%s/intrus.pdf', '%s')$$,
         pg_temp.uid(1), pg_temp.uid(2)),
  '42501', null, 'autre membre : dépôt dans le dossier diplomas d''autrui refusé');
select lives_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id) values ('diplomas', '%s/mien.pdf', '%s')$$,
         pg_temp.uid(2), pg_temp.uid(2)),
  'dépôt dans son propre dossier diplomas autorisé');
select is_empty($$select id from storage.objects where bucket_id = 'diplomas' and name like '%/mien.pdf'$$,
  'même son propre diplôme n''est pas relisible côté client');
select results_eq(
  $$with u as (update storage.objects set name = name || '.x' where bucket_id = 'diplomas' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$, 'aucune modification d''objet diplomas');

-- Le propriétaire lit ses lignes, mais pas les colonnes de modération.
select pg_temp.login(pg_temp.uid(1));
select results_eq($$select id, status::text from public.my_submissions$$,
  $$values (pg_temp.uid(901), 'needs_review'::text)$$, 'propriétaire : my_submissions');
select results_eq($$select id from public.degree_submissions$$,
  $$values (pg_temp.uid(901))$$, 'propriétaire : ses lignes de degree_submissions');
select throws_ok($$select signals from public.degree_submissions$$, '42501', null, 'propriétaire : signals illisible');
select throws_ok($$select extracted from public.degree_submissions$$, '42501', null, 'propriétaire : extracted illisible');
select throws_ok($$select moderator_note from public.degree_submissions$$, '42501', null, 'propriétaire : moderator_note illisible');
select is_empty($$select id from storage.objects where bucket_id = 'diplomas'$$,
  'propriétaire : pas de lecture du fichier (URL signées côté serveur uniquement)');

-- anon : rien.
select pg_temp.login_anon();
select throws_ok($$select id from public.degree_submissions$$, '42501', null, 'anon : degree_submissions illisible');
select is_empty($$select id from storage.objects where bucket_id = 'diplomas'$$, 'anon : aucun objet diplomas');

select * from finish();
rollback;

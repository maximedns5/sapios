-- Textes des emails (migration 20261021091000_email_copy.sql) : présents, non vides, variables attendues.
begin;
\ir _helpers.psql
select plan(4);

select set_has(
  $$select key from public.app_copy where locale = 'fr'$$,
  $$values ('email.verdict.subject'), ('email.verdict.title'), ('email.verdict.body'), ('email.verdict.cta'),
           ('email.match.subject'), ('email.match.title'), ('email.match.body'), ('email.match.cta'),
           ('email.footer')$$,
  'textes des emails présents dans app_copy');

select is(
  (select count(*)::int from public.app_copy where key like 'email.%' and btrim(text) = ''),
  0, 'aucun texte d''email vide');

select ok(
  (select bool_or(text like '%{verdict}%') from public.app_copy
    where locale = 'fr' and key in ('email.verdict.title', 'email.verdict.body')),
  'l''email de verdict reprend le texte du verdict');

select is(
  (select count(*)::int from public.app_copy
    where key like 'email.match.%' and (text like '%{verdict}%' or text ~* 'orientation|niveau|bac')),
  0, 'l''email de match ne parle ni de verdict ni de niveau');

select * from finish();
rollback;

-- Textes de la plateforme (app_copy) après le retrait du dating : seuls restent l'email et l'avis
-- d'inactivité, le pied des emails et le délai de revue des diplômes ; plus aucun texte du dating.
begin;
\ir _helpers.psql
select plan(4);

select set_eq(
  $$select key from public.app_copy where locale = 'fr'$$,
  $$values ('email.footer'), ('email.inactivity.subject'), ('email.inactivity.title'), ('email.inactivity.body'),
           ('email.inactivity.cta'), ('notice.inactivity.title'), ('notice.inactivity.body'), ('review.delay')$$,
  'textes restants dans app_copy');

select is(
  (select count(*)::int from public.app_copy where btrim(text) = ''),
  0, 'aucun texte vide');

select ok(
  (select bool_and(text like '%{date}%') from public.app_copy
    where locale = 'fr' and key in ('email.inactivity.subject', 'email.inactivity.body')),
  'l''email d''inactivité donne la date de suppression');

select is(
  (select count(*)::int from public.app_copy
    where key ~ '^(verdict|match|push|feed|likes|events|referral|safety|prompt|affinity|intellect|quiz|terms)\.'),
  0, 'plus aucun texte du dating');

select * from finish();
rollback;

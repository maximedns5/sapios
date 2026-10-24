-- Sapios Emploi, contrat §6 : offres montrées au candidat et correspondances. Règles fixes et affichées :
-- offre publiée d'une entreprise vérifiée, non expirée, ni postulée ni passée, contrat souhaité, dans le
-- rayon ; ordre par correspondances remplies, puis date de publication, puis distance.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(29);

do $$
declare
  v_ok uuid := pg_temp.new_company(10);
  v_pending uuid := pg_temp.new_company(11, 'pending');
  v_suspended uuid := pg_temp.new_company(12, 'suspended');
begin
  -- Candidate à Reykjavik, rayon 20 km, CDI, compétences SQL, Python, Excel, langue anglais, niveau
  -- européen 7 (Bac+5).
  perform pg_temp.new_candidate(1, '{SQL,Python,Excel}', 7);
  insert into public.cv_languages (user_id, language, level) values (pg_temp.uid(1), 'Anglais', 'b2');

  perform set_config('t.match3', pg_temp.new_offer(v_ok, 'Trois correspondances', p_must => '{SQL,Python,"Bac+5 en statistiques"}',
                     p_nice => '{dbt}', p_published_ago => interval '5 days')::text, true);
  perform set_config('t.match1_new', pg_temp.new_offer(v_ok, 'Une correspondance récente', p_must => '{SQL,Rust}',
                     p_nice => '{}', p_published_ago => interval '1 day')::text, true);
  perform set_config('t.match1_old', pg_temp.new_offer(v_ok, 'Une correspondance ancienne', p_must => '{SQL,Rust}',
                     p_nice => '{}', p_published_ago => interval '9 days')::text, true);
  perform set_config('t.far', pg_temp.new_offer(v_ok, 'Trop loin', p_lat => 65.68, p_lng => -18.09)::text, true);  -- Akureyri
  perform set_config('t.cdd', pg_temp.new_offer(v_ok, 'En CDD', p_contract => 'cdd')::text, true);
  perform set_config('t.pending_co', pg_temp.new_offer(v_pending, 'Entreprise non vérifiée')::text, true);
  perform set_config('t.suspended_co', pg_temp.new_offer(v_suspended, 'Entreprise suspendue')::text, true);
  perform set_config('t.draft', pg_temp.new_offer(v_ok, 'Brouillon', p_status => 'draft')::text, true);
  perform set_config('t.review', pg_temp.new_offer(v_ok, 'En vérification', p_status => 'pending_review')::text, true);
  perform set_config('t.expired', pg_temp.new_offer(v_ok, 'Expirée')::text, true);
  update public.offers set expires_at = now() - interval '1 minute' where id = current_setting('t.expired')::uuid;
  perform set_config('t.passed', pg_temp.new_offer(v_ok, 'Passée')::text, true);
  perform set_config('t.applied', pg_temp.new_offer(v_ok, 'Déjà postulée')::text, true);
end;
$$;

select pg_temp.login(pg_temp.uid(1), 'aal1');
select lives_ok($$select public.pass_offer(current_setting('t.passed')::uuid)$$, 'passer une offre');
select lives_ok($$select public.apply_offer(current_setting('t.applied')::uuid)$$, 'postuler à une offre');

create temp table feed on commit drop as select t.f, t.n from public.get_offer_feed(50) with ordinality as t(f, n);
select is((select count(*)::int from feed), 3, 'le fil ne garde que 3 offres');
select is((select array_agg(f ->> 'title' order by n) from feed),
  array['Trois correspondances', 'Une correspondance récente', 'Une correspondance ancienne'],
  'ordre : correspondances, puis date de publication');
select ok(not exists (select 1 from feed where f ->> 'id' in (current_setting('t.far'), current_setting('t.cdd'))),
  'hors rayon et contrat non souhaité exclus');
select ok(not exists (select 1 from feed where f ->> 'id' in (current_setting('t.pending_co'), current_setting('t.suspended_co'))),
  'entreprises non vérifiées exclues');
select ok(not exists (select 1 from feed where f ->> 'id' in (current_setting('t.draft'), current_setting('t.review'),
                                                               current_setting('t.expired'))),
  'brouillon, offre en vérification et offre expirée exclus');
select ok(not exists (select 1 from feed where f ->> 'id' in (current_setting('t.passed'), current_setting('t.applied'))),
  'offres passées et postulées exclues');
select is((select (f ->> 'distance_km')::int from feed order by n limit 1), 0, 'distance en km depuis le centre de la zone');
select ok(not ((select f from feed limit 1) ? 'score'), 'aucun score dans une carte');

-- Correspondances.
select is((select f -> 'matches' from feed where f ->> 'id' = current_setting('t.match3')),
  '[{"met": true, "kind": "must", "label": "SQL"}, {"met": true, "kind": "must", "label": "Python"},
    {"met": true, "kind": "must", "label": "Bac+5 en statistiques"}, {"met": false, "kind": "nice", "label": "dbt"}]'::jsonb,
  'correspondances : critères dans l''ordre, Bac+5 rempli par le niveau vérifié');
select pg_temp.logout();

create function pg_temp.met(p_must text[], p_uid uuid default pg_temp.uid(1))
returns boolean[]
language sql
as $$
  select array_agg((m ->> 'met')::boolean order by o)
    from jsonb_array_elements(private.requirement_matches(
           row(gen_random_uuid(), gen_random_uuid(), 'x', 'cdi', null, null, null, null, 0, null, null, null, 'y0_1',
               '{}', p_must, '{}', null, null, null, null, 2, 7, 'draft', null, null, null, null, null, null, now(), now()
           )::public.offers, p_uid)) with ordinality as t(m, o);
$$;

select is(pg_temp.met('{sql}'), array[true], 'casse ignorée');
select is(pg_temp.met('{"Maîtrise de SQL et de dbt"}'), array[true], 'compétence contenue comme mot entier');
select is(pg_temp.met('{"MySQL"}'), array[false], 'pas de correspondance dans un mot plus long');
select is(pg_temp.met('{"Anglais courant"}'), array[true], 'une langue du candidat compte');
select is(pg_temp.met('{"Excél"}'), array[true], 'accents ignorés');
select is(pg_temp.met('{"Bac+5"}'), array[true], 'Bac+5 : niveau européen 7');
select is(pg_temp.met('{"Bac + 8 en physique"}'), array[false], 'Bac+8 : niveau 7 insuffisant');
select pg_temp.new_candidate(3, '{SQL}', 6);
select is(pg_temp.met('{"Bac+3","Bac+2","Bac+4","Bac+5"}', pg_temp.uid(3)), array[true, true, true, false],
  'niveau 6 (Bac+3) : Bac+2 à Bac+4 remplis, pas Bac+5');
select is(pg_temp.met('{"Rust"}'), array[false], 'compétence absente');

-- Sans niveau vérifié, Bac+N n'est jamais rempli.
select pg_temp.new_candidate(2, '{SQL}');
select is(pg_temp.met('{"Bac+3"}', pg_temp.uid(2)), array[false], 'sans diplôme vérifié : Bac+N non rempli');
select is(pg_temp.met('{"Bac+5 en data ou SQL"}', pg_temp.uid(2)), array[false],
  'critère Bac+N : une compétence citée dans le critère ne suffit pas sans le niveau');

-- Profil incomplet (moins de 3 compétences) : fil vide.
select pg_temp.login(pg_temp.uid(2), 'aal1');
select is((select count(*)::int from public.get_offer_feed()), 0, 'profil incomplet : fil vide');
select throws_ok($$select public.apply_offer(current_setting('t.match3')::uuid)$$, 'P0001', 'profile_incomplete',
  'profil incomplet : candidature refusée');

-- Recruteur : pas de fil.
select pg_temp.login(pg_temp.uid(10), 'aal1');
select throws_ok($$select * from public.get_offer_feed()$$, 'P0001', 'not_candidate', 'recruteur : pas de fil');

-- Offre lisible par un compte connecté seulement si publique.
select pg_temp.login(pg_temp.uid(1), 'aal1');
select is((select count(*)::int from public.offers where id = current_setting('t.draft')::uuid), 0,
  'brouillon d''une autre entreprise illisible');
select throws_ok($$select public.get_offer(current_setting('t.draft')::uuid)$$, 'P0001', 'not_found',
  'get_offer : brouillon introuvable');
select is(public.get_offer(current_setting('t.match3')::uuid) ->> 'can_apply', 'true', 'get_offer : can_apply');
select is(public.get_offer(current_setting('t.applied')::uuid) -> 'my_application' ->> 'status', 'sent',
  'get_offer : ma candidature');

select * from finish();
rollback;

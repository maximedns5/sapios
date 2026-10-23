-- Lot 2, événements gratuits : paliers admis, capacité jamais dépassée, file d'attente FIFO, lieu
-- exact réservé aux inscrits, liste des inscrits jamais lisible par les membres, annulation, rappel.
begin;
\ir _helpers.psql
select plan(56);

-- 1, 5, 6, 7 : Bac+5 ; 2 : Bac+8 ; 3 : liste d'attente ; 4 : banni ; 20 : admin.
do $$
begin
  perform pg_temp.new_member(1, 'standard');
  perform pg_temp.new_member(2, 'unlimited');
  perform pg_temp.new_member(3, 'waitlist');
  perform pg_temp.new_member(4, 'standard', p_status => 'banned');
  perform pg_temp.new_member(5, 'standard');
  perform pg_temp.new_member(6, 'standard');
  perform pg_temp.new_member(7, 'standard');
  perform pg_temp.new_member(20, 'unlimited');
  insert into public.admins (user_id, role) values (pg_temp.uid(20), 'moderator');
end;
$$;

create temp table ev (name text primary key, id uuid);
grant select, insert on ev to authenticated;
-- Minuit (heure de Paris) du jour du test, lu avant de prendre le rôle d'un membre.
create temp table t0 as select private.paris_day_start() as d;
grant select on t0 to authenticated;

-- Créer les événements (admin) ------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select throws_ok(
  $$select public.admin_upsert_event(null, 'Dîner', 'dinner', '', 'Paris', '6e', 'Le Procope', '13 rue de l''Ancienne-Comédie',
      now() + interval '7 days', now() + interval '7 days 3 hours', 2)$$,
  'P0001', 'forbidden', 'un membre ne crée pas d''événement');

select pg_temp.login(pg_temp.uid(20));
insert into ev values
  ('dinner', public.admin_upsert_event(null, 'Dîner de thèse', 'dinner', 'Trois thèses, un dessert.', 'Paris', '6e',
     'Le Procope', '13 rue de l''Ancienne-Comédie', now() + interval '7 days', now() + interval '7 days 3 hours', 2,
     '{standard,unlimited}', 'published')),
  ('draft', public.admin_upsert_event(null, 'Brouillon', 'debate', '', 'Paris', null, null, null,
     now() + interval '9 days', now() + interval '9 days 2 hours', 30)),
  ('bac8', public.admin_upsert_event(null, 'Conférence Bac+8', 'conference', '', 'Paris', '5e', 'Amphi', '1 rue X',
     now() + interval '8 days', now() + interval '8 days 2 hours', 30, '{unlimited}', 'published')),
  ('tomorrow', public.admin_upsert_event(null, 'Débat de demain', 'debate', '', 'Lyon', '2e', 'Café', '2 place Y',
     (select d from t0) + interval '1 day 18 hours', (select d from t0) + interval '1 day 20 hours', 20,
     '{standard,unlimited}', 'published'));
select is((select count(*)::int from ev where id is not null), 4, 'admin : quatre événements créés');
select throws_ok(
  $$select public.admin_upsert_event(null, 'Inversé', 'other', '', 'Paris', null, null, null,
      now() + interval '2 days', now() + interval '1 day', 10)$$,
  'P0001', 'invalid_input', 'fin avant le début : refusé');
select throws_ok(
  $$select public.admin_upsert_event(null, 'Annulé', 'other', '', 'Paris', null, null, null,
      now() + interval '2 days', now() + interval '3 days', 10, '{standard}', 'cancelled')$$,
  'P0001', 'invalid_input', 'statut « annulé » réservé à admin_cancel_event');
select throws_ok(
  $$select public.admin_upsert_event(null, 'Liste d''attente', 'other', '', 'Paris', null, null, null,
      now() + interval '2 days', now() + interval '3 days', 10, '{waitlist}', 'published')$$,
  'P0001', 'invalid_input', 'seuls les paliers avec découverte sont admis');

-- Événement payant (lot 3) : inséré directement.
select pg_temp.logout();
with x as (
  insert into public.events (title, kind, city, starts_at, ends_at, capacity, price_cents, status, published_at)
  values ('Dîner payant', 'dinner', 'Paris', now() + interval '10 days', now() + interval '10 days 2 hours', 10, 1500,
          'published', now())
  returning id)
insert into ev select 'paid', id from x;

-- Visibilité --------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select set_eq(
  $$select (e ->> 'id')::uuid from public.list_events() e where (e ->> 'id')::uuid in (select id from ev)$$,
  $$select id from ev where name in ('dinner', 'tomorrow', 'paid')$$,
  'Bac+5 : événements publiés ouverts à son palier, ni brouillon ni réservé Bac+8');
select pg_temp.login(pg_temp.uid(2));
select ok((select (select id from ev where name = 'bac8') in (select (e ->> 'id')::uuid from public.list_events() e)),
  'Bac+8 : voit la conférence réservée Bac+8');
select pg_temp.login(pg_temp.uid(3));
select is((select count(*)::int from public.list_events()), 0, 'liste d''attente : aucun événement');
select throws_ok($$select public.register_event((select id from ev where name = 'dinner'), true)$$,
  'P0001', 'not_allowed', 'liste d''attente : inscription refusée');
select pg_temp.login(pg_temp.uid(4));
select throws_ok($$select public.register_event((select id from ev where name = 'dinner'), true)$$,
  'P0001', 'not_allowed', 'banni : inscription refusée');

select pg_temp.login(pg_temp.uid(1));
select is((select count(*)::int from public.events where id = (select id from ev where name = 'dinner')), 1,
  'lecture directe : l''événement publié est visible');
select throws_ok($$select venue_address from public.events$$, '42501', null,
  'lecture directe : l''adresse exacte n''est jamais accordée');
select throws_ok($$select venue_name from public.events$$, '42501', null,
  'lecture directe : le nom du lieu n''est jamais accordé');
select is((select count(*)::int from public.events where id = (select id from ev where name = 'draft')), 0,
  'lecture directe : brouillon invisible');
select is(public.get_event((select id from ev where name = 'dinner')) ->> 'venue_address', null,
  'fiche avant inscription : pas d''adresse');
select throws_ok($$select public.get_event((select id from ev where name = 'draft'))$$, 'P0001', 'not_found',
  'brouillon : introuvable');
select throws_ok($$select public.get_event((select id from ev where name = 'bac8'))$$, 'P0001', 'not_found',
  'événement réservé Bac+8 : introuvable pour un Bac+5');

-- Inscription, capacité et file d'attente ------------------------------------------------------------------
select throws_ok($$select public.register_event((select id from ev where name = 'dinner'), false)$$,
  'P0001', 'charter_required', 'charte de conduite obligatoire');
select throws_ok($$select public.register_event((select id from ev where name = 'paid'), true)$$,
  'P0001', 'paid_event_unavailable', 'événement payant : pas avant le lot 3');
select is(public.register_event((select id from ev where name = 'dinner'), true) ->> 'status', 'registered',
  'première place : inscrit');
select pg_temp.login(pg_temp.uid(2));
select is(public.register_event((select id from ev where name = 'dinner'), true) ->> 'status', 'registered',
  'deuxième place : inscrit');
select pg_temp.login(pg_temp.uid(5));
select results_eq(
  $$select r ->> 'status', (r ->> 'waitlist_rank')::int from public.register_event((select id from ev where name = 'dinner'), true) r$$,
  $$values ('waitlisted'::text, 1)$$,
  'complet : file d''attente, rang 1');
select pg_temp.login(pg_temp.uid(6));
select is((public.register_event((select id from ev where name = 'dinner'), true) ->> 'waitlist_rank')::int, 2,
  'file d''attente, rang 2');

select pg_temp.logout();
select is((select count(*)::int from public.event_registrations
            where event_id = (select id from ev where name = 'dinner') and status in ('registered', 'attended')), 2,
  'capacité respectée : 2 places, 2 inscrits');

select pg_temp.login(pg_temp.uid(1));
select is(public.register_event((select id from ev where name = 'dinner'), true) ->> 'status', 'registered',
  'réinscription : sans effet, toujours inscrit');
select is(public.get_event((select id from ev where name = 'dinner')) ->> 'venue_address', '13 rue de l''Ancienne-Comédie',
  'inscrit : adresse exacte donnée');
select ok((public.get_my_ticket((select id from ev where name = 'dinner')) ->> 'ticket_code') ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$',
  'inscrit : billet avec un code de 12 caractères');
select results_eq(
  $$select (e ->> 'seats_left')::int, (e ->> 'waitlist_count')::int, e ->> 'my_status'
      from public.list_events() e where (e ->> 'id')::uuid = (select id from ev where name = 'dinner')$$,
  $$values (0, 2, 'registered'::text)$$,
  'agenda : places restantes et file, jamais les noms');
select is((select count(*)::int from public.event_registrations), 1,
  'un membre ne lit que sa propre inscription');

select pg_temp.login(pg_temp.uid(5));
select is(public.get_event((select id from ev where name = 'dinner')) ->> 'venue_address', null,
  'en file d''attente : pas d''adresse');
select throws_ok($$select public.get_my_ticket((select id from ev where name = 'dinner'))$$, 'P0001', 'not_registered',
  'en file d''attente : pas de billet');

-- Désinscription : la première personne de la file monte -------------------------------------------------
select pg_temp.login(pg_temp.uid(1));
select is(public.cancel_registration((select id from ev where name = 'dinner')) ->> 'status', 'cancelled',
  'désinscription');
select throws_ok($$select public.cancel_registration((select id from ev where name = 'dinner'))$$, 'P0001', 'not_registered',
  'désinscription en double : refusée');
select pg_temp.logout();
select results_eq(
  $$select user_id, status::text from public.event_registrations
     where event_id = (select id from ev where name = 'dinner') and user_id in (pg_temp.uid(5), pg_temp.uid(6))
     order by user_id$$,
  $$values (pg_temp.uid(5), 'registered'::text), (pg_temp.uid(6), 'waitlisted'::text)$$,
  'file FIFO : le rang 1 monte, le rang 2 attend');
select ok(exists (select 1 from public.member_notices where user_id = pg_temp.uid(5) and kind = 'event_promoted'),
  'avis « place libérée » pour la personne promue');

-- Admin : capacité augmentée, pointage, promotion, liste ---------------------------------------------------
-- Les inscriptions des autres ne sont lisibles qu'en postgres : on les garde pour l'admin.
create temp table regs as
  select user_id, id, ticket_code from public.event_registrations where event_id = (select id from ev where name = 'dinner');
grant select on regs to authenticated;

select pg_temp.login(pg_temp.uid(20));
select lives_ok(
  $$select public.admin_upsert_event((select id from ev where name = 'dinner'), 'Dîner de thèse', 'dinner', 'Trois thèses, un dessert.',
      'Paris', '6e', 'Le Procope', '13 rue de l''Ancienne-Comédie', (select starts_at from public.events where id = (select id from ev where name = 'dinner')),
      (select ends_at from public.events where id = (select id from ev where name = 'dinner')), 3, '{standard,unlimited}', 'published')$$,
  'admin : capacité portée à 3');
select pg_temp.logout();
select is((select status::text from public.event_registrations
            where event_id = (select id from ev where name = 'dinner') and user_id = pg_temp.uid(6)), 'registered',
  'une place de plus : la file monte');
select pg_temp.login(pg_temp.uid(20));
select is((select admin_check_in ->> 'already' from public.admin_check_in(null,
            (select lower(ticket_code) from regs where user_id = pg_temp.uid(2)))),
  'false', 'pointage par code de billet (saisie en minuscules)');
select is((select admin_check_in ->> 'already' from public.admin_check_in((select id from regs where user_id = pg_temp.uid(2)))),
  'true', 'second pointage : déjà présent');
select throws_ok(
  $$select public.admin_check_in((select id from regs where user_id = pg_temp.uid(1)))$$,
  'P0001', 'not_registered', 'pointage d''une inscription annulée : refusé');

select pg_temp.login(pg_temp.uid(7));
select is(public.register_event((select id from ev where name = 'dinner'), true) ->> 'status', 'waitlisted',
  'complet de nouveau : file d''attente');
select pg_temp.login(pg_temp.uid(20));
select pg_temp.logout();
insert into regs select user_id, id, ticket_code from public.event_registrations
 where event_id = (select id from ev where name = 'dinner') and user_id = pg_temp.uid(7);
select pg_temp.login(pg_temp.uid(20));
select throws_ok(
  $$select public.admin_promote_registration((select id from regs where user_id = pg_temp.uid(7)))$$,
  'P0001', 'event_full', 'promotion impossible sans place');
select results_eq(
  $$select registered_count, attended_count, waitlisted_count, cancelled_count from public.admin_list_events()
     where id = (select id from ev where name = 'dinner')$$,
  $$values (2, 1, 1, 1)$$,
  'admin : remplissage de l''événement');

select pg_temp.login(pg_temp.uid(1));
select throws_ok($$select * from public.admin_list_registrations((select id from ev where name = 'dinner'))$$,
  'P0001', 'forbidden', 'un membre ne lit pas la liste des inscrits');

-- Annulation de l'événement ----------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(20));
select throws_ok($$select public.admin_cancel_event((select id from ev where name = 'dinner'), '  ')$$,
  'P0001', 'reason_required', 'annulation sans motif : refusée');
select is(public.admin_cancel_event((select id from ev where name = 'dinner'), 'Le restaurant ferme ce soir-là.'), 3,
  'annulation : les trois inscrits et en file prévenus');
select ok(exists (select 1 from public.member_notices
                   where user_id = pg_temp.uid(7) and kind = 'event_cancelled'
                     and payload ->> 'reason' = 'Le restaurant ferme ce soir-là.'),
  'avis d''annulation avec le motif');
select ok((public.admin_export_event((select id from ev where name = 'dinner')) -> 'registrations')::text ~ '@sapios\.test',
  'export admin : emails des inscrits pour l''organisation');

select pg_temp.login(pg_temp.uid(5));
select throws_ok($$select public.register_event((select id from ev where name = 'dinner'), true)$$, 'P0001', 'event_cancelled',
  'événement annulé : plus d''inscription');
select is(public.get_event((select id from ev where name = 'dinner')) ->> 'cancel_reason', 'Le restaurant ferme ce soir-là.',
  'l''inscrit voit encore la fiche, avec le motif d''annulation');

-- Rappel la veille --------------------------------------------------------------------------------------
select pg_temp.logout();
select is(private.send_event_reminders(), 1, 'rappel : l''événement de demain seulement');
select is(private.send_event_reminders(), 0, 'rappel envoyé une seule fois');
select ok(exists (select 1 from cron.job where jobname = 'event-reminders'), 'tâche pg_cron du rappel planifiée');

-- Événement commencé, export, suppression ---------------------------------------------------------------
update public.events set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour'
 where id = (select id from ev where name = 'bac8');
select pg_temp.login(pg_temp.uid(2));
select throws_ok($$select public.register_event((select id from ev where name = 'bac8'), true)$$, 'P0001', 'event_started',
  'événement commencé : inscription fermée');
select is(jsonb_array_length(public.export_my_data() -> 'event_registrations'), 1, 'export RGPD : mes inscriptions');

select pg_temp.logout();
delete from auth.users where id = pg_temp.uid(6);
select is((select count(*)::int from public.event_registrations where user_id = pg_temp.uid(6)), 0,
  'compte supprimé : inscriptions supprimées');

select * from finish();
rollback;

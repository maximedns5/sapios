-- Lot 2 (cadrage des fonctionnalités §6) : événements IRL gratuits, organisés par Sapios.
-- Réservés aux paliers qui ont accès à la découverte. L'adresse exacte n'est donnée qu'aux inscrits ;
-- la liste des inscrits n'est jamais visible des membres (seulement les places restantes).
-- Événements payants : lot 3 (price_cents existe, l'inscription refuse tout prix non nul).

-- Types ---------------------------------------------------------------------------------------
create type public.event_kind as enum ('dinner', 'debate', 'conference', 'other');
create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.registration_status as enum ('registered', 'waitlisted', 'cancelled', 'attended', 'no_show');

-- Tables -------------------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind public.event_kind not null,
  description text not null default '' check (char_length(description) <= 4000),
  city text not null check (char_length(btrim(city)) between 1 and 80),
  neighbourhood text check (neighbourhood is null or char_length(btrim(neighbourhood)) between 1 and 80),
  -- Privé : donné aux seuls inscrits (get_event, get_my_ticket) et aux admins.
  venue_name text check (venue_name is null or char_length(btrim(venue_name)) between 1 and 120),
  venue_address text check (venue_address is null or char_length(btrim(venue_address)) between 1 and 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 1000),
  price_cents int not null default 0 check (price_cents >= 0),
  allowed_tiers public.access_tier[] not null default '{standard,unlimited}'
    check (cardinality(allowed_tiers) >= 1 and allowed_tiers <@ array['standard', 'unlimited']::public.access_tier[]),
  status public.event_status not null default 'draft',
  cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 500),
  created_by uuid, -- pas de FK : l'événement reste attribué même si l'admin part
  published_at timestamptz,
  cancelled_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_dates check (ends_at > starts_at),
  constraint events_cancelled check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
alter table public.events enable row level security;
create index events_status_starts_idx on public.events (status, starts_at);

-- Une inscription par membre et par événement. La file d'attente suit status_changed_at (FIFO,
-- heure réelle de l'opération, pas celle du début de la transaction) : se réinscrire après une
-- annulation remet en bout de file.
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.registration_status not null,
  ticket_code text not null unique check (ticket_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$'),
  charter_accepted_at timestamptz not null,
  status_changed_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registrations_once unique (event_id, user_id)
);
alter table public.event_registrations enable row level security;
create index event_registrations_queue_idx on public.event_registrations (event_id, status, status_changed_at, id);
create index event_registrations_user_idx on public.event_registrations (user_id);

create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();
create trigger event_registrations_touch before update on public.event_registrations
  for each row execute function private.touch_updated_at();

-- Avis au membre : promotion depuis la file d'attente, annulation d'un événement.
alter table public.member_notices drop constraint member_notices_kind_check;
alter table public.member_notices
  add constraint member_notices_kind_check check (kind in ('content_removed', 'event_promoted', 'event_cancelled'));

-- Fonctions internes -------------------------------------------------------------------------

-- Le membre peut voir et rejoindre un événement ouvert à ces paliers : palier admis avec accès à
-- la découverte, compte actif ou en pause (jamais banni ni en cours d'inscription).
create function private.can_attend(p_uid uuid, p_allowed public.access_tier[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access ua
    join public.profiles p on p.id = ua.user_id
    where ua.user_id = p_uid
      and ua.tier = any (p_allowed)
      and private.tier_can_browse(ua.tier)
      and p.status in ('active', 'paused')
  );
$$;

-- Places occupées : inscrits et présents.
create function private.event_taken(p_event uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.event_registrations r
  where r.event_id = p_event and r.status in ('registered', 'attended');
$$;

-- Rang dans la file d'attente (1 = prochain), null si la personne n'y est pas.
create function private.waitlist_rank(p_registration uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select q.rank::int from (
    select r.id, row_number() over (order by r.status_changed_at, r.id) as rank
    from public.event_registrations r
    where r.event_id = (select x.event_id from public.event_registrations x where x.id = p_registration)
      and r.status = 'waitlisted'
  ) q where q.id = p_registration;
$$;

create function private.event_notice(p_user uuid, p_kind text, p_event public.events, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.member_notices (user_id, kind, payload)
  values (p_user, p_kind, jsonb_strip_nulls(jsonb_build_object(
    'event_id', p_event.id, 'title', p_event.title, 'starts_at', p_event.starts_at, 'reason', p_reason)));
$$;

-- Fait monter la file d'attente tant qu'il reste des places (événement publié, à venir).
-- L'appelant tient déjà le verrou de la ligne de l'événement.
create function private.promote_waitlist(p_event_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_next uuid;
  v_user uuid;
  v_count int := 0;
begin
  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.status <> 'published' or v_event.starts_at <= now() then
    return 0;
  end if;
  loop
    exit when private.event_taken(p_event_id) >= v_event.capacity;
    select r.id, r.user_id into v_next, v_user from public.event_registrations r
     where r.event_id = p_event_id and r.status = 'waitlisted'
     order by r.status_changed_at, r.id
     limit 1
     for update;
    exit when v_next is null;
    update public.event_registrations r
       set status = 'registered', status_changed_at = clock_timestamp()
     where r.id = v_next;
    perform private.event_notice(v_user, 'event_promoted', v_event, null);
    perform private.invoke_edge_function('notify',
      jsonb_build_object('type', 'event', 'kind', 'promoted', 'registration_id', v_next));
    v_count := v_count + 1;
    v_next := null;
  end loop;
  return v_count;
end;
$$;

-- Ligne d'un événement vue par un membre : jamais le lieu exact, jamais les inscrits.
create function private.event_public_json(p_event public.events, p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_event.id,
    'title', p_event.title,
    'kind', p_event.kind,
    'description', p_event.description,
    'city', p_event.city,
    'neighbourhood', p_event.neighbourhood,
    'starts_at', p_event.starts_at,
    'ends_at', p_event.ends_at,
    'capacity', p_event.capacity,
    'seats_left', greatest(p_event.capacity - private.event_taken(p_event.id), 0),
    'waitlist_count', (select count(*)::int from public.event_registrations r
                        where r.event_id = p_event.id and r.status = 'waitlisted'),
    'price_cents', p_event.price_cents,
    'status', p_event.status,
    'cancel_reason', p_event.cancel_reason,
    'my_status', r.status,
    'my_waitlist_rank', case when r.status = 'waitlisted' then private.waitlist_rank(r.id) end
  )
  from (select 1) one
  left join public.event_registrations r on r.event_id = p_event.id and r.user_id = p_uid;
$$;

-- RPC membres --------------------------------------------------------------------------------

-- Agenda : événements publiés à venir ouverts à mon palier, plus ceux où je suis (ou étais)
-- inscrit depuis 30 jours (annulés compris). Du plus proche au plus lointain.
create function public.list_events()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.touch_activity(v_uid);
  return query
  select private.event_public_json(e, v_uid)
  from public.events e
  where (e.status = 'published' and e.ends_at > now() and private.can_attend(v_uid, e.allowed_tiers))
     or (e.status <> 'draft' and e.starts_at > now() - interval '30 days'
         and exists (select 1 from public.event_registrations r where r.event_id = e.id and r.user_id = v_uid))
  order by e.starts_at, e.id;
end;
$$;

-- Fiche : le lieu exact seulement pour un inscrit (ou présent). not_found sinon visible.
create function public.get_event(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_event public.events;
  v_reg public.event_registrations;
begin
  select * into v_event from public.events e where e.id = p_id;
  select * into v_reg from public.event_registrations r where r.event_id = p_id and r.user_id = v_uid;
  if v_event.id is null or v_event.status = 'draft'
     or (v_reg.id is null and not (v_event.status = 'published' and private.can_attend(v_uid, v_event.allowed_tiers))) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.event_public_json(v_event, v_uid) || jsonb_build_object(
    'venue_name', case when v_reg.status in ('registered', 'attended') then v_event.venue_name end,
    'venue_address', case when v_reg.status in ('registered', 'attended') then v_event.venue_address end,
    'can_register', v_event.status = 'published' and v_event.starts_at > now() and v_event.price_cents = 0
                    and private.can_attend(v_uid, v_event.allowed_tiers)
  );
end;
$$;

-- Inscription : verrou sur l'événement, la capacité n'est jamais dépassée. La charte de conduite
-- doit être acceptée. Renvoie registered (place confirmée) ou waitlisted (file d'attente).
-- Erreurs : charter_required, not_found, event_cancelled, event_started, paid_event_unavailable,
-- not_allowed. Idempotent : déjà inscrit ou en file, renvoie l'état actuel.
create function public.register_event(p_id uuid, p_accept_charter boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_event public.events;
  v_reg public.event_registrations;
  v_status public.registration_status;
  v_code text;
begin
  if not coalesce(p_accept_charter, false) then
    raise exception 'charter_required' using errcode = 'P0001';
  end if;

  select * into v_event from public.events e where e.id = p_id for update;
  if v_event.id is null or v_event.status = 'draft' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'event_started' using errcode = 'P0001';
  end if;
  if v_event.price_cents > 0 then
    raise exception 'paid_event_unavailable' using errcode = 'P0001';
  end if;
  if not private.can_attend(v_uid, v_event.allowed_tiers) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_reg from public.event_registrations r
   where r.event_id = p_id and r.user_id = v_uid for update;
  if v_reg.status in ('registered', 'waitlisted', 'attended') then
    return jsonb_build_object('registration_id', v_reg.id, 'status', v_reg.status,
                              'waitlist_rank', private.waitlist_rank(v_reg.id));
  end if;

  v_status := case when private.event_taken(p_id) < v_event.capacity
                        and not exists (select 1 from public.event_registrations r
                                         where r.event_id = p_id and r.status = 'waitlisted')
                   then 'registered' else 'waitlisted' end;

  if v_reg.id is not null then
    update public.event_registrations r
       set status = v_status, charter_accepted_at = now(), status_changed_at = clock_timestamp(), cancelled_at = null
     where r.id = v_reg.id;
  else
    loop
      begin
        v_code := private.random_code(12);
        insert into public.event_registrations (event_id, user_id, status, ticket_code, charter_accepted_at)
        values (p_id, v_uid, v_status, v_code, now())
        returning * into v_reg;
        exit;
      exception when unique_violation then
        -- Collision du code de billet (improbable) : on retire. Le doublon (événement, membre) est
        -- impossible ici, la ligne de l'événement étant verrouillée.
        null;
      end;
    end loop;
  end if;

  if v_status = 'registered' then
    perform private.invoke_edge_function('notify',
      jsonb_build_object('type', 'event', 'kind', 'registered', 'registration_id', v_reg.id));
  end if;
  return jsonb_build_object('registration_id', v_reg.id, 'status', v_status,
                            'waitlist_rank', private.waitlist_rank(v_reg.id));
end;
$$;

-- Désinscription avant le début ; une place libérée fait monter le premier de la file.
-- Erreurs : not_registered, event_started.
create function public.cancel_registration(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_event public.events;
  v_reg public.event_registrations;
begin
  select * into v_event from public.events e where e.id = p_id for update;
  select * into v_reg from public.event_registrations r
   where r.event_id = p_id and r.user_id = v_uid and r.status in ('registered', 'waitlisted')
   for update;
  if v_event.id is null or v_reg.id is null then
    raise exception 'not_registered' using errcode = 'P0001';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'event_started' using errcode = 'P0001';
  end if;
  update public.event_registrations r
     set status = 'cancelled', cancelled_at = now(), status_changed_at = clock_timestamp()
   where r.id = v_reg.id;
  if v_reg.status = 'registered' then
    perform private.promote_waitlist(p_id);
  end if;
  return jsonb_build_object('registration_id', v_reg.id, 'status', 'cancelled');
end;
$$;

-- Billet : code et lieu exact, pour une place confirmée (ou un membre déjà pointé).
create function public.get_my_ticket(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_event public.events;
  v_reg public.event_registrations;
begin
  select * into v_reg from public.event_registrations r
   where r.event_id = p_id and r.user_id = v_uid and r.status in ('registered', 'attended');
  if v_reg.id is null then
    raise exception 'not_registered' using errcode = 'P0001';
  end if;
  select * into v_event from public.events e where e.id = p_id;
  return jsonb_build_object(
    'registration_id', v_reg.id,
    'ticket_code', v_reg.ticket_code,
    'status', v_reg.status,
    'checked_in_at', v_reg.checked_in_at,
    'event', jsonb_build_object(
      'id', v_event.id, 'title', v_event.title, 'kind', v_event.kind, 'status', v_event.status,
      'starts_at', v_event.starts_at, 'ends_at', v_event.ends_at, 'city', v_event.city,
      'neighbourhood', v_event.neighbourhood, 'venue_name', v_event.venue_name,
      'venue_address', v_event.venue_address)
  );
end;
$$;

-- RPC admin ----------------------------------------------------------------------------------

-- Créer (p_id null) ou modifier un événement. Statut draft ou published ; l'annulation passe par
-- admin_cancel_event. Gratuit seulement (lot 2). Une capacité augmentée fait monter la file.
-- Erreurs : invalid_input, not_found, event_cancelled.
create function public.admin_upsert_event(
  p_id uuid,
  p_title text,
  p_kind public.event_kind,
  p_description text,
  p_city text,
  p_neighbourhood text,
  p_venue_name text,
  p_venue_address text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity int,
  p_allowed_tiers public.access_tier[] default '{standard,unlimited}',
  p_status public.event_status default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_old public.events;
  v_id uuid;
begin
  if p_status is null or p_status = 'cancelled' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_id is not null then
    select * into v_old from public.events e where e.id = p_id for update;
    if v_old.id is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if v_old.status = 'cancelled' then
      raise exception 'event_cancelled' using errcode = 'P0001';
    end if;
    if v_old.status = 'published' and p_status = 'draft'
       and exists (select 1 from public.event_registrations r
                    where r.event_id = p_id and r.status in ('registered', 'waitlisted')) then
      -- Dépublier un événement qui a des inscrits les laisserait sans nouvelles : annuler plutôt.
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  end if;

  begin
    if p_id is null then
      insert into public.events (title, kind, description, city, neighbourhood, venue_name, venue_address,
                                 starts_at, ends_at, capacity, allowed_tiers, status, created_by, published_at)
      values (btrim(p_title), p_kind, coalesce(p_description, ''), btrim(p_city), nullif(btrim(p_neighbourhood), ''),
              nullif(btrim(p_venue_name), ''), nullif(btrim(p_venue_address), ''), p_starts_at, p_ends_at,
              p_capacity, coalesce(p_allowed_tiers, '{standard,unlimited}'), p_status, v_admin,
              case when p_status = 'published' then now() end)
      returning id into v_id;
    else
      update public.events e
         set title = btrim(p_title), kind = p_kind, description = coalesce(p_description, ''),
             city = btrim(p_city), neighbourhood = nullif(btrim(p_neighbourhood), ''),
             venue_name = nullif(btrim(p_venue_name), ''), venue_address = nullif(btrim(p_venue_address), ''),
             starts_at = p_starts_at, ends_at = p_ends_at, capacity = p_capacity,
             allowed_tiers = coalesce(p_allowed_tiers, '{standard,unlimited}'), status = p_status,
             published_at = case when p_status = 'published' then coalesce(e.published_at, now()) else e.published_at end,
             -- Rappel à renvoyer si la date change.
             reminder_sent_at = case when e.starts_at = p_starts_at then e.reminder_sent_at end
       where e.id = p_id
      returning id into v_id;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'invalid_input' using errcode = 'P0001';
  end;

  if p_id is not null then
    perform private.promote_waitlist(v_id);
  end if;
  perform private.audit(v_admin, case when p_id is null then 'event.create' else 'event.update' end,
                        'events', v_id::text,
                        jsonb_build_object('status', p_status, 'capacity', p_capacity, 'starts_at', p_starts_at));
  return v_id;
end;
$$;

-- Liste des événements avec le remplissage.
create function public.admin_list_events(p_include_past boolean default false)
returns table (
  id uuid, title text, kind public.event_kind, description text, city text, neighbourhood text,
  venue_name text, venue_address text, starts_at timestamptz, ends_at timestamptz, capacity int,
  price_cents int, allowed_tiers public.access_tier[], status public.event_status, cancel_reason text,
  registered_count int, waitlisted_count int, attended_count int, no_show_count int, cancelled_count int,
  published_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select e.id, e.title, e.kind, e.description, e.city, e.neighbourhood, e.venue_name, e.venue_address,
         e.starts_at, e.ends_at, e.capacity, e.price_cents, e.allowed_tiers, e.status, e.cancel_reason,
         count(r.id) filter (where r.status = 'registered')::int,
         count(r.id) filter (where r.status = 'waitlisted')::int,
         count(r.id) filter (where r.status = 'attended')::int,
         count(r.id) filter (where r.status = 'no_show')::int,
         count(r.id) filter (where r.status = 'cancelled')::int,
         e.published_at, e.created_at, e.updated_at
  from public.events e
  left join public.event_registrations r on r.event_id = e.id
  where coalesce(p_include_past, false) or e.ends_at > now() - interval '1 day'
  group by e.id
  order by e.starts_at, e.id
  limit 500;
end;
$$;

-- Inscrits d'un événement : champs utiles au pointage seulement.
create function public.admin_list_registrations(p_event_id uuid)
returns table (
  id uuid, user_id uuid, display_name text, status public.registration_status, ticket_code text,
  waitlist_rank int, checked_in_at timestamptz, status_changed_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select r.id, r.user_id, p.display_name, r.status, r.ticket_code,
         case when r.status = 'waitlisted' then private.waitlist_rank(r.id) end,
         r.checked_in_at, r.status_changed_at, r.created_at
  from public.event_registrations r
  left join public.profiles p on p.id = r.user_id
  where r.event_id = p_event_id
  order by case r.status when 'attended' then 0 when 'registered' then 1 when 'waitlisted' then 2
                         when 'no_show' then 3 else 4 end,
           r.status_changed_at, r.id;
end;
$$;

-- Pointage à l'entrée, par inscription ou par code de billet. Erreurs : not_found, not_registered.
create function public.admin_check_in(p_registration_id uuid default null, p_ticket_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reg public.event_registrations;
  v_already boolean;
begin
  select * into v_reg from public.event_registrations r
   where (p_registration_id is not null and r.id = p_registration_id)
      or (p_registration_id is null and r.ticket_code = private.normalize_referral_code(p_ticket_code))
   for update;
  if v_reg.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_reg.status not in ('registered', 'attended', 'no_show') then
    raise exception 'not_registered' using errcode = 'P0001';
  end if;
  v_already := v_reg.status = 'attended';
  if not v_already then
    update public.event_registrations r
       set status = 'attended', checked_in_at = now(), checked_in_by = v_admin, status_changed_at = clock_timestamp()
     where r.id = v_reg.id;
    perform private.audit(v_admin, 'event.check_in', 'event_registrations', v_reg.id::text,
                          jsonb_build_object('event_id', v_reg.event_id));
  end if;
  return jsonb_build_object(
    'registration_id', v_reg.id,
    'event_id', v_reg.event_id,
    'display_name', (select p.display_name from public.profiles p where p.id = v_reg.user_id),
    'status', 'attended',
    'already', v_already
  );
end;
$$;

-- Après l'événement : les inscrits non pointés passent « absent ». Erreur : event_not_started.
create function public.admin_mark_no_shows(p_event_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_count int;
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.starts_at <= now()) then
    raise exception 'event_not_started' using errcode = 'P0001';
  end if;
  update public.event_registrations r
     set status = 'no_show', status_changed_at = clock_timestamp()
   where r.event_id = p_event_id and r.status = 'registered';
  get diagnostics v_count = row_count;
  perform private.audit(v_admin, 'event.no_shows', 'events', p_event_id::text, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- Faire monter une personne de la file s'il reste une place. Erreurs : not_found, event_full.
create function public.admin_promote_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reg public.event_registrations;
  v_event public.events;
begin
  select * into v_reg from public.event_registrations r where r.id = p_registration_id;
  if v_reg.id is null or v_reg.status <> 'waitlisted' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_event from public.events e where e.id = v_reg.event_id for update;
  if v_event.status <> 'published' or v_event.starts_at <= now() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if private.event_taken(v_event.id) >= v_event.capacity then
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  update public.event_registrations r
     set status = 'registered', status_changed_at = clock_timestamp()
   where r.id = v_reg.id and r.status = 'waitlisted';
  perform private.event_notice(v_reg.user_id, 'event_promoted', v_event, null);
  perform private.invoke_edge_function('notify',
    jsonb_build_object('type', 'event', 'kind', 'promoted', 'registration_id', v_reg.id));
  perform private.audit(v_admin, 'event.promote', 'event_registrations', v_reg.id::text,
                        jsonb_build_object('event_id', v_event.id));
end;
$$;

-- Annuler un événement : motif obligatoire, toutes les inscriptions annulées, chaque personne
-- prévenue (avis dans l'app et email). Renvoie le nombre de personnes prévenues.
-- Erreurs : reason_required, not_found, event_cancelled.
create function public.admin_cancel_event(p_event_id uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_event public.events;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row record;
  v_count int := 0;
begin
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into v_event from public.events e where e.id = p_event_id for update;
  if v_event.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  update public.events e
     set status = 'cancelled', cancel_reason = v_reason, cancelled_at = now()
   where e.id = p_event_id
  returning * into v_event;

  for v_row in
    update public.event_registrations r
       set status = 'cancelled', cancelled_at = now(), status_changed_at = clock_timestamp()
     where r.event_id = p_event_id and r.status in ('registered', 'waitlisted')
    returning r.id, r.user_id
  loop
    perform private.event_notice(v_row.user_id, 'event_cancelled', v_event, v_reason);
    perform private.invoke_edge_function('notify',
      jsonb_build_object('type', 'event', 'kind', 'cancelled', 'registration_id', v_row.id));
    v_count := v_count + 1;
  end loop;

  perform private.audit(v_admin, 'event.cancel', 'events', p_event_id::text,
                        jsonb_build_object('reason', v_reason, 'notified', v_count));
  return v_count;
end;
$$;

-- Export pour l'organisation (liste à l'entrée, contact) : seul endroit où figurent les emails.
create function public.admin_export_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_event public.events;
begin
  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.audit(v_admin, 'event.export', 'events', p_event_id::text, '{}'::jsonb);
  return jsonb_build_object(
    'exported_at', now(),
    'event', to_jsonb(v_event),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'display_name', p.display_name, 'email', u.email::text, 'status', r.status,
               'ticket_code', r.ticket_code, 'checked_in_at', r.checked_in_at,
               'waitlist_rank', case when r.status = 'waitlisted' then private.waitlist_rank(r.id) end)
             order by r.status, r.status_changed_at, r.id)
      from public.event_registrations r
      left join public.profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
      where r.event_id = p_event_id), '[]'::jsonb)
  );
end;
$$;

-- Rappel la veille (pg_cron, chaque jour à 16 h 07 UTC, soit 17 h ou 18 h à Paris) ----------
-- Un appel notify par événement du lendemain (jour de Paris), une seule fois.
create function private.send_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_count int := 0;
begin
  for v_event in
    update public.events e
       set reminder_sent_at = now()
     where e.status = 'published'
       and e.reminder_sent_at is null
       and e.starts_at >= private.paris_day_start() + interval '1 day'
       and e.starts_at < private.paris_day_start() + interval '2 days'
    returning e.id
  loop
    perform private.invoke_edge_function('notify', jsonb_build_object('type', 'event_reminder', 'event_id', v_event.id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('event-reminders', '7 16 * * *', $$select private.send_event_reminders()$$);

-- Droits et politiques ------------------------------------------------------------------------
revoke all on public.events, public.event_registrations from anon, authenticated;
grant all on public.events, public.event_registrations to service_role;

-- events : lecture directe des événements publiés ouverts à mon palier, sans le lieu exact
-- (colonnes venue_* jamais accordées) ; écriture par RPC admin seulement.
grant select (id, title, kind, description, city, neighbourhood, starts_at, ends_at, capacity, price_cents,
              allowed_tiers, status, cancel_reason, published_at, created_at, updated_at)
  on public.events to authenticated;
create policy events_select on public.events for select to authenticated
  using (public.is_admin() or (status = 'published' and private.can_attend((select auth.uid()), allowed_tiers)));

-- event_registrations : chacun lit ses propres lignes ; aucune écriture directe.
grant select on public.event_registrations to authenticated;
create policy event_registrations_select_own on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function
  public.list_events(),
  public.get_event(uuid),
  public.register_event(uuid, boolean),
  public.cancel_registration(uuid),
  public.get_my_ticket(uuid),
  public.admin_upsert_event(uuid, text, public.event_kind, text, text, text, text, text, timestamptz, timestamptz,
                            int, public.access_tier[], public.event_status),
  public.admin_list_events(boolean),
  public.admin_list_registrations(uuid),
  public.admin_check_in(uuid, text),
  public.admin_mark_no_shows(uuid),
  public.admin_promote_registration(uuid),
  public.admin_cancel_event(uuid, text),
  public.admin_export_event(uuid)
from public, anon, authenticated;

grant execute on function
  public.list_events(),
  public.get_event(uuid),
  public.register_event(uuid, boolean),
  public.cancel_registration(uuid),
  public.get_my_ticket(uuid),
  public.admin_upsert_event(uuid, text, public.event_kind, text, text, text, text, text, timestamptz, timestamptz,
                            int, public.access_tier[], public.event_status),
  public.admin_list_events(boolean),
  public.admin_list_registrations(uuid),
  public.admin_check_in(uuid, text),
  public.admin_mark_no_shows(uuid),
  public.admin_promote_registration(uuid),
  public.admin_cancel_event(uuid, text),
  public.admin_export_event(uuid)
to authenticated, service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_privileged(),
  private.is_server_call(),
  private.age_years(date),
  private.photo_count(uuid),
  private.can_access_match(uuid),
  private.is_not_banned(),
  private.is_matched(uuid, uuid),
  private.can_read_photo_object(text),
  private.can_attend(uuid, public.access_tier[])
to authenticated;
grant execute on all functions in schema private to service_role;

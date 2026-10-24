-- Sapios Emploi, produit minimal : types, tables, stockage et règles d'accès (docs/EMPLOI_CONTRACT.md §1, §2, §4).
--
-- Principes :
--   * un compte est candidat ou recruteur (emploi_accounts), choisi une fois ;
--   * avant le match, rien de ce qu'un recruteur lit ne permet d'identifier le candidat : le prénom et le
--     nom vivent dans candidate_identities, sans aucun droit de lecture client, et ne sortent que par des
--     RPC qui vérifient le statut de la candidature (décision E9) ;
--   * aucune écriture client directe hors CV photo d'offre et blocages : tout passe par des RPC qui
--     contrôlent les règles du contrat.
-- Les objets du dating restent intacts (décision E1).

-- 1. Types -------------------------------------------------------------------------------------------
create type public.emploi_account_kind as enum ('candidate', 'recruiter');
create type public.company_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.company_role as enum ('owner', 'recruiter');
create type public.contract_type as enum ('cdi', 'cdd');
create type public.experience_band as enum ('y0_1', 'y1_3', 'y3_5', 'y5_plus');
create type public.offer_status as enum ('draft', 'pending_review', 'published', 'rejected', 'filled', 'expired', 'archived');
create type public.offer_photo_kind as enum ('workplace', 'manager', 'team', 'tools', 'area');
create type public.application_status as enum (
  'sent', 'seen', 'interested', 'interview', 'offer_made', 'hired', 'rejected', 'closed_no_response', 'withdrawn'
);
create type public.refusal_reason as enum ('experience', 'skills', 'position_filled', 'other_profile', 'other');
create type public.interview_mode as enum ('visio', 'onsite');
create type public.slot_status as enum ('proposed', 'accepted', 'declined', 'cancelled');
create type public.language_level as enum ('a2', 'b1', 'b2', 'c1', 'c2');
create type public.invitation_status as enum ('sent', 'applied', 'declined');
create type public.offer_report_reason as enum ('fake', 'discriminatory', 'misleading_salary', 'scam', 'other');

-- Numéro affiché des candidats (« n° 0427 ») : jamais réutilisé, sans lien avec l'identité.
create sequence private.candidate_number_seq start with 100;

-- Tableau de textes : au plus p_max éléments, chacun de p_min à p_len caractères (après btrim).
create function private.text_array_ok(p_values text[], p_max int, p_min int, p_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_values is not null
     and coalesce(cardinality(p_values), 0) <= p_max
     and not exists (select 1 from unnest(p_values) v
                      where v is null or char_length(btrim(v)) not between p_min and p_len);
$$;

-- 2. Comptes et candidats ----------------------------------------------------------------------------
create table public.emploi_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind public.emploi_account_kind not null,
  created_at timestamptz not null default now()
);

create table public.candidates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  number int not null unique default nextval('private.candidate_number_seq'),
  target_role text not null check (char_length(btrim(target_role)) between 2 and 80),
  search_city text not null check (char_length(btrim(search_city)) between 1 and 80),
  search_postcode text check (search_postcode is null or search_postcode ~ '^[0-9]{5}$'),
  search_location extensions.geography(Point, 4326) not null,
  search_radius_km int not null default 20 check (search_radius_km between 5 and 100),
  contract_types public.contract_type[] not null check (cardinality(contract_types) between 1 and 2),
  salary_min_k int not null check (salary_min_k between 15 and 300),
  salary_max_k int not null check (salary_max_k between 15 and 300),
  remote_days_min int not null default 0 check (remote_days_min between 0 and 5),
  available_from date,
  experience_band public.experience_band not null,
  work_authorization boolean not null default false,
  looking_for text check (looking_for is null or char_length(looking_for) <= 250),
  open_to_opportunities boolean not null default false,
  -- Date d'activation de « Ouvert·e aux opportunités » : ordre de l'approche directe (contrat §6).
  open_since timestamptz,
  show_institution boolean not null default false,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  constraint candidates_salary_order check (salary_min_k <= salary_max_k)
);
create index candidates_search_location_idx on public.candidates using gist (search_location);
create index candidates_open_idx on public.candidates (open_since desc) where open_to_opportunities and not paused;

-- Identité civile : prénom en clair (montré au recruteur après le match seulement), nom chiffré.
create table public.candidate_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 40),
  last_name_enc bytea not null,
  updated_at timestamptz not null default now()
);

create table public.cv_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null check (position between 0 and 9),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  employer text not null check (char_length(btrim(employer)) between 1 and 80),
  employer_hidden boolean not null default false,
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (end_month is null or extract(day from end_month) = 1),
  summary text check (summary is null or char_length(summary) <= 300),
  constraint cv_experiences_position_key unique (user_id, position),
  constraint cv_experiences_order check (end_month is null or end_month >= start_month)
);

create table public.cv_skills (
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null check (position between 0 and 9),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  primary key (user_id, position)
);

create table public.cv_languages (
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null check (char_length(btrim(language)) between 2 and 30),
  level public.language_level not null,
  primary key (user_id, language)
);

-- 3. Entreprises -------------------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  siren text not null unique check (siren ~ '^[0-9]{9}$'),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 200),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  naf_code text check (naf_code is null or char_length(naf_code) <= 10),
  naf_label text check (naf_label is null or char_length(naf_label) <= 200),
  headcount_band text check (headcount_band is null or char_length(headcount_band) <= 60),
  city text check (city is null or char_length(city) <= 80),
  postcode text check (postcode is null or postcode ~ '^[0-9]{5}$'),
  sirene jsonb,
  description text check (description is null or char_length(description) <= 1000),
  website text check (website is null or char_length(website) <= 200),
  email_domain text check (email_domain is null or email_domain = lower(email_domain)),
  email_domain_generic boolean not null default false,
  status public.company_status not null default 'pending',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_status_idx on public.companies (status, created_at);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.company_role not null default 'recruiter',
  job_title text not null check (char_length(btrim(job_title)) between 2 and 80),
  -- Prénom du recruteur, montré au candidat après le match (« Thomas, RH »). Facultatif.
  first_name text check (first_name is null or char_length(btrim(first_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- 4. Offres ------------------------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  contract public.contract_type not null default 'cdi',
  city text check (city is null or char_length(btrim(city)) between 1 and 80),
  postcode text check (postcode is null or postcode ~ '^[0-9]{5}$'),
  address_label text check (address_label is null or char_length(address_label) <= 200),
  location extensions.geography(Point, 4326),
  remote_days int not null default 0 check (remote_days between 0 and 5),
  salary_min_k int check (salary_min_k is null or salary_min_k between 15 and 300),
  salary_max_k int check (salary_max_k is null or salary_max_k between 15 and 300),
  start_label text check (start_label is null or char_length(start_label) <= 40),
  experience_band public.experience_band not null default 'y0_1',
  missions text[] not null default '{}' check (private.text_array_ok(missions, 3, 3, 160)),
  must_have text[] not null default '{}' check (private.text_array_ok(must_have, 3, 1, 60)),
  nice_to_have text[] not null default '{}' check (private.text_array_ok(nice_to_have, 5, 1, 60)),
  language_justification text check (language_justification is null or char_length(language_justification) <= 200),
  team_description text check (team_description is null or char_length(team_description) <= 300),
  manager_name text check (manager_name is null or char_length(manager_name) <= 80),
  manager_title text check (manager_title is null or char_length(manager_title) <= 80),
  interviews_count int not null default 2 check (interviews_count between 1 and 3),
  response_days int not null default 7 check (response_days in (3, 7, 10)),
  status public.offer_status not null default 'draft',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  submitted_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_salary_order check (salary_min_k is null or salary_max_k is null or salary_min_k <= salary_max_k),
  constraint offers_published_complete check (
    status not in ('published', 'pending_review')
    or (location is not null and salary_min_k is not null and salary_max_k is not null
        and cardinality(missions) = 3 and cardinality(must_have) >= 1)
  )
);
create index offers_company_idx on public.offers (company_id, created_at desc);
create index offers_published_idx on public.offers (published_at desc) where status = 'published';
create index offers_location_idx on public.offers using gist (location);
create index offers_review_idx on public.offers (submitted_at) where status = 'pending_review';

create table public.offer_photos (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.offer_photo_kind not null,
  storage_path text not null unique check (char_length(storage_path) between 3 and 300),
  position int not null default 0 check (position between 0 and 19),
  consent_certified boolean not null default false,
  moderation public.photo_moderation not null default 'pending',
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) <= 300),
  created_at timestamptz not null default now(),
  -- Une photo qui montre des personnes exige l'accord écrit de chacune, certifié par l'entreprise.
  constraint offer_photos_consent check (kind not in ('manager', 'team') or consent_certified),
  constraint offer_photos_path_folder check (storage_path like company_id::text || '/%')
);
create index offer_photos_offer_idx on public.offer_photos (offer_id, position);

create table public.offer_passes (
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);

-- 5. Candidatures ------------------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  status public.application_status not null default 'sent',
  note text check (note is null or char_length(note) <= 140),
  note_target text check (note_target is null or char_length(note_target) <= 60),
  note_target_label text check (note_target_label is null or char_length(note_target_label) <= 200),
  invited boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  due_at timestamptz not null,
  decided_at timestamptz,
  -- Recruteur qui a répondu (interlocuteur montré au candidat après le match).
  decided_by uuid references auth.users (id) on delete set null,
  interested_at timestamptz,
  closed_at timestamptz,
  refusal_reason public.refusal_reason,
  refusal_message text check (refusal_message is null or char_length(refusal_message) <= 600),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint applications_offer_candidate_key unique (offer_id, candidate_id),
  -- Un refus est toujours une décision humaine motivée ; une échéance dépassée n'est jamais un refus.
  constraint applications_refusal_has_reason check (status <> 'rejected' or refusal_reason is not null)
);
create index applications_candidate_idx on public.applications (candidate_id, created_at desc);
create index applications_offer_idx on public.applications (offer_id, status, created_at);
create index applications_due_idx on public.applications (due_at) where status in ('sent', 'seen');

create table public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index application_notes_app_idx on public.application_notes (application_id, created_at);

create table public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  -- Côté de l'expéditeur, gardé même si son compte disparaît (lu / non lu, « moi » / « l'autre »).
  from_candidate boolean not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  context text check (context is null or char_length(context) <= 300),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index application_messages_app_idx on public.application_messages (application_id, created_at);

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 45 check (duration_min between 15 and 180),
  mode public.interview_mode not null default 'visio',
  location text check (location is null or char_length(location) <= 200),
  with_whom text check (with_whom is null or char_length(with_whom) <= 120),
  status public.slot_status not null default 'proposed',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index interview_slots_app_idx on public.interview_slots (application_id, starts_at);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 400),
  status public.invitation_status not null default 'sent',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint invitations_offer_candidate_key unique (offer_id, candidate_id)
);
create index invitations_company_idx on public.invitations (company_id, created_at desc);
create index invitations_candidate_idx on public.invitations (candidate_id, created_at desc);

create table public.company_blocks (
  candidate_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (candidate_id, company_id)
);

create table public.offer_reports (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason public.offer_report_reason not null,
  details text check (details is null or char_length(details) <= 1000),
  status public.report_status not null default 'open',
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index offer_reports_status_idx on public.offer_reports (status, created_at);

-- 6. Déclencheurs : dates de mise à jour, position arrondie à ~100 m --------------------------------
create trigger candidates_touch before update on public.candidates
  for each row execute function private.touch_updated_at();
create trigger companies_touch before update on public.companies
  for each row execute function private.touch_updated_at();
create trigger offers_touch before update on public.offers
  for each row execute function private.touch_updated_at();
create trigger applications_touch before update on public.applications
  for each row execute function private.touch_updated_at();

create function private.round_point(p_point extensions.geography)
returns extensions.geography
language sql
immutable
set search_path = ''
as $$
  select case when p_point is null then null else
    extensions.st_setsrid(
      extensions.st_makepoint(round(extensions.st_x(p_point::extensions.geometry)::numeric, 3)::float8,
                              round(extensions.st_y(p_point::extensions.geometry)::numeric, 3)::float8),
      4326)::extensions.geography end;
$$;

create function private.candidates_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_location := private.round_point(new.search_location);
  if new.open_to_opportunities and (tg_op = 'INSERT' or not old.open_to_opportunities) then
    new.open_since := now();
  elsif not new.open_to_opportunities then
    new.open_since := null;
  end if;
  return new;
end;
$$;
create trigger candidates_before_write before insert or update on public.candidates
  for each row execute function private.candidates_before_write();

create function private.offers_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.location := private.round_point(new.location);
  return new;
end;
$$;
create trigger offers_before_write before insert or update of location on public.offers
  for each row execute function private.offers_before_write();

-- 7. Avis dans l'app : nouveaux types ----------------------------------------------------------------
alter table public.member_notices drop constraint member_notices_kind_check;
alter table public.member_notices
  add constraint member_notices_kind_check
  check (kind in ('content_removed', 'event_promoted', 'event_cancelled', 'inactivity_warning',
                  'application_interested', 'application_rejected', 'application_closed', 'interview_proposed',
                  'invitation_received', 'company_verified', 'company_rejected', 'company_suspended',
                  'offer_published', 'offer_rejected'));

-- 8. Réglages ----------------------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('emploi_terms_candidate_version', to_jsonb('cgu-emploi-2026-11-brouillon'::text),
   'Version des CGU candidats de Sapios Emploi ; la changer redemande l''acceptation'),
  ('emploi_terms_recruiter_version', to_jsonb('cgr-emploi-2026-11-brouillon'::text),
   'Version des conditions générales recruteurs ; la changer redemande l''acceptation'),
  ('offer_lifetime_days', to_jsonb(60), 'Durée de publication d''une offre, en jours'),
  ('application_content_retention_days', to_jsonb(180),
   'Délai après la clôture d''une candidature avant l''effacement du mot, des messages et des notes'),
  ('invitation_weekly_quota', to_jsonb(20), 'Invitations d''approche directe par entreprise et par semaine glissante'),
  ('apply_daily_quota', to_jsonb(30), 'Candidatures par candidat et par jour'),
  ('generic_email_domains', '["gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr", "outlook.com",
     "outlook.fr", "live.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net",
     "gmx.fr", "protonmail.com", "proton.me"]'::jsonb,
   'Domaines d''email génériques : l''inscription d''une entreprise avec l''un d''eux demande un Kbis'),
  ('offer_banned_words', '["natif", "native", "langue maternelle", "moins de 30 ans", "moins de 35 ans",
     "jeune et dynamique", "bonne présentation", "nationalité française", "sans enfant"]'::jsonb,
   'Expressions refusées dans une offre (critères discriminatoires)')
on conflict (key) do nothing;

-- 9. Stockage : photos des offres --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offer-photos', 'offer-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Fonctions d'appartenance utilisées par les règles (security definer : pas de récursion de RLS).
create function private.member_company(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.company_id from public.company_members cm where cm.user_id = p_uid;
$$;

create function private.is_company_member(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company is not null and exists (
    select 1 from public.company_members cm where cm.company_id = p_company and cm.user_id = (select auth.uid())
  );
$$;

-- Offre lisible par un compte connecté hors entreprise : publiée, non expirée, entreprise vérifiée.
create function private.offer_is_public(p_offer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.offers o join public.companies c on c.id = o.company_id
     where o.id = p_offer and o.status = 'published' and c.status = 'verified'
       and (o.expires_at is null or o.expires_at > now())
  );
$$;

create function private.offer_is_editable(p_offer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.offers o where o.id = p_offer and o.status in ('draft', 'rejected'));
$$;

create function public.can_view_offer_photo(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_photo public.offer_photos;
  v_folder text := (storage.foldername(path))[1];
begin
  if auth.uid() is null or v_folder is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  if v_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and private.is_company_member(v_folder::uuid) then
    return true;
  end if;
  select * into v_photo from public.offer_photos p where p.storage_path = path;
  return found and v_photo.moderation = 'approved' and private.offer_is_public(v_photo.offer_id);
end;
$$;

create policy offer_photos_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'offer-photos'
    and (storage.foldername(name))[1] = (select private.member_company(auth.uid()))::text
  );
create policy offer_photos_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'offer-photos'
    and (storage.foldername(name))[1] = (select private.member_company(auth.uid()))::text
  );
create policy offer_photos_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'offer-photos' and public.can_view_offer_photo(name));

-- 10. Règles d'accès (RLS) ---------------------------------------------------------------------------
alter table public.emploi_accounts enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_identities enable row level security;
alter table public.cv_experiences enable row level security;
alter table public.cv_skills enable row level security;
alter table public.cv_languages enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.offers enable row level security;
alter table public.offer_photos enable row level security;
alter table public.offer_passes enable row level security;
alter table public.applications enable row level security;
alter table public.application_notes enable row level security;
alter table public.application_messages enable row level security;
alter table public.interview_slots enable row level security;
alter table public.invitations enable row level security;
alter table public.company_blocks enable row level security;
alter table public.offer_reports enable row level security;

revoke all on public.emploi_accounts, public.candidates, public.candidate_identities, public.cv_experiences,
  public.cv_skills, public.cv_languages, public.companies, public.company_members, public.offers,
  public.offer_photos, public.offer_passes, public.applications, public.application_notes,
  public.application_messages, public.interview_slots, public.invitations, public.company_blocks,
  public.offer_reports
  from anon, authenticated;
grant all on public.emploi_accounts, public.candidates, public.candidate_identities, public.cv_experiences,
  public.cv_skills, public.cv_languages, public.companies, public.company_members, public.offers,
  public.offer_photos, public.offer_passes, public.applications, public.application_notes,
  public.application_messages, public.interview_slots, public.invitations, public.company_blocks,
  public.offer_reports
  to service_role;
revoke all on sequence private.candidate_number_seq from public, anon, authenticated;

-- Soi et admins.
create policy emploi_accounts_select on public.emploi_accounts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.emploi_accounts to authenticated;

create policy candidates_select on public.candidates for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.candidates to authenticated;

-- candidate_identities : aucune règle, aucun droit client. Lecture par RPC seulement.

create policy cv_experiences_select on public.cv_experiences for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy cv_skills_select on public.cv_skills for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy cv_languages_select on public.cv_languages for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.cv_experiences, public.cv_skills, public.cv_languages to authenticated;

-- Entreprises : membres et admins voient tout ; les autres comptes ne voient que les entreprises
-- vérifiées, sans les colonnes internes (instantané Sirene, domaine, auteurs, motif).
create policy companies_select on public.companies for select to authenticated
  using (status = 'verified' or private.is_company_member(id) or (select public.is_admin()));
grant select (id, siren, legal_name, display_name, naf_code, naf_label, headcount_band, city, postcode,
              description, website, status, verified_at, created_at, updated_at)
  on public.companies to authenticated;

create policy company_members_select on public.company_members for select to authenticated
  using (private.is_company_member(company_id) or (select public.is_admin()));
grant select on public.company_members to authenticated;

create policy offers_select on public.offers for select to authenticated
  using (private.is_company_member(company_id) or (select public.is_admin()) or private.offer_is_public(id));
grant select (id, company_id, title, contract, city, postcode, address_label, location, remote_days, salary_min_k,
              salary_max_k, start_label, experience_band, missions, must_have, nice_to_have, language_justification,
              team_description, manager_name, manager_title, interviews_count, response_days, status, status_reason,
              submitted_at, published_at, expires_at, closed_at, created_at, updated_at)
  on public.offers to authenticated;

create policy offer_photos_select on public.offer_photos for select to authenticated
  using (private.is_company_member(company_id) or (select public.is_admin())
         or (moderation = 'approved' and private.offer_is_public(offer_id)));
create policy offer_photos_insert on public.offer_photos for insert to authenticated
  with check (private.is_company_member(company_id) and private.offer_is_editable(offer_id)
              and exists (select 1 from public.offers o where o.id = offer_id and o.company_id = offer_photos.company_id));
create policy offer_photos_update on public.offer_photos for update to authenticated
  using (private.is_company_member(company_id) and private.offer_is_editable(offer_id))
  with check (private.is_company_member(company_id) and private.offer_is_editable(offer_id));
create policy offer_photos_delete on public.offer_photos for delete to authenticated
  using (private.is_company_member(company_id) and private.offer_is_editable(offer_id));
grant select (id, offer_id, company_id, kind, storage_path, position, consent_certified, moderation,
              moderation_reason, created_at)
  on public.offer_photos to authenticated;
grant insert (offer_id, company_id, kind, storage_path, position, consent_certified) on public.offer_photos to authenticated;
grant update (position, consent_certified) on public.offer_photos to authenticated;
grant delete on public.offer_photos to authenticated;

-- offer_passes : RPC seulement.

create policy applications_select on public.applications for select to authenticated
  using (candidate_id = (select auth.uid()) or private.is_company_member(company_id) or (select public.is_admin()));
-- Sans candidate_id : l'identifiant du compte ne sort jamais vers un recruteur (il pourrait relier des
-- candidatures d'une entreprise à l'autre).
grant select (id, offer_id, company_id, status, note, note_target, note_target_label, invited, created_at, seen_at,
              due_at, decided_at, decided_by, interested_at, closed_at, refusal_reason, refusal_message, withdrawn_at,
              updated_at)
  on public.applications to authenticated;

-- Les règles qui dépendent de la candidature passent par des fonctions security definer : une sous-requête
-- de règle s'exécute avec les droits de l'appelant, qui ne peut pas lire applications.candidate_id.
create function private.application_access(p_app uuid, p_matched_only boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.candidate_id = (select auth.uid()) then 'candidate'
    when private.is_company_member(a.company_id) then 'company'
  end
  from public.applications a
  where a.id = p_app and (not p_matched_only or a.interested_at is not null);
$$;
revoke all on function private.application_access(uuid, boolean) from public, anon;
grant execute on function private.application_access(uuid, boolean) to authenticated, service_role;

create policy application_notes_select on public.application_notes for select to authenticated
  using ((select public.is_admin()) or private.application_access(application_id, false) = 'company');
grant select on public.application_notes to authenticated;

-- Messages : seulement les deux parties, et seulement si la candidature a été appariée un jour.
create policy application_messages_select on public.application_messages for select to authenticated
  using (private.application_access(application_id, true) is not null);
grant select (id, application_id, from_candidate, body, context, created_at, read_at)
  on public.application_messages to authenticated;

create policy interview_slots_select on public.interview_slots for select to authenticated
  using (private.application_access(application_id, false) is not null);
grant select on public.interview_slots to authenticated;

create policy invitations_select on public.invitations for select to authenticated
  using (candidate_id = (select auth.uid()) or private.is_company_member(company_id));
grant select (id, offer_id, company_id, message, status, created_by, created_at, responded_at)
  on public.invitations to authenticated;

create policy company_blocks_select on public.company_blocks for select to authenticated
  using (candidate_id = (select auth.uid()));
create policy company_blocks_insert on public.company_blocks for insert to authenticated
  with check (candidate_id = (select auth.uid()));
create policy company_blocks_delete on public.company_blocks for delete to authenticated
  using (candidate_id = (select auth.uid()));
grant select, delete on public.company_blocks to authenticated;
grant insert (candidate_id, company_id) on public.company_blocks to authenticated;

create policy offer_reports_select on public.offer_reports for select to authenticated
  using ((select public.is_admin()));
grant select on public.offer_reports to authenticated;

revoke all on function private.text_array_ok(text[], int, int, int), private.round_point(extensions.geography),
  private.member_company(uuid), private.is_company_member(uuid), private.offer_is_public(uuid),
  private.offer_is_editable(uuid)
  from public, anon;
grant execute on function private.text_array_ok(text[], int, int, int), private.round_point(extensions.geography),
  private.member_company(uuid), private.is_company_member(uuid), private.offer_is_public(uuid),
  private.offer_is_editable(uuid)
  to authenticated, service_role;
revoke all on function private.candidates_before_write(), private.offers_before_write() from public, anon, authenticated;
revoke all on function public.can_view_offer_photo(text) from public, anon;
grant execute on function public.can_view_offer_photo(text) to authenticated, service_role;

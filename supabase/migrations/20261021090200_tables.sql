-- Tables (brief §5, contrat §2). La RLS est activée dès la création ; les politiques et les
-- droits sont dans 20261021090400_rls.sql. Tout ce qui appartient à un compte part en cascade
-- avec auth.users, sauf audit_log (aucune clé étrangère : la trace survit à la suppression).

-- Profil public ------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  gender public.gender,
  seeking_genders public.gender[] not null default '{}',
  age_min int not null default 18,
  age_max int not null default 99,
  bio text check (bio is null or char_length(bio) <= 500),
  city text check (city is null or char_length(city) <= 80),
  location extensions.geography(Point, 4326),
  status public.profile_status not null default 'onboarding',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint profiles_age_range check (age_min >= 18 and age_max <= 120 and age_min <= age_max)
);
alter table public.profiles enable row level security;
create index profiles_location_idx on public.profiles using gist (location);
create index profiles_status_activity_idx on public.profiles (status, last_active_at desc);

-- Données d'identité, lisibles par le seul propriétaire ----------------------------------------
create table public.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 2 and 200),
  birthdate date check (birthdate is null or birthdate > date '1900-01-01'),
  consent_sensitive_at timestamptz,
  consent_version text check (consent_version is null or char_length(consent_version) <= 40),
  created_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;

-- Photos (fichiers dans le bucket privé `photos`, chemin `{user_id}/{uuid}.{ext}`) --------------
create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0 check (position between 0 and 9),
  moderation_status public.photo_moderation not null default 'pending',
  created_at timestamptz not null default now(),
  constraint profile_photos_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);
alter table public.profile_photos enable row level security;
create index profile_photos_user_idx on public.profile_photos (user_id, position);

-- Soumissions de diplôme (fichier dans le bucket privé `diplomas`) ------------------------------
create table public.degree_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  doc_sha256 text unique check (doc_sha256 is null or doc_sha256 ~ '^[0-9a-f]{64}$'),
  status public.submission_status not null default 'pending',
  extracted jsonb,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  signals text[] not null default '{}',
  level_verified int check (level_verified is null or level_verified between 1 and 8),
  reviewer_id uuid, -- pas de FK : la décision reste attribuée même si le modérateur part
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  moderator_note text,
  attempts int not null default 0 check (attempts >= 0),
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint degree_submissions_path_owner check (split_part(storage_path, '/', 1) = user_id::text),
  constraint degree_submissions_approved_reviewed
    check (status <> 'approved' or (reviewer_id is not null and level_verified is not null))
);
alter table public.degree_submissions enable row level security;
create index degree_submissions_user_idx on public.degree_submissions (user_id, created_at desc);
create index degree_submissions_status_idx on public.degree_submissions (status, created_at);
create index degree_submissions_purge_idx on public.degree_submissions (reviewed_at)
  where file_deleted_at is null;
-- Recherche de doublon du triplet (titulaire, établissement, année) par process-diploma.
create index degree_submissions_year_idx on public.degree_submissions ((extracted ->> 'year_awarded'))
  where extracted is not null;

-- Configuration des paliers (éditable par les admins) ------------------------------------------
create table public.access_policy (
  id uuid primary key default gen_random_uuid(),
  min_level int not null unique check (min_level between 1 and 8),
  tier public.access_tier not null,
  daily_like_quota int check (daily_like_quota is null or daily_like_quota >= 0),
  can_browse boolean not null default false,
  sees_likers boolean not null default false,
  copy_key text not null,
  created_at timestamptz not null default now()
);
alter table public.access_policy enable row level security;

-- Palier effectif d'un compte : écrit uniquement côté serveur ----------------------------------
create table public.user_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  level int check (level is null or level between 1 and 8),
  tier public.access_tier not null,
  copy_key text,
  source_submission_id uuid references public.degree_submissions (id) on delete set null,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  created_at timestamptz not null default now()
);
alter table public.user_access enable row level security;
create index user_access_tier_idx on public.user_access (tier);

-- Swipes, matches, messages -------------------------------------------------------------------
create table public.swipes (
  swiper_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  direction public.swipe_direction not null,
  created_at timestamptz not null default now(),
  primary key (swiper_id, target_id),
  constraint swipes_not_self check (swiper_id <> target_id)
);
alter table public.swipes enable row level security;
create index swipes_target_idx on public.swipes (target_id, direction);
create index swipes_likes_by_day_idx on public.swipes (swiper_id, created_at) where direction = 'like';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  unmatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint matches_ordered check (user_a < user_b),
  constraint matches_pair_key unique (user_a, user_b)
);
alter table public.matches enable row level security;
create index matches_user_b_idx on public.matches (user_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 2000 and char_length(btrim(body)) >= 1),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index messages_match_idx on public.messages (match_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

-- Sécurité -----------------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 100),
  details text check (details is null or char_length(details) <= 2000),
  status public.report_status not null default 'open',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_not_self check (reporter_id <> target_id)
);
alter table public.reports enable row level security;
create index reports_status_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_id);

-- Jetons Expo : un jeton appartient à un seul compte (il « change de main » à la reconnexion).
create table public.push_tokens (
  token text primary key check (char_length(token) between 1 and 500),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform public.push_platform not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_user_token_key unique (user_id, token)
);
alter table public.push_tokens enable row level security;

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null default 'moderator',
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Textes et réglages --------------------------------------------------------------------------
create table public.app_copy (
  key text not null check (key ~ '^[a-z0-9_.]+$'),
  locale text not null default 'fr' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  text text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (key, locale)
);
alter table public.app_copy enable row level security;

-- Réglages numériques (rayon du feed, rétention…) ; les fonctions ont une valeur de repli.
create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- Journal d'audit : ajout seul (trigger dans 20261021090300_core_functions.sql).
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- Liste d'attente de la landing (seule table ouverte à `anon`, en insertion) -------------------
create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique
    check (char_length(email::text) <= 254 and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  source text check (source is null or char_length(source) <= 100),
  created_at timestamptz not null default now()
);
alter table public.waitlist_signups enable row level security;

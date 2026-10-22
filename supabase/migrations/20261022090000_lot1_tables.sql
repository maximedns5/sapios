-- Lot 1 (cadrage des fonctionnalités §1 à §3) : profil intellectuel, likes ciblés, découverte par critères.
-- Types, tables et colonnes. Droits et politiques dans 20261022090200_lot1_rls.sql.
-- Tout ce qui appartient à un compte part en cascade avec auth.users.

create extension if not exists unaccent with schema extensions;

-- Types ---------------------------------------------------------------------------------------
-- Domaines d'études : les grands domaines de la CITE/ISCED-F 2013, au vocabulaire français.
create type public.study_field as enum (
  'education',        -- Sciences de l'éducation
  'arts',             -- Arts et design
  'letters',          -- Lettres et langues
  'philosophy',       -- Philosophie
  'history',          -- Histoire et archéologie
  'social_sciences',  -- Sciences sociales et psychologie
  'economics',        -- Économie et gestion
  'law',              -- Droit et science politique
  'sciences',         -- Sciences de la nature
  'mathematics',      -- Mathématiques
  'computing',        -- Informatique
  'engineering',      -- Ingénierie et architecture
  'agronomy',         -- Agronomie et environnement
  'health'            -- Médecine et santé
);
create type public.thesis_visibility as enum ('everyone', 'matches');
create type public.discovery_sort as enum ('activity', 'affinity');
create type public.content_kind as enum ('answer', 'book', 'thesis');
create type public.content_flag_status as enum ('open', 'kept', 'removed', 'withdrawn');

-- Profil : domaine et options d'affichage ----------------------------------------------------
-- La phrase de thèse vit dans sa propre table (profile_theses) : `profiles` est lisible par tout
-- membre qui voit le profil, la thèse seulement après un match par défaut (D3).
alter table public.profiles
  add column study_field public.study_field,
  add column show_institution boolean not null default false,
  add column show_quiz_badge boolean not null default false;

-- Catalogue des questions (texte dans app_copy, clé `prompt.<key>`) ---------------------------
create table public.profile_prompts (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profile_prompts enable row level security;

-- Réponses (3 au plus), livres (5 au plus), thèse ---------------------------------------------
-- Modération après publication (D6) : `approved` par défaut, `pending` si le filtre automatique
-- ou un signalement l'envoie en file (le texte reste visible), `rejected` s'il est retiré.
create table public.profile_answers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  id uuid not null default gen_random_uuid() unique,
  prompt_key text not null references public.profile_prompts (key) on update cascade,
  answer text not null check (char_length(btrim(answer)) between 1 and 250),
  moderation_status public.photo_moderation not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, position),
  constraint profile_answers_prompt_once unique (user_id, prompt_key)
);
alter table public.profile_answers enable row level security;
create index profile_answers_prompt_idx on public.profile_answers (prompt_key);

create table public.profile_books (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position smallint not null check (position between 0 and 4),
  id uuid not null default gen_random_uuid() unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text check (author is null or char_length(author) <= 120),
  ol_work_id text check (ol_work_id is null or ol_work_id ~ '^OL[0-9]+W$'),
  moderation_status public.photo_moderation not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, position)
);
alter table public.profile_books enable row level security;

create table public.profile_theses (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  line text not null check (char_length(btrim(line)) between 1 and 160),
  visibility public.thesis_visibility not null default 'matches',
  moderation_status public.photo_moderation not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_theses enable row level security;

-- Établissement et domaine vérifiés (saisis par le modérateur à la validation) ----------------
alter table public.degree_submissions
  add column institution_verified text
    check (institution_verified is null or char_length(btrim(institution_verified)) between 1 and 200),
  add column field_verified public.study_field;

-- Recopiés dans user_access pour que le feed ne lise jamais degree_submissions.
alter table public.user_access
  add column institution text check (institution is null or char_length(btrim(institution)) between 1 and 200),
  add column study_field public.study_field;

-- Critères de découverte (une ligne par membre ; absente = valeurs par défaut) ----------------
-- max_distance_km null = rayon par défaut (app_settings.feed_radius_km). L'âge reste dans profiles.
-- levels / fields vides = aucune préférence. strict_* : on exclut au lieu de faire remonter (D8).
create table public.discovery_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  max_distance_km int check (max_distance_km is null or max_distance_km between 5 and 200),
  levels int[] not null default '{}' check (levels <@ array[1, 2, 3, 4, 5, 6, 7, 8]),
  strict_levels boolean not null default false,
  fields public.study_field[] not null default '{}',
  strict_fields boolean not null default false,
  sort public.discovery_sort not null default 'activity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.discovery_prefs enable row level security;

-- Likes ciblés (une photo ou une réponse) avec un mot facultatif -------------------------------
-- liked_item : null = tout le profil, sinon `photo:<uuid>` ou `answer:<position>`.
alter table public.swipes
  add column liked_item text
    check (liked_item is null or liked_item ~ '^(photo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|answer:[0-2])$'),
  add column comment text check (comment is null or char_length(btrim(comment)) between 1 and 140),
  add constraint swipes_item_on_like check (direction = 'like' or (liked_item is null and comment is null));

-- Au match, chaque mot accompagnant un like devient le premier message de son auteur.
-- context : la réponse citée ; liked_item : l'élément aimé ; from_like : message issu d'un like
-- (pas de notification « nouveau message », le match est déjà notifié).
alter table public.messages
  add column context text check (context is null or char_length(context) <= 300),
  add column liked_item text
    check (liked_item is null or liked_item ~ '^(photo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|answer:[0-2])$'),
  add column from_like boolean not null default false;

-- Signalement d'un contenu précis (réponse, livre, thèse) --------------------------------------
alter table public.reports
  add column content_kind public.content_kind,
  add column content_item_id uuid,
  add constraint reports_content_item check (
    (content_kind is null and content_item_id is null)
    or (content_kind = 'thesis' and content_item_id is null)
    or (content_kind in ('answer', 'book') and content_item_id is not null));

-- File de modération des textes ----------------------------------------------------------------
-- Une seule entrée ouverte par élément ; item_id = id de la réponse ou du livre, null pour la thèse.
create table public.content_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.content_kind not null,
  item_id uuid,
  excerpt text not null check (char_length(excerpt) <= 500),
  reasons text[] not null default '{}',
  source text not null check (source in ('auto', 'report')),
  report_id uuid references public.reports (id) on delete set null,
  status public.content_flag_status not null default 'open',
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_flags_item check ((kind = 'thesis') = (item_id is null))
);
alter table public.content_flags enable row level security;
create unique index content_flags_open_item_idx
  on public.content_flags (user_id, kind, coalesce(item_id, user_id)) where status = 'open';
create index content_flags_status_idx on public.content_flags (status, created_at);

-- Avis au membre (motif d'un retrait de contenu : obligation de motivation du DSA) -------------
create table public.member_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('content_removed')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.member_notices enable row level security;
create index member_notices_user_idx on public.member_notices (user_id, created_at desc);

-- updated_at ----------------------------------------------------------------------------------
create trigger discovery_prefs_touch before update on public.discovery_prefs
  for each row execute function private.touch_updated_at();

-- Réglages et textes par défaut (`do nothing` : le back-office garde la main) ------------------
insert into public.app_settings (key, value, description)
values
  ('affinity_weight_field', '3', 'Affinités : points pour un même domaine d''études'),
  ('affinity_weight_book', '2', 'Affinités : points par livre en commun'),
  ('affinity_weight_prompt', '1', 'Affinités : points par question à laquelle les deux ont répondu'),
  ('affinity_weight_institution', '2', 'Affinités : points pour un même établissement (si les deux l''affichent)'),
  ('moderation_blocklist',
   '["snapchat", "snap", "instagram", "insta", "whatsapp", "telegram", "onlyfans", "tiktok", "salope", "connard", "connasse", "pute", "encule", "nazi"]',
   'Mots qui envoient une réponse, un livre ou une thèse dans la file de modération')
on conflict (key) do nothing;

-- Catalogue : aucune question n'invite la politique, la religion, la santé ou la sexualité.
insert into public.profile_prompts (key, position)
values
  ('three_hours', 1), ('winning_debate', 2), ('secret_reread', 3), ('useless_fact', 4),
  ('changed_my_mind', 5), ('explain_with_passion', 6), ('favorite_footnote', 7), ('dinner_guest', 8),
  ('first_date', 9), ('teach_me', 10), ('rabbit_hole', 11), ('word_comeback', 12),
  ('typo_peeve', 13), ('overrated_classic', 14), ('underrated_classic', 15), ('procrastination', 16),
  ('library_city', 17), ('conversation_crush', 18), ('ideal_sunday', 19), ('lifelong_question', 20)
on conflict (key) do nothing;

insert into public.app_copy (key, locale, text)
values
  ('prompt.three_hours', 'fr', 'Je pourrais en parler 3 h'),
  ('prompt.winning_debate', 'fr', 'Le débat que je gagne toujours'),
  ('prompt.secret_reread', 'fr', 'Le livre que je relis en cachette'),
  ('prompt.useless_fact', 'fr', 'Le fait inutile que je connais par cœur'),
  ('prompt.changed_my_mind', 'fr', 'Le livre qui m''a fait changer d''avis'),
  ('prompt.explain_with_passion', 'fr', 'Ce que j''explique mal, mais avec passion'),
  ('prompt.favorite_footnote', 'fr', 'Ma note de bas de page préférée'),
  ('prompt.dinner_guest', 'fr', 'L''invité idéal à ma table, d''hier ou d''aujourd''hui'),
  ('prompt.first_date', 'fr', 'Pour un premier rendez-vous, je propose…'),
  ('prompt.teach_me', 'fr', 'Apprenez-moi quelque chose sur…'),
  ('prompt.rabbit_hole', 'fr', 'Ma dernière nuit perdue sur Wikipédia'),
  ('prompt.word_comeback', 'fr', 'Le mot que j''aimerais remettre à la mode'),
  ('prompt.typo_peeve', 'fr', 'La faute qui me fait tiquer'),
  ('prompt.overrated_classic', 'fr', 'Un classique que je trouve surcoté'),
  ('prompt.underrated_classic', 'fr', 'Un classique que tout le monde devrait lire'),
  ('prompt.procrastination', 'fr', 'Ma meilleure excuse pour procrastiner'),
  ('prompt.library_city', 'fr', 'La ville où je vivrais pour ses bibliothèques'),
  ('prompt.conversation_crush', 'fr', 'Ce qui me fait craquer dans une conversation'),
  ('prompt.ideal_sunday', 'fr', 'Mon dimanche idéal, en une phrase'),
  ('prompt.lifelong_question', 'fr', 'La question qui m''occupe depuis toujours'),
  ('feed.empty_filters', 'fr', 'Personne ne remplit vos critères. Ils sont peut-être trop élevés. Même pour nous.')
on conflict (key, locale) do nothing;

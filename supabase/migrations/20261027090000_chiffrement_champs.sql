-- Chiffrement en base des champs sensibles qui ne servent à aucune recherche : nom légal, date de
-- naissance (profile_private) et texte libre des signalements (reports.details).
--
-- Clé : 32 octets aléatoires dans Supabase Vault (`field_key`), créée ici si elle manque, lue
-- seulement par des fonctions SECURITY DEFINER du schéma private. Chiffrement : pgcrypto
-- (pgp_sym_encrypt, AES-256 avec contrôle d'intégrité). La transparent column encryption de
-- pgsodium n'est pas utilisée (Supabase la retire).
--
-- Ce que cela protège : une copie ou un export de la base, une sauvegarde, l'affichage d'une table
-- dans le tableau de bord, un journal. Ce que cela ne protège pas : une personne qui a un accès SQL
-- complet au projet peut lire le Vault, donc la clé.
--
-- L'âge reste calculable sans déchiffrer : `birth_month` garde en clair le premier jour du mois de
-- naissance. L'âge affiché change donc jusqu'à un mois avant l'anniversaire réel. Le contrôle des
-- 18 ans (`set_identity`) se fait sur la date complète, avant chiffrement.
--
-- `degree_submissions.extracted` (extraction IA : titulaire, date de naissance) reste en clair :
-- vide en mode manuel, et la détection des doublons de process-diploma l'interroge par année.
-- À chiffrer si l'extraction automatique est réactivée.

-- 1. Clé et fonctions de chiffrement ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'field_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'field_key',
      'Clé de chiffrement des champs sensibles (nom légal, date de naissance, signalements). Ne jamais la changer : les données déjà chiffrées deviendraient illisibles.'
    );
  end if;
end;
$$;

create function private.field_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(ds.decrypted_secret, '') from vault.decrypted_secrets ds where ds.name = 'field_key' limit 1;
$$;

-- s2k-mode=1 : la clé est déjà aléatoire (256 bits), un étirement lent n'ajouterait que du coût.
create function private.encrypt_text(p_value text)
returns bytea
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_value is null then
    return null;
  end if;
  v_key := private.field_key();
  if v_key is null then
    raise exception 'field_key_missing' using errcode = 'P0001';
  end if;
  return extensions.pgp_sym_encrypt(p_value, v_key, 'cipher-algo=aes256, s2k-mode=1');
end;
$$;

create function private.decrypt_text(p_value bytea)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_value is null then
    return null;
  end if;
  v_key := private.field_key();
  if v_key is null then
    raise exception 'field_key_missing' using errcode = 'P0001';
  end if;
  return extensions.pgp_sym_decrypt(p_value, v_key);
end;
$$;

-- 2. Colonnes chiffrées ----------------------------------------------------------------------------
alter table public.profile_private
  add column if not exists legal_name_enc bytea,
  add column if not exists birthdate_enc bytea,
  add column if not exists birth_month date;
alter table public.profile_private
  drop constraint if exists profile_private_birth_month_check;
alter table public.profile_private
  add constraint profile_private_birth_month_check
  check (birth_month is null or (birth_month > date '1900-01-01' and extract(day from birth_month) = 1));

alter table public.reports add column if not exists details_enc bytea;

-- Écriture de l'identité, réservée au serveur (set_identity, seed, tests).
create function private.store_identity(p_user uuid, p_legal_name text, p_birthdate date)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.profile_private (user_id, legal_name_enc, birthdate_enc, birth_month)
  values (p_user, private.encrypt_text(p_legal_name), private.encrypt_text(p_birthdate::text),
          date_trunc('month', p_birthdate)::date)
  on conflict (user_id) do update
    set legal_name_enc = excluded.legal_name_enc,
        birthdate_enc = excluded.birthdate_enc,
        birth_month = excluded.birth_month;
$$;

-- Une identité posée ne change plus, sauf par le serveur ou un admin. Le contrôle des 18 ans est
-- dans set_identity, sur la date complète, avant chiffrement.
create or replace function private.profile_private_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (private.is_server_call() or public.is_admin()) then
    if (old.legal_name_enc is not null and new.legal_name_enc is distinct from old.legal_name_enc)
       or (old.birthdate_enc is not null and new.birthdate_enc is distinct from old.birthdate_enc)
       or (old.birth_month is not null and new.birth_month is distinct from old.birth_month) then
      raise exception 'identity_already_set' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Chiffrement des lignes existantes (rejouable : ne touche que ce qui reste en clair) -----------
do $$
begin
  if exists (select 1 from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = 'profile_private' and c.column_name = 'legal_name') then
    execute $sql$
      update public.profile_private pp
         set legal_name_enc = coalesce(pp.legal_name_enc, private.encrypt_text(pp.legal_name)),
             birthdate_enc = coalesce(pp.birthdate_enc, private.encrypt_text(pp.birthdate::text)),
             birth_month = coalesce(pp.birth_month, date_trunc('month', pp.birthdate)::date)
       where pp.legal_name is not null or pp.birthdate is not null
    $sql$;
  end if;
  if exists (select 1 from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = 'reports' and c.column_name = 'details') then
    execute $sql$
      update public.reports r
         set details_enc = coalesce(r.details_enc, private.encrypt_text(r.details))
       where r.details is not null
    $sql$;
  end if;
end;
$$;

-- 4. Lecteurs et écrivains : déchiffrement côté serveur ---------------------------------------------
create or replace function public.set_identity(p_legal_name text, p_birthdate date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_private public.profile_private;
begin
  select * into v_private from public.profile_private pp where pp.user_id = v_uid for update;
  if v_private.legal_name_enc is not null or v_private.birthdate_enc is not null then
    raise exception 'identity_already_set' using errcode = 'P0001';
  end if;
  if p_birthdate is null or p_birthdate <= date '1900-01-01'
     or coalesce(char_length(btrim(p_legal_name)), 0) not between 2 and 200 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if private.age_years(p_birthdate) < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;

  if private.is_banned_identity('identity', private.normalize_identity(p_legal_name, p_birthdate)) then
    update public.profiles set status = 'banned' where id = v_uid;
    perform private.audit(null, 'retention.banned_identity_match', 'user', v_uid::text,
                          jsonb_build_object('kind', 'identity'));
    return;
  end if;

  -- Chiffré avant écriture : la base ne garde en clair que le mois de naissance (calcul de l'âge).
  perform private.store_identity(v_uid, btrim(p_legal_name), p_birthdate);
end;
$$;

create or replace function private.capture_banned_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_private public.profile_private;
  v_email_hash text;
  v_identity_hash text;
begin
  if not exists (select 1 from public.profiles p where p.id = old.id and p.status = 'banned') then
    return old;
  end if;
  select * into v_private from public.profile_private pp where pp.user_id = old.id;
  v_email_hash := private.identity_hash('email', private.normalize_email(old.email));
  v_identity_hash := private.identity_hash('identity',
                       private.normalize_identity(private.decrypt_text(v_private.legal_name_enc),
                                                  private.decrypt_text(v_private.birthdate_enc)::date));
  if v_email_hash is not null then
    insert into private.banned_identities (kind, hash) values ('email', v_email_hash) on conflict do nothing;
  end if;
  if v_identity_hash is not null then
    insert into private.banned_identities (kind, hash) values ('identity', v_identity_hash) on conflict do nothing;
  end if;
  -- Trace sans l'empreinte ni l'identifiant du compte supprimé.
  perform private.audit(null, 'retention.banned_identity_kept', 'user', null,
    jsonb_build_object('email', v_email_hash is not null, 'identity', v_identity_hash is not null,
                       'pepper', private.identity_pepper() is not null));
  return old;
end;
$$;

create or replace function public.activate_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles;
  v_private public.profile_private;
begin
  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if v_profile.status = 'banned' then
    raise exception 'invalid_status' using errcode = 'P0001';
  elsif v_profile.status in ('active', 'paused') then
    return;
  end if;

  select * into v_private from public.profile_private pp where pp.user_id = v_uid;
  if v_private.legal_name_enc is null or v_private.birthdate_enc is null then
    raise exception 'identity_missing' using errcode = 'P0001';
  end if;
  if not private.profile_is_complete(v_profile) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  if (select count(*) from public.profile_photos ph
       where ph.user_id = v_uid and ph.moderation_status <> 'rejected') < 2 then
    raise exception 'photos_missing' using errcode = 'P0001';
  end if;
  if v_private.consent_sensitive_at is null then
    raise exception 'consent_missing' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.terms_acceptances t
                  where t.user_id = v_uid and t.version = private.terms_version()) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;

  update public.profiles set status = 'active', last_active_at = now() where id = v_uid;
end;
$$;

create or replace function public.get_my_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles;
  v_private public.profile_private;
  v_access public.user_access;
  v_policy public.access_policy;
  v_latest public.degree_submissions;
  v_photos int;
  v_likes_today int;
  v_recent_subs int;
  v_quota int;
begin
  perform private.touch_activity(v_uid);

  select * into v_profile from public.profiles p where p.id = v_uid;
  select * into v_private from public.profile_private pp where pp.user_id = v_uid;
  select * into v_access from public.user_access ua where ua.user_id = v_uid;
  if v_access.tier is not null then
    v_policy := private.tier_policy(v_access.tier);
  end if;

  v_quota := case when v_policy.id is null then 0 else v_policy.daily_like_quota end;

  select count(*) into v_photos from public.profile_photos ph
   where ph.user_id = v_uid and ph.moderation_status <> 'rejected';
  select count(*) into v_likes_today from public.swipes s
   where s.swiper_id = v_uid and s.direction = 'like' and s.created_at >= private.paris_day_start();
  select * into v_latest from public.degree_submissions s
   where s.user_id = v_uid order by s.created_at desc limit 1;
  select count(*) into v_recent_subs from public.degree_submissions s
   where s.user_id = v_uid and s.created_at > now() - interval '30 days';

  return jsonb_build_object(
    'profile_status', v_profile.status,
    'onboarding', jsonb_build_object(
      'identity_set', v_private.legal_name_enc is not null and v_private.birthdate_enc is not null,
      'profile_complete', coalesce(private.profile_is_complete(v_profile), false),
      'photos_count', v_photos,
      'consent_sensitive', v_private.consent_sensitive_at is not null
    ),
    'tier', v_access.tier,
    'level', v_access.level,
    'copy_key', v_access.copy_key,
    'can_browse', coalesce(v_policy.can_browse, false),
    'daily_like_quota', v_quota,
    'likes_left_today', case when v_quota is null then null else greatest(v_quota - v_likes_today, 0) end,
    'sees_likers', coalesce(v_policy.sees_likers, false),
    'latest_submission', case when v_latest.id is null then null else jsonb_build_object(
      'id', v_latest.id,
      'status', v_latest.status,
      'created_at', v_latest.created_at,
      'rejection_reason', v_latest.rejection_reason
    ) end,
    'submissions_left', greatest(private.setting_int('max_submissions_per_30_days', 3) - v_recent_subs, 0),
    'likes_received', private.likes_received_count(v_uid),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload,
                                                             'created_at', n.created_at) order by n.created_at desc)
                           from (select * from public.member_notices mn
                                  where mn.user_id = v_uid and mn.read_at is null
                                  order by mn.created_at desc limit 20) n), '[]'::jsonb),
    'intellect', jsonb_build_object(
      'answers', (select count(*) from public.profile_answers a where a.user_id = v_uid and a.moderation_status <> 'rejected'),
      'books', (select count(*) from public.profile_books b where b.user_id = v_uid and b.moderation_status <> 'rejected'),
      'thesis', exists (select 1 from public.profile_theses t where t.user_id = v_uid and t.moderation_status <> 'rejected'),
      'study_field', v_profile.study_field
    ),
    'referred', exists (select 1 from public.referrals r where r.referee_id = v_uid),
    'referred_by', private.referred_by_name(v_uid),
    'can_refer', private.referral_quota(v_uid) is not null,
    'terms', private.terms_state(v_uid)
  );
end;
$$;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = v_uid;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u where u.id = v_uid),
    'profile', (select (to_jsonb(p) - 'location') || jsonb_build_object('location',
                         case when p.location is null then null else jsonb_build_object(
                           'lat', extensions.st_y(p.location::extensions.geometry),
                           'lng', extensions.st_x(p.location::extensions.geometry)) end)
                  from public.profiles p where p.id = v_uid),
    'identity', (select jsonb_build_object(
                    'legal_name', private.decrypt_text(pp.legal_name_enc),
                    'birthdate', private.decrypt_text(pp.birthdate_enc)::date,
                    'consent_sensitive_at', pp.consent_sensitive_at, 'consent_version', pp.consent_version,
                    'created_at', pp.created_at)
                  from public.profile_private pp where pp.user_id = v_uid),
    'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.position)
                          from public.profile_photos ph where ph.user_id = v_uid), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(to_jsonb(a) order by a.position)
                           from public.profile_answers a where a.user_id = v_uid), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(to_jsonb(b) order by b.position)
                         from public.profile_books b where b.user_id = v_uid), '[]'::jsonb),
    'thesis', (select to_jsonb(t) from public.profile_theses t where t.user_id = v_uid),
    'discovery_prefs', (select to_jsonb(dp) from public.discovery_prefs dp where dp.user_id = v_uid),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
                           from public.member_notices n where n.user_id = v_uid), '[]'::jsonb),
    'access', (select to_jsonb(ua) - 'granted_by' from public.user_access ua where ua.user_id = v_uid),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) - 'signals' - 'moderator_note' - 'reviewer_id'
                                              order by s.created_at)
                               from public.degree_submissions s where s.user_id = v_uid), '[]'::jsonb),
    'swipes', coalesce((select jsonb_agg(jsonb_build_object('target_id', s.target_id, 'direction', s.direction,
                                                            'liked_item', s.liked_item, 'comment', s.comment,
                                                            'created_at', s.created_at) order by s.created_at)
                          from public.swipes s where s.swiper_id = v_uid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', m.id,
                                  'other_id', case when m.user_a = v_uid then m.user_b else m.user_a end,
                                  'created_at', m.created_at, 'unmatched_at', m.unmatched_at) order by m.created_at)
                           from public.matches m where v_uid in (m.user_a, m.user_b)), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('id', msg.id, 'match_id', msg.match_id,
                                                                   'body', msg.body, 'context', msg.context,
                                                                   'liked_item', msg.liked_item,
                                                                   'created_at', msg.created_at)
                                                order by msg.created_at)
                                 from public.messages msg where msg.sender_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at))
                          from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target_id', r.target_id, 'reason', r.reason,
                                                             'details', private.decrypt_text(r.details_enc), 'content_kind', r.content_kind,
                                                             'content_item_id', r.content_item_id,
                                                             'status', r.status, 'created_at', r.created_at))
                           from public.reports r where r.reporter_id = v_uid), '[]'::jsonb),
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform,
                                                                 'created_at', t.created_at))
                               from public.push_tokens t where t.user_id = v_uid), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('email', w.email, 'source', w.source,
                                                              'created_at', w.created_at))
                            from public.waitlist_signups w where w.email::text = lower(v_email)), '[]'::jsonb),
    'referral', jsonb_build_object(
      'codes', coalesce((select jsonb_agg(jsonb_build_object('code', rc.code, 'created_at', rc.created_at,
                                                             'revoked_at', rc.revoked_at) order by rc.created_at)
                           from public.referral_codes rc where rc.owner_id = v_uid), '[]'::jsonb),
      'letters_used_total', (select count(*) from public.referrals r where r.referrer_id = v_uid),
      'referred_by', (select jsonb_build_object('first_name', p.display_name, 'code', r.code, 'claimed_at', r.claimed_at)
                        from public.referrals r left join public.profiles p on p.id = r.referrer_id
                       where r.referee_id = v_uid)
    ),
    'event_registrations', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', r.event_id, 'event_title', e.title, 'starts_at', e.starts_at,
                                          'status', r.status, 'ticket_code', r.ticket_code,
                                          'charter_accepted_at', r.charter_accepted_at,
                                          'checked_in_at', r.checked_in_at, 'created_at', r.created_at)
                       order by e.starts_at)
      from public.event_registrations r join public.events e on e.id = r.event_id
      where r.user_id = v_uid), '[]'::jsonb),
    'terms_acceptances', coalesce((select jsonb_agg(jsonb_build_object('version', t.version,
                                                                       'accepted_at', t.accepted_at)
                                                    order by t.accepted_at)
                                     from public.terms_acceptances t where t.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

create or replace function private.discovery_candidates(
  p_uid uuid,
  p_apply_prefs boolean,
  p_max_distance_km int default null,
  p_age_min int default null,
  p_age_max int default null,
  p_levels int[] default null,
  p_strict_levels boolean default null,
  p_fields public.study_field[] default null,
  p_strict_fields boolean default null
)
returns table (id uuid, dist_m double precision, last_active_at timestamptz, age int, level int,
               study_field public.study_field, pref_score int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me public.profiles;
  v_tier public.access_tier;
  v_my_age int;
  v_prefs public.discovery_prefs;
  v_radius_m double precision;
  v_age_min int;
  v_age_max int;
  v_levels int[];
  v_strict_levels boolean;
  v_fields public.study_field[];
  v_strict_fields boolean;
begin
  if p_uid is null then
    return;
  end if;
  select * into v_me from public.profiles p where p.id = p_uid;
  select ua.tier into v_tier from public.user_access ua where ua.user_id = p_uid;
  if v_me.status is distinct from 'active' or v_tier is null or not private.tier_can_browse(v_tier) then
    return;
  end if;
  select private.age_years(pp.birth_month) into v_my_age from public.profile_private pp where pp.user_id = p_uid;
  if v_my_age is null or v_me.gender is null then
    return;
  end if;

  select * into v_prefs from public.discovery_prefs dp where dp.user_id = p_uid;
  v_radius_m := coalesce(p_max_distance_km, v_prefs.max_distance_km,
                         private.setting_int('feed_radius_km', 50)) * 1000.0;
  v_age_min := coalesce(p_age_min, v_me.age_min);
  v_age_max := coalesce(p_age_max, v_me.age_max);
  v_levels := coalesce(p_levels, v_prefs.levels, '{}');
  v_strict_levels := coalesce(p_strict_levels, v_prefs.strict_levels, false);
  v_fields := coalesce(p_fields, v_prefs.fields, '{}');
  v_strict_fields := coalesce(p_strict_fields, v_prefs.strict_fields, false);

  return query
  select p.id,
         case when v_me.location is not null and p.location is not null
              then extensions.st_distance(p.location, v_me.location) end,
         p.last_active_at,
         private.age_years(pp.birth_month),
         ua.level,
         p.study_field,
         (case when cardinality(v_levels) > 0 and ua.level = any (v_levels) then 1 else 0 end
          + case when cardinality(v_fields) > 0 and p.study_field = any (v_fields) then 1 else 0 end)
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  join public.user_access ua on ua.user_id = p.id
  where p.id <> p_uid
    and p.status = 'active'
    and private.tier_can_browse(ua.tier)
    and p.gender = any (v_me.seeking_genders)
    and v_me.gender = any (p.seeking_genders)
    and pp.birth_month is not null
    and v_my_age between p.age_min and p.age_max
    and (not p_apply_prefs or private.age_years(pp.birth_month) between v_age_min and v_age_max)
    and (not p_apply_prefs or v_me.location is null
         or (p.location is not null and extensions.st_dwithin(p.location, v_me.location, v_radius_m)))
    and (not p_apply_prefs or not v_strict_levels or cardinality(v_levels) = 0 or ua.level = any (v_levels))
    and (not p_apply_prefs or not v_strict_fields or cardinality(v_fields) = 0 or p.study_field = any (v_fields))
    and not exists (select 1 from public.swipes s where s.swiper_id = p_uid and s.target_id = p.id)
    and not private.is_blocked_pair(p_uid, p.id);
end;
$$;

create or replace function public.get_likers()
returns table (
  id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[],
  level int, study_field public.study_field, liked_item text, comment text,
  liked_prompt_key text, liked_text text, liked_photo_path text, liked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_me public.profiles;
  v_policy public.access_policy;
begin
  select * into v_me from public.profiles p where p.id = v_uid;
  v_policy := private.tier_policy((select ua.tier from public.user_access ua where ua.user_id = v_uid));
  if not coalesce(v_policy.sees_likers, false) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_me.status is distinct from 'active' then
    return;
  end if;

  return query
  select p.id, p.display_name, private.age_years(pp.birth_month), p.bio, p.city,
         case when v_me.location is not null and p.location is not null
              then greatest(1, round(extensions.st_distance(p.location, v_me.location) / 1000.0))::int end,
         coalesce((select array_agg(ph.storage_path order by ph.position, ph.created_at)
                     from public.profile_photos ph
                    where ph.user_id = p.id and ph.moderation_status <> 'rejected'), '{}'::text[]),
         ua.level,
         p.study_field,
         s.liked_item,
         s.comment,
         (select a.prompt_key from public.profile_answers a
           where a.user_id = v_uid
             and a.position = case when s.liked_item like 'answer:%' then substr(s.liked_item, 8)::smallint end),
         private.liked_item_context(v_uid, s.liked_item),
         (select ph.storage_path from public.profile_photos ph
           where ph.user_id = v_uid
             and ph.id = case when s.liked_item like 'photo:%' then substr(s.liked_item, 7)::uuid end),
         s.created_at
  from public.swipes s
  join public.profiles p on p.id = s.swiper_id
  join public.profile_private pp on pp.user_id = p.id
  join public.user_access ua on ua.user_id = p.id
  where s.target_id = v_uid
    and s.direction = 'like'
    and p.status = 'active'
    and private.tier_can_browse(ua.tier)
    and not exists (select 1 from public.swipes mine where mine.swiper_id = v_uid and mine.target_id = p.id)
    and not private.is_blocked_pair(v_uid, p.id)
  order by s.created_at desc
  limit 100;
end;
$$;

create or replace function public.get_profile(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_self boolean := p_target = v_uid;
  v_p public.profiles;
  v_me public.profiles;
  v_access public.user_access;
  v_thesis public.profile_theses;
  v_match uuid;
begin
  if p_target is null or not public.can_view_profile(p_target) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_p from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_me from public.profiles p where p.id = v_uid;
  select * into v_access from public.user_access ua where ua.user_id = p_target;
  select * into v_thesis from public.profile_theses t
   where t.user_id = p_target and t.moderation_status <> 'rejected';
  select m.id into v_match from public.matches m
   where m.user_a = least(v_uid, p_target) and m.user_b = greatest(v_uid, p_target)
     and m.unmatched_at is null and not v_self;

  if not v_self then
    perform private.touch_activity(v_uid);
  end if;

  return jsonb_build_object(
    'id', v_p.id,
    'is_self', v_self,
    'display_name', v_p.display_name,
    'age', (select private.age_years(pp.birth_month) from public.profile_private pp where pp.user_id = p_target),
    'city', v_p.city,
    'bio', v_p.bio,
    'distance_km', case when v_self or v_me.location is null or v_p.location is null then null
                        else greatest(1, round(extensions.st_distance(v_p.location, v_me.location) / 1000.0))::int end,
    'level', v_access.level,
    'study_field', v_p.study_field,
    'field_verified', coalesce(v_p.study_field = v_access.study_field, false),
    'institution', case when v_p.show_institution or v_self then v_access.institution end,
    'quiz_badge', v_p.show_quiz_badge,
    'thesis', case
      when v_thesis.user_id is null then null
      when v_self then jsonb_build_object('line', v_thesis.line, 'visibility', v_thesis.visibility)
      when v_thesis.visibility = 'everyone' or v_match is not null then jsonb_build_object('line', v_thesis.line)
    end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path,
                                                            'position', ph.position)
                                         order by ph.position, ph.created_at)
                          from public.profile_photos ph
                         where ph.user_id = p_target and ph.moderation_status <> 'rejected'), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'position', a.position, 'prompt_key', a.prompt_key,
                                                             'answer', a.answer) order by a.position)
                           from public.profile_answers a
                          where a.user_id = p_target and a.moderation_status <> 'rejected'), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'position', b.position, 'title', b.title,
                                                           'author', b.author) order by b.position)
                         from public.profile_books b
                        where b.user_id = p_target and b.moderation_status <> 'rejected'), '[]'::jsonb),
    'affinity', case when v_self then null else private.affinity(v_uid, p_target) end,
    'match_id', v_match,
    'my_swipe', (select s.direction from public.swipes s where s.swiper_id = v_uid and s.target_id = p_target)
  );
end;
$$;

create or replace function public.admin_get_report_context(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_target uuid;
  v_match public.matches;
begin
  perform private.require_admin();
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_target := v_report.target_id;

  if v_target is not null and v_report.reporter_id is not null then
    select * into v_match from public.matches m
     where m.user_a = least(v_report.reporter_id, v_target) and m.user_b = greatest(v_report.reporter_id, v_target);
  end if;

  return jsonb_build_object(
    'target_deleted_at', v_report.target_deleted_at,
    'target_pseudonym', v_report.target_pseudonym,
    'reporter_pseudonym', v_report.reporter_pseudonym,
    'target', (select jsonb_build_object(
                 'id', p.id, 'display_name', p.display_name, 'status', p.status, 'city', p.city, 'bio', p.bio,
                 'study_field', p.study_field, 'created_at', p.created_at, 'last_active_at', p.last_active_at,
                 'age', private.age_years(pp.birth_month), 'legal_name', private.decrypt_text(pp.legal_name_enc),
                 'email', u.email::text,
                 'tier', ua.tier, 'level', ua.level, 'institution', ua.institution,
                 'source_submission_id', ua.source_submission_id)
               from public.profiles p
               left join public.profile_private pp on pp.user_id = p.id
               left join public.user_access ua on ua.user_id = p.id
               left join auth.users u on u.id = p.id
               where v_target is not null and p.id = v_target),
    'reporter', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
                                           'reports_filed', (select count(*) from public.reports r
                                                              where r.reporter_id = p.id))
                 from public.profiles p where v_report.reporter_id is not null and p.id = v_report.reporter_id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'storage_path', ph.storage_path,
                                                            'moderation_status', ph.moderation_status)
                                         order by ph.position)
                          from public.profile_photos ph where ph.user_id = v_target), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'position', a.position,
                                                             'prompt_key', a.prompt_key, 'answer', a.answer,
                                                             'moderation_status', a.moderation_status)
                                          order by a.position)
                           from public.profile_answers a where a.user_id = v_target), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'author', b.author,
                                                           'moderation_status', b.moderation_status)
                                        order by b.position)
                         from public.profile_books b where b.user_id = v_target), '[]'::jsonb),
    'thesis', (select jsonb_build_object('line', t.line, 'visibility', t.visibility,
                                         'moderation_status', t.moderation_status)
                 from public.profile_theses t where t.user_id = v_target),
    'content', case when v_report.content_kind is null then null else jsonb_build_object(
                 'kind', v_report.content_kind,
                 'item_id', v_report.content_item_id,
                 'text', case when v_target is null then null
                              else private.content_text(v_target, v_report.content_kind, v_report.content_item_id) end,
                 'prompt_key', (select a.prompt_key from public.profile_answers a
                                 where v_report.content_kind = 'answer' and a.id = v_report.content_item_id),
                 'flag_id', (select f.id from public.content_flags f
                              where f.report_id = v_report.id order by f.created_at desc limit 1),
                 'flag_status', (select f.status from public.content_flags f
                                  where f.report_id = v_report.id order by f.created_at desc limit 1)) end,
    'reports_against', jsonb_build_object(
                 'open', (select count(*) from public.reports r
                           where r.target_pseudonym = v_report.target_pseudonym and r.status = 'open'),
                 'total', (select count(*) from public.reports r where r.target_pseudonym = v_report.target_pseudonym),
                 'actioned', (select count(*) from public.reports r
                               where r.target_pseudonym = v_report.target_pseudonym and r.status = 'actioned'),
                 'reasons', coalesce((select jsonb_agg(distinct r.reason) from public.reports r
                                       where r.target_pseudonym = v_report.target_pseudonym), '[]'::jsonb)),
    'relationship', jsonb_build_object(
                 'matched_at', v_match.created_at,
                 'unmatched_at', v_match.unmatched_at,
                 'reporter_blocked', v_target is not null and exists (select 1 from public.blocks b
                                              where b.blocker_id = v_report.reporter_id and b.blocked_id = v_target),
                 'target_blocked', v_target is not null and exists (select 1 from public.blocks b
                                            where b.blocker_id = v_target and b.blocked_id = v_report.reporter_id))
  );
end;
$$;

create or replace function private.admin_submission_rows(p_status public.submission_status, p_id uuid)
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text,
  institution_verified text, field_verified public.study_field,
  referred boolean, referred_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.storage_path, s.mime, s.doc_sha256, s.status, s.extracted, s.confidence,
         s.signals, s.level_verified, s.reviewer_id, s.reviewed_at, s.rejection_reason, s.moderator_note,
         s.attempts, s.file_deleted_at, s.created_at,
         private.decrypt_text(pp.legal_name_enc), private.decrypt_text(pp.birthdate_enc)::date, p.display_name,
         u.email::text, s.institution_verified, s.field_verified,
         (rf.referee_id is not null), rp.display_name
  from public.degree_submissions s
  left join public.profile_private pp on pp.user_id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  left join public.referrals rf on rf.referee_id = s.user_id
  left join public.profiles rp on rp.id = rf.referrer_id
  where (p_id is null or s.id = p_id)
    and (p_id is not null or p_status is null or s.status = p_status)
  order by (rf.referee_id is not null) desc, s.created_at asc
  limit 500;
$$;

create or replace function public.report_user(
  p_target uuid,
  p_reason text,
  p_details text,
  p_content_kind public.content_kind default null,
  p_content_item uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_text text;
begin
  if not private.is_not_banned() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_target is null or p_target = v_uid or coalesce(btrim(p_reason), '') = ''
     or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_content_kind is not null then
    if (p_content_kind = 'thesis') <> (p_content_item is null) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    v_text := private.content_text(p_target, p_content_kind, p_content_item);
    if v_text is null then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  elsif p_content_item is not null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_id, reason, details_enc, content_kind, content_item_id)
  values (v_uid, p_target, left(btrim(p_reason), 100),
          private.encrypt_text(left(nullif(btrim(p_details), ''), 2000)),
          p_content_kind, p_content_item)
  returning id into v_id;

  if p_content_kind is not null then
    perform private.queue_content_flag(p_target, p_content_kind, p_content_item, v_text,
                                       array['report:' || left(btrim(p_reason), 40)], 'report', v_id);
    -- Le texte reste visible ; un texte déjà retiré le reste.
    if private.content_text(p_target, p_content_kind, p_content_item) is not null then
      if p_content_kind = 'answer' then
        update public.profile_answers a set moderation_status = 'pending'
         where a.id = p_content_item and a.moderation_status = 'approved';
      elsif p_content_kind = 'book' then
        update public.profile_books b set moderation_status = 'pending'
         where b.id = p_content_item and b.moderation_status = 'approved';
      else
        update public.profile_theses t set moderation_status = 'pending'
         where t.user_id = p_target and t.moderation_status = 'approved';
      end if;
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_list_flagged_content(p_status public.content_flag_status default 'open')
returns table (
  id uuid, user_id uuid, display_name text, email text, kind public.content_kind, item_id uuid,
  prompt_key text, current_text text, item_status public.photo_moderation, excerpt text, reasons text[],
  source text, report_id uuid, report_reason text, report_details text, status public.content_flag_status,
  decision_reason text, handled_by uuid, handled_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select f.id, f.user_id, p.display_name, u.email::text, f.kind, f.item_id,
         a.prompt_key,
         private.content_text(f.user_id, f.kind, f.item_id),
         coalesce(a.moderation_status, b.moderation_status, t.moderation_status),
         f.excerpt, f.reasons, f.source, f.report_id, r.reason, private.decrypt_text(r.details_enc), f.status,
         f.decision_reason, f.handled_by, f.handled_at, f.created_at
  from public.content_flags f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  left join public.profile_answers a on f.kind = 'answer' and a.id = f.item_id
  left join public.profile_books b on f.kind = 'book' and b.id = f.item_id
  left join public.profile_theses t on f.kind = 'thesis' and t.user_id = f.user_id
  left join public.reports r on r.id = f.report_id
  where p_status is null or f.status = p_status
  order by f.created_at asc
  limit 500;
end;
$$;

-- 5. Nouvelles RPC ---------------------------------------------------------------------------------
-- Le membre lit sa propre identité, déchiffrée.
create function public.get_my_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_identity jsonb;
begin
  select jsonb_build_object('legal_name', private.decrypt_text(pp.legal_name_enc),
                            'birthdate', private.decrypt_text(pp.birthdate_enc)::date)
    into v_identity
    from public.profile_private pp where pp.user_id = v_uid;
  return coalesce(v_identity, jsonb_build_object('legal_name', null, 'birthdate', null));
end;
$$;

-- Noms légaux d'une liste de membres (liste d'attente du back-office), 500 au plus.
create function public.admin_list_identities(p_user_ids uuid[])
returns table (user_id uuid, legal_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  if coalesce(cardinality(p_user_ids), 0) > 500 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  return query
  select pp.user_id, private.decrypt_text(pp.legal_name_enc)
    from public.profile_private pp
   where pp.user_id = any (coalesce(p_user_ids, '{}'::uuid[]));
end;
$$;

-- Signalements avec leur texte libre déchiffré (le back-office ne lit plus la table directement).
create function public.admin_list_reports(p_status public.report_status default null, p_limit int default 200)
returns table (
  id uuid, reporter_id uuid, target_id uuid, reason text, details text, status public.report_status,
  handled_by uuid, handled_at timestamptz, created_at timestamptz,
  content_kind public.content_kind, content_item_id uuid,
  reporter_pseudonym text, target_pseudonym text, target_deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select r.id, r.reporter_id, r.target_id, r.reason, private.decrypt_text(r.details_enc), r.status,
         r.handled_by, r.handled_at, r.created_at, r.content_kind, r.content_item_id,
         r.reporter_pseudonym, r.target_pseudonym, r.target_deleted_at
    from public.reports r
   where p_status is null or r.status = p_status
   order by case when p_status = 'open' then r.created_at end asc,
            r.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- Identité pour la vérification automatique d'un diplôme (process-diploma, clé de service).
create function public.server_get_identity(p_user uuid)
returns table (legal_name text, birthdate date)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_server();
  return query
  select private.decrypt_text(pp.legal_name_enc), private.decrypt_text(pp.birthdate_enc)::date
    from public.profile_private pp where pp.user_id = p_user;
end;
$$;

-- 6. Plus de texte en clair ------------------------------------------------------------------------
alter table public.profile_private drop column if exists legal_name, drop column if exists birthdate;
alter table public.reports drop column if exists details;

-- 7. Droits : le chiffré ne quitte jamais le serveur ------------------------------------------------
revoke select on public.profile_private from authenticated, anon;
grant select (user_id, birth_month, consent_sensitive_at, consent_version, created_at)
  on public.profile_private to authenticated;

revoke select on public.reports from authenticated, anon;
grant select (id, reporter_id, target_id, reason, status, handled_by, handled_at, created_at,
              content_kind, content_item_id, reporter_pseudonym, target_pseudonym, target_deleted_at)
  on public.reports to authenticated;

revoke all on function public.get_my_identity() from public, anon;
grant execute on function public.get_my_identity() to authenticated;
revoke all on function public.admin_list_identities(uuid[]), public.admin_list_reports(public.report_status, int)
  from public, anon;
grant execute on function public.admin_list_identities(uuid[]), public.admin_list_reports(public.report_status, int)
  to authenticated;
revoke all on function public.server_get_identity(uuid) from public, anon, authenticated;
grant execute on function public.server_get_identity(uuid) to service_role;

-- Fonctions privées nouvelles : jamais appelables par un client (la clé et le clair restent au serveur).
revoke all on function private.field_key(), private.encrypt_text(text), private.decrypt_text(bytea),
  private.store_identity(uuid, text, date)
  from public, anon, authenticated;

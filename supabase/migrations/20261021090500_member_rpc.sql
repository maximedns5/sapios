-- RPC appelées par l'app (contrat §3). Toutes : security definer, search_path vide, tables
-- qualifiées, contrôle explicite de auth.uid(). Erreurs métier : errcode P0001, message = code.

-- Critères « profil complet » pour l'activation (la bio et la localisation restent facultatives).
create function private.profile_is_complete(p public.profiles)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p.display_name), '') <> ''
     and p.gender is not null
     and cardinality(p.seeking_genders) > 0
     and coalesce(btrim(p.city), '') <> '';
$$;

create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

create function private.touch_activity(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p set last_active_at = now()
  where p.id = p_uid and p.last_active_at < now() - interval '5 minutes';
$$;

-- État complet du compte pour le routage de l'app --------------------------------------------
create function public.get_my_state()
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
      'identity_set', v_private.legal_name is not null and v_private.birthdate is not null,
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
    'submissions_left', greatest(private.setting_int('max_submissions_per_30_days', 3) - v_recent_subs, 0)
  );
end;
$$;

-- Onboarding ----------------------------------------------------------------------------------
create function public.set_identity(p_legal_name text, p_birthdate date)
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
  if v_private.legal_name is not null or v_private.birthdate is not null then
    raise exception 'identity_already_set' using errcode = 'P0001';
  end if;
  if p_birthdate is null or coalesce(char_length(btrim(p_legal_name)), 0) < 2 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if private.age_years(p_birthdate) < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;

  insert into public.profile_private (user_id, legal_name, birthdate)
  values (v_uid, btrim(p_legal_name), p_birthdate)
  on conflict (user_id) do update set legal_name = excluded.legal_name, birthdate = excluded.birthdate;
end;
$$;

-- Consentement art. 9 (orientation déduite des genres recherchés). Le retrait efface les genres
-- recherchés et renvoie le profil en onboarding (il disparaît du feed).
create function public.set_sensitive_consent(p_granted boolean, p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_version text := coalesce(nullif(btrim(p_version), ''), 'unspecified');
begin
  if coalesce(p_granted, false) then
    update public.profile_private
       set consent_sensitive_at = now(), consent_version = v_version
     where user_id = v_uid;
  else
    update public.profile_private
       set consent_sensitive_at = null, consent_version = null
     where user_id = v_uid;
    update public.profiles
       set seeking_genders = '{}',
           status = case when status in ('active', 'paused') then 'onboarding'::public.profile_status else status end
     where id = v_uid;
  end if;
  perform private.audit(v_uid, case when coalesce(p_granted, false) then 'consent.granted' else 'consent.revoked' end,
                        'profile_private', v_uid::text, jsonb_build_object('version', v_version));
end;
$$;

create function public.activate_profile()
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
  if v_private.legal_name is null or v_private.birthdate is null then
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

  update public.profiles set status = 'active', last_active_at = now() where id = v_uid;
end;
$$;

create function public.set_paused(p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_status public.profile_status;
  v_target public.profile_status := case when coalesce(p_paused, false) then 'paused' else 'active' end;
begin
  select p.status into v_status from public.profiles p where p.id = v_uid for update;
  if v_status = v_target then
    return;
  end if;
  if v_status not in ('active', 'paused') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.profiles set status = v_target where id = v_uid;
end;
$$;

create function public.set_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  -- L'arrondi à 3 décimales est appliqué par le trigger profiles_before_write.
  update public.profiles
     set location = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
   where id = v_uid;
end;
$$;

-- Découverte ----------------------------------------------------------------------------------
-- Feed : candidats actifs et éligibles, préférences genre/âge compatibles dans les deux sens,
-- dans le rayon (app_settings.feed_radius_km, 50 km par défaut), hors soi, déjà swipés et
-- blocages. Tri : jour de dernière activité, puis distance. Photos `rejected` exclues.
create function public.get_feed(p_limit int default 20)
returns table (id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_tier public.access_tier;
  v_my_age int;
  v_radius_m double precision := private.setting_int('feed_radius_km', 50) * 1000.0;
begin
  if v_uid is null then
    return;
  end if;
  select * into v_me from public.profiles p where p.id = v_uid;
  select ua.tier into v_tier from public.user_access ua where ua.user_id = v_uid;
  if v_me.status is distinct from 'active' or v_tier is null or not private.tier_can_browse(v_tier) then
    return;
  end if;
  select private.age_years(pp.birthdate) into v_my_age from public.profile_private pp where pp.user_id = v_uid;
  if v_my_age is null or v_me.gender is null then
    return;
  end if;

  perform private.touch_activity(v_uid);

  return query
  select c.id, c.display_name, c.age, c.bio, c.city,
         case when c.dist_m is null then null else greatest(1, round(c.dist_m / 1000.0))::int end,
         coalesce((select array_agg(ph.storage_path order by ph.position, ph.created_at)
                     from public.profile_photos ph
                    where ph.user_id = c.id and ph.moderation_status <> 'rejected'), '{}'::text[])
  from (
    select p.id, p.display_name, p.bio, p.city, p.last_active_at,
           private.age_years(pp.birthdate) as age,
           case when v_me.location is not null and p.location is not null
                then extensions.st_distance(p.location, v_me.location) end as dist_m
    from public.profiles p
    join public.profile_private pp on pp.user_id = p.id
    join public.user_access ua on ua.user_id = p.id
    where p.id <> v_uid
      and p.status = 'active'
      and private.tier_can_browse(ua.tier)
      and p.gender = any (v_me.seeking_genders)
      and v_me.gender = any (p.seeking_genders)
      and pp.birthdate is not null
      and private.age_years(pp.birthdate) between v_me.age_min and v_me.age_max
      and v_my_age between p.age_min and p.age_max
      and (v_me.location is null
           or (p.location is not null and extensions.st_dwithin(p.location, v_me.location, v_radius_m)))
      and not exists (select 1 from public.swipes s where s.swiper_id = v_uid and s.target_id = p.id)
      and not private.is_blocked_pair(v_uid, p.id)
  ) c
  order by date_trunc('day', c.last_active_at at time zone 'Europe/Paris') desc,
           c.dist_m asc nulls last,
           c.last_active_at desc,
           c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Swipe atomique et idempotent. Deux verrous transactionnels : la paire (deux likes croisés
-- simultanés se sérialisent, le second voit le premier et crée le match) puis le membre (quota).
-- Le match est unique par (user_a, user_b) avec user_a < user_b ; insertion en `on conflict`.
create function public.swipe(p_target uuid, p_direction public.swipe_direction)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.profile_status;
  v_tier public.access_tier;
  v_policy public.access_policy;
  v_existing public.swipe_direction;
  v_effective public.swipe_direction;
  v_likes_today int;
  v_match_id uuid;
  v_unmatched_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  if p_target is not null and p_target = v_uid then
    raise exception 'self_swipe' using errcode = 'P0001';
  end if;

  select p.status into v_status from public.profiles p where p.id = v_uid;
  select ua.tier into v_tier from public.user_access ua where ua.user_id = v_uid;
  if v_tier is not null then
    v_policy := private.tier_policy(v_tier);
  end if;
  if v_status is distinct from 'active' or not coalesce(v_policy.can_browse, false) then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;

  if p_target is null or p_direction is null
     or not exists (
       select 1 from public.profiles t join public.user_access ta on ta.user_id = t.id
        where t.id = p_target and t.status = 'active' and private.tier_can_browse(ta.tier))
     or private.is_blocked_pair(v_uid, p_target) then
    raise exception 'target_unavailable' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sapios.swipe.pair:' || least(v_uid, p_target)::text || ':' || greatest(v_uid, p_target)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('sapios.swipe.user:' || v_uid::text, 0));

  select s.direction into v_existing from public.swipes s
   where s.swiper_id = v_uid and s.target_id = p_target;

  -- Nouveau swipe, ou pass transformé en like ; un like n'est jamais retiré (unmatch/block).
  if v_existing is null or (v_existing = 'pass' and p_direction = 'like') then
    if p_direction = 'like' and v_policy.daily_like_quota is not null then
      select count(*) into v_likes_today from public.swipes s
       where s.swiper_id = v_uid and s.direction = 'like' and s.created_at >= private.paris_day_start();
      if v_likes_today >= v_policy.daily_like_quota then
        raise exception 'quota_exceeded' using errcode = 'P0001';
      end if;
    end if;
    insert into public.swipes (swiper_id, target_id, direction)
    values (v_uid, p_target, p_direction)
    on conflict (swiper_id, target_id) do update set direction = excluded.direction, created_at = now();
    v_effective := p_direction;
  else
    v_effective := v_existing;
  end if;

  if v_effective = 'like' and exists (
    select 1 from public.swipes s
     where s.swiper_id = p_target and s.target_id = v_uid and s.direction = 'like') then
    insert into public.matches (user_a, user_b)
    values (least(v_uid, p_target), greatest(v_uid, p_target))
    on conflict (user_a, user_b) do nothing
    returning id into v_match_id;
    if v_match_id is null then
      select m.id, m.unmatched_at into v_match_id, v_unmatched_at from public.matches m
       where m.user_a = least(v_uid, p_target) and m.user_b = greatest(v_uid, p_target);
    end if;
  end if;

  perform private.touch_activity(v_uid);

  if v_match_id is null or v_unmatched_at is not null then
    return jsonb_build_object('matched', false, 'match_id', null);
  end if;
  return jsonb_build_object('matched', true, 'match_id', v_match_id);
end;
$$;

-- Qui m'a liké (palier avec sees_likers) : likes en attente de réponse, profils visibles.
create function public.get_likers()
returns table (id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[])
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
  select p.id, p.display_name, private.age_years(pp.birthdate), p.bio, p.city,
         case when v_me.location is not null and p.location is not null
              then greatest(1, round(extensions.st_distance(p.location, v_me.location) / 1000.0))::int end,
         coalesce((select array_agg(ph.storage_path order by ph.position, ph.created_at)
                     from public.profile_photos ph
                    where ph.user_id = p.id and ph.moderation_status <> 'rejected'), '{}'::text[])
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

-- Matches et chat -----------------------------------------------------------------------------
create function public.get_matches()
returns table (match_id uuid, other_id uuid, display_name text, photo_path text,
               last_message text, last_message_at timestamptz, unread_count int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  return query
  select m.id,
         o.id,
         o.display_name,
         (select ph.storage_path from public.profile_photos ph
           where ph.user_id = o.id and ph.moderation_status <> 'rejected'
           order by ph.position, ph.created_at limit 1),
         lm.body,
         lm.created_at,
         (select count(*) from public.messages x
           where x.match_id = m.id and x.sender_id <> v_uid and x.read_at is null)::int
  from public.matches m
  join public.profiles o on o.id = case when m.user_a = v_uid then m.user_b else m.user_a end
  left join lateral (
    select msg.body, msg.created_at from public.messages msg
     where msg.match_id = m.id order by msg.created_at desc limit 1
  ) lm on true
  where v_uid in (m.user_a, m.user_b)
    and m.unmatched_at is null
    and o.status <> 'banned'
    and not private.is_blocked_pair(m.user_a, m.user_b)
  order by coalesce(lm.created_at, m.created_at) desc;
end;
$$;

create function public.unmatch(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.matches m set unmatched_at = now()
   where m.id = p_match_id and v_uid in (m.user_a, m.user_b) and m.unmatched_at is null;
  if not found and not exists (
    select 1 from public.matches m where m.id = p_match_id and v_uid in (m.user_a, m.user_b)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Sécurité ------------------------------------------------------------------------------------
create function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_target is null or p_target = v_uid
     or not exists (select 1 from public.profiles p where p.id = p_target) then
    return;
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_target)
  on conflict (blocker_id, blocked_id) do nothing;
  update public.matches m set unmatched_at = now()
   where m.user_a = least(v_uid, p_target) and m.user_b = greatest(v_uid, p_target)
     and m.unmatched_at is null;
end;
$$;

create function public.report_user(p_target uuid, p_reason text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  if not private.is_not_banned() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_target is null or p_target = v_uid or coalesce(btrim(p_reason), '') = ''
     or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into public.reports (reporter_id, target_id, reason, details)
  values (v_uid, p_target, left(btrim(p_reason), 100), left(nullif(btrim(p_details), ''), 2000))
  returning id into v_id;
  return v_id;
end;
$$;

-- Droit d'accès RGPD : tout ce qui concerne le compte, hors notes internes de modération.
create function public.export_my_data()
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
    'identity', (select to_jsonb(pp) from public.profile_private pp where pp.user_id = v_uid),
    'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.position)
                          from public.profile_photos ph where ph.user_id = v_uid), '[]'::jsonb),
    'access', (select to_jsonb(ua) - 'granted_by' from public.user_access ua where ua.user_id = v_uid),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) - 'signals' - 'moderator_note' - 'reviewer_id'
                                              order by s.created_at)
                               from public.degree_submissions s where s.user_id = v_uid), '[]'::jsonb),
    'swipes', coalesce((select jsonb_agg(jsonb_build_object('target_id', s.target_id, 'direction', s.direction,
                                                            'created_at', s.created_at) order by s.created_at)
                          from public.swipes s where s.swiper_id = v_uid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', m.id,
                                  'other_id', case when m.user_a = v_uid then m.user_b else m.user_a end,
                                  'created_at', m.created_at, 'unmatched_at', m.unmatched_at) order by m.created_at)
                           from public.matches m where v_uid in (m.user_a, m.user_b)), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('id', msg.id, 'match_id', msg.match_id,
                                                                   'body', msg.body, 'created_at', msg.created_at)
                                                order by msg.created_at)
                                 from public.messages msg where msg.sender_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at))
                          from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target_id', r.target_id, 'reason', r.reason,
                                                             'details', r.details, 'status', r.status,
                                                             'created_at', r.created_at))
                           from public.reports r where r.reporter_id = v_uid), '[]'::jsonb),
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform,
                                                                 'created_at', t.created_at))
                               from public.push_tokens t where t.user_id = v_uid), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('email', w.email, 'source', w.source,
                                                              'created_at', w.created_at))
                            from public.waitlist_signups w where w.email::text = lower(v_email)), '[]'::jsonb)
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.is_admin(),
  public.can_view_profile(uuid),
  public.get_my_state(),
  public.set_identity(text, date),
  public.set_sensitive_consent(boolean, text),
  public.activate_profile(),
  public.set_paused(boolean),
  public.set_location(double precision, double precision),
  public.get_feed(int),
  public.swipe(uuid, public.swipe_direction),
  public.get_likers(),
  public.get_matches(),
  public.unmatch(uuid),
  public.block_user(uuid),
  public.report_user(uuid, text, text),
  public.export_my_data()
from public, anon;

grant execute on function
  public.is_admin(),
  public.can_view_profile(uuid),
  public.get_my_state(),
  public.set_identity(text, date),
  public.set_sensitive_consent(boolean, text),
  public.activate_profile(),
  public.set_paused(boolean),
  public.set_location(double precision, double precision),
  public.get_feed(int),
  public.swipe(uuid, public.swipe_direction),
  public.get_likers(),
  public.get_matches(),
  public.unmatch(uuid),
  public.block_user(uuid),
  public.report_user(uuid, text, text),
  public.export_my_data()
to authenticated, service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_privileged(),
  private.is_server_call(),
  private.age_years(date),
  private.photo_count(uuid),
  private.can_access_match(uuid),
  private.is_not_banned()
to authenticated;
grant execute on all functions in schema private to service_role;

-- Lot 1 : likes ciblés à la Hinge. On aime le profil, une photo (`photo:<uuid>`) ou une réponse
-- (`answer:<position>`), avec un mot facultatif (140 caractères). Au match, chaque mot devient
-- le premier message de son auteur, avec l'élément cité (messages.context / liked_item).

-- Texte cité d'un élément aimé (réponse) ; null pour une photo ou tout le profil.
create function private.liked_item_context(p_owner uuid, p_item text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_item like 'answer:%' then
    (select left(a.answer, 300) from public.profile_answers a
      where a.user_id = p_owner and a.position = substr(p_item, 8)::smallint)
  end;
$$;

-- Élément aimable : photo ou réponse visible du profil ciblé.
create function private.liked_item_exists(p_owner uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_item is null then true
    when p_item ~ '^photo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.profile_photos ph
       where ph.id = substr(p_item, 7)::uuid and ph.user_id = p_owner and ph.moderation_status <> 'rejected')
    when p_item ~ '^answer:[0-2]$' then exists (
      select 1 from public.profile_answers a
       where a.user_id = p_owner and a.position = substr(p_item, 8)::smallint and a.moderation_status <> 'rejected')
    else false
  end;
$$;

-- Swipe : mêmes règles qu'avant (verrous, quota, idempotence), plus l'élément aimé et le mot.
-- Compatible avec l'appel à 2 arguments. Un like existant n'est jamais modifié.
-- Erreurs ajoutées : `invalid_item` (élément inconnu ou invisible), `invalid_input` (élément ou
-- mot sur un pass), `comment_too_long`.
drop function public.swipe(uuid, public.swipe_direction);

create function public.swipe(
  p_target uuid,
  p_direction public.swipe_direction,
  p_liked_item text default null,
  p_comment text default null
)
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
  v_created boolean := false;
  v_unmatched_at timestamptz;
  v_item text := nullif(btrim(p_liked_item), '');
  v_comment text := nullif(btrim(p_comment), '');
  v_like record;
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

  if p_direction = 'pass' and (v_item is not null or v_comment is not null) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if char_length(v_comment) > 140 then
    raise exception 'comment_too_long' using errcode = 'P0001';
  end if;
  if not private.liked_item_exists(p_target, v_item) then
    raise exception 'invalid_item' using errcode = 'P0001';
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
    insert into public.swipes (swiper_id, target_id, direction, liked_item, comment)
    values (v_uid, p_target, p_direction, v_item, v_comment)
    on conflict (swiper_id, target_id) do update
      set direction = excluded.direction, liked_item = excluded.liked_item, comment = excluded.comment,
          created_at = now();
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
    v_created := v_match_id is not null;
    if v_match_id is null then
      select m.id, m.unmatched_at into v_match_id, v_unmatched_at from public.matches m
       where m.user_a = least(v_uid, p_target) and m.user_b = greatest(v_uid, p_target);
    end if;
  end if;

  -- Nouveau match : les mots des deux likes deviennent les premiers messages, dans l'ordre des likes.
  if v_created then
    for v_like in
      select s.swiper_id, s.target_id, s.liked_item, s.comment from public.swipes s
       where ((s.swiper_id = v_uid and s.target_id = p_target) or (s.swiper_id = p_target and s.target_id = v_uid))
         and s.direction = 'like' and s.comment is not null
       order by s.created_at, s.swiper_id
    loop
      insert into public.messages (match_id, sender_id, body, context, liked_item, from_like, created_at)
      values (v_match_id, v_like.swiper_id, v_like.comment,
              private.liked_item_context(v_like.target_id, v_like.liked_item), v_like.liked_item, true,
              clock_timestamp());
    end loop;
  end if;

  perform private.touch_activity(v_uid);

  if v_match_id is null or v_unmatched_at is not null then
    return jsonb_build_object('matched', false, 'match_id', null);
  end if;
  return jsonb_build_object('matched', true, 'match_id', v_match_id);
end;
$$;

-- Les messages issus d'un like ne déclenchent pas de notification « nouveau message » : le match
-- est déjà notifié.
drop trigger messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row when (not new.from_like) execute function private.notify_new_message();

-- Qui m'a liké (palier avec sees_likers) : mêmes colonnes qu'avant, plus le niveau, le domaine,
-- l'élément aimé chez moi (réponse citée ou chemin de la photo), le mot et la date du like.
drop function public.get_likers();

create function public.get_likers()
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
  select p.id, p.display_name, private.age_years(pp.birthdate), p.bio, p.city,
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

-- Nombre de likes reçus en attente de réponse, pour tous les paliers : jamais l'identité des
-- personnes (D16). Mêmes conditions que get_likers.
create function private.likes_received_count(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.swipes s
  join public.profiles p on p.id = s.swiper_id
  join public.user_access ua on ua.user_id = p.id
  where s.target_id = p_uid
    and s.direction = 'like'
    and p.status = 'active'
    and private.tier_can_browse(ua.tier)
    and not exists (select 1 from public.swipes mine where mine.swiper_id = p_uid and mine.target_id = p.id)
    and not private.is_blocked_pair(p_uid, p.id);
$$;

create function public.get_likes_count()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return private.likes_received_count(v_uid);
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.swipe(uuid, public.swipe_direction, text, text),
  public.get_likers(),
  public.get_likes_count()
from public, anon;

grant execute on function
  public.swipe(uuid, public.swipe_direction, text, text),
  public.get_likers(),
  public.get_likes_count()
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
  private.can_read_photo_object(text)
to authenticated;
grant execute on all functions in schema private to service_role;

-- Lot 1 : découverte par critères et affinités (cadrage §3, décisions D1, D8, D9), fiche profil complète.
--  * Filtres stricts : âge (dans les deux sens) et distance (rayon personnel de 5 à 200 km).
--  * Préférences : niveaux et domaines font remonter ; en mode strict, ils excluent.
--  * Tri par défaut (activity) : jour de dernière activité, préférences, affinités, distance.
--    Tri affinity : préférences, affinités, jour d'activité, distance.
--  * Jamais de contournement de l'éligibilité, des blocages ni des préférences de genre et d'âge
--    de l'autre personne.

-- Affinités -----------------------------------------------------------------------------------
-- Score et raisons explicables entre deux membres. Poids dans app_settings (affinity_weight_*).
-- reasons : tableau d'objets, dans cet ordre quand ils s'appliquent :
--   { "kind": "same_field", "field": "<study_field>" }
--   { "kind": "shared_books", "count": n, "titles": ["<titre chez la cible>", …] }
--   { "kind": "shared_prompts", "count": n, "prompt_keys": ["<clé>", …] }
--   { "kind": "same_institution", "institution": "<établissement>" }   (si les deux l'affichent)
create function private.affinity(p_viewer uuid, p_target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_score int := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_field_a public.study_field;
  v_field_b public.study_field;
  v_show_a boolean;
  v_show_b boolean;
  v_inst_a text;
  v_inst_b text;
  v_books text[];
  v_prompts text[];
begin
  if p_viewer is null or p_target is null or p_viewer = p_target then
    return jsonb_build_object('score', 0, 'reasons', '[]'::jsonb);
  end if;

  select p.study_field, p.show_institution, ua.institution into v_field_a, v_show_a, v_inst_a
    from public.profiles p left join public.user_access ua on ua.user_id = p.id where p.id = p_viewer;
  select p.study_field, p.show_institution, ua.institution into v_field_b, v_show_b, v_inst_b
    from public.profiles p left join public.user_access ua on ua.user_id = p.id where p.id = p_target;

  if v_field_a is not null and v_field_a = v_field_b then
    v_score := v_score + private.setting_int('affinity_weight_field', 3);
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('kind', 'same_field', 'field', v_field_b));
  end if;

  select array_agg(b.title order by b.position) into v_books
    from public.profile_books b
   where b.user_id = p_target and b.moderation_status <> 'rejected'
     and private.normalize_text(b.title) in (
       select private.normalize_text(a.title) from public.profile_books a
        where a.user_id = p_viewer and a.moderation_status <> 'rejected');
  if coalesce(cardinality(v_books), 0) > 0 then
    v_score := v_score + private.setting_int('affinity_weight_book', 2) * cardinality(v_books);
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'kind', 'shared_books', 'count', cardinality(v_books), 'titles', to_jsonb(v_books)));
  end if;

  select array_agg(b.prompt_key order by b.position) into v_prompts
    from public.profile_answers b
    join public.profile_answers a on a.prompt_key = b.prompt_key and a.user_id = p_viewer
                                 and a.moderation_status <> 'rejected'
   where b.user_id = p_target and b.moderation_status <> 'rejected';
  if coalesce(cardinality(v_prompts), 0) > 0 then
    v_score := v_score + private.setting_int('affinity_weight_prompt', 1) * cardinality(v_prompts);
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'kind', 'shared_prompts', 'count', cardinality(v_prompts), 'prompt_keys', to_jsonb(v_prompts)));
  end if;

  if v_show_a and v_show_b and v_inst_a is not null and v_inst_b is not null
     and private.normalize_text(v_inst_a) = private.normalize_text(v_inst_b) then
    v_score := v_score + private.setting_int('affinity_weight_institution', 2);
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('kind', 'same_institution', 'institution', v_inst_b));
  end if;

  return jsonb_build_object('score', v_score, 'reasons', v_reasons);
end;
$$;

-- Candidats de la découverte -------------------------------------------------------------------
-- p_apply_prefs = false : ignore les critères du membre (âge, rayon, niveaux et domaines stricts)
-- mais garde tout le reste (éligibilité, genres réciproques, tranche d'âge de l'autre, déjà vus,
-- blocages) : sert à distinguer « critères trop stricts » de « plus personne ».
-- Paramètres p_* non nuls : remplacent les critères enregistrés (aperçu de l'écran Critères).
create function private.discovery_candidates(
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
  select private.age_years(pp.birthdate) into v_my_age from public.profile_private pp where pp.user_id = p_uid;
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
         private.age_years(pp.birthdate),
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
    and pp.birthdate is not null
    and v_my_age between p.age_min and p.age_max
    and (not p_apply_prefs or private.age_years(pp.birthdate) between v_age_min and v_age_max)
    and (not p_apply_prefs or v_me.location is null
         or (p.location is not null and extensions.st_dwithin(p.location, v_me.location, v_radius_m)))
    and (not p_apply_prefs or not v_strict_levels or cardinality(v_levels) = 0 or ua.level = any (v_levels))
    and (not p_apply_prefs or not v_strict_fields or cardinality(v_fields) = 0 or p.study_field = any (v_fields))
    and not exists (select 1 from public.swipes s where s.swiper_id = p_uid and s.target_id = p.id)
    and not private.is_blocked_pair(p_uid, p.id);
end;
$$;

-- Première réponse visible d'un membre (aperçu sur la carte).
create function private.preview_answer(p_user uuid)
returns table (prompt_key text, answer text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.prompt_key, a.answer from public.profile_answers a
   where a.user_id = p_user and a.moderation_status <> 'rejected'
   order by a.position limit 1;
$$;

-- get_feed : mêmes colonnes qu'avant, plus le niveau (D1), le domaine, l'établissement (si le
-- membre l'affiche), une réponse en aperçu, le badge du test et les affinités avec le spectateur.
drop function public.get_feed(int);

create function public.get_feed(p_limit int default 20)
returns table (
  id uuid, display_name text, age int, bio text, city text, distance_km int, photo_paths text[],
  level int, study_field public.study_field, field_verified boolean, institution text,
  preview_prompt_key text, preview_answer text, quiz_badge boolean,
  affinity_score int, affinity_reasons jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_sort public.discovery_sort;
begin
  if v_uid is null then
    return;
  end if;
  select coalesce((select dp.sort from public.discovery_prefs dp where dp.user_id = v_uid), 'activity')
    into v_sort;
  perform private.touch_activity(v_uid);

  return query
  with c as (
    select c.*, private.affinity(v_uid, c.id) as aff,
           date_trunc('day', c.last_active_at at time zone 'Europe/Paris') as active_day
    from private.discovery_candidates(v_uid, true) c
  )
  select c.id, p.display_name, c.age, p.bio, p.city,
         case when c.dist_m is null then null else greatest(1, round(c.dist_m / 1000.0))::int end,
         coalesce((select array_agg(ph.storage_path order by ph.position, ph.created_at)
                     from public.profile_photos ph
                    where ph.user_id = c.id and ph.moderation_status <> 'rejected'), '{}'::text[]),
         c.level,
         c.study_field,
         coalesce(c.study_field = ua.study_field, false),
         case when p.show_institution then ua.institution end,
         pa.prompt_key,
         pa.answer,
         p.show_quiz_badge,
         (c.aff ->> 'score')::int,
         c.aff -> 'reasons'
  from c
  join public.profiles p on p.id = c.id
  join public.user_access ua on ua.user_id = c.id
  left join lateral private.preview_answer(c.id) pa on true
  order by
    case when v_sort = 'activity' then c.active_day end desc nulls last,
    c.pref_score desc,
    (c.aff ->> 'score')::int desc,
    case when v_sort = 'affinity' then c.active_day end desc nulls last,
    c.dist_m asc nulls last,
    c.last_active_at desc,
    c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Compteurs pour l'écran Critères et l'état vide du feed :
--   matching : profils non vus qui correspondent aux critères (enregistrés, ou ceux passés en
--              paramètre : aperçu avant d'enregistrer, « + n profils » en élargissant) ;
--   total    : profils non vus compatibles sans les critères du membre.
-- matching = 0 et total > 0 : critères trop stricts ; total = 0 : plus personne pour l'instant.
create function public.count_discovery(
  p_max_distance_km int default null,
  p_age_min int default null,
  p_age_max int default null,
  p_levels int[] default null,
  p_strict_levels boolean default null,
  p_fields public.study_field[] default null,
  p_strict_fields boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if (p_max_distance_km is not null and p_max_distance_km not between 5 and 200)
     or (p_age_min is not null and p_age_min < 18) or (p_age_max is not null and p_age_max > 120) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'matching', (select count(*) from private.discovery_candidates(v_uid, true, p_max_distance_km, p_age_min,
                   p_age_max, p_levels, p_strict_levels, p_fields, p_strict_fields)),
    'total', (select count(*) from private.discovery_candidates(v_uid, false)));
end;
$$;

-- Critères effectifs du membre (valeurs par défaut si rien n'est enregistré).
create function public.get_discovery_prefs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_prefs public.discovery_prefs;
  v_me public.profiles;
  v_default int := private.setting_int('feed_radius_km', 50);
begin
  select * into v_me from public.profiles p where p.id = v_uid;
  select * into v_prefs from public.discovery_prefs dp where dp.user_id = v_uid;
  return jsonb_build_object(
    'max_distance_km', coalesce(v_prefs.max_distance_km, v_default),
    'default_distance_km', v_default,
    'age_min', v_me.age_min,
    'age_max', v_me.age_max,
    'levels', to_jsonb(coalesce(v_prefs.levels, '{}')),
    'strict_levels', coalesce(v_prefs.strict_levels, false),
    'fields', to_jsonb(coalesce(v_prefs.fields, '{}')),
    'strict_fields', coalesce(v_prefs.strict_fields, false),
    'sort', coalesce(v_prefs.sort, 'activity'),
    'saved', v_prefs.user_id is not null);
end;
$$;

-- Enregistre les critères (un seul endroit pour la tranche d'âge). Paramètre nul = inchangé.
create function public.set_discovery_prefs(
  p_max_distance_km int default null,
  p_age_min int default null,
  p_age_max int default null,
  p_levels int[] default null,
  p_strict_levels boolean default null,
  p_fields public.study_field[] default null,
  p_strict_fields boolean default null,
  p_sort public.discovery_sort default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_me public.profiles;
  v_age_min int;
  v_age_max int;
begin
  select * into v_me from public.profiles p where p.id = v_uid for update;
  v_age_min := coalesce(p_age_min, v_me.age_min);
  v_age_max := coalesce(p_age_max, v_me.age_max);
  if (p_max_distance_km is not null and p_max_distance_km not between 5 and 200)
     or v_age_min < 18 or v_age_max > 120 or v_age_min > v_age_max
     or (p_levels is not null and not p_levels <@ array[1, 2, 3, 4, 5, 6, 7, 8]) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  update public.profiles set age_min = v_age_min, age_max = v_age_max where id = v_uid;

  insert into public.discovery_prefs as dp (user_id, max_distance_km, levels, strict_levels, fields, strict_fields, sort)
  values (v_uid, p_max_distance_km, coalesce(p_levels, '{}'), coalesce(p_strict_levels, false),
          coalesce(p_fields, '{}'), coalesce(p_strict_fields, false), coalesce(p_sort, 'activity'))
  on conflict (user_id) do update set
    max_distance_km = coalesce(p_max_distance_km, dp.max_distance_km),
    levels = coalesce(p_levels, dp.levels),
    strict_levels = coalesce(p_strict_levels, dp.strict_levels),
    fields = coalesce(p_fields, dp.fields),
    strict_fields = coalesce(p_strict_fields, dp.strict_fields),
    sort = coalesce(p_sort, dp.sort);

  return public.get_discovery_prefs();
end;
$$;

-- Fiche profil complète ------------------------------------------------------------------------
-- Tout ce que montre la fiche, si can_view_profile(p_target) (sinon `not_found`) :
-- { id, is_self, display_name, age, city, bio, distance_km, level, study_field, field_verified,
--   institution (si affiché), quiz_badge, thesis: { line, visibility? } | null,
--   photos: [{ id, path, position }], answers: [{ position, prompt_key, answer }],
--   books: [{ position, title, author }], affinity: { score, reasons } | null,
--   match_id | null, my_swipe: 'like' | 'pass' | null }
-- La thèse n'apparaît que si elle est ouverte à tous ou s'il y a un match (D3).
create function public.get_profile(p_target uuid)
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
    'age', (select private.age_years(pp.birthdate) from public.profile_private pp where pp.user_id = p_target),
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
    'answers', coalesce((select jsonb_agg(jsonb_build_object('position', a.position, 'prompt_key', a.prompt_key,
                                                             'answer', a.answer) order by a.position)
                           from public.profile_answers a
                          where a.user_id = p_target and a.moderation_status <> 'rejected'), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('position', b.position, 'title', b.title,
                                                           'author', b.author) order by b.position)
                         from public.profile_books b
                        where b.user_id = p_target and b.moderation_status <> 'rejected'), '[]'::jsonb),
    'affinity', case when v_self then null else private.affinity(v_uid, p_target) end,
    'match_id', v_match,
    'my_swipe', (select s.direction from public.swipes s where s.swiper_id = v_uid and s.target_id = p_target)
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.get_feed(int),
  public.count_discovery(int, int, int, int[], boolean, public.study_field[], boolean),
  public.get_discovery_prefs(),
  public.set_discovery_prefs(int, int, int, int[], boolean, public.study_field[], boolean, public.discovery_sort),
  public.get_profile(uuid)
from public, anon;

grant execute on function
  public.get_feed(int),
  public.count_discovery(int, int, int, int[], boolean, public.study_field[], boolean),
  public.get_discovery_prefs(),
  public.set_discovery_prefs(int, int, int, int[], boolean, public.study_field[], boolean, public.discovery_sort),
  public.get_profile(uuid)
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

-- Lot 1, back-office : liste d'attente enrichie (niveau, ville), réglages de la découverte et de
-- la modération validés et tracés, contexte d'un signalement (audit n° 23).

-- Liste d'attente : niveau et ville facultatifs ---------------------------------------------------
-- Le formulaire de la landing les propose sans les exiger. Niveau sur l'échelle des diplômes
-- (1 à 8, comme user_access.level), ville en texte libre court.
alter table public.waitlist_signups
  add column level smallint check (level is null or level between 1 and 8),
  add column city text check (city is null or char_length(btrim(city)) between 1 and 80);

grant insert (email, source, level, city) on public.waitlist_signups to anon, authenticated;

-- Réglages : écriture validée et tracée -----------------------------------------------------------
-- Les clés connues seulement, chacune avec ses bornes. Une écriture directe dans app_settings reste
-- possible pour un admin (RLS d'origine), mais le back-office passe par ici : valeurs vérifiées et
-- trace dans audit_log (avant / après).
create function public.admin_update_settings(p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_key text;
  v_value jsonb;
  v_new jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_int int;
  v_words text[];
  v_word text;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  for v_key, v_value in select * from jsonb_each(p_values)
  loop
    if v_key = 'feed_radius_km' or v_key like 'affinity\_weight\_%' then
      if v_key not in ('feed_radius_km', 'affinity_weight_field', 'affinity_weight_book',
                       'affinity_weight_prompt', 'affinity_weight_institution') then
        raise exception 'unknown_setting' using errcode = 'P0001', detail = v_key;
      end if;
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      if (v_key = 'feed_radius_km' and v_int not between 5 and 200)
         or (v_key <> 'feed_radius_km' and v_int not between 0 and 20) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key = 'moderation_blocklist' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_words := '{}';
      for v_word in select lower(btrim(w)) from jsonb_array_elements_text(v_value) w
      loop
        if v_word = '' then
          continue;
        end if;
        if char_length(v_word) > 40 then
          raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
        end if;
        if not v_word = any (v_words) then
          v_words := array_append(v_words, v_word);
        end if;
      end loop;
      if cardinality(v_words) > 300 then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_words);
    else
      raise exception 'unknown_setting' using errcode = 'P0001', detail = v_key;
    end if;

    v_before := v_before || jsonb_build_object(v_key, (select s.value from public.app_settings s where s.key = v_key));
    insert into public.app_settings (key, value) values (v_key, v_new)
    on conflict (key) do update set value = excluded.value;
    v_after := v_after || jsonb_build_object(v_key, v_new);
  end loop;

  perform private.audit(v_admin, 'settings.update', 'app_settings', null,
    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;

-- Contexte d'un signalement (audit n° 23) -------------------------------------------------------------
-- Tout ce qu'il faut pour décider sans ouvrir dix écrans : la personne signalée (profil, photos,
-- textes, diplôme validé), le texte visé, ses autres signalements, le lien entre les deux membres
-- (match, blocage). Jamais les messages : le formulaire de signalement ne l'annonce pas.
create function public.admin_get_report_context(p_report_id uuid)
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

  select * into v_match from public.matches m
   where m.user_a = least(v_report.reporter_id, v_target) and m.user_b = greatest(v_report.reporter_id, v_target);

  return jsonb_build_object(
    'target', (select jsonb_build_object(
                 'id', p.id, 'display_name', p.display_name, 'status', p.status, 'city', p.city, 'bio', p.bio,
                 'study_field', p.study_field, 'created_at', p.created_at, 'last_active_at', p.last_active_at,
                 'age', private.age_years(pp.birthdate), 'legal_name', pp.legal_name,
                 'email', u.email::text,
                 'tier', ua.tier, 'level', ua.level, 'institution', ua.institution,
                 'source_submission_id', ua.source_submission_id)
               from public.profiles p
               left join public.profile_private pp on pp.user_id = p.id
               left join public.user_access ua on ua.user_id = p.id
               left join auth.users u on u.id = p.id
               where p.id = v_target),
    'reporter', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
                                           'reports_filed', (select count(*) from public.reports r
                                                              where r.reporter_id = p.id))
                 from public.profiles p where p.id = v_report.reporter_id),
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
                 'text', private.content_text(v_target, v_report.content_kind, v_report.content_item_id),
                 'prompt_key', (select a.prompt_key from public.profile_answers a
                                 where v_report.content_kind = 'answer' and a.id = v_report.content_item_id),
                 'flag_id', (select f.id from public.content_flags f
                              where f.report_id = v_report.id order by f.created_at desc limit 1),
                 'flag_status', (select f.status from public.content_flags f
                                  where f.report_id = v_report.id order by f.created_at desc limit 1)) end,
    'reports_against', jsonb_build_object(
                 'open', (select count(*) from public.reports r where r.target_id = v_target and r.status = 'open'),
                 'total', (select count(*) from public.reports r where r.target_id = v_target),
                 'actioned', (select count(*) from public.reports r
                               where r.target_id = v_target and r.status = 'actioned'),
                 'reasons', coalesce((select jsonb_agg(distinct r.reason) from public.reports r
                                       where r.target_id = v_target), '[]'::jsonb)),
    'relationship', jsonb_build_object(
                 'matched_at', v_match.created_at,
                 'unmatched_at', v_match.unmatched_at,
                 'reporter_blocked', exists (select 1 from public.blocks b
                                              where b.blocker_id = v_report.reporter_id and b.blocked_id = v_target),
                 'target_blocked', exists (select 1 from public.blocks b
                                            where b.blocker_id = v_target and b.blocked_id = v_report.reporter_id))
  );
end;
$$;

revoke all on function
  public.admin_update_settings(jsonb),
  public.admin_get_report_context(uuid)
from public, anon;
grant execute on function
  public.admin_update_settings(jsonb),
  public.admin_get_report_context(uuid)
to authenticated, service_role;

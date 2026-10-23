-- Lot 2, back-office : réglages des lettres de recommandation depuis la page « Parrainages », et palier
-- du parrain dans les statistiques. Aucune nouvelle table, aucun nouveau droit.

-- Réglages : admin_update_settings (lot 1) accepte en plus les trois réglages des recommandations.
-- Les autres clés gardent exactement leurs règles.
create or replace function public.admin_update_settings(p_values jsonb)
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
    elsif v_key in ('referral_letters_standard', 'referral_letters_unlimited', 'referral_window_days') then
      -- Lot 2 : lettres de recommandation par palier et durée de la période glissante.
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      if (v_key = 'referral_window_days' and v_int not between 7 and 90)
         or (v_key <> 'referral_window_days' and v_int not between 0 and 20) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
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

-- Statistiques des recommandations : + palier et niveau du parrain (affichage seulement).
create or replace function public.admin_referral_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window int := private.setting_int('referral_window_days', 30);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'codes_active', (select count(*) from public.referral_codes rc where rc.revoked_at is null),
    'codes_revoked', (select count(*) from public.referral_codes rc where rc.revoked_at is not null),
    'referrals_total', (select count(*) from public.referrals),
    'referrals_window', (select count(*) from public.referrals r
                          where r.claimed_at > now() - make_interval(days => v_window)),
    'referrers', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb order by s.referees_total desc, s.display_name)
      from (
        select r.referrer_id,
               p.display_name,
               u.email::text as email,
               ua_ref.tier,
               ua_ref.level,
               (select rc.code from public.referral_codes rc
                 where rc.owner_id = r.referrer_id and rc.revoked_at is null) as active_code,
               coalesce(ua_ref.referral_disabled, false) as referral_disabled,
               count(*)::int as referees_total,
               count(*) filter (where r.claimed_at > now() - make_interval(days => v_window))::int as letters_used_window,
               count(*) filter (where ua.tier in ('standard', 'unlimited'))::int as referees_admitted,
               count(*) filter (where ua.tier = 'waitlist')::int as referees_waitlisted,
               count(*) filter (where ua.tier = 'refused')::int as referees_refused,
               count(*) filter (where ua.user_id is null)::int as referees_pending,
               count(*) filter (where rp.status = 'banned')::int as referees_banned,
               (count(*) filter (where rp.status = 'banned') > 0) as flagged
        from public.referrals r
        join public.profiles p on p.id = r.referrer_id
        join auth.users u on u.id = r.referrer_id
        left join public.user_access ua_ref on ua_ref.user_id = r.referrer_id
        left join public.user_access ua on ua.user_id = r.referee_id
        left join public.profiles rp on rp.id = r.referee_id
        where r.referrer_id is not null
        group by r.referrer_id, p.display_name, u.email, ua_ref.referral_disabled, ua_ref.tier, ua_ref.level
        limit 500
      ) s), '[]'::jsonb)
  );
end;
$$;

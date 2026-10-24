-- Sapios Emploi : RPC du compte et du candidat (contrat §3, « Compte et candidat »).
-- security definer, search_path vide, erreurs P0001 dont le message est le code du contrat.

-- État du compte pour le routage des clients (EmploiState) ------------------------------------------
create function public.get_emploi_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_kind public.emploi_account_kind := private.emploi_kind(v_uid);
  v_version text := private.emploi_terms_version(v_kind);
  v_cand public.candidates;
  v_member public.company_members;
  v_company public.companies;
  v_latest public.degree_submissions;
  v_recent_subs int;
  v_accepted_at timestamptz;
  v_apps_open int := 0;
  v_unread int := 0;
  v_invites int := 0;
begin
  perform private.touch_activity(v_uid);
  select * into v_cand from public.candidates c where c.user_id = v_uid;
  select * into v_member from public.company_members cm where cm.user_id = v_uid;
  if v_member.company_id is not null then
    select * into v_company from public.companies c where c.id = v_member.company_id;
  end if;
  select * into v_latest from public.degree_submissions s where s.user_id = v_uid order by s.created_at desc limit 1;
  select count(*) into v_recent_subs from public.degree_submissions s
   where s.user_id = v_uid and s.created_at > now() - interval '30 days';
  if v_version is not null then
    select t.accepted_at into v_accepted_at from public.terms_acceptances t
     where t.user_id = v_uid and t.version = v_version;
  end if;

  if v_kind = 'candidate' then
    select count(*) into v_apps_open from public.applications a
     where a.candidate_id = v_uid and a.status in ('sent', 'seen', 'interested', 'interview', 'offer_made');
    select count(*) into v_unread from public.application_messages m
      join public.applications a on a.id = m.application_id
     where a.candidate_id = v_uid and not m.from_candidate and m.read_at is null;
    select count(*) into v_invites from public.invitations i
     where i.candidate_id = v_uid and i.status = 'sent' and private.offer_is_public(i.offer_id);
  elsif v_member.company_id is not null then
    select count(*) into v_apps_open from public.applications a
     where a.company_id = v_member.company_id and a.status in ('sent', 'seen');
    select count(*) into v_unread from public.application_messages m
      join public.applications a on a.id = m.application_id
     where a.company_id = v_member.company_id and m.from_candidate and m.read_at is null;
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'is_admin_account', exists (select 1 from public.admins ad where ad.user_id = v_uid),
    'terms', jsonb_build_object('required_version', v_version, 'accepted', v_accepted_at is not null,
                                'accepted_at', v_accepted_at),
    'identity_set', exists (select 1 from public.candidate_identities ci where ci.user_id = v_uid),
    'candidate', case when v_cand.user_id is null then null else jsonb_build_object(
      'number', v_cand.number,
      'complete', private.candidate_complete(v_uid),
      'paused', v_cand.paused,
      'open_to_opportunities', v_cand.open_to_opportunities) end,
    'diploma', private.diploma_badge(v_uid, false),
    'latest_submission', case when v_latest.id is null then null else jsonb_build_object(
      'id', v_latest.id, 'status', v_latest.status, 'created_at', v_latest.created_at,
      'rejection_reason', v_latest.rejection_reason) end,
    'submissions_left', greatest(private.setting_int('max_submissions_per_30_days', 3) - v_recent_subs, 0),
    'recruiter', case when v_member.company_id is null then null else jsonb_build_object(
      'company_id', v_company.id, 'company_name', v_company.display_name, 'company_status', v_company.status,
      'role', v_member.role) end,
    'counts', jsonb_build_object('applications_open', v_apps_open, 'unread_messages', v_unread,
                                 'invitations_pending', v_invites),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload, 'created_at', n.created_at)
                       order by n.created_at desc)
        from (select * from public.member_notices mn
               where mn.user_id = v_uid and mn.read_at is null
                 and mn.kind in ('application_interested', 'application_rejected', 'application_closed',
                                 'interview_proposed', 'invitation_received', 'company_verified', 'company_rejected',
                                 'company_suspended', 'offer_published', 'offer_rejected')
               order by mn.created_at desc limit 20) n), '[]'::jsonb)
  );
end;
$$;

create function public.set_account_kind(p_kind public.emploi_account_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_current public.emploi_account_kind := private.emploi_kind(v_uid);
begin
  if p_kind is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if v_current is not null then
    if v_current = p_kind then
      return; -- idempotent
    end if;
    raise exception 'kind_already_set' using errcode = 'P0001';
  end if;
  insert into public.emploi_accounts (user_id, kind) values (v_uid, p_kind);
  perform private.audit(v_uid, 'emploi.account_kind', 'emploi_accounts', v_uid::text, jsonb_build_object('kind', p_kind));
end;
$$;

create function public.accept_emploi_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_kind public.emploi_account_kind := private.emploi_kind(v_uid);
  v_current text;
begin
  if v_kind is null then
    raise exception 'kind_required' using errcode = 'P0001';
  end if;
  v_current := private.emploi_terms_version(v_kind);
  if p_version is null or btrim(p_version) <> v_current then
    raise exception 'terms_version_mismatch' using errcode = 'P0001';
  end if;
  insert into public.terms_acceptances (user_id, version) values (v_uid, v_current)
  on conflict (user_id, version) do nothing;
  if found then
    perform private.audit(v_uid, 'terms.accepted', 'terms_acceptances', v_uid::text,
                          jsonb_build_object('version', v_current, 'kind', v_kind));
  end if;
end;
$$;

-- Identité : prénom en clair, nom chiffré (field_key). Jamais lue par un recruteur avant le match.
create function public.set_candidate_identity(p_first_name text, p_last_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
begin
  if char_length(v_first) not between 1 and 40 or char_length(v_last) not between 1 and 80 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into public.candidate_identities (user_id, first_name, last_name_enc)
  values (v_uid, v_first, private.encrypt_text(v_last))
  on conflict (user_id) do update
    set first_name = excluded.first_name, last_name_enc = excluded.last_name_enc, updated_at = now();
end;
$$;

create function public.get_my_candidate_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return private.candidate_identity_json(v_uid);
end;
$$;

-- Profil de recherche (CandidateProfile) ------------------------------------------------------------
create function public.save_candidate_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_c public.candidates;
  v_exists boolean;
  v_key text;
  v_lat double precision;
  v_lng double precision;
begin
  if not private.emploi_terms_accepted(v_uid) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('target_role', 'search_city', 'search_postcode', 'search_lat', 'search_lng', 'search_radius_km',
                     'contract_types', 'salary_min_k', 'salary_max_k', 'remote_days_min', 'available_from',
                     'experience_band', 'work_authorization', 'looking_for', 'open_to_opportunities',
                     'show_institution', 'paused') then
      raise exception 'invalid_input' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;

  select * into v_c from public.candidates c where c.user_id = v_uid for update;
  v_exists := found;
  if not v_exists then
    if not (p ?& array['target_role', 'search_city', 'search_lat', 'search_lng', 'contract_types', 'salary_min_k',
                       'salary_max_k', 'experience_band']) then
      raise exception 'invalid_input' using errcode = 'P0001', detail = 'missing_required';
    end if;
    v_c.user_id := v_uid;
    v_c.search_radius_km := 20;
    v_c.remote_days_min := 0;
    v_c.work_authorization := false;
    v_c.open_to_opportunities := false;
    v_c.show_institution := false;
    v_c.paused := false;
  end if;

  begin
    if p ? 'target_role' then v_c.target_role := btrim(p ->> 'target_role'); end if;
    if p ? 'search_city' then v_c.search_city := btrim(p ->> 'search_city'); end if;
    if p ? 'search_postcode' then v_c.search_postcode := nullif(btrim(p ->> 'search_postcode'), ''); end if;
    if p ? 'search_lat' or p ? 'search_lng' then
      v_lat := (p ->> 'search_lat')::double precision;
      v_lng := (p ->> 'search_lng')::double precision;
      if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'invalid_input' using errcode = 'P0001', detail = 'search_location';
      end if;
      v_c.search_location := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
    end if;
    if p ? 'search_radius_km' then v_c.search_radius_km := (p ->> 'search_radius_km')::int; end if;
    if p ? 'contract_types' then
      if jsonb_typeof(p -> 'contract_types') <> 'array' then
        raise exception 'invalid_input' using errcode = 'P0001', detail = 'contract_types';
      end if;
      v_c.contract_types := array(select distinct x::public.contract_type
                                    from jsonb_array_elements_text(p -> 'contract_types') x);
    end if;
    if p ? 'salary_min_k' then v_c.salary_min_k := (p ->> 'salary_min_k')::int; end if;
    if p ? 'salary_max_k' then v_c.salary_max_k := (p ->> 'salary_max_k')::int; end if;
    if p ? 'remote_days_min' then v_c.remote_days_min := coalesce((p ->> 'remote_days_min')::int, 0); end if;
    if p ? 'available_from' then v_c.available_from := (p ->> 'available_from')::date; end if;
    if p ? 'experience_band' then v_c.experience_band := (p ->> 'experience_band')::public.experience_band; end if;
    if p ? 'work_authorization' then v_c.work_authorization := coalesce((p ->> 'work_authorization')::boolean, false); end if;
    if p ? 'looking_for' then v_c.looking_for := nullif(btrim(p ->> 'looking_for'), ''); end if;
    if p ? 'open_to_opportunities' then
      v_c.open_to_opportunities := coalesce((p ->> 'open_to_opportunities')::boolean, false);
    end if;
    if p ? 'show_institution' then v_c.show_institution := coalesce((p ->> 'show_institution')::boolean, false); end if;
    if p ? 'paused' then v_c.paused := coalesce((p ->> 'paused')::boolean, false); end if;

    if v_exists then
      update public.candidates c set
        target_role = v_c.target_role, search_city = v_c.search_city, search_postcode = v_c.search_postcode,
        search_location = v_c.search_location, search_radius_km = v_c.search_radius_km,
        contract_types = v_c.contract_types, salary_min_k = v_c.salary_min_k, salary_max_k = v_c.salary_max_k,
        remote_days_min = v_c.remote_days_min, available_from = v_c.available_from,
        experience_band = v_c.experience_band, work_authorization = v_c.work_authorization,
        looking_for = v_c.looking_for, open_to_opportunities = v_c.open_to_opportunities,
        show_institution = v_c.show_institution, paused = v_c.paused
       where c.user_id = v_uid;
    else
      insert into public.candidates (user_id, target_role, search_city, search_postcode, search_location,
                                     search_radius_km, contract_types, salary_min_k, salary_max_k, remote_days_min,
                                     available_from, experience_band, work_authorization, looking_for,
                                     open_to_opportunities, show_institution, paused)
      values (v_uid, v_c.target_role, v_c.search_city, v_c.search_postcode, v_c.search_location,
              v_c.search_radius_km, v_c.contract_types, v_c.salary_min_k, v_c.salary_max_k, v_c.remote_days_min,
              v_c.available_from, v_c.experience_band, v_c.work_authorization, v_c.looking_for,
              v_c.open_to_opportunities, v_c.show_institution, v_c.paused);
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
         or invalid_datetime_format or datetime_field_overflow or string_data_right_truncation then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;
  return private.candidate_profile_json(v_uid);
end;
$$;

-- CV : remplace toutes les expériences, compétences et langues (CandidateCv) -------------------------
create function public.get_my_cv()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  return jsonb_build_object(
    'identity', private.candidate_identity_json(v_uid),
    'profile', private.candidate_profile_json(v_uid),
    'experiences', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'employer', e.employer,
                                          'employer_hidden', e.employer_hidden, 'start_month', e.start_month,
                                          'end_month', e.end_month, 'summary', e.summary) order by e.position)
        from public.cv_experiences e where e.user_id = v_uid), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(s.label order by s.position) from public.cv_skills s
                         where s.user_id = v_uid), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('language', l.language, 'level', l.level)
                                            order by l.language)
                             from public.cv_languages l where l.user_id = v_uid), '[]'::jsonb),
    'diploma', private.diploma_badge(v_uid, false)
  );
end;
$$;

create function public.save_cv(p_experiences jsonb, p_skills text[], p_languages jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_item jsonb;
  v_pos int := 0;
  v_skill text;
  v_seen text[] := '{}';
begin
  if p_experiences is null or jsonb_typeof(p_experiences) <> 'array' or jsonb_array_length(p_experiences) > 10
     or p_languages is null or jsonb_typeof(p_languages) <> 'array' or jsonb_array_length(p_languages) > 6
     or coalesce(cardinality(p_skills), 0) > 10 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  begin
    delete from public.cv_experiences e where e.user_id = v_uid;
    delete from public.cv_skills s where s.user_id = v_uid;
    delete from public.cv_languages l where l.user_id = v_uid;

    for v_item in select x from jsonb_array_elements(p_experiences) x loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_input' using errcode = 'P0001';
      end if;
      insert into public.cv_experiences (user_id, position, title, employer, employer_hidden, start_month, end_month, summary)
      values (v_uid, v_pos, btrim(v_item ->> 'title'), btrim(v_item ->> 'employer'),
              coalesce((v_item ->> 'employer_hidden')::boolean, false),
              date_trunc('month', (v_item ->> 'start_month')::date)::date,
              date_trunc('month', (v_item ->> 'end_month')::date)::date,
              nullif(btrim(v_item ->> 'summary'), ''));
      v_pos := v_pos + 1;
    end loop;

    v_pos := 0;
    foreach v_skill in array coalesce(p_skills, '{}') loop
      v_skill := btrim(coalesce(v_skill, ''));
      if v_skill = '' or lower(v_skill) = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, lower(v_skill));
      insert into public.cv_skills (user_id, position, label) values (v_uid, v_pos, v_skill);
      v_pos := v_pos + 1;
    end loop;

    for v_item in select x from jsonb_array_elements(p_languages) x loop
      insert into public.cv_languages (user_id, language, level)
      values (v_uid, btrim(v_item ->> 'language'), (v_item ->> 'level')::public.language_level);
    end loop;
  exception
    when check_violation or not_null_violation or invalid_text_representation or unique_violation
         or invalid_datetime_format or datetime_field_overflow or string_data_right_truncation then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;
  return public.get_my_cv();
end;
$$;

-- Ce que voit un recruteur avant le match (null tant que le profil de recherche n'existe pas).
create function public.get_my_cv_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  return private.anonymous_cv(v_uid);
end;
$$;

-- Offres ---------------------------------------------------------------------------------------------
-- Règles affichées (contrat §6) : offre publiée d'une entreprise vérifiée, non expirée, ni postulée ni
-- passée, contrat souhaité, dans le rayon de la zone de recherche. Ordre : correspondances remplies,
-- date de publication, distance. Rien d'autre.
create function public.get_offer_feed(p_limit int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  if not private.candidate_complete(v_uid) then
    return;
  end if;
  return query
    select private.offer_card_json(f.o, v_uid)
      from (
        select o, private.met_count(private.requirement_matches(o, v_uid)) as met,
               extensions.st_distance(o.location, c.search_location) as dist
          from public.offers o
          join public.companies co on co.id = o.company_id
          join public.candidates c on c.user_id = v_uid
         where o.status = 'published' and co.status = 'verified'
           and (o.expires_at is null or o.expires_at > now())
           and o.contract = any (c.contract_types)
           and extensions.st_dwithin(o.location, c.search_location, c.search_radius_km * 1000.0)
           and not exists (select 1 from public.applications a where a.offer_id = o.id and a.candidate_id = v_uid)
           and not exists (select 1 from public.offer_passes ps where ps.offer_id = o.id and ps.user_id = v_uid)
      ) f
     order by f.met desc, (f.o).published_at desc, f.dist asc
     limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

-- Fiche complète d'une offre (OfferDetail). Lisible si publiée, ou par un membre de l'entreprise.
create function public.get_offer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_offer public.offers;
  v_app public.applications;
  v_public boolean;
  v_can boolean;
begin
  select * into v_offer from public.offers o where o.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_public := private.offer_is_public(p_id);
  if not v_public and not private.is_company_member(v_offer.company_id) and not public.is_admin() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications a where a.offer_id = p_id and a.candidate_id = v_uid;
  v_can := v_public and v_app.id is null and private.emploi_kind(v_uid) = 'candidate'
           and private.emploi_terms_accepted(v_uid) and private.candidate_complete(v_uid)
           and exists (select 1 from public.candidate_identities ci where ci.user_id = v_uid);
  return private.offer_card_json(v_offer, v_uid)
    || jsonb_build_object(
      'photos', private.offer_photos_json(p_id, not private.is_company_member(v_offer.company_id) and not public.is_admin()),
      'missions', to_jsonb(v_offer.missions),
      'must_have', to_jsonb(v_offer.must_have),
      'nice_to_have', to_jsonb(v_offer.nice_to_have),
      'language_justification', v_offer.language_justification,
      'team_description', v_offer.team_description,
      'manager_name', v_offer.manager_name,
      'manager_title', v_offer.manager_title,
      'interviews_count', v_offer.interviews_count,
      'address_label', v_offer.address_label,
      'expires_at', v_offer.expires_at,
      'my_application', case when v_app.id is null then null
                             else jsonb_build_object('id', v_app.id, 'status', v_app.status) end,
      'can_apply', coalesce(v_can, false));
end;
$$;

-- Page entreprise (CompanyPage) : entreprise vérifiée, photos approuvées et offres publiées.
create function public.get_company(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_company public.companies;
begin
  select * into v_company from public.companies c where c.id = p_id;
  if not found or (v_company.status <> 'verified' and not private.is_company_member(p_id) and not public.is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.company_summary_json(p_id) || jsonb_build_object(
    'description', v_company.description,
    'website', v_company.website,
    'avg_response_days', private.company_avg_response_days(p_id),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'storage_path', x.storage_path, 'position', x.position)
                       order by x.rank)
        from (select ph.*, row_number() over (order by (ph.kind <> 'workplace'), o.published_at desc, ph.position) as rank
                from public.offer_photos ph join public.offers o on o.id = ph.offer_id
               where ph.company_id = p_id and ph.moderation = 'approved' and ph.kind in ('workplace', 'team', 'area', 'tools')
                 and private.offer_is_public(o.id)) x
       where x.rank <= 8), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'contract', o.contract, 'city', o.city,
                                          'salary_min_k', o.salary_min_k, 'salary_max_k', o.salary_max_k,
                                          'published_at', o.published_at) order by o.published_at desc)
        from public.offers o where o.company_id = p_id and private.offer_is_public(o.id)), '[]'::jsonb)
  );
end;
$$;

create function public.search_companies(p_q text)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_q text := private.normalize_text(p_q);
begin
  if char_length(v_q) not between 2 and 80 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  return query
    select jsonb_build_object('id', c.id, 'display_name', c.display_name, 'city', c.city)
      from public.companies c
     where c.status = 'verified'
       and (private.normalize_text(c.display_name) like '%' || v_q || '%'
            or private.normalize_text(c.legal_name) like '%' || v_q || '%')
     order by (private.normalize_text(c.display_name) like v_q || '%') desc, c.display_name
     limit 10;
end;
$$;

create function public.pass_offer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  if not private.offer_is_public(p_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.offer_passes (user_id, offer_id) values (v_uid, p_id) on conflict do nothing;
end;
$$;

-- Candidature ---------------------------------------------------------------------------------------
-- p_note_target : point de l'offre auquel le mot répond (`mission:<0-2>`, `must:<i>`, `nice:<i>`,
-- `photo:<uuid>`, `team`, `process`) ; le texte cité est recopié dans note_target_label.
create function public.apply_offer(p_id uuid, p_note text default null, p_note_target text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_offer public.offers;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
  v_idx int;
  v_kind text;
  v_app public.applications;
  v_invited boolean;
begin
  if not private.emploi_terms_accepted(v_uid) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;
  if not private.candidate_complete(v_uid)
     or not exists (select 1 from public.candidate_identities ci where ci.user_id = v_uid) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  if not private.offer_is_public(p_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers o where o.id = p_id for share;
  if exists (select 1 from public.applications a where a.offer_id = p_id and a.candidate_id = v_uid) then
    raise exception 'already_applied' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_note, '')) > 140 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  if p_note_target is not null then
    v_kind := split_part(p_note_target, ':', 1);
    if v_kind in ('mission', 'must', 'nice') and p_note_target ~ '^(mission|must|nice):[0-9]{1,2}$' then
      v_idx := split_part(p_note_target, ':', 2)::int + 1;
      v_label := case v_kind when 'mission' then v_offer.missions[v_idx]
                             when 'must' then v_offer.must_have[v_idx]
                             else v_offer.nice_to_have[v_idx] end;
    elsif v_kind = 'photo' and p_note_target ~* '^photo:[0-9a-f-]{36}$' then
      select 'Photo : ' || case ph.kind when 'workplace' then 'le lieu de travail' when 'manager' then 'le manager'
                                        when 'team' then 'l''équipe' when 'tools' then 'les outils'
                                        else 'le quartier' end
        into v_label from public.offer_photos ph
       where ph.id = split_part(p_note_target, ':', 2)::uuid and ph.offer_id = p_id and ph.moderation = 'approved';
    elsif p_note_target = 'team' then
      v_label := v_offer.team_description;
    elsif p_note_target = 'process' then
      v_label := 'Le recrutement : ' || v_offer.interviews_count || ' entretien'
                 || case when v_offer.interviews_count > 1 then 's' else '' end
                 || ' · réponse sous ' || v_offer.response_days || ' jours';
    end if;
    if v_label is null then
      raise exception 'invalid_target' using errcode = 'P0001';
    end if;
    v_label := left(v_label, 200);
  end if;

  if (select count(*) from public.applications a
       where a.candidate_id = v_uid and a.created_at >= private.paris_day_start())
     >= private.setting_int('apply_daily_quota', 30) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_invited := exists (select 1 from public.invitations i
                        where i.offer_id = p_id and i.candidate_id = v_uid and i.status = 'sent');
  insert into public.applications (offer_id, company_id, candidate_id, note, note_target, note_target_label, invited, due_at)
  values (p_id, v_offer.company_id, v_uid, v_note, case when v_label is null then null else p_note_target end, v_label,
          v_invited, now() + make_interval(days => v_offer.response_days))
  returning * into v_app;
  if v_invited then
    update public.invitations i set status = 'applied', responded_at = now()
     where i.offer_id = p_id and i.candidate_id = v_uid and i.status = 'sent';
  end if;
  return jsonb_build_object('application_id', v_app.id, 'due_at', v_app.due_at);
exception
  when unique_violation then
    raise exception 'already_applied' using errcode = 'P0001';
end;
$$;

create function public.withdraw_application(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_app public.applications;
begin
  select * into v_app from public.applications a where a.id = p_id and a.candidate_id = v_uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.status not in ('sent', 'seen', 'interested', 'interview', 'offer_made') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.applications a set status = 'withdrawn', withdrawn_at = now(), closed_at = now() where a.id = p_id;
  update public.interview_slots s set status = 'cancelled', responded_at = now()
   where s.application_id = p_id and s.status in ('proposed', 'accepted');
end;
$$;

-- Candidature vue par le candidat (MyApplication).
create function private.my_application_json(p_app public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_app.id,
    'status', p_app.status,
    'offer', jsonb_build_object('id', o.id, 'title', o.title, 'city', o.city, 'salary_min_k', o.salary_min_k,
                                'salary_max_k', o.salary_max_k),
    'company', jsonb_build_object('id', c.id, 'display_name', c.display_name),
    'created_at', p_app.created_at,
    'seen_at', p_app.seen_at,
    'due_at', p_app.due_at,
    'closed_at', p_app.closed_at,
    'refusal_reason', p_app.refusal_reason,
    'refusal_message', p_app.refusal_message,
    'interview', (select private.slot_json(s) from public.interview_slots s
                   where s.application_id = p_app.id and s.status = 'accepted'
                     and s.starts_at > now() - interval '3 hours'
                   order by s.starts_at limit 1),
    'slots_to_answer', (select count(*) from public.interview_slots s
                         where s.application_id = p_app.id and s.status = 'proposed' and s.starts_at > now()),
    'unread_messages', (select count(*) from public.application_messages m
                         where m.application_id = p_app.id and not m.from_candidate and m.read_at is null)
  )
  from public.offers o join public.companies c on c.id = o.company_id
  where o.id = p_app.offer_id;
$$;

create function public.get_my_applications()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  return query
    select private.my_application_json(a) from public.applications a
     where a.candidate_id = v_uid order by a.created_at desc;
end;
$$;

create function public.get_my_application(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_app public.applications;
  v_member public.company_members;
begin
  select * into v_app from public.applications a where a.id = p_id and a.candidate_id = v_uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.interested_at is not null then
    select * into v_member from public.company_members cm
     where cm.company_id = v_app.company_id
     order by (cm.user_id = v_app.decided_by) desc nulls last, (cm.role = 'owner') desc, cm.created_at
     limit 1;
  end if;
  return private.my_application_json(v_app) || jsonb_build_object(
    'note', v_app.note,
    'note_target_label', v_app.note_target_label,
    'slots', coalesce((select jsonb_agg(private.slot_json(s) order by s.starts_at)
                         from public.interview_slots s where s.application_id = p_id), '[]'::jsonb),
    'recruiter', case when v_member.user_id is null then null
                      else jsonb_build_object('first_name', v_member.first_name, 'job_title', v_member.job_title) end
  );
end;
$$;

-- Messagerie (après le match seulement) --------------------------------------------------------------
-- Côté de l'appelant : 'candidate', 'company' ; erreur not_found s'il n'est ni l'un ni l'autre.
create function private.application_side(p_app public.applications, p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_app.candidate_id = p_uid then 'candidate'
    when exists (select 1 from public.company_members cm where cm.company_id = p_app.company_id and cm.user_id = p_uid)
      then 'company'
  end;
$$;

create function public.get_application_messages(p_id uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_app public.applications;
  v_side text;
begin
  select * into v_app from public.applications a where a.id = p_id;
  v_side := case when found then private.application_side(v_app, v_uid) end;
  if v_side is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.interested_at is null then
    raise exception 'not_matched' using errcode = 'P0001';
  end if;
  update public.application_messages m set read_at = now()
   where m.application_id = p_id and m.read_at is null and m.from_candidate = (v_side = 'company');
  return query
    select jsonb_build_object('id', m.id, 'application_id', m.application_id,
                              'mine', m.from_candidate = (v_side = 'candidate'),
                              'body', m.body, 'context', m.context, 'created_at', m.created_at, 'read_at', m.read_at)
      from public.application_messages m where m.application_id = p_id order by m.created_at, m.id;
end;
$$;

create function public.send_application_message(p_id uuid, p_body text, p_context text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_app public.applications;
  v_side text;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  select * into v_app from public.applications a where a.id = p_id;
  v_side := case when found then private.application_side(v_app, v_uid) end;
  if v_side is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.interested_at is null or v_app.status in ('rejected', 'withdrawn', 'closed_no_response') then
    raise exception 'not_matched' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 2000 or char_length(coalesce(p_context, '')) > 300 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into public.application_messages (application_id, sender_id, from_candidate, body, context)
  values (p_id, v_uid, v_side = 'candidate', v_body, nullif(btrim(coalesce(p_context, '')), ''))
  returning id into v_id;
  perform private.emploi_notify('message', v_id);
  return v_id;
end;
$$;

-- Conversations (ConversationSummary) : candidatures appariées, côté candidat ou entreprise.
create function public.get_my_conversations()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_company uuid := private.member_company(v_uid);
begin
  return query
    select jsonb_build_object(
      'application_id', a.id,
      'status', a.status,
      'offer_title', o.title,
      'counterpart', case when a.candidate_id = v_uid then c.display_name
                          else coalesce(ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc),
                                        'Candidat·e n° ' || lpad(cd.number::text, 4, '0')) end,
      'last_message', lm.body,
      'last_message_at', lm.created_at,
      'unread_count', (select count(*) from public.application_messages m
                        where m.application_id = a.id and m.read_at is null
                          and m.from_candidate = (a.candidate_id <> v_uid))
    )
    from public.applications a
    join public.offers o on o.id = a.offer_id
    join public.companies c on c.id = a.company_id
    left join public.candidate_identities ci on ci.user_id = a.candidate_id
    left join public.candidates cd on cd.user_id = a.candidate_id
    left join lateral (select m.body, m.created_at from public.application_messages m
                        where m.application_id = a.id order by m.created_at desc limit 1) lm on true
    where a.interested_at is not null
      and (a.candidate_id = v_uid or (v_company is not null and a.company_id = v_company))
    order by coalesce(lm.created_at, a.interested_at) desc;
end;
$$;

-- Entretien -----------------------------------------------------------------------------------------
create function public.accept_interview_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_slot public.interview_slots;
  v_app public.applications;
begin
  select s.* into v_slot from public.interview_slots s
    join public.applications a on a.id = s.application_id
   where s.id = p_slot_id and a.candidate_id = v_uid
   for update of s;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications a where a.id = v_slot.application_id for update;
  if v_slot.status <> 'proposed' or v_slot.starts_at <= now() or v_app.status not in ('interested', 'interview') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.interview_slots s set status = 'accepted', responded_at = now() where s.id = p_slot_id;
  update public.interview_slots s set status = 'declined', responded_at = now()
   where s.application_id = v_app.id and s.status = 'proposed' and s.id <> p_slot_id;
  if v_app.status = 'interested' then
    update public.applications a set status = 'interview' where a.id = v_app.id;
  end if;
  perform private.emploi_notify('interview_accepted', v_app.id);
end;
$$;

-- Invitations (approche directe) --------------------------------------------------------------------
create function public.get_my_invitations()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  return query
    select jsonb_build_object(
      'id', i.id, 'status', i.status, 'message', i.message, 'created_at', i.created_at,
      'offer', jsonb_build_object('id', o.id, 'title', o.title, 'city', o.city, 'salary_min_k', o.salary_min_k,
                                  'salary_max_k', o.salary_max_k, 'contract', o.contract),
      'company', jsonb_build_object('id', c.id, 'display_name', c.display_name, 'city', c.city))
      from public.invitations i
      join public.offers o on o.id = i.offer_id
      join public.companies c on c.id = i.company_id
     where i.candidate_id = v_uid
     order by i.created_at desc;
end;
$$;

-- Accepter n'est pas postuler : l'app ouvre l'offre, et apply_offer marque `invited`.
create function public.respond_invitation(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations i where i.id = p_id and i.candidate_id = v_uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'sent' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if not coalesce(p_accept, false) then
    update public.invitations i set status = 'declined', responded_at = now() where i.id = p_id;
  end if;
  return jsonb_build_object('offer_id', v_inv.offer_id);
end;
$$;

-- Blocages d'entreprises ----------------------------------------------------------------------------
create function public.block_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.company_blocks (candidate_id, company_id) values (v_uid, p_company_id) on conflict do nothing;
end;
$$;

create function public.unblock_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  delete from public.company_blocks b where b.candidate_id = v_uid and b.company_id = p_company_id;
end;
$$;

create function public.list_my_company_blocks()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  return query
    select jsonb_build_object('id', c.id, 'display_name', c.display_name, 'city', c.city)
      from public.company_blocks b join public.companies c on c.id = b.company_id
     where b.candidate_id = v_uid order by c.display_name;
end;
$$;

-- Signalement d'une offre ---------------------------------------------------------------------------
create function public.report_offer(p_offer_id uuid, p_reason public.offer_report_reason, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id uuid;
begin
  if not private.offer_is_public(p_offer_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(coalesce(v_details, '')) > 1000 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  select r.id into v_id from public.offer_reports r
   where r.offer_id = p_offer_id and r.reporter_id = v_uid and r.status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.offer_reports (offer_id, reporter_id, reason, details)
  values (p_offer_id, v_uid, p_reason, v_details) returning id into v_id;
  return v_id;
end;
$$;

-- Export RGPD (candidat ou recruteur) -----------------------------------------------------------------
create function public.export_my_emploi_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_kind public.emploi_account_kind := private.emploi_kind(v_uid);
  v_member public.company_members;
  v_out jsonb := jsonb_build_object('exported_at', now(), 'kind', v_kind);
begin
  v_out := v_out || jsonb_build_object(
    'terms_acceptances', coalesce((select jsonb_agg(jsonb_build_object('version', t.version, 'accepted_at', t.accepted_at)
                                                    order by t.accepted_at)
                                     from public.terms_acceptances t where t.user_id = v_uid), '[]'::jsonb));
  if v_kind = 'candidate' then
    v_out := v_out || jsonb_build_object(
      'identity', private.candidate_identity_json(v_uid),
      'profile', private.candidate_profile_json(v_uid),
      'cv', jsonb_build_object(
        'experiences', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.position)
                                   from public.cv_experiences e where e.user_id = v_uid), '[]'::jsonb),
        'skills', coalesce((select jsonb_agg(s.label order by s.position) from public.cv_skills s where s.user_id = v_uid), '[]'::jsonb),
        'languages', coalesce((select jsonb_agg(jsonb_build_object('language', l.language, 'level', l.level))
                                 from public.cv_languages l where l.user_id = v_uid), '[]'::jsonb)),
      'diploma', private.diploma_badge(v_uid, false),
      'applications', coalesce((
        select jsonb_agg(jsonb_build_object(
          'offer_title', o.title, 'company', c.display_name, 'status', a.status, 'note', a.note,
          'note_target_label', a.note_target_label, 'created_at', a.created_at, 'seen_at', a.seen_at,
          'due_at', a.due_at, 'decided_at', a.decided_at, 'closed_at', a.closed_at,
          'refusal_reason', a.refusal_reason, 'refusal_message', a.refusal_message,
          'recruiter_notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at)
                                                        order by n.created_at)
                                         from public.application_notes n where n.application_id = a.id), '[]'::jsonb),
          'messages', coalesce((select jsonb_agg(jsonb_build_object('from_me', m.from_candidate, 'body', m.body,
                                                                    'context', m.context, 'created_at', m.created_at)
                                                 order by m.created_at)
                                  from public.application_messages m where m.application_id = a.id), '[]'::jsonb),
          'interview_slots', coalesce((select jsonb_agg(private.slot_json(s) order by s.starts_at)
                                         from public.interview_slots s where s.application_id = a.id), '[]'::jsonb))
          order by a.created_at)
          from public.applications a join public.offers o on o.id = a.offer_id
          join public.companies c on c.id = a.company_id
         where a.candidate_id = v_uid), '[]'::jsonb),
      'invitations', coalesce((
        select jsonb_agg(jsonb_build_object('offer_title', o.title, 'company', c.display_name, 'message', i.message,
                                            'status', i.status, 'created_at', i.created_at) order by i.created_at)
          from public.invitations i join public.offers o on o.id = i.offer_id
          join public.companies c on c.id = i.company_id where i.candidate_id = v_uid), '[]'::jsonb),
      'company_blocks', coalesce((
        select jsonb_agg(jsonb_build_object('company', c.display_name, 'created_at', b.created_at))
          from public.company_blocks b join public.companies c on c.id = b.company_id where b.candidate_id = v_uid), '[]'::jsonb),
      'passes', (select count(*) from public.offer_passes p where p.user_id = v_uid)
    );
  elsif v_kind = 'recruiter' then
    select * into v_member from public.company_members cm where cm.user_id = v_uid;
    v_out := v_out || jsonb_build_object(
      'membership', case when v_member.user_id is null then null else jsonb_build_object(
        'role', v_member.role, 'job_title', v_member.job_title, 'first_name', v_member.first_name,
        'created_at', v_member.created_at) end,
      'company', (select to_jsonb(c) - 'created_by' - 'verified_by' from public.companies c where c.id = v_member.company_id),
      'offers', coalesce((select jsonb_agg(to_jsonb(o) - 'location' - 'created_by' order by o.created_at)
                            from public.offers o where o.company_id = v_member.company_id), '[]'::jsonb),
      'notes_written', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at)
                                                  order by n.created_at)
                                   from public.application_notes n where n.author_id = v_uid), '[]'::jsonb),
      'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'created_at', m.created_at)
                                                  order by m.created_at)
                                   from public.application_messages m where m.sender_id = v_uid), '[]'::jsonb)
    );
  end if;
  return v_out;
end;
$$;

-- Droits ---------------------------------------------------------------------------------------------
revoke all on function
  public.get_emploi_state(), public.set_account_kind(public.emploi_account_kind), public.accept_emploi_terms(text),
  public.set_candidate_identity(text, text), public.get_my_candidate_identity(), public.save_candidate_profile(jsonb),
  public.get_my_cv(), public.save_cv(jsonb, text[], jsonb), public.get_my_cv_preview(), public.get_offer_feed(int),
  public.get_offer(uuid), public.get_company(uuid), public.search_companies(text), public.pass_offer(uuid),
  public.apply_offer(uuid, text, text), public.withdraw_application(uuid), public.get_my_applications(),
  public.get_my_application(uuid), public.get_application_messages(uuid),
  public.send_application_message(uuid, text, text), public.get_my_conversations(),
  public.accept_interview_slot(uuid), public.get_my_invitations(), public.respond_invitation(uuid, boolean),
  public.block_company(uuid), public.unblock_company(uuid), public.list_my_company_blocks(),
  public.report_offer(uuid, public.offer_report_reason, text), public.export_my_emploi_data()
  from public, anon;
grant execute on function
  public.get_emploi_state(), public.set_account_kind(public.emploi_account_kind), public.accept_emploi_terms(text),
  public.set_candidate_identity(text, text), public.get_my_candidate_identity(), public.save_candidate_profile(jsonb),
  public.get_my_cv(), public.save_cv(jsonb, text[], jsonb), public.get_my_cv_preview(), public.get_offer_feed(int),
  public.get_offer(uuid), public.get_company(uuid), public.search_companies(text), public.pass_offer(uuid),
  public.apply_offer(uuid, text, text), public.withdraw_application(uuid), public.get_my_applications(),
  public.get_my_application(uuid), public.get_application_messages(uuid),
  public.send_application_message(uuid, text, text), public.get_my_conversations(),
  public.accept_interview_slot(uuid), public.get_my_invitations(), public.respond_invitation(uuid, boolean),
  public.block_company(uuid), public.unblock_company(uuid), public.list_my_company_blocks(),
  public.report_offer(uuid, public.offer_report_reason, text), public.export_my_emploi_data()
  to authenticated, service_role;
revoke all on function private.my_application_json(public.applications), private.application_side(public.applications, uuid)
  from public, anon, authenticated;
grant execute on function private.my_application_json(public.applications), private.application_side(public.applications, uuid)
  to service_role;

-- Sapios Emploi : RPC de l'espace recruteur (contrat §3, « Recruteur »).
-- Avant le match, rien de ce qui sort d'ici n'identifie un candidat : CV anonyme (private.anonymous_cv),
-- numéro, correspondances. Le prénom et le nom ne sortent qu'à partir de `interested` (décision E9).

-- Entreprise -----------------------------------------------------------------------------------------
-- p_sirene : réponse de l'Edge Function company-lookup (CompanyLookup), gardée telle quelle pour la revue.
-- p_first_name (ajout au contrat) : prénom du recruteur, montré au candidat après le match.
create function public.register_company(p_siren text, p_display_name text, p_job_title text, p_sirene jsonb,
                                        p_first_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_recruiter();
  v_siren text := regexp_replace(coalesce(p_siren, ''), '\s', '', 'g');
  v_name text := btrim(coalesce(p_display_name, ''));
  v_title text := btrim(coalesce(p_job_title, ''));
  v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_email text;
  v_domain text;
  v_generic boolean;
  v_snapshot jsonb := case when jsonb_typeof(p_sirene) = 'object' then p_sirene end;
  v_postcode text;
  v_id uuid;
begin
  if not private.emploi_terms_accepted(v_uid) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;
  if not private.siren_valid(v_siren) then
    raise exception 'invalid_siren' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.company_members cm where cm.user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.companies c where c.siren = v_siren) then
    raise exception 'company_exists' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_title) not between 2 and 80
     or char_length(coalesce(v_first, '')) > 40 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select lower(u.email::text) into v_email from auth.users u where u.id = v_uid;
  v_domain := nullif(split_part(coalesce(v_email, ''), '@', 2), '');
  v_generic := v_domain is null or exists (
    select 1 from jsonb_array_elements_text(
      coalesce((select s.value from public.app_settings s where s.key = 'generic_email_domains'), '[]'::jsonb)) d
     where lower(d.value) = v_domain);
  v_postcode := v_snapshot ->> 'postcode';
  if v_postcode !~ '^[0-9]{5}$' then
    v_postcode := null;
  end if;

  insert into public.companies (siren, legal_name, display_name, naf_code, naf_label, headcount_band, city, postcode,
                                sirene, email_domain, email_domain_generic, created_by)
  values (v_siren, left(coalesce(nullif(btrim(v_snapshot ->> 'legal_name'), ''), v_name), 200), v_name,
          left(v_snapshot ->> 'naf_code', 10), left(v_snapshot ->> 'naf_label', 200),
          left(v_snapshot ->> 'headcount_band', 60), left(v_snapshot ->> 'city', 80), v_postcode,
          v_snapshot, v_domain, v_generic, v_uid)
  returning id into v_id;
  insert into public.company_members (company_id, user_id, role, job_title, first_name)
  values (v_id, v_uid, 'owner', v_title, v_first);
  perform private.audit(v_uid, 'company.register', 'companies', v_id::text,
                        jsonb_build_object('siren', v_siren, 'email_domain', v_domain, 'generic', v_generic));
  return v_id;
exception
  when unique_violation then
    raise exception 'company_exists' using errcode = 'P0001';
end;
$$;

create function public.get_my_company()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
  v_c public.companies;
begin
  select * into v_c from public.companies c where c.id = v_member.company_id;
  return jsonb_build_object(
    'company', private.company_summary_json(v_c.id) || jsonb_build_object(
      'siren', v_c.siren, 'legal_name', v_c.legal_name, 'status', v_c.status, 'status_reason', v_c.status_reason,
      'description', v_c.description, 'website', v_c.website, 'email_domain', v_c.email_domain),
    'me', jsonb_build_object('role', v_member.role, 'job_title', v_member.job_title, 'first_name', v_member.first_name),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'role', cm.role,
                                                             'job_title', cm.job_title) order by cm.created_at)
                           from public.company_members cm where cm.company_id = v_c.id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'avg_response_days', private.company_avg_response_days(v_c.id),
      'closed_no_response_90d', (select count(*) from public.applications a
                                  where a.company_id = v_c.id and a.status = 'closed_no_response'
                                    and a.closed_at > now() - interval '90 days'),
      'offers_published', (select count(*) from public.offers o where o.company_id = v_c.id and o.status = 'published'),
      'applications_to_review', (select count(*) from public.applications a
                                  where a.company_id = v_c.id and a.status in ('sent', 'seen')))
  );
end;
$$;

create function public.update_company_profile(p_display_name text default null, p_description text default null,
                                              p_website text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
begin
  if (p_display_name is not null and char_length(btrim(p_display_name)) not between 1 and 80)
     or char_length(coalesce(p_description, '')) > 1000 or char_length(coalesce(p_website, '')) > 200
     or (nullif(btrim(coalesce(p_website, '')), '') is not null and btrim(p_website) !~* '^https?://[^\s]+$') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.companies c set
    display_name = coalesce(nullif(btrim(p_display_name), ''), c.display_name),
    description = case when p_description is null then c.description else nullif(btrim(p_description), '') end,
    website = case when p_website is null then c.website else nullif(btrim(p_website), '') end
   where c.id = v_member.company_id;
end;
$$;

-- Ajout au contrat : prénom et fonction du recruteur connecté.
create function public.update_my_member_profile(p_first_name text default null, p_job_title text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
begin
  if (p_job_title is not null and char_length(btrim(p_job_title)) not between 2 and 80)
     or char_length(btrim(coalesce(p_first_name, ''))) > 40 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.company_members cm set
    first_name = case when p_first_name is null then cm.first_name else nullif(btrim(p_first_name), '') end,
    job_title = coalesce(nullif(btrim(p_job_title), ''), cm.job_title)
   where cm.user_id = v_member.user_id;
end;
$$;

-- Offres ---------------------------------------------------------------------------------------------
create function private.offer_draft_json(p_offer public.offers)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_offer.id, 'status', p_offer.status, 'status_reason', p_offer.status_reason,
    'title', p_offer.title, 'contract', p_offer.contract, 'city', p_offer.city, 'postcode', p_offer.postcode,
    'address_label', p_offer.address_label,
    'lat', extensions.st_y(p_offer.location::extensions.geometry),
    'lng', extensions.st_x(p_offer.location::extensions.geometry),
    'remote_days', p_offer.remote_days, 'salary_min_k', p_offer.salary_min_k, 'salary_max_k', p_offer.salary_max_k,
    'start_label', p_offer.start_label, 'experience_band', p_offer.experience_band,
    'missions', to_jsonb(p_offer.missions), 'must_have', to_jsonb(p_offer.must_have),
    'nice_to_have', to_jsonb(p_offer.nice_to_have), 'language_justification', p_offer.language_justification,
    'team_description', p_offer.team_description, 'manager_name', p_offer.manager_name,
    'manager_title', p_offer.manager_title, 'interviews_count', p_offer.interviews_count,
    'response_days', p_offer.response_days,
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
                                 'id', ph.id, 'kind', ph.kind, 'storage_path', ph.storage_path, 'position', ph.position,
                                 'consent_certified', ph.consent_certified, 'moderation', ph.moderation,
                                 'moderation_reason', ph.moderation_reason) order by ph.position, ph.created_at)
                          from public.offer_photos ph where ph.offer_id = p_offer.id), '[]'::jsonb)
  );
$$;

create function private.text_array_from_json(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  return array(select btrim(x) from jsonb_array_elements_text(p_value) x where btrim(x) <> '');
end;
$$;

-- p_id null : création d'un brouillon (le titre est alors obligatoire). Modifiable en `draft` ou
-- `rejected` (repasse `draft`). Une clé absente ne change rien ; une valeur null efface le champ.
create function public.save_offer(p_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
  v_o public.offers;
  v_key text;
  v_lat double precision;
  v_lng double precision;
  f jsonb := p_fields;
begin
  if f is null or jsonb_typeof(f) <> 'object' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(f) loop
    if v_key not in ('title', 'contract', 'city', 'postcode', 'address_label', 'lat', 'lng', 'remote_days',
                     'salary_min_k', 'salary_max_k', 'start_label', 'experience_band', 'missions', 'must_have',
                     'nice_to_have', 'language_justification', 'team_description', 'manager_name', 'manager_title',
                     'interviews_count', 'response_days') then
      raise exception 'invalid_input' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;

  if p_id is null then
    if coalesce(btrim(f ->> 'title'), '') = '' then
      raise exception 'invalid_input' using errcode = 'P0001', detail = 'title';
    end if;
    v_o.company_id := v_member.company_id;
    v_o.contract := 'cdi';
    v_o.remote_days := 0;
    v_o.experience_band := 'y0_1';
    v_o.missions := '{}';
    v_o.must_have := '{}';
    v_o.nice_to_have := '{}';
    v_o.interviews_count := 2;
    v_o.response_days := 7;
  else
    select * into v_o from public.offers o where o.id = p_id and o.company_id = v_member.company_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if v_o.status not in ('draft', 'rejected') then
      raise exception 'not_editable' using errcode = 'P0001';
    end if;
  end if;

  begin
    if f ? 'title' then v_o.title := btrim(f ->> 'title'); end if;
    if f ? 'contract' then v_o.contract := (f ->> 'contract')::public.contract_type; end if;
    if f ? 'city' then v_o.city := nullif(btrim(f ->> 'city'), ''); end if;
    if f ? 'postcode' then v_o.postcode := nullif(btrim(f ->> 'postcode'), ''); end if;
    if f ? 'address_label' then v_o.address_label := nullif(btrim(f ->> 'address_label'), ''); end if;
    if f ? 'lat' or f ? 'lng' then
      v_lat := (f ->> 'lat')::double precision;
      v_lng := (f ->> 'lng')::double precision;
      if v_lat is null and v_lng is null then
        v_o.location := null;
      elsif v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'invalid_input' using errcode = 'P0001', detail = 'location';
      else
        v_o.location := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
      end if;
    end if;
    if f ? 'remote_days' then v_o.remote_days := coalesce((f ->> 'remote_days')::int, 0); end if;
    if f ? 'salary_min_k' then v_o.salary_min_k := (f ->> 'salary_min_k')::int; end if;
    if f ? 'salary_max_k' then v_o.salary_max_k := (f ->> 'salary_max_k')::int; end if;
    if f ? 'start_label' then v_o.start_label := nullif(btrim(f ->> 'start_label'), ''); end if;
    if f ? 'experience_band' then v_o.experience_band := (f ->> 'experience_band')::public.experience_band; end if;
    -- Les éléments vides sont ignorés : moins de 3 missions remplies, et submit_offer signale `missions`.
    if f ? 'missions' then
      if jsonb_typeof(f -> 'missions') not in ('array', 'null') then
        raise exception 'invalid_input' using errcode = 'P0001', detail = 'missions';
      end if;
      v_o.missions := private.text_array_from_json(f -> 'missions');
    end if;
    if f ? 'must_have' then v_o.must_have := private.text_array_from_json(f -> 'must_have'); end if;
    if f ? 'nice_to_have' then v_o.nice_to_have := private.text_array_from_json(f -> 'nice_to_have'); end if;
    if f ? 'language_justification' then v_o.language_justification := nullif(btrim(f ->> 'language_justification'), ''); end if;
    if f ? 'team_description' then v_o.team_description := nullif(btrim(f ->> 'team_description'), ''); end if;
    if f ? 'manager_name' then v_o.manager_name := nullif(btrim(f ->> 'manager_name'), ''); end if;
    if f ? 'manager_title' then v_o.manager_title := nullif(btrim(f ->> 'manager_title'), ''); end if;
    if f ? 'interviews_count' then v_o.interviews_count := (f ->> 'interviews_count')::int; end if;
    if f ? 'response_days' then v_o.response_days := (f ->> 'response_days')::int; end if;

    if p_id is null then
      insert into public.offers (company_id, title, contract, city, postcode, address_label, location, remote_days,
                                 salary_min_k, salary_max_k, start_label, experience_band, missions, must_have,
                                 nice_to_have, language_justification, team_description, manager_name, manager_title,
                                 interviews_count, response_days, created_by)
      values (v_o.company_id, v_o.title, v_o.contract, v_o.city, v_o.postcode, v_o.address_label, v_o.location,
              v_o.remote_days, v_o.salary_min_k, v_o.salary_max_k, v_o.start_label, v_o.experience_band, v_o.missions,
              v_o.must_have, v_o.nice_to_have, v_o.language_justification, v_o.team_description, v_o.manager_name,
              v_o.manager_title, v_o.interviews_count, v_o.response_days, v_member.user_id)
      returning id into v_o.id;
    else
      update public.offers o set
        title = v_o.title, contract = v_o.contract, city = v_o.city, postcode = v_o.postcode,
        address_label = v_o.address_label, location = v_o.location, remote_days = v_o.remote_days,
        salary_min_k = v_o.salary_min_k, salary_max_k = v_o.salary_max_k, start_label = v_o.start_label,
        experience_band = v_o.experience_band, missions = v_o.missions, must_have = v_o.must_have,
        nice_to_have = v_o.nice_to_have, language_justification = v_o.language_justification,
        team_description = v_o.team_description, manager_name = v_o.manager_name, manager_title = v_o.manager_title,
        interviews_count = v_o.interviews_count, response_days = v_o.response_days,
        status = 'draft'
       where o.id = p_id;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
         or string_data_right_truncation then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;
  return v_o.id;
end;
$$;

create function public.get_offer_for_edit(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_id);
begin
  return private.offer_draft_json(v_offer);
end;
$$;

-- Contrôles avant vérification (OfferCheck). Clés : OFFER_CHECK_KEYS de packages/shared/src/emploi.ts.
create function private.offer_missing_checks(p_offer public.offers)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
begin
  if (select c.status from public.companies c where c.id = p_offer.company_id) <> 'verified' then
    v_missing := array_append(v_missing, 'company_not_verified');
  end if;
  if char_length(btrim(coalesce(p_offer.title, ''))) not between 3 and 80 then
    v_missing := array_append(v_missing, 'title');
  end if;
  if p_offer.location is null or p_offer.city is null then
    v_missing := array_append(v_missing, 'location');
  end if;
  if p_offer.salary_min_k is null or p_offer.salary_max_k is null then
    v_missing := array_append(v_missing, 'salary');
  end if;
  if cardinality(p_offer.missions) <> 3 then
    v_missing := array_append(v_missing, 'missions');
  end if;
  if cardinality(p_offer.must_have) < 1 then
    v_missing := array_append(v_missing, 'must_have');
  end if;
  if not exists (select 1 from public.offer_photos ph
                  where ph.offer_id = p_offer.id and ph.kind = 'workplace' and ph.moderation <> 'rejected') then
    v_missing := array_append(v_missing, 'workplace_photo');
  end if;
  if exists (select 1 from public.offer_photos ph
              where ph.offer_id = p_offer.id and ph.kind in ('manager', 'team') and not ph.consent_certified) then
    v_missing := array_append(v_missing, 'photo_consent');
  end if;
  if private.mentions_language(p_offer.must_have)
     and char_length(btrim(coalesce(p_offer.language_justification, ''))) < 10 then
    v_missing := array_append(v_missing, 'language_justification');
  end if;
  if private.banned_word_in(array[p_offer.title, array_to_string(p_offer.missions, ' '),
                                  array_to_string(p_offer.must_have, ' '), array_to_string(p_offer.nice_to_have, ' '),
                                  coalesce(p_offer.team_description, ''), coalesce(p_offer.language_justification, ''),
                                  coalesce(p_offer.start_label, '')]) is not null then
    v_missing := array_append(v_missing, 'banned_words');
  end if;
  return v_missing;
end;
$$;

create function public.submit_offer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_id);
  v_missing text[];
begin
  if v_offer.status not in ('draft', 'rejected') then
    raise exception 'not_editable' using errcode = 'P0001';
  end if;
  v_missing := private.offer_missing_checks(v_offer);
  if cardinality(v_missing) = 0 then
    update public.offers o set status = 'pending_review', submitted_at = now(), status_reason = null where o.id = p_id;
    perform private.audit(auth.uid(), 'offer.submit', 'offers', p_id::text, '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing));
end;
$$;

-- Clôture : les candidatures en attente reçoivent une réponse (décision humaine du recruteur).
create function private.close_open_applications(p_offer uuid, p_reason public.refusal_reason, p_message text, p_actor uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications;
  v_count int := 0;
begin
  for v_app in
    update public.applications a set status = 'rejected', refusal_reason = p_reason, refusal_message = p_message,
           decided_at = now(), closed_at = now(), decided_by = p_actor
     where a.offer_id = p_offer and a.status in ('sent', 'seen')
    returning *
  loop
    perform private.emploi_notice(v_app.candidate_id, 'application_rejected', private.application_notice_payload(v_app));
    perform private.emploi_notify('application_rejected', v_app.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.close_offer(p_id uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_id);
begin
  if p_reason = 'filled' then
    if v_offer.status not in ('published', 'expired') then
      raise exception 'invalid_status' using errcode = 'P0001';
    end if;
    update public.offers o set status = 'filled', closed_at = now() where o.id = p_id;
    return private.close_open_applications(p_id, 'position_filled',
      'Merci pour votre candidature. Le poste vient d’être pourvu ; nous ne pouvons pas donner suite.', auth.uid());
  elsif p_reason = 'archived' then
    if v_offer.status in ('archived', 'filled') then
      raise exception 'invalid_status' using errcode = 'P0001';
    end if;
    update public.offers o set status = 'archived', closed_at = now() where o.id = p_id;
    return private.close_open_applications(p_id, 'other',
      'Merci pour votre candidature. L’entreprise a retiré cette offre ; nous ne pouvons pas y donner suite.', auth.uid());
  end if;
  raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

create function public.list_company_offers()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
begin
  return query
    select jsonb_build_object(
      'id', o.id, 'title', o.title, 'status', o.status, 'status_reason', o.status_reason, 'contract', o.contract,
      'city', o.city, 'salary_min_k', o.salary_min_k, 'salary_max_k', o.salary_max_k,
      'published_at', o.published_at, 'expires_at', o.expires_at,
      'counts', jsonb_build_object(
        'total', count(a.id),
        'to_review', count(a.id) filter (where a.status in ('sent', 'seen')),
        'interested', count(a.id) filter (where a.status = 'interested'),
        'interview', count(a.id) filter (where a.status = 'interview'),
        'offer_made', count(a.id) filter (where a.status = 'offer_made'),
        'hired', count(a.id) filter (where a.status = 'hired'),
        'closed', count(a.id) filter (where a.status in ('rejected', 'closed_no_response', 'withdrawn'))),
      'next_due_at', min(a.due_at) filter (where a.status in ('sent', 'seen')),
      'urgent_count', count(a.id) filter (where a.status in ('sent', 'seen') and a.due_at <= now() + interval '48 hours')
    )
    from public.offers o
    left join public.applications a on a.offer_id = o.id
    where o.company_id = v_member.company_id
    group by o.id
    order by array_position(array['published', 'pending_review', 'draft', 'rejected', 'filled', 'expired', 'archived']::public.offer_status[], o.status),
             o.created_at desc;
end;
$$;

-- Candidatures ---------------------------------------------------------------------------------------
-- Nom révélé (prénom et nom) d'une candidature appariée ; null avant le match.
create function private.revealed_name(p_app public.applications)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_app.interested_at is null then null
              else ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc) end
    from public.candidate_identities ci where ci.user_id = p_app.candidate_id;
$$;

create function private.pile_card_json(p_app public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'application_id', p_app.id, 'status', p_app.status, 'created_at', p_app.created_at, 'due_at', p_app.due_at,
    'note', p_app.note, 'note_target_label', p_app.note_target_label, 'invited', p_app.invited,
    'cv', private.anonymous_cv(p_app.candidate_id),
    'matches', private.requirement_matches(o, p_app.candidate_id))
  from public.offers o where o.id = p_app.offer_id;
$$;

create function public.list_offer_applications(p_offer_id uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_offer_id);
begin
  return query
    select jsonb_build_object(
      'application_id', a.id, 'status', a.status, 'number', c.number,
      'name', private.revealed_name(a),
      'diploma', (select jsonb_build_object('level', ua.level, 'study_field', ua.study_field)
                    from public.user_access ua where ua.user_id = a.candidate_id and ua.level is not null),
      'experience_band', c.experience_band,
      'must_met', private.met_count(m.matches, 'must'),
      'must_total', cardinality(v_offer.must_have),
      'created_at', a.created_at, 'due_at', a.due_at,
      'next_slot', (select private.slot_json(s) from public.interview_slots s
                     where s.application_id = a.id and s.status in ('proposed', 'accepted') and s.starts_at > now()
                     order by (s.status = 'accepted') desc, s.starts_at limit 1))
    from public.applications a
    join public.candidates c on c.user_id = a.candidate_id
    cross join lateral (select private.requirement_matches(v_offer, a.candidate_id) as matches) m
    where a.offer_id = p_offer_id
    order by a.created_at;
end;
$$;

-- Pile : candidatures à examiner, dans l'ordre d'arrivée et rien d'autre (contrat §6).
create function public.get_offer_pile(p_offer_id uuid, p_limit int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_offer_id);
begin
  return query
    select private.pile_card_json(a) from public.applications a
     where a.offer_id = v_offer.id and a.status in ('sent', 'seen')
     order by a.created_at, a.id
     limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

create function public.mark_application_seen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
begin
  if v_app.status = 'sent' then
    update public.applications a set status = 'seen', seen_at = now() where a.id = p_id and a.status = 'sent';
  end if;
end;
$$;

-- Décision humaine : « Intéressé » (depuis `sent` ou `seen`) révèle l'identité ; « Pas pour ce poste »
-- exige un motif et un message, avant comme après le match (jusqu'à la proposition) : les créneaux encore
-- ouverts sont alors annulés.
create function public.decide_application(p_id uuid, p_decision text, p_reason public.refusal_reason default null,
                                          p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
  v_message text := btrim(coalesce(p_message, ''));
begin
  select * into v_app from public.applications a where a.id = p_id for update;
  if (p_decision = 'interested' and v_app.status not in ('sent', 'seen'))
     or (p_decision = 'rejected' and v_app.status in ('hired', 'rejected', 'closed_no_response', 'withdrawn')) then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_decision = 'interested' then
    update public.applications a set status = 'interested', interested_at = now(), decided_at = now(),
           decided_by = auth.uid(), seen_at = coalesce(a.seen_at, now())
     where a.id = p_id returning * into v_app;
    perform private.emploi_notice(v_app.candidate_id, 'application_interested', private.application_notice_payload(v_app));
    perform private.emploi_notify('application_interested', p_id);
    return jsonb_build_object('status', v_app.status,
                              'identity', private.candidate_identity_json(v_app.candidate_id));
  elsif p_decision = 'rejected' then
    if p_reason is null then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    if char_length(v_message) not between 20 and 600 then
      raise exception 'message_required' using errcode = 'P0001';
    end if;
    update public.applications a set status = 'rejected', refusal_reason = p_reason, refusal_message = v_message,
           decided_at = now(), closed_at = now(), decided_by = auth.uid(), seen_at = coalesce(a.seen_at, now())
     where a.id = p_id returning * into v_app;
    update public.interview_slots s set status = 'cancelled', responded_at = now()
     where s.application_id = p_id and s.status in ('proposed', 'accepted');
    perform private.emploi_notice(v_app.candidate_id, 'application_rejected', private.application_notice_payload(v_app));
    perform private.emploi_notify('application_rejected', p_id);
    return jsonb_build_object('status', v_app.status, 'identity', null);
  end if;
  raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

create function public.move_application(p_id uuid, p_status public.application_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
  v_order public.application_status[] := array['interested', 'interview', 'offer_made', 'hired']::public.application_status[];
begin
  select * into v_app from public.applications a where a.id = p_id for update;
  if p_status is null or not (p_status = any (v_order)) or p_status = 'interested'
     or not (v_app.status = any (v_order))
     or array_position(v_order, p_status) <= array_position(v_order, v_app.status) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.applications a set status = p_status,
         closed_at = case when p_status = 'hired' then now() else a.closed_at end
   where a.id = p_id;
end;
$$;

create function public.get_recruiter_application(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
begin
  return jsonb_build_object(
    'application', private.pile_card_json(v_app) || jsonb_build_object(
      'decided_at', v_app.decided_at, 'refusal_reason', v_app.refusal_reason, 'refusal_message', v_app.refusal_message),
    'offer', (select jsonb_build_object('id', o.id, 'title', o.title) from public.offers o where o.id = v_app.offer_id),
    'identity', case when v_app.interested_at is null then null else private.candidate_identity_json(v_app.candidate_id) end,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body,
                                                           'author_job_title', cm.job_title, 'created_at', n.created_at)
                                        order by n.created_at)
                         from public.application_notes n
                         left join public.company_members cm on cm.user_id = n.author_id and cm.company_id = v_app.company_id
                        where n.application_id = p_id), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(private.slot_json(s) order by s.starts_at)
                         from public.interview_slots s where s.application_id = p_id), '[]'::jsonb),
    'unread_messages', (select count(*) from public.application_messages m
                         where m.application_id = p_id and m.from_candidate and m.read_at is null)
  );
end;
$$;

create function public.add_application_note(p_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into public.application_notes (application_id, author_id, body) values (p_id, auth.uid(), v_body)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.propose_interview_slots(p_id uuid, p_slots jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications := private.require_company_application(p_id);
  v_slot jsonb;
  v_count int := 0;
begin
  if v_app.status not in ('interested', 'interview') then
    raise exception 'not_matched' using errcode = 'P0001';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and 5 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  begin
    for v_slot in select x from jsonb_array_elements(p_slots) x loop
      if (v_slot ->> 'starts_at')::timestamptz <= now() then
        raise exception 'invalid_input' using errcode = 'P0001';
      end if;
      insert into public.interview_slots (application_id, starts_at, duration_min, mode, location, with_whom, created_by)
      values (p_id, (v_slot ->> 'starts_at')::timestamptz, coalesce((v_slot ->> 'duration_min')::int, 45),
              coalesce((v_slot ->> 'mode')::public.interview_mode, 'visio'),
              nullif(btrim(v_slot ->> 'location'), ''), nullif(btrim(v_slot ->> 'with_whom'), ''), auth.uid());
      v_count := v_count + 1;
    end loop;
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;
  perform private.emploi_notice(v_app.candidate_id, 'interview_proposed', private.application_notice_payload(v_app));
  perform private.emploi_notify('interview_proposed', p_id);
  return v_count;
end;
$$;

-- Approche directe -----------------------------------------------------------------------------------
create function public.search_open_candidates(p_offer_id uuid, p_min_level int default null, p_skill text default null)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_offer_id);
  v_skill text := nullif(private.normalize_text(p_skill), '');
begin
  if v_offer.status <> 'published' or not private.offer_is_public(v_offer.id) then
    raise exception 'offer_not_published' using errcode = 'P0001';
  end if;
  return query
    select jsonb_build_object(
      'number', c.number,
      'cv', private.anonymous_cv(c.user_id),
      'matches', private.requirement_matches(v_offer, c.user_id),
      'already_invited', exists (select 1 from public.invitations i where i.offer_id = v_offer.id and i.candidate_id = c.user_id))
    from public.candidates c
    where c.open_to_opportunities and not c.paused
      and private.candidate_complete(c.user_id)
      and not exists (select 1 from public.profiles p where p.id = c.user_id and p.status = 'banned')
      and not exists (select 1 from public.company_blocks b where b.candidate_id = c.user_id and b.company_id = v_offer.company_id)
      and not exists (select 1 from public.applications a where a.offer_id = v_offer.id and a.candidate_id = c.user_id)
      and extensions.st_dwithin(v_offer.location, c.search_location, c.search_radius_km * 1000.0)
      and (p_min_level is null or exists (select 1 from public.user_access ua
                                           where ua.user_id = c.user_id and ua.level >= p_min_level))
      and (v_skill is null or exists (select 1 from public.cv_skills s
                                       where s.user_id = c.user_id
                                         and private.normalize_text(s.label) like '%' || v_skill || '%'))
    order by c.open_since desc nulls last, c.number
    limit 50;
end;
$$;

create function public.invite_candidate(p_offer_id uuid, p_number int, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers := private.require_company_offer(p_offer_id);
  v_message text := btrim(coalesce(p_message, ''));
  v_cand public.candidates;
  v_id uuid;
begin
  if v_offer.status <> 'published' or not private.offer_is_public(v_offer.id) then
    raise exception 'offer_not_published' using errcode = 'P0001';
  end if;
  if char_length(v_message) not between 1 and 400 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  select * into v_cand from public.candidates c
   where c.number = p_number and c.open_to_opportunities and not c.paused
     and private.candidate_complete(c.user_id)
     and not exists (select 1 from public.company_blocks b where b.candidate_id = c.user_id and b.company_id = v_offer.company_id);
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invitations i where i.offer_id = v_offer.id and i.candidate_id = v_cand.user_id) then
    raise exception 'already_invited' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.applications a where a.offer_id = v_offer.id and a.candidate_id = v_cand.user_id) then
    raise exception 'already_applied' using errcode = 'P0001';
  end if;
  perform 1 from public.companies c where c.id = v_offer.company_id for update;
  if (select count(*) from public.invitations i
       where i.company_id = v_offer.company_id and i.created_at > now() - interval '7 days')
     >= private.setting_int('invitation_weekly_quota', 20) then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;
  insert into public.invitations (offer_id, company_id, candidate_id, message, created_by)
  values (v_offer.id, v_offer.company_id, v_cand.user_id, v_message, auth.uid())
  returning id into v_id;
  perform private.emploi_notice(v_cand.user_id, 'invitation_received', jsonb_build_object(
    'invitation_id', v_id, 'offer_id', v_offer.id, 'offer_title', v_offer.title,
    'company_name', (select c.display_name from public.companies c where c.id = v_offer.company_id)));
  perform private.emploi_notify('invitation_received', v_id);
  return v_id;
end;
$$;

-- Droits ---------------------------------------------------------------------------------------------
revoke all on function
  public.register_company(text, text, text, jsonb, text), public.get_my_company(),
  public.update_company_profile(text, text, text), public.update_my_member_profile(text, text),
  public.save_offer(uuid, jsonb), public.get_offer_for_edit(uuid), public.submit_offer(uuid),
  public.close_offer(uuid, text), public.list_company_offers(), public.list_offer_applications(uuid),
  public.get_offer_pile(uuid, int), public.mark_application_seen(uuid),
  public.decide_application(uuid, text, public.refusal_reason, text),
  public.move_application(uuid, public.application_status), public.get_recruiter_application(uuid),
  public.add_application_note(uuid, text), public.propose_interview_slots(uuid, jsonb),
  public.search_open_candidates(uuid, int, text), public.invite_candidate(uuid, int, text)
  from public, anon;
grant execute on function
  public.register_company(text, text, text, jsonb, text), public.get_my_company(),
  public.update_company_profile(text, text, text), public.update_my_member_profile(text, text),
  public.save_offer(uuid, jsonb), public.get_offer_for_edit(uuid), public.submit_offer(uuid),
  public.close_offer(uuid, text), public.list_company_offers(), public.list_offer_applications(uuid),
  public.get_offer_pile(uuid, int), public.mark_application_seen(uuid),
  public.decide_application(uuid, text, public.refusal_reason, text),
  public.move_application(uuid, public.application_status), public.get_recruiter_application(uuid),
  public.add_application_note(uuid, text), public.propose_interview_slots(uuid, jsonb),
  public.search_open_candidates(uuid, int, text), public.invite_candidate(uuid, int, text)
  to authenticated, service_role;
revoke all on function private.offer_draft_json(public.offers), private.text_array_from_json(jsonb),
  private.offer_missing_checks(public.offers),
  private.close_open_applications(uuid, public.refusal_reason, text, uuid), private.revealed_name(public.applications),
  private.pile_card_json(public.applications)
  from public, anon, authenticated;
grant execute on function private.offer_draft_json(public.offers), private.text_array_from_json(jsonb),
  private.offer_missing_checks(public.offers),
  private.close_open_applications(uuid, public.refusal_reason, text, uuid), private.revealed_name(public.applications),
  private.pile_card_json(public.applications)
  to service_role;

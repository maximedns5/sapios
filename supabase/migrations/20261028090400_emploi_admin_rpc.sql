-- Sapios Emploi : back-office (contrat §3, « Admin »). Toutes exigent public.is_admin() (session aal2)
-- par private.require_admin() et journalisent leurs décisions dans audit_log.

create function public.admin_list_companies(p_status public.company_status default 'pending')
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select jsonb_build_object(
      'id', c.id, 'siren', c.siren, 'legal_name', c.legal_name, 'display_name', c.display_name, 'status', c.status,
      'status_reason', c.status_reason, 'naf_code', c.naf_code, 'naf_label', c.naf_label,
      'headcount_band', c.headcount_band, 'city', c.city, 'postcode', c.postcode, 'sirene', c.sirene,
      'email_domain', c.email_domain, 'email_domain_generic', c.email_domain_generic, 'created_at', c.created_at,
      'owner', (select jsonb_build_object('user_id', cm.user_id, 'email', u.email::text, 'job_title', cm.job_title)
                  from public.company_members cm left join auth.users u on u.id = cm.user_id
                 where cm.company_id = c.id
                 order by (cm.role = 'owner') desc, cm.created_at limit 1),
      'offers_count', (select count(*) from public.offers o where o.company_id = c.id))
    from public.companies c
    where p_status is null or c.status = p_status
    order by c.created_at asc
    limit 500;
end;
$$;

create function public.admin_decide_company(p_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_company public.companies;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.company_status;
begin
  if p_decision not in ('verify', 'reject', 'suspend') or p_decision is null then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  select * into v_company from public.companies c where c.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_decision <> 'verify' and char_length(coalesce(v_reason, '')) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  v_status := case p_decision when 'verify' then 'verified' when 'reject' then 'rejected' else 'suspended' end;
  update public.companies c set
    status = v_status,
    status_reason = case when p_decision = 'verify' then null else left(v_reason, 500) end,
    verified_at = case when p_decision = 'verify' then now() else c.verified_at end,
    verified_by = case when p_decision = 'verify' then v_admin else c.verified_by end
   where c.id = p_id;
  perform private.company_notice(p_id,
    case p_decision when 'verify' then 'company_verified' when 'reject' then 'company_rejected' else 'company_suspended' end,
    jsonb_build_object('company_id', p_id, 'reason', case when p_decision = 'verify' then null else v_reason end));
  perform private.emploi_notify('company_decided', p_id);
  perform private.audit(v_admin, 'company.decide', 'companies', p_id::text,
                        jsonb_build_object('decision', p_decision, 'reason', v_reason, 'previous', v_company.status));
end;
$$;

create function public.admin_list_offers_to_review()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select jsonb_build_object(
      'offer', private.offer_draft_json(o) || jsonb_build_object('submitted_at', o.submitted_at),
      'company', jsonb_build_object('id', c.id, 'display_name', c.display_name, 'status', c.status),
      'banned_word', private.banned_word_in(array[o.title, array_to_string(o.missions, ' '),
                                                  array_to_string(o.must_have, ' '), array_to_string(o.nice_to_have, ' '),
                                                  coalesce(o.team_description, ''), coalesce(o.language_justification, ''),
                                                  coalesce(o.start_label, '')]))
    from public.offers o join public.companies c on c.id = o.company_id
    where o.status = 'pending_review'
    order by o.submitted_at asc nulls last;
end;
$$;

create function public.admin_moderate_photo(p_photo_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and char_length(coalesce(v_reason, '')) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.offer_photos ph set
    moderation = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.photo_moderation,
    moderation_reason = case when p_decision = 'approve' then null else left(v_reason, 300) end
   where ph.id = p_photo_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.audit(v_admin, 'offer_photo.moderate', 'offer_photos', p_photo_id::text,
                        jsonb_build_object('decision', p_decision, 'reason', v_reason));
end;
$$;

create function public.admin_decide_offer(p_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_offer public.offers;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_decision is null or p_decision not in ('publish', 'reject') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers o where o.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending_review' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_decision = 'publish' then
    if (select c.status from public.companies c where c.id = v_offer.company_id) <> 'verified' then
      raise exception 'company_not_verified' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.offer_photos ph where ph.offer_id = p_id and ph.moderation = 'pending') then
      raise exception 'photos_pending' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.offer_photos ph
                    where ph.offer_id = p_id and ph.kind = 'workplace' and ph.moderation = 'approved') then
      raise exception 'photo_required' using errcode = 'P0001';
    end if;
    update public.offers o set status = 'published', status_reason = null, published_at = now(),
           expires_at = now() + make_interval(days => private.setting_int('offer_lifetime_days', 60))
     where o.id = p_id;
  else
    if char_length(coalesce(v_reason, '')) < 3 then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.offers o set status = 'rejected', status_reason = left(v_reason, 500) where o.id = p_id;
  end if;
  perform private.company_notice(v_offer.company_id,
    case when p_decision = 'publish' then 'offer_published' else 'offer_rejected' end,
    jsonb_build_object('offer_id', p_id, 'offer_title', v_offer.title,
                       'reason', case when p_decision = 'publish' then null else v_reason end));
  perform private.emploi_notify('offer_decided', p_id);
  perform private.audit(v_admin, 'offer.decide', 'offers', p_id::text,
                        jsonb_build_object('decision', p_decision, 'reason', v_reason));
end;
$$;

create function public.admin_list_offer_reports(p_status public.report_status default 'open')
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at,
      'offer', jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status),
      'company', jsonb_build_object('id', c.id, 'display_name', c.display_name),
      'reports_on_offer', (select count(*) from public.offer_reports r2 where r2.offer_id = o.id))
    from public.offer_reports r
    join public.offers o on o.id = r.offer_id
    join public.companies c on c.id = o.company_id
    where p_status is null or r.status = p_status
    order by case when r.status = 'open' then r.created_at end asc nulls last, r.created_at desc
    limit 500;
end;
$$;

create function public.admin_handle_offer_report(p_id uuid, p_status public.report_status, p_unpublish boolean default false,
                                                 p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.offer_reports;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_report from public.offer_reports r where r.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_status is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if coalesce(p_unpublish, false) then
    if char_length(coalesce(v_reason, '')) < 3 then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.offers o set status = 'archived', status_reason = left(v_reason, 500), closed_at = now()
     where o.id = v_report.offer_id and o.status not in ('archived', 'filled');
    perform private.close_open_applications(v_report.offer_id, 'other',
      'Merci pour votre candidature. Cette offre a été retirée par l’équipe Sapios ; elle ne peut pas aboutir.', v_admin);
  end if;
  update public.offer_reports r set status = p_status, handled_by = v_admin, handled_at = now() where r.id = p_id;
  perform private.audit(v_admin, 'offer_report.handle', 'offer_reports', p_id::text,
                        jsonb_build_object('status', p_status, 'unpublish', coalesce(p_unpublish, false),
                                           'reason', v_reason, 'offer_id', v_report.offer_id));
end;
$$;

create function public.admin_emploi_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'candidates_total', (select count(*) from public.candidates),
    'candidates_complete', (select count(*) from public.candidates c where private.candidate_complete(c.user_id)),
    'candidates_open', (select count(*) from public.candidates c where c.open_to_opportunities and not c.paused),
    'recruiters_total', (select count(*) from public.company_members),
    'companies_by_status', (select jsonb_object_agg(s::text, (select count(*) from public.companies c where c.status = s))
                              from unnest(enum_range(null::public.company_status)) s),
    'offers_by_status', (select jsonb_object_agg(s::text, (select count(*) from public.offers o where o.status = s))
                           from unnest(enum_range(null::public.offer_status)) s),
    'applications_by_status', (select jsonb_object_agg(s::text, (select count(*) from public.applications a where a.status = s))
                                 from unnest(enum_range(null::public.application_status)) s),
    'avg_response_days', (select round(avg(extract(epoch from (coalesce(a.decided_at, a.closed_at) - a.created_at)) / 86400.0)::numeric, 1)
                            from public.applications a
                           where a.created_at > now() - interval '90 days'
                             and a.status in ('interested', 'interview', 'offer_made', 'hired', 'rejected', 'closed_no_response')),
    'offer_reports_open', (select count(*) from public.offer_reports r where r.status = 'open')
  );
end;
$$;

-- File des diplômes : un candidat de l'emploi n'a pas de profile_private ; son nom légal vient alors de
-- candidate_identities (prénom + nom déchiffré) et son nom affiché de son prénom.
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
         coalesce(private.decrypt_text(pp.legal_name_enc),
                  ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc)),
         private.decrypt_text(pp.birthdate_enc)::date, coalesce(p.display_name, ci.first_name),
         u.email::text, s.institution_verified, s.field_verified,
         (rf.referee_id is not null), rp.display_name
  from public.degree_submissions s
  left join public.profile_private pp on pp.user_id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join public.candidate_identities ci on ci.user_id = s.user_id
  left join auth.users u on u.id = s.user_id
  left join public.referrals rf on rf.referee_id = s.user_id
  left join public.profiles rp on rp.id = rf.referrer_id
  where (p_id is null or s.id = p_id)
    and (p_id is not null or p_status is null or s.status = p_status)
  order by (rf.referee_id is not null) desc, s.created_at asc
  limit 500;
$$;

-- Réglages : en plus des clés existantes (inchangées), celles de l'emploi.
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
  v_min int;
  v_max int;
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
    elsif v_key in ('moderation_blocklist', 'offer_banned_words', 'generic_email_domains') then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_words := '{}';
      v_max := case v_key when 'moderation_blocklist' then 40 when 'offer_banned_words' then 60 else 100 end;
      for v_word in select lower(btrim(w)) from jsonb_array_elements_text(v_value) w
      loop
        if v_word = '' then
          continue;
        end if;
        if char_length(v_word) > v_max
           or (v_key = 'generic_email_domains' and v_word !~ '^[a-z0-9.-]+\.[a-z]{2,}$') then
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
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      if (v_key = 'referral_window_days' and v_int not between 7 and 90)
         or (v_key <> 'referral_window_days' and v_int not between 0 and 20) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key in ('inactive_warning_days', 'inactive_grace_days', 'report_retention_days',
                    'audit_retention_days', 'banned_identity_retention_days', 'notice_retention_days',
                    'offer_lifetime_days', 'application_content_retention_days', 'invitation_weekly_quota',
                    'apply_daily_quota') then
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      select r.lo, r.hi into v_min, v_max
        from (values ('inactive_warning_days', 180, 3650),
                     ('inactive_grace_days', 7, 180),
                     ('report_retention_days', 30, 1825),
                     ('audit_retention_days', 365, 3650),
                     ('banned_identity_retention_days', 90, 3650),
                     ('notice_retention_days', 30, 1825),
                     ('offer_lifetime_days', 7, 180),
                     ('application_content_retention_days', 30, 1095),
                     ('invitation_weekly_quota', 0, 200),
                     ('apply_daily_quota', 1, 200)) as r(k, lo, hi)
       where r.k = v_key;
      if v_int not between v_min and v_max then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key in ('terms_version', 'emploi_terms_candidate_version', 'emploi_terms_recruiter_version') then
      if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[0-9A-Za-z._-]{3,40}$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_value #>> '{}');
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

revoke all on function
  public.admin_list_companies(public.company_status), public.admin_decide_company(uuid, text, text),
  public.admin_list_offers_to_review(), public.admin_moderate_photo(uuid, text, text),
  public.admin_decide_offer(uuid, text, text), public.admin_list_offer_reports(public.report_status),
  public.admin_handle_offer_report(uuid, public.report_status, boolean, text), public.admin_emploi_stats()
  from public, anon;
grant execute on function
  public.admin_list_companies(public.company_status), public.admin_decide_company(uuid, text, text),
  public.admin_list_offers_to_review(), public.admin_moderate_photo(uuid, text, text),
  public.admin_decide_offer(uuid, text, text), public.admin_list_offer_reports(public.report_status),
  public.admin_handle_offer_report(uuid, public.report_status, boolean, text), public.admin_emploi_stats()
  to authenticated, service_role;

-- Nettoyage : suppression du dating en base (accord explicite de l'utilisateur, 31 octobre 2026).
-- Le code du dating reste consultable dans la branche `archive/dating`. Cette migration est IRRÉVERSIBLE :
-- profils, photos, likes, matchs, messages, signalements de membres, profil intellectuel, lettres de
-- recommandation et événements sont effacés.
--
-- Gardé :
--   - la plateforme commune : comptes auth.users, admins (aal2), audit_log, app_settings, app_copy (sans les
--     clés du dating), push_tokens, member_notices (types emploi et inactivité), terms_acceptances ;
--   - les diplômes (degree_submissions, user_access, file pgmq, purge) ; access_policy et user_access.tier
--     restent parce que apply_diploma_review en dérive encore le palier et la clé du verdict ;
--   - la conservation (avertissement et suppression des comptes inactifs), recalculée sans profiles ;
--   - le chiffrement (field_key, identity_pepper : jamais recréés ni supprimés) ;
--   - waitlist_signups, table ET lignes : ce sont les adresses de vraies personnes inscrites sur l'ancienne
--     landing. Leur sort (email d'information puis suppression) reste à décider ; seul le droit d'insertion
--     anonyme est retiré, rien ne collecte plus.
--   - tout Sapios Emploi.
--
-- Le bucket `photos` ne peut pas être vidé en SQL (Supabase bloque `delete from storage.objects`) : la
-- fonction `purge-dating-photos`, appelée par la tâche du même nom, le vide par l'API Storage puis le
-- supprime ; la tâche se désinscrit dès que le bucket n'existe plus.

------------------------------------------------------------------------------------------------
-- 1. Tâches planifiées du dating
------------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-reminders') then
    perform cron.unschedule('event-reminders');
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- 2. Activité des comptes, sans profiles
------------------------------------------------------------------------------------------------

create table private.account_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
revoke all on private.account_activity from public, anon, authenticated;

insert into private.account_activity (user_id, last_active_at)
select p.id, p.last_active_at from public.profiles p
on conflict (user_id) do nothing;

create or replace function private.touch_activity(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.account_activity as a (user_id, last_active_at) values (p_uid, now())
  on conflict (user_id) do update set last_active_at = excluded.last_active_at
   where a.last_active_at < now() - interval '5 minutes';
  delete from private.inactivity_warnings w where w.user_id = p_uid;
$$;

-- Dernier signe de vie : activité dans l'app, dernière connexion ou création du compte.
create or replace function private.last_seen(p_uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(a.last_active_at, u.last_sign_in_at, u.created_at)
  from auth.users u
  left join private.account_activity a on a.user_id = u.id
  where u.id = p_uid;
$$;

create or replace function private.warn_inactive_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warning int := private.setting_int('inactive_warning_days', 730);
  v_grace int := private.setting_int('inactive_grace_days', 30);
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select u.id as user_id
    from auth.users u
    left join private.account_activity a on a.user_id = u.id
    where greatest(a.last_active_at, u.last_sign_in_at, u.created_at) < now() - make_interval(days => v_warning)
      and not exists (select 1 from public.admins ad where ad.user_id = u.id)
      and not exists (select 1 from private.inactivity_warnings w where w.user_id = u.id)
    order by greatest(a.last_active_at, u.last_sign_in_at, u.created_at)
    limit 500
  loop
    insert into private.inactivity_warnings (user_id, delete_after)
    values (v_row.user_id, now() + make_interval(days => v_grace));
    insert into public.member_notices (user_id, kind, payload)
    values (v_row.user_id, 'inactivity_warning',
            jsonb_build_object('delete_after', (now() + make_interval(days => v_grace))::date));
    perform private.invoke_edge_function('notify',
      jsonb_build_object('type', 'inactivity', 'user_id', v_row.user_id,
                         'delete_after', (now() + make_interval(days => v_grace))::date));
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    perform private.audit(null, 'retention.inactivity_warned', 'user', null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

------------------------------------------------------------------------------------------------
-- 3. Fonctions gardées, réécrites sans les tables du dating
------------------------------------------------------------------------------------------------

-- Plus de bannissement de profil dans l'emploi : seules les règles de l'emploi s'appliquent.
CREATE OR REPLACE FUNCTION private.require_emploi_uid()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.touch_activity(v_uid);
  return v_uid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_open_candidates(p_offer_id uuid, p_min_level integer DEFAULT NULL::integer, p_skill text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Le domaine d'études n'est plus recopié dans profiles : user_access suffit.
CREATE OR REPLACE FUNCTION public.apply_diploma_review(p_submission uuid, p_reviewer uuid, p_decision text, p_level integer, p_reason text, p_institution text DEFAULT NULL::text, p_field study_field DEFAULT NULL::study_field)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sub public.degree_submissions;
  v_access public.user_access;
  v_policy public.access_policy;
  v_tier public.access_tier;
  v_level int;
  v_copy text;
  v_source uuid;
  v_reason text := nullif(btrim(p_reason), '');
  v_institution text := nullif(btrim(p_institution), '');
  v_inst_out text;
  v_field_out public.study_field;
begin
  perform private.require_server();
  if p_decision is null or p_decision not in ('approve', 'reject', 'needs_more') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_reviewer is null or not exists (select 1 from public.admins a where a.user_id = p_reviewer) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if char_length(v_institution) > 200 then
    raise exception 'invalid_institution' using errcode = 'P0001';
  end if;

  select * into v_sub from public.degree_submissions s where s.id = p_submission for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_sub.status in ('approved', 'rejected') then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;

  select * into v_access from public.user_access ua where ua.user_id = v_sub.user_id for update;

  if p_decision = 'approve' then
    if p_level is null or p_level not between 1 and 8 then
      raise exception 'invalid_level' using errcode = 'P0001';
    end if;
    v_policy := private.level_policy(p_level);
    if v_policy.id is null then
      raise exception 'policy_missing' using errcode = 'P0001';
    end if;

    update public.degree_submissions
       set status = 'approved', level_verified = p_level, reviewer_id = p_reviewer,
           reviewed_at = now(), rejection_reason = null,
           institution_verified = v_institution, field_verified = p_field
     where id = p_submission;

    v_tier := v_policy.tier;
    v_copy := v_policy.copy_key;
    v_level := p_level;
    v_source := p_submission;
    v_inst_out := coalesce(v_institution, v_access.institution);
    v_field_out := coalesce(p_field, v_access.study_field);
    if v_access.user_id is not null then
      if coalesce(v_access.level, 0) > p_level then
        v_level := v_access.level;
        v_source := v_access.source_submission_id;
        v_inst_out := coalesce(v_access.institution, v_institution);
        v_field_out := coalesce(v_access.study_field, p_field);
      end if;
      if private.tier_rank(v_access.tier) > private.tier_rank(v_tier) then
        v_tier := v_access.tier;
        v_copy := v_access.copy_key;
      end if;
    end if;

    insert into public.user_access (user_id, level, tier, copy_key, source_submission_id, granted_at, granted_by,
                                    institution, study_field)
    values (v_sub.user_id, v_level, v_tier, v_copy, v_source, now(), p_reviewer, v_inst_out, v_field_out)
    on conflict (user_id) do update
      set level = excluded.level, tier = excluded.tier, copy_key = excluded.copy_key,
          source_submission_id = excluded.source_submission_id,
          granted_at = excluded.granted_at, granted_by = excluded.granted_by,
          institution = excluded.institution, study_field = excluded.study_field;

  else
    update public.degree_submissions
       set status = case when p_decision = 'reject' then 'rejected' else 'needs_more' end::public.submission_status,
           level_verified = null, reviewer_id = p_reviewer, reviewed_at = now(), rejection_reason = v_reason
     where id = p_submission;
    v_tier := v_access.tier;
    v_level := v_access.level;
    v_copy := case when p_decision = 'reject' then 'verdict.rejected' else 'verdict.needs_more' end;
  end if;

  perform private.audit(p_reviewer, 'diploma.' || p_decision, 'degree_submissions', p_submission::text,
    jsonb_build_object(
      'user_id', v_sub.user_id,
      'level', case when p_decision = 'approve' then p_level end,
      'tier', v_tier,
      'reason', v_reason,
      'institution', case when p_decision = 'approve' then v_institution end,
      'field', case when p_decision = 'approve' then p_field end,
      'previous_tier', v_access.tier,
      'previous_level', v_access.level
    ));

  return jsonb_build_object('user_id', v_sub.user_id, 'tier', v_tier, 'level', v_level, 'copy_key', v_copy);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_member_institution(p_user uuid, p_institution text, p_field study_field)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := private.require_admin();
  v_institution text := nullif(btrim(p_institution), '');
  v_previous public.user_access;
begin
  if char_length(v_institution) > 200 then
    raise exception 'invalid_institution' using errcode = 'P0001';
  end if;
  select * into v_previous from public.user_access ua where ua.user_id = p_user for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.user_access set institution = v_institution, study_field = p_field where user_id = p_user;
  perform private.audit(v_admin, 'member.institution', 'user_access', p_user::text,
    jsonb_build_object('institution', v_institution, 'field', p_field,
                       'previous_institution', v_previous.institution, 'previous_field', v_previous.study_field));
end;
$function$;

-- Identité comparée au diplôme par process-diploma : celle du candidat (prénom et nom). Aucune date de
-- naissance n'est collectée dans l'emploi.
create or replace function public.server_get_identity(p_user uuid)
returns table (legal_name text, birthdate date)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_server();
  return query
  select ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc), null::date
    from public.candidate_identities ci where ci.user_id = p_user;
end;
$$;

-- File des diplômes : identité du candidat, sans parrainage. La forme change (plus de `referred`,
-- `referred_by`) : les trois fonctions sont recréées.
drop function public.admin_list_submissions(public.submission_status);
drop function public.admin_get_submission(uuid);
drop function private.admin_submission_rows(public.submission_status, uuid);

create function private.admin_submission_rows(p_status public.submission_status, p_id uuid)
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text, status public.submission_status,
  extracted jsonb, confidence numeric, signals text[], level_verified integer, reviewer_id uuid,
  reviewed_at timestamptz, rejection_reason text, moderator_note text, attempts integer,
  file_deleted_at timestamptz, created_at timestamptz, legal_name text, birthdate date, display_name text,
  email text, institution_verified text, field_verified public.study_field
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.storage_path, s.mime, s.doc_sha256, s.status, s.extracted, s.confidence,
         s.signals, s.level_verified, s.reviewer_id, s.reviewed_at, s.rejection_reason, s.moderator_note,
         s.attempts, s.file_deleted_at, s.created_at,
         ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc), null::date, ci.first_name,
         u.email::text, s.institution_verified, s.field_verified
  from public.degree_submissions s
  left join public.candidate_identities ci on ci.user_id = s.user_id
  left join auth.users u on u.id = s.user_id
  where (p_id is null or s.id = p_id)
    and (p_id is not null or p_status is null or s.status = p_status)
  order by s.created_at asc
  limit 500;
$$;
revoke all on function private.admin_submission_rows(public.submission_status, uuid) from public, anon, authenticated;

create function public.admin_list_submissions(p_status public.submission_status default 'needs_review')
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text, status public.submission_status,
  extracted jsonb, confidence numeric, signals text[], level_verified integer, reviewer_id uuid,
  reviewed_at timestamptz, rejection_reason text, moderator_note text, attempts integer,
  file_deleted_at timestamptz, created_at timestamptz, legal_name text, birthdate date, display_name text,
  email text, institution_verified text, field_verified public.study_field
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from private.admin_submission_rows(p_status, null);
end;
$$;

create function public.admin_get_submission(p_id uuid)
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text, status public.submission_status,
  extracted jsonb, confidence numeric, signals text[], level_verified integer, reviewer_id uuid,
  reviewed_at timestamptz, rejection_reason text, moderator_note text, attempts integer,
  file_deleted_at timestamptz, created_at timestamptz, legal_name text, birthdate date, display_name text,
  email text, institution_verified text, field_verified public.study_field
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_id is null then
    return;
  end if;
  return query select * from private.admin_submission_rows(null, p_id);
end;
$$;

revoke all on function public.admin_list_submissions(public.submission_status), public.admin_get_submission(uuid)
  from public, anon;
grant execute on function public.admin_list_submissions(public.submission_status), public.admin_get_submission(uuid)
  to authenticated, service_role;

-- Conservation : les signalements de membres et les empreintes de bannis disparaissent ; les signalements
-- d'offres traités sortent après `report_retention_days`.
create or replace function private.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warned int;
  v_reports int;
  v_audit int;
  v_notices int;
  v_emploi jsonb;
begin
  v_warned := private.warn_inactive_accounts();

  delete from public.offer_reports r
   where r.status <> 'open'
     and coalesce(r.handled_at, r.created_at) < now() - make_interval(days => private.setting_int('report_retention_days', 365));
  get diagnostics v_reports = row_count;

  perform set_config('sapios.audit_purge', 'on', true);
  delete from public.audit_log l
   where l.created_at < now() - make_interval(days => private.setting_int('audit_retention_days', 1825));
  get diagnostics v_audit = row_count;
  perform set_config('sapios.audit_purge', 'off', true);

  delete from public.member_notices n
   where n.read_at is not null
     and n.read_at < now() - make_interval(days => private.setting_int('notice_retention_days', 365));
  get diagnostics v_notices = row_count;

  v_emploi := private.run_emploi_retention();

  if v_reports + v_audit + v_notices > 0
     or (v_emploi ->> 'applications')::int + (v_emploi ->> 'messages')::int + (v_emploi ->> 'notes')::int > 0 then
    perform private.audit(null, 'retention.purged', 'retention', null,
      jsonb_build_object('offer_reports', v_reports, 'audit_log', v_audit, 'notices', v_notices, 'emploi', v_emploi));
  end if;
  return jsonb_build_object('warned', v_warned, 'offer_reports', v_reports, 'audit_log', v_audit,
                            'notices', v_notices, 'emploi', v_emploi);
end;
$$;

-- Réglages : plus de rayon de découverte, d'affinités, de lettres de recommandation, de liste de mots
-- du profil intellectuel ni de CGU du dating.
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
    if v_key in ('offer_banned_words', 'generic_email_domains') then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_words := '{}';
      v_max := case v_key when 'offer_banned_words' then 60 else 100 end;
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
    elsif v_key in ('inactive_warning_days', 'inactive_grace_days', 'report_retention_days',
                    'audit_retention_days', 'notice_retention_days', 'offer_lifetime_days',
                    'application_content_retention_days', 'invitation_weekly_quota', 'apply_daily_quota') then
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      select r.lo, r.hi into v_min, v_max
        from (values ('inactive_warning_days', 180, 3650),
                     ('inactive_grace_days', 7, 180),
                     ('report_retention_days', 30, 1825),
                     ('audit_retention_days', 365, 3650),
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
    elsif v_key in ('emploi_terms_candidate_version', 'emploi_terms_recruiter_version') then
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

------------------------------------------------------------------------------------------------
-- 4. Suppression des objets du dating
------------------------------------------------------------------------------------------------

-- Inscription : plus de profil créé ni de contrôle d'identité bannie (aucun bannissement dans l'emploi).
drop trigger on_auth_user_created on auth.users;
drop trigger on_auth_user_deleted_capture_ban on auth.users;

-- Bucket `photos` : plus aucun accès client ; vidé puis supprimé par purge-dating-photos (section 6).
drop policy photos_select_visible on storage.objects;
drop policy photos_insert_own on storage.objects;
drop policy photos_delete_own on storage.objects;

-- Fonctions typées par une table du dating.
drop function private.event_notice(p_user uuid, p_kind text, p_event events, p_reason text);
drop function private.event_public_json(p_event events, p_uid uuid);
drop function private.profile_is_complete(p profiles);

-- Tables (leurs règles d'accès, déclencheurs et index partent avec elles ; les données sont effacées).
drop table public.event_registrations;
drop table public.events;
drop table public.referrals;
drop table public.referral_codes;
drop table public.content_flags;
drop table public.reports;
drop table public.messages;
drop table public.matches;
drop table public.swipes;
drop table public.blocks;
drop table public.profile_answers;
drop table public.profile_prompts;
drop table public.profile_books;
drop table public.profile_theses;
drop table public.discovery_prefs;
drop table public.profile_photos;
drop table public.profile_private;
drop table public.profiles;
drop table private.user_pseudonyms;
drop table private.banned_identities;

-- Fonctions publiques (RPC du dating)
drop function public.accept_terms(p_version text);
drop function public.activate_profile();
drop function public.admin_admit_waitlist(p_user_ids uuid[], p_tier access_tier);
drop function public.admin_cancel_event(p_event_id uuid, p_reason text);
drop function public.admin_check_in(p_registration_id uuid, p_ticket_code text);
drop function public.admin_enable_referrals(p_user uuid);
drop function public.admin_export_event(p_event_id uuid);
drop function public.admin_get_report_context(p_report_id uuid);
drop function public.admin_list_events(p_include_past boolean);
drop function public.admin_list_flagged_content(p_status content_flag_status);
drop function public.admin_list_identities(p_user_ids uuid[]);
drop function public.admin_list_registrations(p_event_id uuid);
drop function public.admin_list_reports(p_status report_status, p_limit integer);
drop function public.admin_list_waitlist();
drop function public.admin_mark_no_shows(p_event_id uuid);
drop function public.admin_moderate_content(p_flag_id uuid, p_decision text, p_reason text);
drop function public.admin_promote_registration(p_registration_id uuid);
drop function public.admin_referral_stats();
drop function public.admin_revoke_referral_code(p_code text, p_disable boolean, p_reason text);
drop function public.admin_set_report_status(p_report_id uuid, p_status report_status, p_ban boolean);
drop function public.admin_stats();
drop function public.admin_upsert_event(p_id uuid, p_title text, p_kind event_kind, p_description text, p_city text, p_neighbourhood text, p_venue_name text, p_venue_address text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_capacity integer, p_allowed_tiers access_tier[], p_status event_status);
drop function public.block_user(p_target uuid);
drop function public.can_view_profile(target uuid);
drop function public.cancel_registration(p_id uuid);
drop function public.claim_referral(p_code text);
drop function public.count_discovery(p_max_distance_km integer, p_age_min integer, p_age_max integer, p_levels integer[], p_strict_levels boolean, p_fields study_field[], p_strict_fields boolean);
drop function public.export_my_data();
drop function public.get_discovery_prefs();
drop function public.get_event(p_id uuid);
drop function public.get_feed(p_limit integer);
drop function public.get_likers();
drop function public.get_likes_count();
drop function public.get_matches();
drop function public.get_my_identity();
drop function public.get_my_referral();
drop function public.get_my_state();
drop function public.get_my_ticket(p_id uuid);
drop function public.get_profile(p_target uuid);
drop function public.get_referral_preview(p_code text);
drop function public.list_events();
drop function public.register_event(p_id uuid, p_accept_charter boolean);
drop function public.report_user(p_target uuid, p_reason text, p_details text, p_content_kind content_kind, p_content_item uuid);
drop function public.set_discovery_prefs(p_max_distance_km integer, p_age_min integer, p_age_max integer, p_levels integer[], p_strict_levels boolean, p_fields study_field[], p_strict_fields boolean, p_sort discovery_sort);
drop function public.set_identity(p_legal_name text, p_birthdate date);
drop function public.set_location(p_lat double precision, p_lng double precision);
drop function public.set_paused(p_paused boolean);
drop function public.set_sensitive_consent(p_granted boolean, p_version text);
drop function public.swipe(p_target uuid, p_direction swipe_direction, p_liked_item text, p_comment text);
drop function public.unmatch(p_match_id uuid);

-- Fonctions internes du dating
drop function private.affinity(p_viewer uuid, p_target uuid);
drop function private.age_years(p_birthdate date);
drop function private.can_access_match(p_match_id uuid);
drop function private.can_attend(p_uid uuid, p_allowed access_tier[]);
drop function private.can_read_photo_object(p_name text);
drop function private.capture_banned_identity();
drop function private.content_flag_reasons(p_text text);
drop function private.content_text(p_user uuid, p_kind content_kind, p_item uuid);
drop function private.discovery_candidates(p_uid uuid, p_apply_prefs boolean, p_max_distance_km integer, p_age_min integer, p_age_max integer, p_levels integer[], p_strict_levels boolean, p_fields study_field[], p_strict_fields boolean);
drop function private.event_taken(p_event uuid);
drop function private.handle_new_user();
drop function private.is_banned_identity(p_kind text, p_value text);
drop function private.is_blocked_pair(p_a uuid, p_b uuid);
drop function private.is_matched(p_a uuid, p_b uuid);
drop function private.is_not_banned();
drop function private.liked_item_context(p_owner uuid, p_item text);
drop function private.liked_item_exists(p_owner uuid, p_item text);
drop function private.likes_received_count(p_uid uuid);
drop function private.normalize_email(p_email text);
drop function private.normalize_identity(p_legal_name text, p_birthdate date);
drop function private.normalize_referral_code(p_code text);
drop function private.notify_new_match();
drop function private.notify_new_message();
drop function private.photo_count(p_user uuid);
drop function private.preview_answer(p_user uuid);
drop function private.profile_content_after_delete();
drop function private.profile_content_before_write();
drop function private.profile_photos_before_write();
drop function private.profile_private_before_write();
drop function private.profiles_before_write();
drop function private.promote_waitlist(p_event_id uuid);
drop function private.pseudonym_for(p_user uuid);
drop function private.queue_content_flag(p_user uuid, p_kind content_kind, p_item uuid, p_excerpt text, p_reasons text[], p_source text, p_report uuid);
drop function private.random_code(p_len integer);
drop function private.referral_owner(p_code text);
drop function private.referral_quota(p_uid uuid);
drop function private.referral_used(p_uid uuid);
drop function private.referred_by_name(p_uid uuid);
drop function private.reports_pseudonymize();
drop function private.send_event_reminders();
drop function private.set_content_status(p_user uuid, p_kind content_kind, p_item uuid, p_status photo_moderation);
drop function private.store_identity(p_user uuid, p_legal_name text, p_birthdate date);
drop function private.terms_state(p_uid uuid);
drop function private.terms_version();
drop function private.tier_can_browse(p_tier access_tier);
drop function private.tier_policy(p_tier access_tier);
drop function private.waitlist_rank(p_registration uuid);

-- Types énumérés du dating.
drop type public.content_flag_status;
drop type public.content_kind;
drop type public.discovery_sort;
drop type public.event_kind;
drop type public.event_status;
drop type public.gender;
drop type public.profile_status;
drop type public.registration_status;
drop type public.swipe_direction;
drop type public.thesis_visibility;

------------------------------------------------------------------------------------------------
-- 5. Données de configuration du dating
------------------------------------------------------------------------------------------------

delete from public.app_settings
 where key in ('feed_radius_km', 'affinity_weight_field', 'affinity_weight_book', 'affinity_weight_prompt',
               'affinity_weight_institution', 'moderation_blocklist', 'referral_letters_standard',
               'referral_letters_unlimited', 'referral_window_days', 'banned_identity_retention_days',
               'terms_version');

-- Textes : seuls restent ceux de l'inactivité, le pied des emails et le délai de revue des diplômes.
delete from public.app_copy
 where key not in ('email.footer', 'email.inactivity.subject', 'email.inactivity.title', 'email.inactivity.body',
                   'email.inactivity.cta', 'notice.inactivity.title', 'notice.inactivity.body', 'review.delay')
   and key not like 'emploi.%';

delete from public.member_notices
 where kind in ('content_removed', 'event_promoted', 'event_cancelled');
alter table public.member_notices drop constraint member_notices_kind_check;
alter table public.member_notices add constraint member_notices_kind_check
  check (kind in ('inactivity_warning', 'application_interested', 'application_rejected', 'application_closed',
                  'interview_proposed', 'invitation_received', 'company_verified', 'company_rejected',
                  'company_suspended', 'offer_published', 'offer_rejected'));

delete from private.rate_limits where bucket = 'book_search';

-- Liste d'attente de l'ancienne landing : on garde les lignes (décision à venir), on ne collecte plus.
drop policy waitlist_insert_anon on public.waitlist_signups;
drop policy waitlist_insert_authenticated on public.waitlist_signups;
revoke insert on public.waitlist_signups from anon, authenticated;

------------------------------------------------------------------------------------------------
-- 6. Vidage du bucket `photos` par l'API Storage
------------------------------------------------------------------------------------------------

-- Appelle purge-dating-photos tant que le bucket existe ; se désinscrit ensuite. La fonction et cette
-- tâche pourront être retirées par une migration ultérieure.
create function private.kick_dating_photo_purge()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from storage.buckets b where b.id = 'photos') then
    if exists (select 1 from cron.job where jobname = 'purge-dating-photos') then
      perform cron.unschedule('purge-dating-photos');
    end if;
    return null;
  end if;
  return private.invoke_edge_function('purge-dating-photos', '{}'::jsonb, 120000);
end;
$$;
revoke all on function private.kick_dating_photo_purge() from public, anon, authenticated;

-- Bucket déjà vide (nouvelle base, ou staging déjà purgé) : supprimé tout de suite, sans fichier orphelin.
-- Sinon la tâche appelle la fonction toutes les 10 minutes jusqu'à sa disparition.
do $$
begin
  if exists (select 1 from storage.buckets b where b.id = 'photos')
     and not exists (select 1 from storage.objects o where o.bucket_id = 'photos') then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.buckets b where b.id = 'photos';
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
  if exists (select 1 from storage.buckets b where b.id = 'photos') then
    perform cron.schedule('purge-dating-photos', '*/10 * * * *', 'select private.kick_dating_photo_purge()');
  end if;
end;
$$;

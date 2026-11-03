-- Double authentification facultative des recruteurs (TOTP, Supabase Auth MFA).
--
-- Un recruteur qui a enregistré une application d'authentification (facteur vérifié dans auth.mfa_factors)
-- doit être en session aal2 pour agir au nom de son entreprise :
--   - toute RPC recruteur (private.require_member, private.member_company, private.application_side)
--     lève `mfa_required` ;
--   - les règles d'accès des membres (private.is_company_member) ne lui montrent rien ;
--   - get_emploi_state garde le nom et le statut de l'entreprise (aiguillage du site), sans compteurs ;
--   - export_my_emploi_data et la suppression du compte (Edge Function delete-account) exigent aussi aal2.
-- Sans facteur vérifié, rien ne change. Les candidats ne sont pas concernés.

------------------------------------------------------------------------------------------------
-- 1. Règle : facteur vérifié ⇒ session aal2
------------------------------------------------------------------------------------------------

create function private.mfa_ok(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = p_uid and f.status = 'verified');
$$;

comment on function private.mfa_ok(uuid) is
  'Vrai si le compte n''a pas de facteur MFA vérifié, ou si la session courante est aal2.';

revoke all on function private.mfa_ok(uuid) from public, anon, authenticated;
grant execute on function private.mfa_ok(uuid) to service_role;

-- Pour le site (et delete-account, appelée avec le JWT du membre) : la session courante suffit-elle ?
create function public.mfa_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.mfa_ok(auth.uid());
$$;

revoke all on function public.mfa_session_ok() from public, anon;
grant execute on function public.mfa_session_ok() to authenticated, service_role;

------------------------------------------------------------------------------------------------
-- 2. Membres d'une entreprise
------------------------------------------------------------------------------------------------

-- Règles d'accès (offres, candidatures, notes, messages, créneaux, photos…) : pas de ligne sans aal2.
create or replace function private.is_company_member(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company is not null and exists (
    select 1 from public.company_members cm where cm.company_id = p_company and cm.user_id = (select auth.uid())
  ) and private.mfa_ok((select auth.uid()));
$$;

-- Toutes les RPC recruteur passent par ici (require_company_application, require_company_offer…).
create or replace function private.require_member()
returns public.company_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_member public.company_members;
begin
  select * into v_member from public.company_members cm where cm.user_id = v_uid;
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if not private.mfa_ok(v_uid) then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return v_member;
end;
$$;

-- Conversations du recruteur et dépôt des photos d'offres (Storage).
create or replace function private.member_company(p_uid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  select cm.company_id into v_company from public.company_members cm where cm.user_id = p_uid;
  if v_company is not null and not private.mfa_ok(p_uid) then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return v_company;
end;
$$;

-- Messagerie d'une candidature (get_application_messages, send_application_message).
create or replace function private.application_side(p_app public.applications, p_uid uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_app.candidate_id = p_uid then
    return 'candidate';
  end if;
  if exists (select 1 from public.company_members cm where cm.company_id = p_app.company_id and cm.user_id = p_uid) then
    if not private.mfa_ok(p_uid) then
      raise exception 'mfa_required' using errcode = 'P0001';
    end if;
    return 'company';
  end if;
  return null;
end;
$$;

------------------------------------------------------------------------------------------------
-- 3. État du compte et export
------------------------------------------------------------------------------------------------

create or replace function private.emploi_state_base()
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
  -- Compte protégé par la double authentification et session aal1 : pas de compteurs de l'entreprise.
  elsif v_member.company_id is not null and private.mfa_ok(v_uid) then
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

create or replace function public.export_my_emploi_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  -- Un recruteur protégé exporte ses notes et messages seulement en session aal2.
  if exists (select 1 from public.company_members cm where cm.user_id = auth.uid()) and not private.mfa_ok(auth.uid()) then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  v_out := private.export_emploi_data_base();
  if v_out ->> 'kind' = 'candidate' then
    v_out := v_out || jsonb_build_object('diploma_prompt_dismissed_at', (
      select c.diploma_prompt_dismissed_at from public.candidates c where c.user_id = auth.uid()));
  end if;
  return v_out;
end;
$$;

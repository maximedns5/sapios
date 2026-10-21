-- RPC du back-office (admins authentifiés) et fonctions réservées au serveur (service_role).

-- Back-office ---------------------------------------------------------------------------------
create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

create function public.admin_admit_waitlist(p_user_ids uuid[], p_tier public.access_tier default 'standard')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_policy public.access_policy;
  v_copy text;
  v_row record;
  v_count int := 0;
begin
  if p_tier is null or p_tier not in ('standard', 'unlimited') then
    raise exception 'invalid_tier' using errcode = 'P0001';
  end if;
  v_policy := private.tier_policy(p_tier);
  v_copy := coalesce(v_policy.copy_key, 'verdict.' || p_tier::text);

  for v_row in
    update public.user_access ua
       set tier = p_tier, copy_key = v_copy, granted_at = now(), granted_by = v_admin
     where ua.user_id = any (coalesce(p_user_ids, '{}')) and ua.tier = 'waitlist'
    returning ua.user_id, ua.level
  loop
    v_count := v_count + 1;
    perform private.audit(v_admin, 'waitlist.admit', 'user_access', v_row.user_id::text,
                          jsonb_build_object('tier', p_tier, 'level', v_row.level, 'previous_tier', 'waitlist'));
    perform private.invoke_edge_function('notify',
      jsonb_build_object('type', 'verdict', 'user_id', v_row.user_id, 'copy_key', v_copy));
  end loop;
  return v_count;
end;
$$;

create function public.admin_set_report_status(p_report_id uuid, p_status public.report_status, p_ban boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_target uuid;
begin
  update public.reports r
     set status = p_status, handled_by = v_admin, handled_at = now()
   where r.id = p_report_id
  returning r.target_id into v_target;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.audit(v_admin, 'report.' || p_status::text, 'reports', p_report_id::text,
                        jsonb_build_object('target_id', v_target, 'ban', coalesce(p_ban, false)));

  if coalesce(p_ban, false) then
    update public.profiles set status = 'banned' where id = v_target;
    update public.matches m set unmatched_at = now()
     where v_target in (m.user_a, m.user_b) and m.unmatched_at is null;
    perform private.audit(v_admin, 'user.ban', 'profiles', v_target::text,
                          jsonb_build_object('report_id', p_report_id));
  end if;
end;
$$;

-- Soumissions vues par le back-office : ligne complète + identité et e-mail du compte.
create function private.admin_submission_rows(p_status public.submission_status, p_id uuid)
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.storage_path, s.mime, s.doc_sha256, s.status, s.extracted, s.confidence,
         s.signals, s.level_verified, s.reviewer_id, s.reviewed_at, s.rejection_reason, s.moderator_note,
         s.attempts, s.file_deleted_at, s.created_at, pp.legal_name, pp.birthdate, p.display_name,
         u.email::text
  from public.degree_submissions s
  left join public.profile_private pp on pp.user_id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where (p_id is null or s.id = p_id)
    and (p_id is not null or p_status is null or s.status = p_status)
  order by s.created_at asc
  limit 500;
$$;

create function public.admin_list_submissions(p_status public.submission_status default 'needs_review')
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text
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
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text
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

-- Membres en liste d'attente, les plus anciens d'abord (admission par lot).
create function public.admin_list_waitlist()
returns table (
  user_id uuid, email text, display_name text, level int, copy_key text,
  granted_at timestamptz, profile_status public.profile_status, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select ua.user_id, u.email::text, p.display_name, ua.level, ua.copy_key, ua.granted_at, p.status, u.created_at
  from public.user_access ua
  join auth.users u on u.id = ua.user_id
  left join public.profiles p on p.id = ua.user_id
  where ua.tier = 'waitlist'
  order by ua.granted_at asc
  limit 1000;
end;
$$;

-- Statistiques du back-office (la RLS ne laisse pas un admin compter matches et messages).
create function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'profiles_by_status', (
      select jsonb_object_agg(e::text, (select count(*) from public.profiles p where p.status = e))
      from unnest(enum_range(null::public.profile_status)) e),
    'submissions_by_status', (
      select jsonb_object_agg(e::text, (select count(*) from public.degree_submissions s where s.status = e))
      from unnest(enum_range(null::public.submission_status)) e),
    'members_by_tier', (
      select jsonb_object_agg(e::text, (select count(*) from public.user_access ua where ua.tier = e))
      from unnest(enum_range(null::public.access_tier)) e),
    'matches_total', (select count(*) from public.matches),
    'matches_active', (select count(*) from public.matches m where m.unmatched_at is null),
    'messages_total', (select count(*) from public.messages),
    'waitlist_signups', (select count(*) from public.waitlist_signups),
    'reports_open', (select count(*) from public.reports r where r.status = 'open')
  );
end;
$$;

-- Serveur uniquement (service_role) -----------------------------------------------------------
create function private.require_server()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_server_call() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Décision de revue en une transaction : soumission, user_access (via access_policy), audit.
-- Pas de rétrogradation : on conserve le meilleur niveau et le meilleur palier déjà acquis
-- (ex. admission manuelle depuis la liste d'attente).
create function public.apply_diploma_review(
  p_submission uuid,
  p_reviewer uuid,
  p_decision text,
  p_level int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.degree_submissions;
  v_access public.user_access;
  v_policy public.access_policy;
  v_tier public.access_tier;
  v_level int;
  v_copy text;
  v_source uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  perform private.require_server();
  if p_decision is null or p_decision not in ('approve', 'reject', 'needs_more') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_reviewer is null or not exists (select 1 from public.admins a where a.user_id = p_reviewer) then
    raise exception 'forbidden' using errcode = 'P0001';
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
           reviewed_at = now(), rejection_reason = null
     where id = p_submission;

    v_tier := v_policy.tier;
    v_copy := v_policy.copy_key;
    v_level := p_level;
    v_source := p_submission;
    if v_access.user_id is not null then
      if coalesce(v_access.level, 0) > p_level then
        v_level := v_access.level;
        v_source := v_access.source_submission_id;
      end if;
      if private.tier_rank(v_access.tier) > private.tier_rank(v_tier) then
        v_tier := v_access.tier;
        v_copy := v_access.copy_key;
      end if;
    end if;

    insert into public.user_access (user_id, level, tier, copy_key, source_submission_id, granted_at, granted_by)
    values (v_sub.user_id, v_level, v_tier, v_copy, v_source, now(), p_reviewer)
    on conflict (user_id) do update
      set level = excluded.level, tier = excluded.tier, copy_key = excluded.copy_key,
          source_submission_id = excluded.source_submission_id,
          granted_at = excluded.granted_at, granted_by = excluded.granted_by;
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
      'previous_tier', v_access.tier,
      'previous_level', v_access.level
    ));

  return jsonb_build_object('user_id', v_sub.user_id, 'tier', v_tier, 'level', v_level, 'copy_key', v_copy);
end;
$$;

-- Fichiers bruts à supprimer : décision prise il y a plus de p_days jours (défaut : réglage
-- diploma_retention_days, 30). La suppression du fichier se fait par l'API Storage.
create function public.diplomas_to_purge(p_days int)
returns table (id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_days int := greatest(coalesce(p_days, private.setting_int('diploma_retention_days', 30)), 0);
begin
  perform private.require_server();
  return query
  select s.id, s.storage_path
  from public.degree_submissions s
  where s.file_deleted_at is null
    and s.status in ('approved', 'rejected', 'needs_more')
    and s.reviewed_at is not null
    and s.reviewed_at < now() - make_interval(days => v_days)
  order by s.reviewed_at
  limit 1000;
end;
$$;

create function public.mark_diploma_purged(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.degree_submissions;
begin
  perform private.require_server();
  select * into v_sub from public.degree_submissions s where s.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_sub.file_deleted_at is not null then
    return;
  end if;
  update public.degree_submissions set file_deleted_at = now() where id = p_id;
  perform private.audit(null, 'diploma.file_purged', 'degree_submissions', p_id::text,
    jsonb_build_object('user_id', v_sub.user_id, 'storage_path', v_sub.storage_path,
                       'reviewed_at', v_sub.reviewed_at));
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.admin_admit_waitlist(uuid[], public.access_tier),
  public.admin_set_report_status(uuid, public.report_status, boolean),
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid),
  public.admin_list_waitlist(),
  public.admin_stats(),
  public.apply_diploma_review(uuid, uuid, text, int, text),
  public.diplomas_to_purge(int),
  public.mark_diploma_purged(uuid)
from public, anon, authenticated;

grant execute on function
  public.admin_admit_waitlist(uuid[], public.access_tier),
  public.admin_set_report_status(uuid, public.report_status, boolean),
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid),
  public.admin_list_waitlist(),
  public.admin_stats()
to authenticated, service_role;

grant execute on function
  public.apply_diploma_review(uuid, uuid, text, int, text),
  public.diplomas_to_purge(int),
  public.mark_diploma_purged(uuid)
to service_role;

revoke all on function
  private.require_admin(),
  private.require_server(),
  private.admin_submission_rows(public.submission_status, uuid)
from public, anon, authenticated;
grant execute on function
  private.require_admin(),
  private.require_server(),
  private.admin_submission_rows(public.submission_status, uuid)
to service_role;

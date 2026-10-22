-- Lot 1 : établissement vérifié (revue des diplômes), état du compte, export RGPD, back-office.

-- Revue des diplômes : établissement et domaine saisis par le modérateur ----------------------
-- p_institution / p_field facultatifs (le back-office actuel ne les envoie pas encore ; le
-- prochain les rendra obligatoires à l'approbation). Recopiés dans user_access pour le feed :
-- ceux du diplôme qui donne le niveau retenu, sinon ceux déjà connus.
-- Le domaine vérifié devient le domaine du profil s'il n'en a pas encore.
drop function public.apply_diploma_review(uuid, uuid, text, int, text);

create function public.apply_diploma_review(
  p_submission uuid,
  p_reviewer uuid,
  p_decision text,
  p_level int,
  p_reason text,
  p_institution text default null,
  p_field public.study_field default null
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

    if v_field_out is not null then
      update public.profiles set study_field = v_field_out where id = v_sub.user_id and study_field is null;
    end if;
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
$$;

-- Rattrapage : établissement et domaine d'un membre déjà validé (fichier parfois purgé).
create function public.admin_set_member_institution(p_user uuid, p_institution text, p_field public.study_field)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_field is not null then
    update public.profiles set study_field = p_field where id = p_user and study_field is null;
  end if;
  perform private.audit(v_admin, 'member.institution', 'user_access', p_user::text,
    jsonb_build_object('institution', v_institution, 'field', p_field,
                       'previous_institution', v_previous.institution, 'previous_field', v_previous.study_field));
end;
$$;

-- Soumissions vues par le back-office : mêmes colonnes, plus établissement et domaine vérifiés.
drop function public.admin_list_submissions(public.submission_status);
drop function public.admin_get_submission(uuid);
drop function private.admin_submission_rows(public.submission_status, uuid);

create function private.admin_submission_rows(p_status public.submission_status, p_id uuid)
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text,
  institution_verified text, field_verified public.study_field
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.storage_path, s.mime, s.doc_sha256, s.status, s.extracted, s.confidence,
         s.signals, s.level_verified, s.reviewer_id, s.reviewed_at, s.rejection_reason, s.moderator_note,
         s.attempts, s.file_deleted_at, s.created_at, pp.legal_name, pp.birthdate, p.display_name,
         u.email::text, s.institution_verified, s.field_verified
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
  legal_name text, birthdate date, display_name text, email text,
  institution_verified text, field_verified public.study_field
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
  legal_name text, birthdate date, display_name text, email text,
  institution_verified text, field_verified public.study_field
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

-- Statistiques : + textes en attente de modération.
create or replace function public.admin_stats()
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
    'reports_open', (select count(*) from public.reports r where r.status = 'open'),
    'content_flags_open', (select count(*) from public.content_flags f where f.status = 'open')
  );
end;
$$;

-- État du compte : + likes reçus (nombre seul), avis non lus, avancement du profil intellectuel.
--   likes_received : likes en attente de réponse (tous paliers, jamais d'identité) ;
--   notices        : [{ id, kind, payload, created_at }] non lus (kind 'content_removed' :
--                    payload { content_kind, item_id, prompt_key, excerpt, reason }) ;
--   intellect      : { answers, books, thesis, study_field } pour l'anneau de complétion.
create or replace function public.get_my_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles;
  v_private public.profile_private;
  v_access public.user_access;
  v_policy public.access_policy;
  v_latest public.degree_submissions;
  v_photos int;
  v_likes_today int;
  v_recent_subs int;
  v_quota int;
begin
  perform private.touch_activity(v_uid);

  select * into v_profile from public.profiles p where p.id = v_uid;
  select * into v_private from public.profile_private pp where pp.user_id = v_uid;
  select * into v_access from public.user_access ua where ua.user_id = v_uid;
  if v_access.tier is not null then
    v_policy := private.tier_policy(v_access.tier);
  end if;

  v_quota := case when v_policy.id is null then 0 else v_policy.daily_like_quota end;

  select count(*) into v_photos from public.profile_photos ph
   where ph.user_id = v_uid and ph.moderation_status <> 'rejected';
  select count(*) into v_likes_today from public.swipes s
   where s.swiper_id = v_uid and s.direction = 'like' and s.created_at >= private.paris_day_start();
  select * into v_latest from public.degree_submissions s
   where s.user_id = v_uid order by s.created_at desc limit 1;
  select count(*) into v_recent_subs from public.degree_submissions s
   where s.user_id = v_uid and s.created_at > now() - interval '30 days';

  return jsonb_build_object(
    'profile_status', v_profile.status,
    'onboarding', jsonb_build_object(
      'identity_set', v_private.legal_name is not null and v_private.birthdate is not null,
      'profile_complete', coalesce(private.profile_is_complete(v_profile), false),
      'photos_count', v_photos,
      'consent_sensitive', v_private.consent_sensitive_at is not null
    ),
    'tier', v_access.tier,
    'level', v_access.level,
    'copy_key', v_access.copy_key,
    'can_browse', coalesce(v_policy.can_browse, false),
    'daily_like_quota', v_quota,
    'likes_left_today', case when v_quota is null then null else greatest(v_quota - v_likes_today, 0) end,
    'sees_likers', coalesce(v_policy.sees_likers, false),
    'latest_submission', case when v_latest.id is null then null else jsonb_build_object(
      'id', v_latest.id,
      'status', v_latest.status,
      'created_at', v_latest.created_at,
      'rejection_reason', v_latest.rejection_reason
    ) end,
    'submissions_left', greatest(private.setting_int('max_submissions_per_30_days', 3) - v_recent_subs, 0),
    'likes_received', private.likes_received_count(v_uid),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload,
                                                             'created_at', n.created_at) order by n.created_at desc)
                           from (select * from public.member_notices mn
                                  where mn.user_id = v_uid and mn.read_at is null
                                  order by mn.created_at desc limit 20) n), '[]'::jsonb),
    'intellect', jsonb_build_object(
      'answers', (select count(*) from public.profile_answers a where a.user_id = v_uid and a.moderation_status <> 'rejected'),
      'books', (select count(*) from public.profile_books b where b.user_id = v_uid and b.moderation_status <> 'rejected'),
      'thesis', exists (select 1 from public.profile_theses t where t.user_id = v_uid and t.moderation_status <> 'rejected'),
      'study_field', v_profile.study_field
    )
  );
end;
$$;

-- Export RGPD : + réponses, livres, thèse, critères, avis, likes ciblés et messages cités.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = v_uid;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u where u.id = v_uid),
    'profile', (select (to_jsonb(p) - 'location') || jsonb_build_object('location',
                         case when p.location is null then null else jsonb_build_object(
                           'lat', extensions.st_y(p.location::extensions.geometry),
                           'lng', extensions.st_x(p.location::extensions.geometry)) end)
                  from public.profiles p where p.id = v_uid),
    'identity', (select to_jsonb(pp) from public.profile_private pp where pp.user_id = v_uid),
    'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.position)
                          from public.profile_photos ph where ph.user_id = v_uid), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(to_jsonb(a) order by a.position)
                           from public.profile_answers a where a.user_id = v_uid), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(to_jsonb(b) order by b.position)
                         from public.profile_books b where b.user_id = v_uid), '[]'::jsonb),
    'thesis', (select to_jsonb(t) from public.profile_theses t where t.user_id = v_uid),
    'discovery_prefs', (select to_jsonb(dp) from public.discovery_prefs dp where dp.user_id = v_uid),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
                           from public.member_notices n where n.user_id = v_uid), '[]'::jsonb),
    'access', (select to_jsonb(ua) - 'granted_by' from public.user_access ua where ua.user_id = v_uid),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) - 'signals' - 'moderator_note' - 'reviewer_id'
                                              order by s.created_at)
                               from public.degree_submissions s where s.user_id = v_uid), '[]'::jsonb),
    'swipes', coalesce((select jsonb_agg(jsonb_build_object('target_id', s.target_id, 'direction', s.direction,
                                                            'liked_item', s.liked_item, 'comment', s.comment,
                                                            'created_at', s.created_at) order by s.created_at)
                          from public.swipes s where s.swiper_id = v_uid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', m.id,
                                  'other_id', case when m.user_a = v_uid then m.user_b else m.user_a end,
                                  'created_at', m.created_at, 'unmatched_at', m.unmatched_at) order by m.created_at)
                           from public.matches m where v_uid in (m.user_a, m.user_b)), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('id', msg.id, 'match_id', msg.match_id,
                                                                   'body', msg.body, 'context', msg.context,
                                                                   'liked_item', msg.liked_item,
                                                                   'created_at', msg.created_at)
                                                order by msg.created_at)
                                 from public.messages msg where msg.sender_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at))
                          from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target_id', r.target_id, 'reason', r.reason,
                                                             'details', r.details, 'content_kind', r.content_kind,
                                                             'content_item_id', r.content_item_id,
                                                             'status', r.status, 'created_at', r.created_at))
                           from public.reports r where r.reporter_id = v_uid), '[]'::jsonb),
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform,
                                                                 'created_at', t.created_at))
                               from public.push_tokens t where t.user_id = v_uid), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('email', w.email, 'source', w.source,
                                                              'created_at', w.created_at))
                            from public.waitlist_signups w where w.email::text = lower(v_email)), '[]'::jsonb)
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.apply_diploma_review(uuid, uuid, text, int, text, text, public.study_field),
  public.admin_set_member_institution(uuid, text, public.study_field),
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid)
from public, anon, authenticated;

grant execute on function
  public.admin_set_member_institution(uuid, text, public.study_field),
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid)
to authenticated, service_role;

grant execute on function public.apply_diploma_review(uuid, uuid, text, int, text, text, public.study_field)
  to service_role;

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

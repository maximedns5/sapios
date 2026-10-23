-- Lot 2 : priorité des personnes recommandées dans le back-office, état du compte, export RGPD et
-- statistiques. La recommandation fait passer devant, jamais au-delà du diplôme.

-- File de revue des diplômes : recommandés d'abord, puis les plus anciens --------------------------
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
         s.attempts, s.file_deleted_at, s.created_at, pp.legal_name, pp.birthdate, p.display_name,
         u.email::text, s.institution_verified, s.field_verified,
         (rf.referee_id is not null), rp.display_name
  from public.degree_submissions s
  left join public.profile_private pp on pp.user_id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  left join public.referrals rf on rf.referee_id = s.user_id
  left join public.profiles rp on rp.id = rf.referrer_id
  where (p_id is null or s.id = p_id)
    and (p_id is not null or p_status is null or s.status = p_status)
  order by (rf.referee_id is not null) desc, s.created_at asc
  limit 500;
$$;

create function public.admin_list_submissions(p_status public.submission_status default 'needs_review')
returns table (
  id uuid, user_id uuid, storage_path text, mime text, doc_sha256 text,
  status public.submission_status, extracted jsonb, confidence numeric, signals text[],
  level_verified int, reviewer_id uuid, reviewed_at timestamptz, rejection_reason text,
  moderator_note text, attempts int, file_deleted_at timestamptz, created_at timestamptz,
  legal_name text, birthdate date, display_name text, email text,
  institution_verified text, field_verified public.study_field,
  referred boolean, referred_by text
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
  institution_verified text, field_verified public.study_field,
  referred boolean, referred_by text
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

-- Liste d'attente Bac+3 : recommandés d'abord, puis les plus anciens (admission par lot) --------
drop function public.admin_list_waitlist();

create function public.admin_list_waitlist()
returns table (
  user_id uuid, email text, display_name text, level int, copy_key text,
  granted_at timestamptz, profile_status public.profile_status, created_at timestamptz,
  referred boolean, referred_by text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select ua.user_id, u.email::text, p.display_name, ua.level, ua.copy_key, ua.granted_at, p.status, u.created_at,
         (rf.referee_id is not null), rp.display_name
  from public.user_access ua
  join auth.users u on u.id = ua.user_id
  left join public.profiles p on p.id = ua.user_id
  left join public.referrals rf on rf.referee_id = ua.user_id
  left join public.profiles rp on rp.id = rf.referrer_id
  where ua.tier = 'waitlist'
  order by (rf.referee_id is not null) desc, ua.granted_at asc
  limit 1000;
end;
$$;

-- Statistiques : + recommandations et événements à venir --------------------------------------
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
    'content_flags_open', (select count(*) from public.content_flags f where f.status = 'open'),
    'referrals_total', (select count(*) from public.referrals),
    'referred_pending_review', (select count(*) from public.degree_submissions s
                                 join public.referrals rf on rf.referee_id = s.user_id
                                where s.status = 'needs_review'),
    'events_upcoming', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'capacity', e.capacity,
               'registered', private.event_taken(e.id),
               'waitlisted', (select count(*) from public.event_registrations r
                               where r.event_id = e.id and r.status = 'waitlisted'))
             order by e.starts_at)
      from public.events e
      where e.status = 'published' and e.starts_at > now()), '[]'::jsonb)
  );
end;
$$;

-- État du compte : + recommandation (prénom du parrain) et avis d'événements -------------------
--   referred    : la personne a utilisé un code ;
--   referred_by : prénom affiché du parrain (null s'il a supprimé son compte) ;
--   notices     : kinds 'content_removed', 'event_promoted', 'event_cancelled'.
-- Verdict « liste d'attente » d'une personne recommandée : texte `verdict.waitlist.referred`
-- (choisi par l'app quand tier = 'waitlist' et referred = true).
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
    ),
    'referred', exists (select 1 from public.referrals r where r.referee_id = v_uid),
    'referred_by', private.referred_by_name(v_uid),
    'can_refer', private.referral_quota(v_uid) is not null
  );
end;
$$;

-- Export RGPD : + recommandation (mon code, mes lettres, qui m'a recommandé) et inscriptions ----
-- Jamais l'identité des personnes que j'ai recommandées : seulement leur nombre.
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
                            from public.waitlist_signups w where w.email::text = lower(v_email)), '[]'::jsonb),
    'referral', jsonb_build_object(
      'codes', coalesce((select jsonb_agg(jsonb_build_object('code', rc.code, 'created_at', rc.created_at,
                                                             'revoked_at', rc.revoked_at) order by rc.created_at)
                           from public.referral_codes rc where rc.owner_id = v_uid), '[]'::jsonb),
      'letters_used_total', (select count(*) from public.referrals r where r.referrer_id = v_uid),
      'referred_by', (select jsonb_build_object('first_name', p.display_name, 'code', r.code, 'claimed_at', r.claimed_at)
                        from public.referrals r left join public.profiles p on p.id = r.referrer_id
                       where r.referee_id = v_uid)
    ),
    'event_registrations', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', r.event_id, 'event_title', e.title, 'starts_at', e.starts_at,
                                          'status', r.status, 'ticket_code', r.ticket_code,
                                          'charter_accepted_at', r.charter_accepted_at,
                                          'checked_in_at', r.checked_in_at, 'created_at', r.created_at)
                       order by e.starts_at)
      from public.event_registrations r join public.events e on e.id = r.event_id
      where r.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid),
  public.admin_list_waitlist()
from public, anon, authenticated;

grant execute on function
  public.admin_list_submissions(public.submission_status),
  public.admin_get_submission(uuid),
  public.admin_list_waitlist()
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
  private.can_read_photo_object(text),
  private.can_attend(uuid, public.access_tier[])
to authenticated;
grant execute on all functions in schema private to service_role;

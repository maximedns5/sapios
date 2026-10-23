-- Conformité : get_my_state expose l'état des CGU, l'export inclut les acceptations.
-- Copie des définitions du lot 2 (20261024090200), avec seulement ces deux ajouts.
--   get_my_state().terms : {current_version, accepted, accepted_at, last_accepted_version}

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
    'can_refer', private.referral_quota(v_uid) is not null,
    'terms', private.terms_state(v_uid)
  );
end;
$$;

-- Export RGPD : + acceptations des CGU (version, date).
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
      where r.user_id = v_uid), '[]'::jsonb),
    'terms_acceptances', coalesce((select jsonb_agg(jsonb_build_object('version', t.version,
                                                                       'accepted_at', t.accepted_at)
                                                    order by t.accepted_at)
                                     from public.terms_acceptances t where t.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_state(), public.export_my_data() from public, anon;
grant execute on function public.get_my_state(), public.export_my_data() to authenticated, service_role;

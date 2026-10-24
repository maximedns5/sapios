-- Sapios Emploi : tâches planifiées, conservation et données des notifications (contrat §3 « Serveur et
-- tâches », §8).

-- 1. Échéances : une candidature sans réponse à l'échéance est close, jamais refusée (décision E10) -----
create function private.close_overdue_applications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications;
  v_closed int := 0;
  v_expired int := 0;
begin
  for v_app in
    update public.applications a set status = 'closed_no_response', closed_at = now()
     where a.id in (select x.id from public.applications x
                     where x.status in ('sent', 'seen') and x.due_at <= now()
                     order by x.due_at limit 1000
                     for update skip locked)
    returning *
  loop
    perform private.emploi_notice(v_app.candidate_id, 'application_closed', private.application_notice_payload(v_app));
    perform private.emploi_notify('application_closed', v_app.id);
    v_closed := v_closed + 1;
  end loop;

  update public.offers o set status = 'expired', closed_at = now()
   where o.status = 'published' and o.expires_at is not null and o.expires_at <= now();
  get diagnostics v_expired = row_count;

  if v_closed + v_expired > 0 then
    perform private.audit(null, 'emploi.deadlines', 'applications', null,
                          jsonb_build_object('closed_no_response', v_closed, 'offers_expired', v_expired));
  end if;
  return jsonb_build_object('closed_no_response', v_closed, 'offers_expired', v_expired);
end;
$$;

-- 2. Rappel aux recruteurs : candidatures à échéance dans les 48 h (un email par entreprise et par jour).
create function private.send_deadline_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_count int := 0;
begin
  for v_company in
    select distinct a.company_id from public.applications a
     where a.status in ('sent', 'seen') and a.due_at > now() and a.due_at <= now() + interval '48 hours'
  loop
    perform private.emploi_notify('deadline_reminder', v_company);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('emploi-deadlines', '17 * * * *', $$select private.close_overdue_applications()$$);
select cron.schedule('emploi-reminders', '7 8 * * *', $$select private.send_deadline_reminders()$$);

-- 3. Conservation : le contenu d'une candidature close part après application_content_retention_days ;
-- le statut et les dates restent (délai de réponse moyen, preuve d'une réponse).
create function private.run_emploi_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int := private.setting_int('application_content_retention_days', 180);
  v_apps int;
  v_messages int;
  v_notes int;
  v_passes int;
begin
  delete from public.application_messages m
   using public.applications a
   where a.id = m.application_id and a.status in ('rejected', 'closed_no_response', 'withdrawn', 'hired')
     and a.closed_at < now() - make_interval(days => v_days);
  get diagnostics v_messages = row_count;

  delete from public.application_notes n
   using public.applications a
   where a.id = n.application_id and a.status in ('rejected', 'closed_no_response', 'withdrawn', 'hired')
     and a.closed_at < now() - make_interval(days => v_days);
  get diagnostics v_notes = row_count;

  update public.applications a set note = null, note_target = null, note_target_label = null, refusal_message = null
   where a.status in ('rejected', 'closed_no_response', 'withdrawn', 'hired')
     and a.closed_at < now() - make_interval(days => v_days)
     and (a.note is not null or a.note_target_label is not null or a.refusal_message is not null);
  get diagnostics v_apps = row_count;

  delete from public.offer_passes p where p.created_at < now() - interval '180 days';
  get diagnostics v_passes = row_count;

  return jsonb_build_object('applications', v_apps, 'messages', v_messages, 'notes', v_notes, 'passes', v_passes);
end;
$$;

-- run_retention : corps inchangé (conformité), plus l'appel à la conservation de l'emploi.
create or replace function private.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warned int;
  v_reports int;
  v_identities int;
  v_audit int;
  v_notices int;
  v_emploi jsonb;
begin
  v_warned := private.warn_inactive_accounts();

  delete from public.reports r
   where r.target_deleted_at is not null
     and r.target_deleted_at < now() - make_interval(days => private.setting_int('report_retention_days', 365));
  get diagnostics v_reports = row_count;

  delete from private.banned_identities b
   where b.created_at < now() - make_interval(days => private.setting_int('banned_identity_retention_days', 1095));
  get diagnostics v_identities = row_count;

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

  if v_reports + v_identities + v_audit + v_notices > 0
     or (v_emploi ->> 'applications')::int + (v_emploi ->> 'messages')::int + (v_emploi ->> 'notes')::int > 0 then
    perform private.audit(null, 'retention.purged', 'retention', null,
      jsonb_build_object('reports', v_reports, 'banned_identities', v_identities,
                         'audit_log', v_audit, 'notices', v_notices, 'emploi', v_emploi));
  end if;
  return jsonb_build_object('warned', v_warned, 'reports', v_reports, 'banned_identities', v_identities,
                            'audit_log', v_audit, 'notices', v_notices, 'emploi', v_emploi);
end;
$$;

-- 4. Données d'une notification (Edge Function notify, clé de service) -------------------------------
-- Renvoie null si la notification est périmée (statut changé entre-temps) ; sinon :
--   { event, variant, audience: candidate|recruiter, recipients: [{ user_id, name }], vars, path, target_id }
-- target_id : ce que l'app candidat ouvre (push `{ type: "emploi", event, id }`) : la candidature
-- (application_*, interview_proposed, message), l'offre (invitation_received), le compte (diploma_verdict) ;
-- pour un recruteur, la candidature, l'entreprise ou l'offre.
-- vars : textes déjà prêts (offer, company, candidate, reason, date, count, level). Le nom du candidat
-- n'y figure que pour un événement postérieur au match.
create function public.server_emploi_notification(p_event text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app public.applications;
  v_offer public.offers;
  v_company public.companies;
  v_inv public.invitations;
  v_msg public.application_messages;
  v_slot public.interview_slots;
  v_candidate jsonb;
  v_members jsonb;
  v_count int;
  v_due timestamptz;
begin
  if not private.is_server_call() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_event = 'message' then
    select * into v_msg from public.application_messages m where m.id = p_id;
    if not found then
      return null;
    end if;
    p_id := v_msg.application_id;
  end if;

  if p_event in ('application_interested', 'application_rejected', 'application_closed', 'interview_proposed',
                 'interview_accepted', 'message') then
    select * into v_app from public.applications a where a.id = p_id;
    if not found then
      return null;
    end if;
    select * into v_offer from public.offers o where o.id = v_app.offer_id;
    select * into v_company from public.companies c where c.id = v_app.company_id;
    if (p_event = 'application_interested' and v_app.interested_at is null)
       or (p_event = 'application_rejected' and v_app.status <> 'rejected')
       or (p_event = 'application_closed' and v_app.status <> 'closed_no_response')
       or (p_event = 'interview_proposed' and not exists (
             select 1 from public.interview_slots s where s.application_id = v_app.id and s.status = 'proposed'))
       or (p_event in ('interview_accepted', 'message') and v_app.interested_at is null) then
      return null;
    end if;
    v_candidate := jsonb_build_array(jsonb_build_object(
      'user_id', v_app.candidate_id,
      'name', (select ci.first_name from public.candidate_identities ci where ci.user_id = v_app.candidate_id)));
    v_members := coalesce((select jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'name', cm.first_name))
                             from public.company_members cm where cm.company_id = v_app.company_id), '[]'::jsonb);

    if p_event = 'interview_accepted' then
      select * into v_slot from public.interview_slots s
       where s.application_id = v_app.id and s.status = 'accepted' order by s.responded_at desc nulls last limit 1;
      if not found then
        return null;
      end if;
      return jsonb_build_object('event', p_event, 'variant', null, 'audience', 'recruiter', 'recipients', v_members,
        'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name,
                                   'candidate', private.revealed_name(v_app), 'date', v_slot.starts_at,
                                   'mode', v_slot.mode),
        'path', '/recruteur/offres/' || v_offer.id || '/suivi?c=' || v_app.id, 'target_id', v_app.id);
    elsif p_event = 'message' then
      if v_msg.from_candidate then
        return jsonb_build_object('event', p_event, 'variant', 'to_recruiter', 'audience', 'recruiter',
          'recipients', v_members,
          'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name,
                                     'candidate', private.revealed_name(v_app), 'message_id', v_msg.id),
          'path', '/recruteur/offres/' || v_offer.id || '/suivi?c=' || v_app.id, 'target_id', v_app.id);
      end if;
      return jsonb_build_object('event', p_event, 'variant', 'to_candidate', 'audience', 'candidate',
        'recipients', v_candidate,
        'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name, 'message_id', v_msg.id),
        'path', '/applications/' || v_app.id, 'target_id', v_app.id);
    end if;
    return jsonb_build_object('event', p_event, 'variant', null, 'audience', 'candidate', 'recipients', v_candidate,
      'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name),
      'path', '/applications/' || v_app.id, 'target_id', v_app.id);

  elsif p_event = 'invitation_received' then
    select * into v_inv from public.invitations i where i.id = p_id;
    if not found or v_inv.status <> 'sent' then
      return null;
    end if;
    select * into v_offer from public.offers o where o.id = v_inv.offer_id;
    select * into v_company from public.companies c where c.id = v_inv.company_id;
    return jsonb_build_object('event', p_event, 'variant', null, 'audience', 'candidate',
      'recipients', jsonb_build_array(jsonb_build_object(
        'user_id', v_inv.candidate_id,
        'name', (select ci.first_name from public.candidate_identities ci where ci.user_id = v_inv.candidate_id))),
      'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name),
      'path', '/offers/' || v_offer.id, 'target_id', v_offer.id);

  elsif p_event in ('company_decided', 'deadline_reminder') then
    select * into v_company from public.companies c where c.id = p_id;
    if not found then
      return null;
    end if;
    v_members := coalesce((select jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'name', cm.first_name))
                             from public.company_members cm where cm.company_id = p_id), '[]'::jsonb);
    if p_event = 'company_decided' then
      if v_company.status = 'pending' then
        return null;
      end if;
      return jsonb_build_object('event', p_event, 'variant', v_company.status, 'audience', 'recruiter',
        'recipients', v_members,
        'vars', jsonb_build_object('company', v_company.display_name, 'reason', coalesce(v_company.status_reason, '')),
        'path', '/recruteur', 'target_id', p_id);
    end if;
    select count(*), min(a.due_at) into v_count, v_due from public.applications a
     where a.company_id = p_id and a.status in ('sent', 'seen') and a.due_at > now()
       and a.due_at <= now() + interval '48 hours';
    if v_count = 0 then
      return null;
    end if;
    return jsonb_build_object('event', p_event, 'variant', null, 'audience', 'recruiter', 'recipients', v_members,
      'vars', jsonb_build_object('company', v_company.display_name, 'count', v_count, 'date', v_due),
      'path', '/recruteur', 'target_id', p_id);

  elsif p_event = 'offer_decided' then
    select * into v_offer from public.offers o where o.id = p_id;
    if not found or v_offer.status not in ('published', 'rejected') then
      return null;
    end if;
    select * into v_company from public.companies c where c.id = v_offer.company_id;
    return jsonb_build_object('event', p_event, 'variant', v_offer.status, 'audience', 'recruiter',
      'recipients', coalesce((select jsonb_agg(jsonb_build_object('user_id', cm.user_id, 'name', cm.first_name))
                                from public.company_members cm where cm.company_id = v_offer.company_id), '[]'::jsonb),
      'vars', jsonb_build_object('offer', v_offer.title, 'company', v_company.display_name,
                                 'reason', coalesce(v_offer.status_reason, '')),
      'path', '/recruteur/offres/' || v_offer.id, 'target_id', v_offer.id);

  elsif p_event = 'diploma_verdict' then
    -- p_id = compte. Seuls les comptes de l'emploi reçoivent ce texte (sinon : verdict du dating).
    if private.emploi_kind(p_id) is null then
      return null;
    end if;
    return jsonb_build_object('event', p_event, 'variant', null, 'audience', 'candidate',
      'recipients', jsonb_build_array(jsonb_build_object(
        'user_id', p_id, 'name', (select ci.first_name from public.candidate_identities ci where ci.user_id = p_id))),
      'vars', jsonb_build_object('level', (select ua.level from public.user_access ua where ua.user_id = p_id)),
      'path', '/', 'target_id', p_id);
  end if;
  return null;
end;
$$;

revoke all on function private.close_overdue_applications(), private.send_deadline_reminders(),
  private.run_emploi_retention(), public.server_emploi_notification(text, uuid)
  from public, anon, authenticated;
grant execute on function private.close_overdue_applications(), private.send_deadline_reminders(),
  private.run_emploi_retention(), public.server_emploi_notification(text, uuid)
  to service_role;

-- 5. Temps réel : messages et créneaux d'entretien (la RLS et les droits par colonne s'appliquent).
alter publication supabase_realtime add table public.application_messages, public.interview_slots;

-- Sapios Emploi : fonctions internes partagées par les RPC (contrat §3, §6, §7).
-- Toutes dans le schéma private, jamais appelables par un client sauf mention.

-- 1. Comptes ----------------------------------------------------------------------------------------
create function private.emploi_kind(p_uid uuid)
returns public.emploi_account_kind
language sql
stable
security definer
set search_path = ''
as $$
  select ea.kind from public.emploi_accounts ea where ea.user_id = p_uid;
$$;

-- Appelant connecté et non banni ; met à jour la dernière activité (conservation, inactivité).
create function private.require_emploi_uid()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if exists (select 1 from public.profiles p where p.id = v_uid and p.status = 'banned') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  perform private.touch_activity(v_uid);
  return v_uid;
end;
$$;

create function private.require_candidate()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
begin
  if private.emploi_kind(v_uid) is distinct from 'candidate' then
    raise exception 'not_candidate' using errcode = 'P0001';
  end if;
  update public.candidates c set last_active_at = now()
   where c.user_id = v_uid and c.last_active_at < now() - interval '5 minutes';
  return v_uid;
end;
$$;

create function private.require_recruiter()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
begin
  if private.emploi_kind(v_uid) is distinct from 'recruiter' then
    raise exception 'not_recruiter' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Ligne d'appartenance de l'appelant (une seule entreprise par recruteur).
create function private.require_member()
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
  return v_member;
end;
$$;

create function private.require_company_offer(p_offer uuid)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
  v_offer public.offers;
begin
  select * into v_offer from public.offers o where o.id = p_offer and o.company_id = v_member.company_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_offer;
end;
$$;

create function private.require_company_application(p_app uuid)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members := private.require_member();
  v_app public.applications;
begin
  select * into v_app from public.applications a where a.id = p_app and a.company_id = v_member.company_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_app;
end;
$$;

-- 2. Conditions générales ---------------------------------------------------------------------------
create function private.emploi_terms_version(p_kind public.emploi_account_kind)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'candidate' then private.setting_text('emploi_terms_candidate_version', 'cgu-emploi-2026-11-brouillon')
    when 'recruiter' then private.setting_text('emploi_terms_recruiter_version', 'cgr-emploi-2026-11-brouillon')
  end;
$$;

create function private.emploi_terms_accepted(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.terms_acceptances t
     where t.user_id = p_uid and t.version = private.emploi_terms_version(private.emploi_kind(p_uid))
  );
$$;

-- 3. Candidat ---------------------------------------------------------------------------------------
-- Profil assez rempli pour voir des offres : la ligne candidates (champs obligatoires par contrainte)
-- et au moins 3 compétences.
create function private.candidate_complete(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.candidates c where c.user_id = p_uid)
     and (select count(*) from public.cv_skills s where s.user_id = p_uid) >= 3;
$$;

create function private.candidate_identity_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('first_name', ci.first_name, 'last_name', private.decrypt_text(ci.last_name_enc))
    from public.candidate_identities ci where ci.user_id = p_uid;
$$;

-- Badge diplôme (DiplomaBadge) : niveau vérifié par la revue humaine ; établissement masqué sur demande.
create function private.diploma_badge(p_uid uuid, p_hide_institution boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'level', ua.level,
    'study_field', ua.study_field,
    'institution', case when p_hide_institution then null else ua.institution end,
    'verified_at', ua.granted_at
  )
  from public.user_access ua
  where ua.user_id = p_uid and ua.level is not null;
$$;

create function private.candidate_profile_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', c.number,
    'target_role', c.target_role,
    'search_city', c.search_city,
    'search_postcode', c.search_postcode,
    'search_lat', extensions.st_y(c.search_location::extensions.geometry),
    'search_lng', extensions.st_x(c.search_location::extensions.geometry),
    'search_radius_km', c.search_radius_km,
    'contract_types', to_jsonb(c.contract_types),
    'salary_min_k', c.salary_min_k,
    'salary_max_k', c.salary_max_k,
    'remote_days_min', c.remote_days_min,
    'available_from', c.available_from,
    'experience_band', c.experience_band,
    'work_authorization', c.work_authorization,
    'looking_for', c.looking_for,
    'open_to_opportunities', c.open_to_opportunities,
    'show_institution', c.show_institution,
    'paused', c.paused
  )
  from public.candidates c where c.user_id = p_uid;
$$;

-- Durée d'une expérience en mois entiers (au moins 1), jusqu'à aujourd'hui si elle est en cours.
create function private.experience_months(p_start date, p_end date)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(1,
    (extract(year from age(coalesce(p_end, date_trunc('month', now())::date), p_start)) * 12
     + extract(month from age(coalesce(p_end, date_trunc('month', now())::date), p_start)))::int + 1);
$$;

-- CV anonyme (AnonymousCv, contrat §7) : exactement ce que voit un recruteur avant le match.
-- Jamais : prénom, nom, email, âge, genre, adresse, photo ; ni les dates des expériences.
create function private.anonymous_cv(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', c.number,
    'target_role', c.target_role,
    'experience_band', c.experience_band,
    'diploma', private.diploma_badge(p_uid, not c.show_institution),
    'experiences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', e.title,
               'employer', case when e.employer_hidden then null else e.employer end,
               'months', private.experience_months(e.start_month, e.end_month),
               'current', e.end_month is null) order by e.rank)
        from (select x.*, row_number() over (order by (x.end_month is null) desc, x.end_month desc nulls first,
                                                       x.start_month desc) as rank
                from public.cv_experiences x where x.user_id = p_uid) e
       where e.rank <= 2), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(s.label order by s.position) from public.cv_skills s
                         where s.user_id = p_uid), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('language', l.language, 'level', l.level)
                                            order by l.language)
                             from public.cv_languages l where l.user_id = p_uid), '[]'::jsonb),
    'salary_min_k', c.salary_min_k,
    'salary_max_k', c.salary_max_k,
    'available_from', c.available_from,
    'search_city', c.search_city,
    'search_radius_km', c.search_radius_km,
    'remote_days_min', c.remote_days_min,
    'work_authorization', c.work_authorization,
    'looking_for', c.looking_for
  )
  from public.candidates c where c.user_id = p_uid;
$$;

-- 4. Correspondances (contrat §6) --------------------------------------------------------------------
-- Pour chaque critère indispensable puis apprécié : un critère qui demande « bac+N » est rempli seulement si
-- le niveau vérifié du candidat (échelle européenne de user_access.level : 5 = Bac+2, 6 = Bac+3, 7 = Bac+5,
-- 8 = Bac+8) atteint le niveau de Bac+N (private.bac_level) ; une compétence citée dans le même critère ne
-- suffit pas. Tout autre critère est rempli si une compétence ou une langue du candidat, normalisée
-- (minuscules, sans accents ni ponctuation), est égale au critère ou y figure comme mot(s) entier(s).
-- Bac+N → niveau européen exigé : Bac+1 ou Bac+2 → 5, Bac+3 ou Bac+4 → 6, Bac+5 → 7, Bac+6 à Bac+8 → 8.
create function private.bac_level(p_years int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_years is null then null
              when p_years <= 2 then 5
              when p_years <= 4 then 6
              when p_years = 5 then 7
              else 8 end;
$$;

create function private.requirement_matches(p_offer public.offers, p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with terms as (
    select private.normalize_text(s.label) as n from public.cv_skills s where s.user_id = p_uid
    union
    select private.normalize_text(l.language) from public.cv_languages l where l.user_id = p_uid
  ),
  lvl as (
    select ua.level from public.user_access ua where ua.user_id = p_uid
  ),
  reqs as (
    select r.label, 'must'::text as kind, 0 as k, r.ord
      from unnest(p_offer.must_have) with ordinality as r(label, ord)
    union all
    select r.label, 'nice', 1, r.ord
      from unnest(p_offer.nice_to_have) with ordinality as r(label, ord)
  ),
  graded as (
    select q.*, private.bac_level((substring(lower(extensions.unaccent(q.label)) from 'bac\s*\+\s*([1-8])'))::int) as bac
      from reqs q
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', q.label,
           'kind', q.kind,
           'met', case when q.bac is not null
                       then coalesce((select l.level from lvl l) >= q.bac, false)
                       else exists (
                              select 1 from terms t
                               where t.n <> ''
                                 and (' ' || private.normalize_text(q.label) || ' ') like ('% ' || t.n || ' %'))
                  end
         ) order by q.k, q.ord), '[]'::jsonb)
  from graded q;
$$;

create function public.emploi_requirement_matches(p_offer uuid, p_candidate uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.requirement_matches(o, p_candidate) from public.offers o where o.id = p_offer;
$$;

create function private.met_count(p_matches jsonb, p_kind text default null)
returns int
language sql
immutable
set search_path = ''
as $$
  select count(*)::int from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) m
   where (m ->> 'met')::boolean and (p_kind is null or m ->> 'kind' = p_kind);
$$;

-- 5. Offres et entreprises --------------------------------------------------------------------------
create function private.company_summary_json(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'display_name', c.display_name, 'city', c.city, 'naf_label', c.naf_label,
                            'headcount_band', c.headcount_band, 'verified', c.status = 'verified')
    from public.companies c where c.id = p_company;
$$;

-- Photos d'une offre (OfferPhoto[]) ; p_public : seulement les photos approuvées.
create function private.offer_photos_json(p_offer uuid, p_public boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'storage_path', p.storage_path,
                                               'position', p.position)
                            order by (p.kind <> 'workplace'), p.position, p.created_at), '[]'::jsonb)
    from public.offer_photos p
   where p.offer_id = p_offer and (not p_public or p.moderation = 'approved');
$$;

-- Distance en km entre l'offre et le centre de la zone de recherche du candidat (null si inconnue).
create function private.offer_distance_km(p_offer public.offers, p_uid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select round(extensions.st_distance(p_offer.location, c.search_location) / 1000.0)::int
    from public.candidates c where c.user_id = p_uid and p_offer.location is not null;
$$;

create function private.offer_card_json(p_offer public.offers, p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_offer.id,
    'title', p_offer.title,
    'company', private.company_summary_json(p_offer.company_id),
    'contract', p_offer.contract,
    'city', p_offer.city,
    'distance_km', private.offer_distance_km(p_offer, p_uid),
    'remote_days', p_offer.remote_days,
    'salary_min_k', p_offer.salary_min_k,
    'salary_max_k', p_offer.salary_max_k,
    'start_label', p_offer.start_label,
    'experience_band', p_offer.experience_band,
    'photos', private.offer_photos_json(p_offer.id, true),
    'matches', private.requirement_matches(p_offer, p_uid),
    'published_at', p_offer.published_at,
    'response_days', p_offer.response_days
  );
$$;

create function private.slot_json(p_slot public.interview_slots)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', p_slot.id, 'starts_at', p_slot.starts_at, 'duration_min', p_slot.duration_min,
                            'mode', p_slot.mode, 'location', p_slot.location, 'with_whom', p_slot.with_whom,
                            'status', p_slot.status);
$$;

-- Délai moyen de réponse (jours, une décimale) sur les candidatures reçues depuis 90 jours. Une
-- candidature close sans réponse compte avec son délai réel : le retard pèse sur la moyenne.
-- Null sous 3 réponses.
create function private.company_avg_response_days(p_company uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) >= 3 then round(avg(extract(epoch from (r.answered_at - r.created_at)) / 86400.0)::numeric, 1) end
    from (select a.created_at, coalesce(a.decided_at, a.closed_at) as answered_at
            from public.applications a
           where a.company_id = p_company
             and a.created_at > now() - interval '90 days'
             and a.status in ('interested', 'interview', 'offer_made', 'hired', 'rejected', 'closed_no_response')
             and coalesce(a.decided_at, a.closed_at) is not null) r;
$$;

-- 6. Avis et notifications ---------------------------------------------------------------------------
create function private.emploi_notice(p_uid uuid, p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.member_notices (user_id, kind, payload) values (p_uid, p_kind, coalesce(p_payload, '{}'::jsonb));
$$;

create function private.company_notice(p_company uuid, p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.member_notices (user_id, kind, payload)
  select cm.user_id, p_kind, coalesce(p_payload, '{}'::jsonb) from public.company_members cm where cm.company_id = p_company;
$$;

-- Push et email par l'Edge Function notify (contrat §8). N'échoue jamais.
create function private.emploi_notify(p_event text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_edge_function('notify', jsonb_build_object('type', 'emploi', 'event', p_event, 'id', p_id));
end;
$$;

-- Charge utile commune des avis de candidature.
create function private.application_notice_payload(p_app public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('application_id', p_app.id, 'offer_title', o.title, 'company_name', c.display_name)
    from public.offers o join public.companies c on c.id = o.company_id where o.id = p_app.offer_id;
$$;

-- 7. Contrôles de texte des offres -------------------------------------------------------------------
create function private.banned_word_in(p_texts text[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with hay as (select ' ' || private.normalize_text(array_to_string(p_texts, ' ')) || ' ' as h),
       words as (
         select w.value as word from jsonb_array_elements_text(
           coalesce((select s.value from public.app_settings s where s.key = 'offer_banned_words'), '[]'::jsonb)) w
       )
  select w.word from words w, hay
   where private.normalize_text(w.word) <> ''
     and hay.h like '% ' || private.normalize_text(w.word) || ' %'
   limit 1;
$$;

create function private.mentions_language(p_texts text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from unnest(p_texts) t
     where lower(extensions.unaccent(t)) ~ '\m(anglais|allemand|espagnol|italien|portugais|neerlandais|chinois|mandarin|japonais|arabe|russe|english|langue|bilingue)\M'
  );
$$;

-- Clé de Luhn d'un SIREN.
create function private.siren_valid(p_siren text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum int := 0;
  v_d int;
begin
  if p_siren is null or p_siren !~ '^[0-9]{9}$' then
    return false;
  end if;
  for i in 0..8 loop
    v_d := substr(p_siren, 9 - i, 1)::int;
    if i % 2 = 1 then
      v_d := v_d * 2;
      if v_d > 9 then
        v_d := v_d - 9;
      end if;
    end if;
    v_sum := v_sum + v_d;
  end loop;
  return v_sum % 10 = 0;
end;
$$;

-- Droits : rien d'exécutable par un client ici, sauf ce dont la RLS a besoin (migration précédente).
revoke all on function
  private.emploi_kind(uuid), private.require_emploi_uid(), private.require_candidate(), private.require_recruiter(),
  private.require_member(), private.require_company_offer(uuid), private.require_company_application(uuid),
  private.emploi_terms_version(public.emploi_account_kind), private.emploi_terms_accepted(uuid),
  private.candidate_complete(uuid), private.candidate_identity_json(uuid), private.diploma_badge(uuid, boolean),
  private.candidate_profile_json(uuid), private.experience_months(date, date), private.anonymous_cv(uuid),
  private.requirement_matches(public.offers, uuid), private.met_count(jsonb, text), private.bac_level(int),
  private.company_summary_json(uuid), private.offer_photos_json(uuid, boolean),
  private.offer_distance_km(public.offers, uuid), private.offer_card_json(public.offers, uuid),
  private.slot_json(public.interview_slots), private.company_avg_response_days(uuid),
  private.emploi_notice(uuid, text, jsonb), private.company_notice(uuid, text, jsonb),
  private.emploi_notify(text, uuid), private.application_notice_payload(public.applications),
  private.banned_word_in(text[]), private.mentions_language(text[]), private.siren_valid(text)
  from public, anon, authenticated;
grant execute on function
  private.emploi_kind(uuid), private.require_emploi_uid(), private.require_candidate(), private.require_recruiter(),
  private.require_member(), private.require_company_offer(uuid), private.require_company_application(uuid),
  private.emploi_terms_version(public.emploi_account_kind), private.emploi_terms_accepted(uuid),
  private.candidate_complete(uuid), private.candidate_identity_json(uuid), private.diploma_badge(uuid, boolean),
  private.candidate_profile_json(uuid), private.experience_months(date, date), private.anonymous_cv(uuid),
  private.requirement_matches(public.offers, uuid), private.met_count(jsonb, text), private.bac_level(int),
  private.company_summary_json(uuid), private.offer_photos_json(uuid, boolean),
  private.offer_distance_km(public.offers, uuid), private.offer_card_json(public.offers, uuid),
  private.slot_json(public.interview_slots), private.company_avg_response_days(uuid),
  private.emploi_notice(uuid, text, jsonb), private.company_notice(uuid, text, jsonb),
  private.emploi_notify(text, uuid), private.application_notice_payload(public.applications),
  private.banned_word_in(text[]), private.mentions_language(text[]), private.siren_valid(text)
  to service_role;
-- Correspondances d'un candidat quelconque : serveur et tests seulement, jamais un client.
revoke all on function public.emploi_requirement_matches(uuid, uuid) from public, anon, authenticated;
grant execute on function public.emploi_requirement_matches(uuid, uuid) to service_role;

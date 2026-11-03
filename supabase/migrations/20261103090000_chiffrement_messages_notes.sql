-- Chiffrement des messages et des notes internes des recruteurs.
--
-- `application_messages.body` et `.context`, `application_notes.body` deviennent `body_enc` / `context_enc`
-- (bytea, pgcrypto en AES-256 avec la clé Vault `field_key`, comme `candidate_identities.last_name_enc`).
-- Aucun client ne lit une colonne `_enc` : le clair ne passe que par les RPC, et seulement pour les
-- participants (le candidat, les membres de l'entreprise). Aucune RPC d'admin ne lit les messages.
--
-- Temps réel : la table reste publiée ; Realtime n'envoie que les colonnes que le rôle peut lire, donc un
-- événement sans contenu. Les clients relisent la conversation par `get_application_messages`.

------------------------------------------------------------------------------------------------
-- 1. Colonnes chiffrées, reprise des lignes existantes, suppression du clair
------------------------------------------------------------------------------------------------

alter table public.application_messages
  add column body_enc bytea,
  add column context_enc bytea;
alter table public.application_notes add column body_enc bytea;

update public.application_messages
   set body_enc = private.encrypt_text(body), context_enc = private.encrypt_text(context)
 where body_enc is null;
update public.application_notes set body_enc = private.encrypt_text(body) where body_enc is null;

alter table public.application_messages alter column body_enc set not null;
alter table public.application_notes alter column body_enc set not null;

-- Les contrôles de longueur suivent les colonnes en clair ; ils sont faits par send_application_message
-- (1 à 2000 caractères, contexte 300 au plus) et add_application_note (1 à 1000).
alter table public.application_messages drop column body, drop column context;
alter table public.application_notes drop column body;

comment on column public.application_messages.body_enc is
  'Texte du message, chiffré (pgp_sym_encrypt, AES-256, clé Vault field_key). Lu par get_application_messages.';
comment on column public.application_messages.context_enc is
  'Point de l''offre cité, chiffré comme body_enc.';
comment on column public.application_notes.body_enc is
  'Note interne du recruteur, chiffrée (pgp_sym_encrypt, AES-256, clé Vault field_key). Lue par get_recruiter_application.';

------------------------------------------------------------------------------------------------
-- 2. Droits : métadonnées seulement
------------------------------------------------------------------------------------------------

-- application_notes avait un droit de lecture sur toute la table : il couvrirait body_enc.
revoke select on public.application_notes from authenticated, anon;
grant select (id, application_id, author_id, created_at) on public.application_notes to authenticated;
revoke select (body_enc, context_enc) on public.application_messages from authenticated, anon;

------------------------------------------------------------------------------------------------
-- 3. RPC : chiffrement à l'écriture, déchiffrement pour les participants
------------------------------------------------------------------------------------------------

create or replace function private.export_emploi_data_base()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_kind public.emploi_account_kind := private.emploi_kind(v_uid);
  v_member public.company_members;
  v_out jsonb := jsonb_build_object('exported_at', now(), 'kind', v_kind);
begin
  v_out := v_out || jsonb_build_object(
    'terms_acceptances', coalesce((select jsonb_agg(jsonb_build_object('version', t.version, 'accepted_at', t.accepted_at)
                                                    order by t.accepted_at)
                                     from public.terms_acceptances t where t.user_id = v_uid), '[]'::jsonb));
  if v_kind = 'candidate' then
    v_out := v_out || jsonb_build_object(
      'identity', private.candidate_identity_json(v_uid),
      'profile', private.candidate_profile_json(v_uid),
      'cv', jsonb_build_object(
        'experiences', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.position)
                                   from public.cv_experiences e where e.user_id = v_uid), '[]'::jsonb),
        'skills', coalesce((select jsonb_agg(s.label order by s.position) from public.cv_skills s where s.user_id = v_uid), '[]'::jsonb),
        'languages', coalesce((select jsonb_agg(jsonb_build_object('language', l.language, 'level', l.level))
                                 from public.cv_languages l where l.user_id = v_uid), '[]'::jsonb)),
      'diploma', private.diploma_badge(v_uid, false),
      'applications', coalesce((
        select jsonb_agg(jsonb_build_object(
          'offer_title', o.title, 'company', c.display_name, 'status', a.status, 'note', a.note,
          'note_target_label', a.note_target_label, 'created_at', a.created_at, 'seen_at', a.seen_at,
          'due_at', a.due_at, 'decided_at', a.decided_at, 'closed_at', a.closed_at,
          'refusal_reason', a.refusal_reason, 'refusal_message', a.refusal_message,
          'recruiter_notes', coalesce((select jsonb_agg(jsonb_build_object('body', private.decrypt_text(n.body_enc), 'created_at', n.created_at)
                                                        order by n.created_at)
                                         from public.application_notes n where n.application_id = a.id), '[]'::jsonb),
          'messages', coalesce((select jsonb_agg(jsonb_build_object('from_me', m.from_candidate, 'body', private.decrypt_text(m.body_enc),
                                                                    'context', private.decrypt_text(m.context_enc), 'created_at', m.created_at)
                                                 order by m.created_at)
                                  from public.application_messages m where m.application_id = a.id), '[]'::jsonb),
          'interview_slots', coalesce((select jsonb_agg(private.slot_json(s) order by s.starts_at)
                                         from public.interview_slots s where s.application_id = a.id), '[]'::jsonb))
          order by a.created_at)
          from public.applications a join public.offers o on o.id = a.offer_id
          join public.companies c on c.id = a.company_id
         where a.candidate_id = v_uid), '[]'::jsonb),
      'invitations', coalesce((
        select jsonb_agg(jsonb_build_object('offer_title', o.title, 'company', c.display_name, 'message', i.message,
                                            'status', i.status, 'created_at', i.created_at) order by i.created_at)
          from public.invitations i join public.offers o on o.id = i.offer_id
          join public.companies c on c.id = i.company_id where i.candidate_id = v_uid), '[]'::jsonb),
      'company_blocks', coalesce((
        select jsonb_agg(jsonb_build_object('company', c.display_name, 'created_at', b.created_at))
          from public.company_blocks b join public.companies c on c.id = b.company_id where b.candidate_id = v_uid), '[]'::jsonb),
      'passes', (select count(*) from public.offer_passes p where p.user_id = v_uid)
    );
  elsif v_kind = 'recruiter' then
    select * into v_member from public.company_members cm where cm.user_id = v_uid;
    v_out := v_out || jsonb_build_object(
      'membership', case when v_member.user_id is null then null else jsonb_build_object(
        'role', v_member.role, 'job_title', v_member.job_title, 'first_name', v_member.first_name,
        'created_at', v_member.created_at) end,
      'company', (select to_jsonb(c) - 'created_by' - 'verified_by' from public.companies c where c.id = v_member.company_id),
      'offers', coalesce((select jsonb_agg(to_jsonb(o) - 'location' - 'created_by' order by o.created_at)
                            from public.offers o where o.company_id = v_member.company_id), '[]'::jsonb),
      'notes_written', coalesce((select jsonb_agg(jsonb_build_object('body', private.decrypt_text(n.body_enc), 'created_at', n.created_at)
                                                  order by n.created_at)
                                   from public.application_notes n where n.author_id = v_uid), '[]'::jsonb),
      'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('body', private.decrypt_text(m.body_enc), 'created_at', m.created_at)
                                                  order by m.created_at)
                                   from public.application_messages m where m.sender_id = v_uid), '[]'::jsonb)
    );
  end if;
  return v_out;
end;
$$;

create or replace function public.add_application_note(p_id uuid, p_body text)
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
  insert into public.application_notes (application_id, author_id, body_enc)
  values (p_id, auth.uid(), private.encrypt_text(v_body))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_application_messages(p_id uuid)
returns SETOF jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_app public.applications;
  v_side text;
begin
  select * into v_app from public.applications a where a.id = p_id;
  v_side := case when found then private.application_side(v_app, v_uid) end;
  if v_side is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.interested_at is null then
    raise exception 'not_matched' using errcode = 'P0001';
  end if;
  update public.application_messages m set read_at = now()
   where m.application_id = p_id and m.read_at is null and m.from_candidate = (v_side = 'company');
  return query
    select jsonb_build_object('id', m.id, 'application_id', m.application_id,
                              'mine', m.from_candidate = (v_side = 'candidate'),
                              'body', private.decrypt_text(m.body_enc), 'context', private.decrypt_text(m.context_enc), 'created_at', m.created_at, 'read_at', m.read_at)
      from public.application_messages m where m.application_id = p_id order by m.created_at, m.id;
end;
$$;

create or replace function public.get_my_conversations()
returns SETOF jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_company uuid := private.member_company(v_uid);
begin
  return query
    select jsonb_build_object(
      'application_id', a.id,
      'status', a.status,
      'offer_title', o.title,
      'counterpart', case when a.candidate_id = v_uid then c.display_name
                          else coalesce(ci.first_name || ' ' || private.decrypt_text(ci.last_name_enc),
                                        'Candidat·e n° ' || lpad(cd.number::text, 4, '0')) end,
      'last_message', private.decrypt_text(lm.body_enc),
      'last_message_at', lm.created_at,
      'unread_count', (select count(*) from public.application_messages m
                        where m.application_id = a.id and m.read_at is null
                          and m.from_candidate = (a.candidate_id <> v_uid))
    )
    from public.applications a
    join public.offers o on o.id = a.offer_id
    join public.companies c on c.id = a.company_id
    left join public.candidate_identities ci on ci.user_id = a.candidate_id
    left join public.candidates cd on cd.user_id = a.candidate_id
    left join lateral (select m.body_enc, m.created_at from public.application_messages m
                        where m.application_id = a.id order by m.created_at desc limit 1) lm on true
    where a.interested_at is not null
      and (a.candidate_id = v_uid or (v_company is not null and a.company_id = v_company))
    order by coalesce(lm.created_at, a.interested_at) desc;
end;
$$;

create or replace function public.get_recruiter_application(p_id uuid)
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
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', private.decrypt_text(n.body_enc),
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

create or replace function public.send_application_message(p_id uuid, p_body text, p_context text default null::text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_emploi_uid();
  v_app public.applications;
  v_side text;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  select * into v_app from public.applications a where a.id = p_id;
  v_side := case when found then private.application_side(v_app, v_uid) end;
  if v_side is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_app.interested_at is null or v_app.status in ('rejected', 'withdrawn', 'closed_no_response') then
    raise exception 'not_matched' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 2000 or char_length(coalesce(p_context, '')) > 300 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into public.application_messages (application_id, sender_id, from_candidate, body_enc, context_enc)
  values (p_id, v_uid, v_side = 'candidate', private.encrypt_text(v_body),
          private.encrypt_text(nullif(btrim(coalesce(p_context, '')), '')))
  returning id into v_id;
  perform private.emploi_notify('message', v_id);
  return v_id;
end;
$$;

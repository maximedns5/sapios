-- Lot 1 : modération après publication des textes du profil (D6).
-- Un filtre automatique repère coordonnées, liens et mots de la liste `moderation_blocklist` ;
-- le texte reste visible mais part dans la file `content_flags`. Un admin le garde ou le retire,
-- avec un motif transmis au membre (`member_notices`). Un signalement peut viser un texte précis.

-- Utilitaires ---------------------------------------------------------------------------------

-- Match actif et sans blocage entre deux comptes (thèse « après un match », get_profile).
create function private.is_matched(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.matches m
    where m.user_a = least(p_a, p_b) and m.user_b = greatest(p_a, p_b)
      and m.unmatched_at is null
  ) and not private.is_blocked_pair(p_a, p_b);
$$;

-- Texte comparable : minuscules, sans accents ni ponctuation.
create function private.normalize_text(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Motifs repérés par le filtre automatique (tableau vide : rien à signaler).
create function private.content_flag_reasons(p_text text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text := coalesce(p_text, '');
  v_norm text;
  v_reasons text[] := '{}';
  v_word text;
begin
  if btrim(v_text) = '' then
    return v_reasons;
  end if;
  v_norm := ' ' || private.normalize_text(v_text) || ' ';

  -- Téléphone : 9 chiffres ou plus, séparés au plus d'un espace, point ou tiret, ou indicatif +XX suivi
  -- d'au moins 6 chiffres. Faux positifs possibles (« 1789 1815 1914 ») : le texte n'est que mis en file.
  if v_text ~ '\d([[:space:].-]?\d){8,}' or v_text ~ '\+[[:space:]]?\d{2}([[:space:].-]?\d){6,}' then
    v_reasons := array_append(v_reasons, 'phone');
  end if;
  if v_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then
    v_reasons := array_append(v_reasons, 'email');
  elsif v_text ~ '(^|[^[:alnum:]_])@[[:alnum:]_.]{2,}' then
    v_reasons := array_append(v_reasons, 'handle');
  end if;
  -- Liens, hors domaine d'une adresse email déjà repérée.
  v_text := regexp_replace(v_text, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', ' ', 'gi');
  if v_text ~* '(https?://|www\.)'
     or v_text ~* '[[:alnum:]-]+\.(com|fr|net|org|io|me|co|be|ch|ly|gg|app|link)\y' then
    v_reasons := array_append(v_reasons, 'url');
  end if;
  for v_word in
    select private.normalize_text(w) from jsonb_array_elements_text(
      coalesce((select s.value from public.app_settings s where s.key = 'moderation_blocklist'), '[]'::jsonb)) w
  loop
    if v_word <> '' and strpos(v_norm, ' ' || v_word || ' ') > 0 then
      v_reasons := array_append(v_reasons, 'word');
      exit;
    end if;
  end loop;
  return v_reasons;
end;
$$;

-- Ajoute un élément à la file, ou complète l'entrée déjà ouverte pour cet élément.
create function private.queue_content_flag(
  p_user uuid,
  p_kind public.content_kind,
  p_item uuid,
  p_excerpt text,
  p_reasons text[],
  p_source text,
  p_report uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.content_flags (user_id, kind, item_id, excerpt, reasons, source, report_id)
  values (p_user, p_kind, p_item, left(coalesce(p_excerpt, ''), 500), coalesce(p_reasons, '{}'), p_source, p_report)
  on conflict (user_id, kind, coalesce(item_id, user_id)) where status = 'open'
  do update set
    excerpt = excluded.excerpt,
    reasons = (select coalesce(array_agg(distinct r order by r), '{}')
                 from unnest(public.content_flags.reasons || excluded.reasons) r),
    source = case when excluded.source = 'report' then 'report' else public.content_flags.source end,
    report_id = coalesce(public.content_flags.report_id, excluded.report_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Triggers des textes du profil ----------------------------------------------------------------
-- Écriture par le membre : texte nettoyé, statut recalculé à chaque changement de texte
-- (un texte retiré puis modifié repasse en file). Les admins et le serveur écrivent librement
-- (décision de modération, données de test). Le client n'a pas le droit d'écrire le statut.
create function private.profile_content_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trusted boolean := private.is_server_call() or public.is_admin();
  v_kind public.content_kind;
  v_item uuid;
  v_text text;
  v_changed boolean;
  v_reasons text[];
begin
  if tg_table_name = 'profile_answers' then
    v_kind := 'answer';
    new.answer := btrim(new.answer);
    if (tg_op = 'INSERT' or new.prompt_key is distinct from old.prompt_key)
       and not exists (select 1 from public.profile_prompts pr where pr.key = new.prompt_key and pr.active) then
      raise exception 'prompt_inactive' using errcode = 'P0001';
    end if;
    v_item := new.id;
    v_text := new.answer;
    v_changed := tg_op = 'INSERT' or new.answer is distinct from old.answer;
  elsif tg_table_name = 'profile_books' then
    v_kind := 'book';
    new.title := btrim(new.title);
    new.author := nullif(btrim(new.author), '');
    v_item := new.id;
    v_text := new.title || coalesce(' — ' || new.author, '');
    v_changed := tg_op = 'INSERT' or new.title is distinct from old.title or new.author is distinct from old.author;
  else
    v_kind := 'thesis';
    new.line := btrim(new.line);
    v_item := null;
    v_text := new.line;
    v_changed := tg_op = 'INSERT' or new.line is distinct from old.line;
  end if;

  new.updated_at := now();
  if v_trusted or not v_changed then
    return new;
  end if;

  v_reasons := private.content_flag_reasons(v_text);
  if tg_op = 'UPDATE' and old.moderation_status = 'rejected' then
    v_reasons := array_append(v_reasons, 'edited_after_removal');
  end if;
  if cardinality(v_reasons) = 0 then
    new.moderation_status := 'approved';
  else
    new.moderation_status := 'pending';
    perform private.queue_content_flag(new.user_id, v_kind, v_item, v_text, v_reasons, 'auto', null);
  end if;
  return new;
end;
$$;

-- Le membre supprime son texte : l'entrée ouverte de la file est close (`withdrawn`).
create function private.profile_content_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profile_theses' then
    update public.content_flags f set status = 'withdrawn', handled_at = now()
     where f.status = 'open' and f.user_id = old.user_id and f.kind = 'thesis';
  else
    update public.content_flags f set status = 'withdrawn', handled_at = now()
     where f.status = 'open' and f.user_id = old.user_id and f.item_id = old.id;
  end if;
  return old;
end;
$$;

create trigger profile_answers_before_write before insert or update on public.profile_answers
  for each row execute function private.profile_content_before_write();
create trigger profile_books_before_write before insert or update on public.profile_books
  for each row execute function private.profile_content_before_write();
create trigger profile_theses_before_write before insert or update on public.profile_theses
  for each row execute function private.profile_content_before_write();

create trigger profile_answers_after_delete after delete on public.profile_answers
  for each row execute function private.profile_content_after_delete();
create trigger profile_books_after_delete after delete on public.profile_books
  for each row execute function private.profile_content_after_delete();
create trigger profile_theses_after_delete after delete on public.profile_theses
  for each row execute function private.profile_content_after_delete();

-- Texte courant d'un élément (file de modération, signalement).
create function private.content_text(p_user uuid, p_kind public.content_kind, p_item uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'answer' then (select a.answer from public.profile_answers a where a.id = p_item and a.user_id = p_user)
    when 'book' then (select b.title || coalesce(' — ' || b.author, '') from public.profile_books b
                       where b.id = p_item and b.user_id = p_user)
    else (select t.line from public.profile_theses t where t.user_id = p_user)
  end;
$$;

-- Statut de modération d'un élément (écrit par le serveur uniquement).
create function private.set_content_status(p_user uuid, p_kind public.content_kind, p_item uuid,
                                           p_status public.photo_moderation)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'answer' then
    update public.profile_answers a set moderation_status = p_status where a.id = p_item and a.user_id = p_user;
  elsif p_kind = 'book' then
    update public.profile_books b set moderation_status = p_status where b.id = p_item and b.user_id = p_user;
  else
    update public.profile_theses t set moderation_status = p_status where t.user_id = p_user;
  end if;
  return found;
end;
$$;

-- Back-office ---------------------------------------------------------------------------------

create function public.admin_list_flagged_content(p_status public.content_flag_status default 'open')
returns table (
  id uuid, user_id uuid, display_name text, email text, kind public.content_kind, item_id uuid,
  prompt_key text, current_text text, item_status public.photo_moderation, excerpt text, reasons text[],
  source text, report_id uuid, report_reason text, report_details text, status public.content_flag_status,
  decision_reason text, handled_by uuid, handled_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select f.id, f.user_id, p.display_name, u.email::text, f.kind, f.item_id,
         a.prompt_key,
         private.content_text(f.user_id, f.kind, f.item_id),
         coalesce(a.moderation_status, b.moderation_status, t.moderation_status),
         f.excerpt, f.reasons, f.source, f.report_id, r.reason, r.details, f.status,
         f.decision_reason, f.handled_by, f.handled_at, f.created_at
  from public.content_flags f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  left join public.profile_answers a on f.kind = 'answer' and a.id = f.item_id
  left join public.profile_books b on f.kind = 'book' and b.id = f.item_id
  left join public.profile_theses t on f.kind = 'thesis' and t.user_id = f.user_id
  left join public.reports r on r.id = f.report_id
  where p_status is null or f.status = p_status
  order by f.created_at asc
  limit 500;
end;
$$;

-- Décision : `keep` (le texte reste, statut approved) ou `remove` (statut rejected, invisible des
-- autres membres, motif obligatoire envoyé au membre).
create function public.admin_moderate_content(p_flag_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_flag public.content_flags;
  v_reason text := nullif(btrim(p_reason), '');
  v_text text;
  v_prompt text;
  v_exists boolean;
begin
  if p_decision is null or p_decision not in ('keep', 'remove') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'remove' and v_reason is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into v_flag from public.content_flags f where f.id = p_flag_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_flag.status <> 'open' then
    raise exception 'already_handled' using errcode = 'P0001';
  end if;

  v_text := coalesce(private.content_text(v_flag.user_id, v_flag.kind, v_flag.item_id), v_flag.excerpt);
  if v_flag.kind = 'answer' then
    select a.prompt_key into v_prompt from public.profile_answers a where a.id = v_flag.item_id;
  end if;
  v_exists := private.set_content_status(v_flag.user_id, v_flag.kind, v_flag.item_id,
    case when p_decision = 'remove' then 'rejected' else 'approved' end::public.photo_moderation);

  update public.content_flags
     set status = case when p_decision = 'remove' then 'removed' else 'kept' end::public.content_flag_status,
         decision_reason = left(v_reason, 500), handled_by = v_admin, handled_at = now()
   where id = p_flag_id;

  if p_decision = 'remove' and v_exists then
    insert into public.member_notices (user_id, kind, payload)
    values (v_flag.user_id, 'content_removed', jsonb_build_object(
      'content_kind', v_flag.kind,
      'item_id', v_flag.item_id,
      'prompt_key', v_prompt,
      'excerpt', left(v_text, 200),
      'reason', left(v_reason, 500)));
  end if;

  perform private.audit(v_admin, 'content.' || p_decision, 'content_flags', p_flag_id::text,
    jsonb_build_object('user_id', v_flag.user_id, 'kind', v_flag.kind, 'item_id', v_flag.item_id,
                       'reason', v_reason, 'reasons', v_flag.reasons, 'source', v_flag.source));
end;
$$;

-- Membre ---------------------------------------------------------------------------------------

-- Avis lu (disparaît de get_my_state.notices).
create function public.ack_notice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.member_notices n set read_at = now()
   where n.id = p_id and n.user_id = v_uid and n.read_at is null;
end;
$$;

-- Signalement, éventuellement d'un texte précis du profil (il part alors dans la file de
-- modération, en restant visible jusqu'à la décision). Compatible avec l'appel à 3 arguments.
drop function public.report_user(uuid, text, text);

create function public.report_user(
  p_target uuid,
  p_reason text,
  p_details text,
  p_content_kind public.content_kind default null,
  p_content_item uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_text text;
begin
  if not private.is_not_banned() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_target is null or p_target = v_uid or coalesce(btrim(p_reason), '') = ''
     or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_content_kind is not null then
    if (p_content_kind = 'thesis') <> (p_content_item is null) then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    v_text := private.content_text(p_target, p_content_kind, p_content_item);
    if v_text is null then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  elsif p_content_item is not null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_id, reason, details, content_kind, content_item_id)
  values (v_uid, p_target, left(btrim(p_reason), 100), left(nullif(btrim(p_details), ''), 2000),
          p_content_kind, p_content_item)
  returning id into v_id;

  if p_content_kind is not null then
    perform private.queue_content_flag(p_target, p_content_kind, p_content_item, v_text,
                                       array['report:' || left(btrim(p_reason), 40)], 'report', v_id);
    -- Le texte reste visible ; un texte déjà retiré le reste.
    if private.content_text(p_target, p_content_kind, p_content_item) is not null then
      if p_content_kind = 'answer' then
        update public.profile_answers a set moderation_status = 'pending'
         where a.id = p_content_item and a.moderation_status = 'approved';
      elsif p_content_kind = 'book' then
        update public.profile_books b set moderation_status = 'pending'
         where b.id = p_content_item and b.moderation_status = 'approved';
      else
        update public.profile_theses t set moderation_status = 'pending'
         where t.user_id = p_target and t.moderation_status = 'approved';
      end if;
    end if;
  end if;
  return v_id;
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.admin_list_flagged_content(public.content_flag_status),
  public.admin_moderate_content(uuid, text, text),
  public.ack_notice(uuid),
  public.report_user(uuid, text, text, public.content_kind, uuid)
from public, anon;

grant execute on function
  public.admin_list_flagged_content(public.content_flag_status),
  public.admin_moderate_content(uuid, text, text),
  public.ack_notice(uuid),
  public.report_user(uuid, text, text, public.content_kind, uuid)
to authenticated, service_role;

-- Conformité : durées de conservation (AIPD sections 2, 4 et 7 ; CGU art. 5.5).
--   1. Comptes inactifs : avertissement après `inactive_warning_days`, suppression
--      `inactive_grace_days` plus tard par l'Edge Function `purge-inactive` (jamais un admin).
--   2. Signalements conservés, pseudonymisés, après la suppression du compte visé ; purgés
--      `report_retention_days` après cette suppression.
--   3. Identités exclues : empreintes (HMAC poivré, poivre dans Vault) de l'email et du couple
--      nom légal + date de naissance d'un compte banni supprimé ; une réinscription est bannie.
--   4. Purges : journal d'audit après `audit_retention_days`, avis lus après `notice_retention_days`.
-- Une tâche pg_cron quotidienne exécute tout (private.run_retention), une autre déclenche
-- `purge-inactive` s'il y a des comptes à supprimer.

create extension if not exists pgcrypto with schema extensions;

-- Réglages (noms et valeurs par défaut fixés avec le back-office) --------------------------------
insert into public.app_settings (key, value, description) values
  ('inactive_warning_days', '730', 'Jours sans activité avant l''avertissement de suppression du compte'),
  ('inactive_grace_days', '30', 'Jours entre l''avertissement et la suppression d''un compte inactif'),
  ('report_retention_days', '365', 'Jours de conservation d''un signalement après la suppression du compte visé'),
  ('audit_retention_days', '1825', 'Jours de conservation du journal d''audit'),
  ('banned_identity_retention_days', '1095', 'Jours de conservation des empreintes d''un compte banni supprimé'),
  ('notice_retention_days', '365', 'Jours de conservation d''un avis lu par le membre')
on conflict (key) do nothing;

-- 1. Comptes inactifs ---------------------------------------------------------------------------
-- Table privée : l'avertissement n'est lisible par personne côté client (pas même son titulaire,
-- qui reçoit un avis et un email).
create table private.inactivity_warnings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  warned_at timestamptz not null default now(),
  delete_after timestamptz not null
);

-- Toute activité efface l'avertissement (get_my_state, feed, likes… passent par touch_activity).
create or replace function private.touch_activity(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p set last_active_at = now()
  where p.id = p_uid and p.last_active_at < now() - interval '5 minutes';
  delete from private.inactivity_warnings w where w.user_id = p_uid;
$$;

-- Dernière activité connue : profil ou dernière connexion.
create function private.last_seen(p_uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(p.last_active_at, coalesce(u.last_sign_in_at, p.last_active_at), coalesce(u.created_at, p.last_active_at))
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_uid;
$$;

alter table public.member_notices drop constraint member_notices_kind_check;
alter table public.member_notices
  add constraint member_notices_kind_check
  check (kind in ('content_removed', 'event_promoted', 'event_cancelled', 'inactivity_warning'));

-- Avertit les comptes inactifs non encore avertis (500 par passage). Renvoie le nombre avertis.
create function private.warn_inactive_accounts()
returns int
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
    select p.id as user_id, p.status
    from public.profiles p
    join auth.users u on u.id = p.id
    where greatest(p.last_active_at, coalesce(u.last_sign_in_at, p.last_active_at), u.created_at)
          < now() - make_interval(days => v_warning)
      and not exists (select 1 from public.admins a where a.user_id = p.id)
      and not exists (select 1 from private.inactivity_warnings w where w.user_id = p.id)
    order by p.last_active_at
    limit 500
  loop
    insert into private.inactivity_warnings (user_id, delete_after)
    values (v_row.user_id, now() + make_interval(days => v_grace));
    -- Compte banni : supprimé au même terme, mais sans avis ni email (« Vous nous manquez »).
    if v_row.status <> 'banned' then
      insert into public.member_notices (user_id, kind, payload)
      values (v_row.user_id, 'inactivity_warning',
              jsonb_build_object('delete_after', (now() + make_interval(days => v_grace))::date));
      perform private.invoke_edge_function('notify',
        jsonb_build_object('type', 'inactivity', 'user_id', v_row.user_id,
                           'delete_after', (now() + make_interval(days => v_grace))::date));
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    perform private.audit(null, 'retention.inactivity_warned', 'user', null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

-- Compte encore supprimable : averti depuis plus de `inactive_grace_days`, aucune activité depuis
-- l'avertissement, jamais un admin. Revérifié par purge-inactive juste avant chaque suppression.
create function public.inactive_purge_eligible(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_server();
  return exists (
    select 1
    from private.inactivity_warnings w
    where w.user_id = p_user
      and w.delete_after <= now()
      and coalesce(private.last_seen(p_user), w.warned_at) <= w.warned_at
      and not exists (select 1 from public.admins a where a.user_id = p_user)
  );
end;
$$;

create function public.inactive_accounts_to_purge(p_limit int default 100)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_server();
  return query
  select w.user_id
  from private.inactivity_warnings w
  where w.delete_after <= now()
    and coalesce(private.last_seen(w.user_id), w.warned_at) <= w.warned_at
    and not exists (select 1 from public.admins a where a.user_id = w.user_id)
  order by w.delete_after
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- N'appelle purge-inactive que s'il y a quelque chose à supprimer.
create function private.kick_inactive_purge()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.inactivity_warnings w
              where w.delete_after <= now()
                and coalesce(private.last_seen(w.user_id), w.warned_at) <= w.warned_at
                and not exists (select 1 from public.admins a where a.user_id = w.user_id)) then
    return private.invoke_edge_function('purge-inactive', '{}'::jsonb, 120000);
  end if;
  return null;
end;
$$;

-- 2. Signalements pseudonymisés -----------------------------------------------------------------
-- Un pseudonyme aléatoire par compte, effacé avec lui : les signalements gardent un lien entre eux
-- (« 3 signalements contre la même personne ») sans pointer vers une personne identifiable.
create table private.user_pseudonyms (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pseudonym text not null unique default ('m_' || encode(extensions.gen_random_bytes(9), 'hex'))
);

create function private.pseudonym_for(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if p_user is null then
    return null;
  end if;
  select up.pseudonym into v from private.user_pseudonyms up where up.user_id = p_user;
  if v is null then
    insert into private.user_pseudonyms (user_id) values (p_user)
    on conflict (user_id) do nothing;
    select up.pseudonym into v from private.user_pseudonyms up where up.user_id = p_user;
  end if;
  return v;
end;
$$;

alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports drop constraint reports_target_id_fkey;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports alter column target_id drop not null;
alter table public.reports
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references auth.users (id) on delete set null,
  add constraint reports_target_id_fkey foreign key (target_id) references auth.users (id) on delete set null,
  add column reporter_pseudonym text,
  add column target_pseudonym text,
  add column target_deleted_at timestamptz;
create index reports_target_pseudonym_idx on public.reports (target_pseudonym);
create index reports_target_deleted_idx on public.reports (target_deleted_at) where target_deleted_at is not null;

update public.reports r
   set reporter_pseudonym = private.pseudonym_for(r.reporter_id),
       target_pseudonym = private.pseudonym_for(r.target_id);

-- Pseudonymes posés à l'insertion ; date de suppression du compte visé posée quand la clé
-- étrangère passe à null (la suppression d'un compte exécute ce `set null` comme un UPDATE).
create function private.reports_pseudonymize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.reporter_pseudonym := coalesce(new.reporter_pseudonym, private.pseudonym_for(new.reporter_id));
    new.target_pseudonym := coalesce(new.target_pseudonym, private.pseudonym_for(new.target_id));
  elsif old.target_id is not null and new.target_id is null and new.target_deleted_at is null then
    new.target_deleted_at := now();
  end if;
  return new;
end;
$$;

create trigger reports_pseudonymize
  before insert or update on public.reports
  for each row execute function private.reports_pseudonymize();

-- 3. Identités exclues --------------------------------------------------------------------------
create table private.banned_identities (
  kind text not null check (kind in ('email', 'identity')),
  hash text not null,
  created_at timestamptz not null default now(),
  primary key (kind, hash)
);

-- Poivre lu dans Vault (secret `identity_pepper`) : sans lui, rien n'est enregistré ni comparé
-- (une empreinte sans poivre se retrouverait par dictionnaire).
create function private.identity_pepper()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(ds.decrypted_secret, '') from vault.decrypted_secrets ds where ds.name = 'identity_pepper' limit 1;
$$;

create function private.identity_hash(p_kind text, p_value text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text := private.identity_pepper();
begin
  if v_pepper is null or coalesce(btrim(p_value), '') = '' then
    return null;
  end if;
  return encode(extensions.hmac(p_kind || ':' || p_value, v_pepper, 'sha256'), 'hex');
end;
$$;

create function private.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create function private.normalize_identity(p_legal_name text, p_birthdate date)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_birthdate is null or private.normalize_text(p_legal_name) = '' then null
              else private.normalize_text(p_legal_name) || '|' || p_birthdate::text end;
$$;

create function private.is_banned_identity(p_kind text, p_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select true from private.banned_identities b
                    where b.kind = p_kind and b.hash = private.identity_hash(p_kind, p_value)), false);
$$;

-- Avant la suppression d'un compte banni : empreintes de son email et de son identité.
create function private.capture_banned_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_private public.profile_private;
  v_email_hash text;
  v_identity_hash text;
begin
  if not exists (select 1 from public.profiles p where p.id = old.id and p.status = 'banned') then
    return old;
  end if;
  select * into v_private from public.profile_private pp where pp.user_id = old.id;
  v_email_hash := private.identity_hash('email', private.normalize_email(old.email));
  v_identity_hash := private.identity_hash('identity',
                       private.normalize_identity(v_private.legal_name, v_private.birthdate));
  if v_email_hash is not null then
    insert into private.banned_identities (kind, hash) values ('email', v_email_hash) on conflict do nothing;
  end if;
  if v_identity_hash is not null then
    insert into private.banned_identities (kind, hash) values ('identity', v_identity_hash) on conflict do nothing;
  end if;
  -- Trace sans l'empreinte ni l'identifiant du compte supprimé.
  perform private.audit(null, 'retention.banned_identity_kept', 'user', null,
    jsonb_build_object('email', v_email_hash is not null, 'identity', v_identity_hash is not null,
                       'pepper', private.identity_pepper() is not null));
  return old;
end;
$$;

create trigger on_auth_user_deleted_capture_ban
  before delete on auth.users
  for each row execute function private.capture_banned_identity();

-- Nouveau compte : email d'un compte banni supprimé → profil banni dès sa création.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict (user_id) do nothing;
  if private.is_banned_identity('email', private.normalize_email(new.email)) then
    update public.profiles set status = 'banned' where id = new.id;
    perform private.audit(null, 'retention.banned_identity_match', 'user', new.id::text,
                          jsonb_build_object('kind', 'email'));
  end if;
  return new;
end;
$$;

-- set_identity : identité d'un compte banni supprimé → profil banni, identité non enregistrée.
create or replace function public.set_identity(p_legal_name text, p_birthdate date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_private public.profile_private;
begin
  select * into v_private from public.profile_private pp where pp.user_id = v_uid for update;
  if v_private.legal_name is not null or v_private.birthdate is not null then
    raise exception 'identity_already_set' using errcode = 'P0001';
  end if;
  if p_birthdate is null or coalesce(char_length(btrim(p_legal_name)), 0) < 2 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if private.age_years(p_birthdate) < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;

  if private.is_banned_identity('identity', private.normalize_identity(p_legal_name, p_birthdate)) then
    update public.profiles set status = 'banned' where id = v_uid;
    perform private.audit(null, 'retention.banned_identity_match', 'user', v_uid::text,
                          jsonb_build_object('kind', 'identity'));
    return;
  end if;

  insert into public.profile_private (user_id, legal_name, birthdate)
  values (v_uid, btrim(p_legal_name), p_birthdate)
  on conflict (user_id) do update set legal_name = excluded.legal_name, birthdate = excluded.birthdate;
end;
$$;

-- 4. Journal d'audit : ajout seul, sauf la purge serveur des entrées expirées ---------------------
-- La purge pose `sapios.audit_purge` pour sa seule transaction ; même ainsi, seule une entrée plus
-- ancienne que `audit_retention_days` peut partir. UPDATE et TRUNCATE restent toujours refusés.
create or replace function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('sapios.audit_purge', true), '') = 'on' then
    if old.created_at < now() - make_interval(days => private.setting_int('audit_retention_days', 1825)) then
      return old;
    end if;
  end if;
  raise exception 'audit_log_append_only' using errcode = '42501';
end;
$$;

-- Tâche quotidienne -----------------------------------------------------------------------------
create function private.run_retention()
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

  if v_reports + v_identities + v_audit + v_notices > 0 then
    perform private.audit(null, 'retention.purged', 'retention', null,
      jsonb_build_object('reports', v_reports, 'banned_identities', v_identities,
                         'audit_log', v_audit, 'notices', v_notices));
  end if;
  return jsonb_build_object('warned', v_warned, 'reports', v_reports, 'banned_identities', v_identities,
                            'audit_log', v_audit, 'notices', v_notices);
end;
$$;

select cron.schedule('retention-daily', '41 3 * * *', $$select private.run_retention()$$);
select cron.schedule('purge-inactive', '53 3 * * *', $$select private.kick_inactive_purge()$$);

-- Réglages : admin_update_settings accepte en plus les durées de conservation et la version des
-- CGU. Les autres clés gardent exactement leurs règles (lot 1 et lot 2).
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
    if v_key = 'feed_radius_km' or v_key like 'affinity\_weight\_%' then
      if v_key not in ('feed_radius_km', 'affinity_weight_field', 'affinity_weight_book',
                       'affinity_weight_prompt', 'affinity_weight_institution') then
        raise exception 'unknown_setting' using errcode = 'P0001', detail = v_key;
      end if;
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      if (v_key = 'feed_radius_km' and v_int not between 5 and 200)
         or (v_key <> 'feed_radius_km' and v_int not between 0 and 20) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key = 'moderation_blocklist' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_words := '{}';
      for v_word in select lower(btrim(w)) from jsonb_array_elements_text(v_value) w
      loop
        if v_word = '' then
          continue;
        end if;
        if char_length(v_word) > 40 then
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
    elsif v_key in ('referral_letters_standard', 'referral_letters_unlimited', 'referral_window_days') then
      -- Lot 2 : lettres de recommandation par palier et durée de la période glissante.
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      if (v_key = 'referral_window_days' and v_int not between 7 and 90)
         or (v_key <> 'referral_window_days' and v_int not between 0 and 20) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key in ('inactive_warning_days', 'inactive_grace_days', 'report_retention_days',
                    'audit_retention_days', 'banned_identity_retention_days', 'notice_retention_days') then
      -- Conformité : durées de conservation, en jours.
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$' then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_int := (v_value #>> '{}')::int;
      select r.lo, r.hi into v_min, v_max
        from (values ('inactive_warning_days', 180, 3650),
                     ('inactive_grace_days', 7, 180),
                     ('report_retention_days', 30, 1825),
                     ('audit_retention_days', 365, 3650),
                     ('banned_identity_retention_days', 90, 3650),
                     ('notice_retention_days', 30, 1825)) as r(k, lo, hi)
       where r.k = v_key;
      if v_int not between v_min and v_max then
        raise exception 'invalid_value' using errcode = 'P0001', detail = v_key;
      end if;
      v_new := to_jsonb(v_int);
    elsif v_key = 'terms_version' then
      -- Conformité : changer de version redemande l'acceptation des CGU à tous les membres.
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

-- Contexte d'un signalement : fonctionne aussi quand le compte visé a été supprimé (cible nulle,
-- seuls le motif, le texte du signalement et le pseudonyme restent ; les autres signalements contre
-- la même personne se comptent par pseudonyme).
create or replace function public.admin_get_report_context(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_target uuid;
  v_match public.matches;
begin
  perform private.require_admin();
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_target := v_report.target_id;

  if v_target is not null and v_report.reporter_id is not null then
    select * into v_match from public.matches m
     where m.user_a = least(v_report.reporter_id, v_target) and m.user_b = greatest(v_report.reporter_id, v_target);
  end if;

  return jsonb_build_object(
    'target_deleted_at', v_report.target_deleted_at,
    'target_pseudonym', v_report.target_pseudonym,
    'reporter_pseudonym', v_report.reporter_pseudonym,
    'target', (select jsonb_build_object(
                 'id', p.id, 'display_name', p.display_name, 'status', p.status, 'city', p.city, 'bio', p.bio,
                 'study_field', p.study_field, 'created_at', p.created_at, 'last_active_at', p.last_active_at,
                 'age', private.age_years(pp.birthdate), 'legal_name', pp.legal_name,
                 'email', u.email::text,
                 'tier', ua.tier, 'level', ua.level, 'institution', ua.institution,
                 'source_submission_id', ua.source_submission_id)
               from public.profiles p
               left join public.profile_private pp on pp.user_id = p.id
               left join public.user_access ua on ua.user_id = p.id
               left join auth.users u on u.id = p.id
               where v_target is not null and p.id = v_target),
    'reporter', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
                                           'reports_filed', (select count(*) from public.reports r
                                                              where r.reporter_id = p.id))
                 from public.profiles p where v_report.reporter_id is not null and p.id = v_report.reporter_id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'storage_path', ph.storage_path,
                                                            'moderation_status', ph.moderation_status)
                                         order by ph.position)
                          from public.profile_photos ph where ph.user_id = v_target), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'position', a.position,
                                                             'prompt_key', a.prompt_key, 'answer', a.answer,
                                                             'moderation_status', a.moderation_status)
                                          order by a.position)
                           from public.profile_answers a where a.user_id = v_target), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'author', b.author,
                                                           'moderation_status', b.moderation_status)
                                        order by b.position)
                         from public.profile_books b where b.user_id = v_target), '[]'::jsonb),
    'thesis', (select jsonb_build_object('line', t.line, 'visibility', t.visibility,
                                         'moderation_status', t.moderation_status)
                 from public.profile_theses t where t.user_id = v_target),
    'content', case when v_report.content_kind is null then null else jsonb_build_object(
                 'kind', v_report.content_kind,
                 'item_id', v_report.content_item_id,
                 'text', case when v_target is null then null
                              else private.content_text(v_target, v_report.content_kind, v_report.content_item_id) end,
                 'prompt_key', (select a.prompt_key from public.profile_answers a
                                 where v_report.content_kind = 'answer' and a.id = v_report.content_item_id),
                 'flag_id', (select f.id from public.content_flags f
                              where f.report_id = v_report.id order by f.created_at desc limit 1),
                 'flag_status', (select f.status from public.content_flags f
                                  where f.report_id = v_report.id order by f.created_at desc limit 1)) end,
    'reports_against', jsonb_build_object(
                 'open', (select count(*) from public.reports r
                           where r.target_pseudonym = v_report.target_pseudonym and r.status = 'open'),
                 'total', (select count(*) from public.reports r where r.target_pseudonym = v_report.target_pseudonym),
                 'actioned', (select count(*) from public.reports r
                               where r.target_pseudonym = v_report.target_pseudonym and r.status = 'actioned'),
                 'reasons', coalesce((select jsonb_agg(distinct r.reason) from public.reports r
                                       where r.target_pseudonym = v_report.target_pseudonym), '[]'::jsonb)),
    'relationship', jsonb_build_object(
                 'matched_at', v_match.created_at,
                 'unmatched_at', v_match.unmatched_at,
                 'reporter_blocked', v_target is not null and exists (select 1 from public.blocks b
                                              where b.blocker_id = v_report.reporter_id and b.blocked_id = v_target),
                 'target_blocked', v_target is not null and exists (select 1 from public.blocks b
                                            where b.blocker_id = v_target and b.blocked_id = v_report.reporter_id))
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on table private.inactivity_warnings, private.user_pseudonyms, private.banned_identities
  from public, anon, authenticated;
grant all on table private.inactivity_warnings, private.user_pseudonyms, private.banned_identities to service_role;

revoke all on function
  public.inactive_purge_eligible(uuid),
  public.inactive_accounts_to_purge(int)
from public, anon, authenticated;
grant execute on function
  public.inactive_purge_eligible(uuid),
  public.inactive_accounts_to_purge(int)
to service_role;

revoke all on function public.admin_update_settings(jsonb), public.admin_get_report_context(uuid)
  from public, anon;
grant execute on function public.admin_update_settings(jsonb), public.admin_get_report_context(uuid)
  to authenticated, service_role;

revoke all on function
  private.last_seen(uuid),
  private.warn_inactive_accounts(),
  private.kick_inactive_purge(),
  private.pseudonym_for(uuid),
  private.reports_pseudonymize(),
  private.identity_pepper(),
  private.identity_hash(text, text),
  private.normalize_email(text),
  private.normalize_identity(text, date),
  private.is_banned_identity(text, text),
  private.capture_banned_identity(),
  private.run_retention()
from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

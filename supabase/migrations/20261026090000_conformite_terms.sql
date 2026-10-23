-- Conformité : acceptation des CGU (CGU art. 1.2 et 14.1, plan d'action de l'AIPD).
-- La version en vigueur vit dans app_settings.terms_version (texte) ; chaque acceptation est datée
-- et conservée par version. Sans acceptation de la version en vigueur, le profil ne s'active pas et
-- l'app bloque l'accès (écran « Nos conditions évoluent »). Les acceptations partent avec le compte.

-- Réglage de la version des CGU ---------------------------------------------------------------
insert into public.app_settings (key, value, description)
values ('terms_version', to_jsonb('2026-10-brouillon'::text),
        'Version des CGU en vigueur ; la changer redemande l''acceptation à tous les membres')
on conflict (key) do nothing;

create function private.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value #>> '{}' from public.app_settings s where s.key = p_key), p_default);
$$;

create function private.terms_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.setting_text('terms_version', '2026-10-brouillon');
$$;

-- Acceptations ---------------------------------------------------------------------------------
create table public.terms_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.terms_acceptances enable row level security;
create index terms_acceptances_user_idx on public.terms_acceptances (user_id, accepted_at desc);

-- Lecture de ses propres acceptations ; écriture par la seule RPC accept_terms.
create policy terms_acceptances_select on public.terms_acceptances for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
grant all on public.terms_acceptances to service_role;

-- État des CGU d'un membre : version en vigueur, acceptée ou non, dernière version acceptée.
create function private.terms_state(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (select private.terms_version() as v)
  select jsonb_build_object(
    'current_version', cur.v,
    'accepted', exists (select 1 from public.terms_acceptances t where t.user_id = p_uid and t.version = cur.v),
    'accepted_at', (select t.accepted_at from public.terms_acceptances t where t.user_id = p_uid and t.version = cur.v),
    'last_accepted_version', (select t.version from public.terms_acceptances t
                               where t.user_id = p_uid order by t.accepted_at desc limit 1)
  )
  from cur;
$$;

-- accept_terms : n'accepte que la version en vigueur (une app restée ouverte sur une ancienne
-- version reçoit `terms_version_mismatch` et recharge le texte). Idempotent.
create function public.accept_terms(p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_current text := private.terms_version();
begin
  if p_version is null or btrim(p_version) <> v_current then
    raise exception 'terms_version_mismatch' using errcode = 'P0001';
  end if;
  insert into public.terms_acceptances (user_id, version) values (v_uid, v_current)
  on conflict (user_id, version) do nothing;
  if found then
    perform private.audit(v_uid, 'terms.accepted', 'terms_acceptances', v_uid::text,
                          jsonb_build_object('version', v_current));
  end if;
  return private.terms_state(v_uid);
end;
$$;

-- activate_profile : + CGU de la version en vigueur acceptées (erreur `terms_required`) --------
create or replace function public.activate_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_profile public.profiles;
  v_private public.profile_private;
begin
  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if v_profile.status = 'banned' then
    raise exception 'invalid_status' using errcode = 'P0001';
  elsif v_profile.status in ('active', 'paused') then
    return;
  end if;

  select * into v_private from public.profile_private pp where pp.user_id = v_uid;
  if v_private.legal_name is null or v_private.birthdate is null then
    raise exception 'identity_missing' using errcode = 'P0001';
  end if;
  if not private.profile_is_complete(v_profile) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  if (select count(*) from public.profile_photos ph
       where ph.user_id = v_uid and ph.moderation_status <> 'rejected') < 2 then
    raise exception 'photos_missing' using errcode = 'P0001';
  end if;
  if v_private.consent_sensitive_at is null then
    raise exception 'consent_missing' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.terms_acceptances t
                  where t.user_id = v_uid and t.version = private.terms_version()) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;

  update public.profiles set status = 'active', last_active_at = now() where id = v_uid;
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated, service_role;
revoke all on function private.setting_text(text, text), private.terms_version(), private.terms_state(uuid)
  from public, anon, authenticated;
grant execute on function private.setting_text(text, text), private.terms_version(), private.terms_state(uuid)
  to service_role;

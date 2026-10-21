-- Fonctions utilitaires, visibilité des profils et triggers de protection.
-- Convention : tout ce qui n'est pas une RPC du contrat vit dans le schéma `private`
-- (non exposé par PostgREST). Fonctions `security definer` : search_path vide, tout est qualifié.

-- Contexte d'exécution -------------------------------------------------------------------------

-- Vrai hors requête client directe : service_role, postgres (migrations, cron) ou corps d'une
-- fonction `security definer` (current_user = propriétaire). Volontairement `security invoker`.
create function private.is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon');
$$;

-- Vrai pour un appel serveur (clé service_role ou session postgres sans JWT), jamais pour un
-- utilisateur, même à l'intérieur d'une RPC `security definer`.
create function private.is_server_call()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') not in ('authenticated', 'anon');
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- Réglages, dates, paliers ---------------------------------------------------------------------

create function private.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::int from public.app_settings s where s.key = p_key), p_default);
$$;

-- Minuit du jour courant à Paris (base du quota quotidien).
create function private.paris_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create function private.age_years(p_birthdate date)
returns int
language sql
stable
set search_path = ''
as $$
  select extract(year from age((now() at time zone 'Europe/Paris')::date, p_birthdate))::int;
$$;

-- Ligne de politique d'un palier (la plus haute si plusieurs niveaux partagent le palier).
create function private.tier_policy(p_tier public.access_tier)
returns public.access_policy
language sql
stable
security definer
set search_path = ''
as $$
  select ap.* from public.access_policy ap where ap.tier = p_tier order by ap.min_level desc limit 1;
$$;

-- Palier d'un niveau N : la ligne au plus grand min_level <= N (contrat §2).
create function private.level_policy(p_level int)
returns public.access_policy
language sql
stable
security definer
set search_path = ''
as $$
  select ap.* from public.access_policy ap where ap.min_level <= p_level order by ap.min_level desc limit 1;
$$;

create function private.tier_can_browse(p_tier public.access_tier)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select ap.can_browse from public.access_policy ap
                   where ap.tier = p_tier order by ap.min_level desc limit 1), false);
$$;

create function private.tier_rank(p_tier public.access_tier)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_tier when 'unlimited' then 4 when 'standard' then 3 when 'waitlist' then 2 else 1 end;
$$;

create function private.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Visibilité d'un profil (brief §6) : point unique réutilisé par les politiques de `profiles`,
-- `profile_photos` et `storage.objects` (bucket photos).
--  * soi-même : oui ;
--  * sinon : palier du lecteur avec can_browse et lecteur non banni, cible `active` avec un palier
--    can_browse, aucun blocage dans un sens ou dans l'autre ;
--  * exception (cf. docs/DEVIATIONS.md) : deux membres d'un match actif, sans blocage, se voient
--    tant que la cible n'est pas bannie (photo du chat même si l'autre est en pause).
create function public.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or target is null then false
    when target = (select auth.uid()) then true
    when private.is_blocked_pair((select auth.uid()), target) then false
    else
      exists (
        select 1
        from public.profiles me
        join public.user_access ma on ma.user_id = me.id
        join public.profiles t on t.id = target
        join public.user_access ta on ta.user_id = t.id
        where me.id = (select auth.uid())
          and me.status <> 'banned'
          and private.tier_can_browse(ma.tier)
          and t.status = 'active'
          and private.tier_can_browse(ta.tier)
      )
      or exists (
        select 1
        from public.matches m
        join public.profiles t on t.id = target
        where m.user_a = least((select auth.uid()), target)
          and m.user_b = greatest((select auth.uid()), target)
          and m.unmatched_at is null
          and t.status <> 'banned'
      )
  end;
$$;

-- Accès à une conversation : participant d'un match actif, sans blocage (politiques `messages`).
create function private.can_access_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and m.unmatched_at is null
      and (select auth.uid()) in (m.user_a, m.user_b)
      and not private.is_blocked_pair(m.user_a, m.user_b)
  );
$$;

create function private.is_not_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status <> 'banned');
$$;

create function private.audit(p_actor uuid, p_action text, p_entity text, p_entity_id text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, payload)
  values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb));
$$;

-- Appel HTTP asynchrone (pg_net) vers une Edge Function, avec `project_url` et `internal_secret`
-- lus dans Vault. N'échoue jamais : sans Vault ou sans pg_net, on journalise et on renvoie null.
-- p_timeout_ms ne bloque pas la transaction : il borne seulement l'attente du worker pg_net.
create function private.invoke_edge_function(
  p_name text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_ms int default 10000
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_anon text;
  v_headers jsonb;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'project_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'internal_secret';
  select ds.decrypted_secret into v_anon from vault.decrypted_secrets ds where ds.name = 'anon_key';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    raise log 'invoke_edge_function(%): Vault project_url/internal_secret absent, appel ignoré', p_name;
    return null;
  end if;
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-sapios-secret', v_secret);
  -- Facultatif : passe la passerelle si la fonction garde verify_jwt = true.
  if coalesce(v_anon, '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_anon);
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    body := coalesce(p_body, '{}'::jsonb),
    headers := v_headers,
    timeout_milliseconds := greatest(coalesce(p_timeout_ms, 10000), 1000)
  );
exception when others then
  raise warning 'invoke_edge_function(%) a échoué : %', p_name, sqlerrm;
  return null;
end;
$$;

-- Triggers ------------------------------------------------------------------------------------

-- Création d'un compte : profil (statut onboarding) + ligne privée vide.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- profiles : arrondi de la localisation (~1 km) et statut jamais écrit par le client.
create function private.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_geom extensions.geometry;
begin
  if new.location is not null then
    v_geom := new.location::extensions.geometry;
    new.location := extensions.st_setsrid(
      extensions.st_makepoint(round(extensions.st_x(v_geom)::numeric, 3)::float8,
                              round(extensions.st_y(v_geom)::numeric, 3)::float8),
      4326)::extensions.geography;
  end if;

  if not private.is_privileged() then
    if tg_op = 'INSERT' and new.status <> 'onboarding' then
      raise exception 'status_forbidden' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'status_forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function private.profiles_before_write();

-- profile_private : nom légal et date de naissance figés après la première écriture
-- (sauf admin ou appel serveur), 18 ans minimum.
create function private.profile_private_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (private.is_server_call() or public.is_admin()) then
    if (old.legal_name is not null and new.legal_name is distinct from old.legal_name)
       or (old.birthdate is not null and new.birthdate is distinct from old.birthdate) then
      raise exception 'identity_already_set' using errcode = 'P0001';
    end if;
  end if;
  if new.birthdate is not null and private.age_years(new.birthdate) < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profile_private_before_write
  before insert or update on public.profile_private
  for each row execute function private.profile_private_before_write();

-- profile_photos : 6 photos maximum, modération réservée aux admins / au serveur.
create function private.profile_photos_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted boolean := private.is_privileged() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_trusted then
      new.moderation_status := 'pending';
    end if;
    if private.photo_count(new.user_id) >= 6 then
      raise exception 'photos_limit' using errcode = 'P0001';
    end if;
  elsif new.moderation_status is distinct from old.moderation_status and not v_trusted then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.photo_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.profile_photos ph where ph.user_id = p_user;
$$;

create trigger profile_photos_before_write
  before insert or update on public.profile_photos
  for each row execute function private.profile_photos_before_write();

-- Tables écrites uniquement par le serveur : refus explicite même si un droit était accordé.
create function private.reject_client_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_privileged() then
    raise exception 'server_only' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger user_access_server_only before insert or update or delete on public.user_access
  for each row execute function private.reject_client_write();
create trigger swipes_server_only before insert or update or delete on public.swipes
  for each row execute function private.reject_client_write();
create trigger matches_server_only before insert or update or delete on public.matches
  for each row execute function private.reject_client_write();

-- audit_log : ajout seul, pour tous les rôles (service_role compris).
create function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_append_only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function private.audit_log_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_append_only();

-- degree_submissions : une décision finale (approved/rejected) ne change plus de statut.
create function private.degree_submissions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'rejected') and new.status is distinct from old.status then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger degree_submissions_before_update before update on public.degree_submissions
  for each row execute function private.degree_submissions_before_update();

-- push_tokens : un jeton déjà enregistré pour un autre compte lui est retiré.
create function private.push_tokens_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_tokens pt where pt.token = new.token and pt.user_id <> new.user_id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger push_tokens_before_write before insert or update on public.push_tokens
  for each row execute function private.push_tokens_before_write();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_copy_touch before update on public.app_copy
  for each row execute function private.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings
  for each row execute function private.touch_updated_at();

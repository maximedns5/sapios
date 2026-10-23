-- Lot 2 (cadrage des fonctionnalités §5) : « lettres de recommandation ».
-- Un membre Bac+5 ou Bac+8 actif partage un lien personnel ; la personne recommandée passe la
-- vérification du diplôme comme tout le monde, mais devant (file de revue et admissions Bac+3).
-- La recommandation ne contourne jamais le diplôme. Le parrain ne voit qu'un compteur.

create extension if not exists pgcrypto with schema extensions;

-- Tables -------------------------------------------------------------------------------------
-- Codes de 10 caractères en base 32 de Crockford (sans I, L, O ni U : rien à confondre) : 32^10 ≈
-- 10^15 combinaisons, l'énumération est hors de portée. Un seul code actif par membre.
create table public.referral_codes (
  code text primary key check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 500),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
create unique index referral_codes_one_active_idx on public.referral_codes (owner_id) where revoked_at is null;

-- Une personne n'est recommandée qu'une fois. La suppression du filleul efface la ligne ; celle du
-- parrain la laisse sans auteur (referrer_id null), pour garder la priorité du filleul.
create table public.referrals (
  referee_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id uuid references auth.users (id) on delete set null,
  code text not null,
  claimed_at timestamptz not null default now(),
  constraint referrals_not_self check (referrer_id is null or referrer_id <> referee_id)
);
alter table public.referrals enable row level security;
create index referrals_referrer_idx on public.referrals (referrer_id, claimed_at desc);

-- Un membre dont l'admin a coupé les recommandations ne reçoit plus de nouveau code.
alter table public.user_access
  add column referral_disabled boolean not null default false;

-- Droits : aucune lecture ni écriture directe, tout passe par les RPC ---------------------------
revoke all on public.referral_codes, public.referrals from anon, authenticated;
grant all on public.referral_codes, public.referrals to service_role;

-- Réglages et textes (`do nothing` : le back-office garde la main) -----------------------------
insert into public.app_settings (key, value, description)
values
  ('referral_letters_standard', '3', 'Lettres de recommandation par période glissante, palier standard (Bac+5)'),
  ('referral_letters_unlimited', '5', 'Lettres de recommandation par période glissante, palier illimité (Bac+8)'),
  ('referral_window_days', '30', 'Durée de la période glissante des lettres de recommandation, en jours')
on conflict (key) do nothing;

insert into public.app_copy (key, locale, text)
values
  ('verdict.waitlist.referred', 'fr', 'Liste d''attente. Mais on vous a recommandé·e : vous passez devant. Un peu.'),
  ('verdict.waitlist.referred.detail', 'fr', 'Les admissions se font par vagues, décidées par notre équipe. Les personnes recommandées y sont examinées en premier ; votre diplôme reste le seul critère d''accès.'),
  ('referral.title', 'fr', 'Mes lettres de recommandation'),
  ('referral.lead', 'fr', 'Un membre se porte garant de vous. Ça ne vaut pas un diplôme, mais ça aide.'),
  ('referral.counter', 'fr', '{used} lettre(s) utilisée(s) sur {quota} ce mois-ci.'),
  ('referral.privacy', 'fr', 'Vous ne saurez ni qui a utilisé votre lien, ni son verdict. La discrétion fait partie de la lettre.'),
  ('referral.banner', 'fr', 'Recommandé·e par {name}.')
on conflict (key, locale) do nothing;

-- Fonctions internes -------------------------------------------------------------------------

-- Code aléatoire : chaque octet donne un caractère (256 est un multiple de 32 : tirage uniforme).
create function private.random_code(p_len int)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(b.bytes, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_len) as bytes) b, generate_series(0, p_len - 1) i;
$$;

-- Saisie tolérante : majuscules, sans espaces ni tirets ; O lu 0, I et L lus 1 (Crockford).
create function private.normalize_referral_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g')), 'OIL', '011');
$$;

-- Lettres par période selon le palier ; null si le membre ne peut pas recommander.
-- Conditions : profil actif ou en pause (jamais banni), palier standard ou illimité avec accès à la
-- découverte, recommandations non coupées par l'admin.
create function private.referral_quota(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case ua.tier
           when 'unlimited' then private.setting_int('referral_letters_unlimited', 5)
           when 'standard' then private.setting_int('referral_letters_standard', 3)
         end
  from public.user_access ua
  join public.profiles p on p.id = ua.user_id
  where ua.user_id = p_uid
    and ua.tier in ('standard', 'unlimited')
    and private.tier_can_browse(ua.tier)
    and not ua.referral_disabled
    and p.status in ('active', 'paused');
$$;

-- Lettres utilisées dans la période glissante.
create function private.referral_used(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.referrals r
  where r.referrer_id = p_uid
    and r.claimed_at > now() - make_interval(days => private.setting_int('referral_window_days', 30));
$$;

-- Code actif d'un parrain valide (non révoqué, parrain encore éligible), ou null.
create function private.referral_owner(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rc.owner_id from public.referral_codes rc
  where rc.code = private.normalize_referral_code(p_code)
    and rc.revoked_at is null
    and private.referral_quota(rc.owner_id) is not null;
$$;

-- Prénom affiché du parrain d'un membre (null si aucun ou si le parrain a supprimé son compte).
create function private.referred_by_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.referrals r
  join public.profiles p on p.id = r.referrer_id
  where r.referee_id = p_uid;
$$;

-- RPC membres --------------------------------------------------------------------------------

-- Mon lien : code (créé à la première demande), lettres utilisées et restantes, prochaine lettre.
-- Jamais d'identité ni de verdict des filleuls.
create function public.get_my_referral()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_quota int := private.referral_quota(v_uid);
  v_used int;
  v_code text;
  v_window int := private.setting_int('referral_window_days', 30);
  v_next timestamptz;
begin
  if v_quota is null then
    return jsonb_build_object('eligible', false, 'code', null, 'quota', 0, 'used', 0, 'left', 0,
                              'next_letter_at', null);
  end if;

  select rc.code into v_code from public.referral_codes rc where rc.owner_id = v_uid and rc.revoked_at is null;
  if v_code is null then
    loop
      begin
        insert into public.referral_codes (code, owner_id) values (private.random_code(10), v_uid)
        returning code into v_code;
        exit;
      exception when unique_violation then
        -- Collision de code (improbable) : on retire. Un code actif créé en parallèle : on le relit.
        select rc.code into v_code from public.referral_codes rc where rc.owner_id = v_uid and rc.revoked_at is null;
        exit when v_code is not null;
      end;
    end loop;
  end if;

  v_used := private.referral_used(v_uid);
  -- Prochaine lettre libérée : la plus ancienne de la période, quand le quota est atteint.
  if v_used >= v_quota then
    select min(r.claimed_at) + make_interval(days => v_window) into v_next from public.referrals r
     where r.referrer_id = v_uid and r.claimed_at > now() - make_interval(days => v_window);
  end if;

  return jsonb_build_object(
    'eligible', true,
    'code', v_code,
    'quota', v_quota,
    'used', v_used,
    'left', greatest(v_quota - v_used, 0),
    'next_letter_at', v_next
  );
end;
$$;

-- Aperçu d'un code sur l'écran de connexion (anon) : le prénom du parrain si le code est
-- utilisable, sinon null. Rien d'autre. Pas de quota d'appels : un code a environ 10^15 valeurs.
create function public.get_referral_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.display_name is null then null
              else jsonb_build_object('referrer_first_name', p.display_name) end
  from (select 1) one
  left join public.profiles p on p.id = private.referral_owner(p_code)
                             and private.referral_used(p.id) < private.referral_quota(p.id);
$$;

-- Utiliser un code : une seule fois, avant toute décision sur le diplôme.
-- Erreurs, dans cet ordre : already_referred, invalid_code (inconnu, révoqué, parrain inéligible),
-- self_referral, too_late, quota_exceeded.
create function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := private.normalize_referral_code(p_code);
  v_owner uuid;
  v_name text;
begin
  if exists (select 1 from public.referrals r where r.referee_id = v_uid) then
    raise exception 'already_referred' using errcode = 'P0001';
  end if;

  -- Verrou sur le code : deux filleuls simultanés ne dépassent pas le quota du parrain.
  select rc.owner_id into v_owner from public.referral_codes rc
   where rc.code = v_code and rc.revoked_at is null
   for update;
  if v_owner is null or private.referral_quota(v_owner) is null then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'self_referral' using errcode = 'P0001';
  end if;
  -- Une décision (palier attribué ou dossier examiné) ferme la porte.
  if exists (select 1 from public.user_access ua where ua.user_id = v_uid)
     or exists (select 1 from public.degree_submissions s where s.user_id = v_uid and s.reviewed_at is not null) then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if private.referral_used(v_owner) >= private.referral_quota(v_owner) then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.referrals (referee_id, referrer_id, code) values (v_uid, v_owner, v_code);
  perform private.audit(v_uid, 'referral.claim', 'referrals', v_uid::text,
                        jsonb_build_object('referrer_id', v_owner, 'code', v_code));

  select p.display_name into v_name from public.profiles p where p.id = v_owner;
  return jsonb_build_object('referrer_first_name', v_name);
end;
$$;

-- RPC admin ----------------------------------------------------------------------------------

-- Révoquer un code ; p_disable coupe aussi les recommandations du membre (pas de nouveau code).
create function public.admin_revoke_referral_code(p_code text, p_disable boolean default false, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_owner uuid;
begin
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.referral_codes rc
     set revoked_at = coalesce(rc.revoked_at, now()), revoked_by = v_admin, revoked_reason = nullif(btrim(p_reason), '')
   where rc.code = private.normalize_referral_code(p_code)
  returning rc.owner_id into v_owner;
  if v_owner is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if coalesce(p_disable, false) then
    update public.user_access ua set referral_disabled = true where ua.user_id = v_owner;
  end if;
  perform private.audit(v_admin, 'referral.revoke', 'referral_codes', private.normalize_referral_code(p_code),
                        jsonb_build_object('owner_id', v_owner, 'disable', coalesce(p_disable, false),
                                           'reason', nullif(btrim(p_reason), '')));
end;
$$;

-- Rétablir les recommandations d'un membre (un nouveau code sera créé à sa prochaine demande).
create function public.admin_enable_referrals(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.user_access ua set referral_disabled = false where ua.user_id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.audit(v_admin, 'referral.enable', 'user_access', p_user::text, '{}'::jsonb);
end;
$$;

-- Statistiques : totaux et une ligne par parrain. `flagged` signale un parrain dont un filleul a
-- été banni (un signal pour l'admin, jamais une sanction automatique).
create function public.admin_referral_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window int := private.setting_int('referral_window_days', 30);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'codes_active', (select count(*) from public.referral_codes rc where rc.revoked_at is null),
    'codes_revoked', (select count(*) from public.referral_codes rc where rc.revoked_at is not null),
    'referrals_total', (select count(*) from public.referrals),
    'referrals_window', (select count(*) from public.referrals r
                          where r.claimed_at > now() - make_interval(days => v_window)),
    'referrers', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb order by s.referees_total desc, s.display_name)
      from (
        select r.referrer_id,
               p.display_name,
               u.email::text as email,
               (select rc.code from public.referral_codes rc
                 where rc.owner_id = r.referrer_id and rc.revoked_at is null) as active_code,
               coalesce(ua_ref.referral_disabled, false) as referral_disabled,
               count(*)::int as referees_total,
               count(*) filter (where r.claimed_at > now() - make_interval(days => v_window))::int as letters_used_window,
               count(*) filter (where ua.tier in ('standard', 'unlimited'))::int as referees_admitted,
               count(*) filter (where ua.tier = 'waitlist')::int as referees_waitlisted,
               count(*) filter (where ua.tier = 'refused')::int as referees_refused,
               count(*) filter (where ua.user_id is null)::int as referees_pending,
               count(*) filter (where rp.status = 'banned')::int as referees_banned,
               (count(*) filter (where rp.status = 'banned') > 0) as flagged
        from public.referrals r
        join public.profiles p on p.id = r.referrer_id
        join auth.users u on u.id = r.referrer_id
        left join public.user_access ua_ref on ua_ref.user_id = r.referrer_id
        left join public.user_access ua on ua.user_id = r.referee_id
        left join public.profiles rp on rp.id = r.referee_id
        where r.referrer_id is not null
        group by r.referrer_id, p.display_name, u.email, ua_ref.referral_disabled
        limit 500
      ) s), '[]'::jsonb)
  );
end;
$$;

-- Droits --------------------------------------------------------------------------------------
revoke all on function
  public.get_my_referral(),
  public.get_referral_preview(text),
  public.claim_referral(text),
  public.admin_revoke_referral_code(text, boolean, text),
  public.admin_enable_referrals(uuid),
  public.admin_referral_stats()
from public, anon, authenticated;

grant execute on function
  public.get_my_referral(),
  public.claim_referral(text),
  public.admin_revoke_referral_code(text, boolean, text),
  public.admin_enable_referrals(uuid),
  public.admin_referral_stats()
to authenticated, service_role;

-- Seule fonction ouverte à anon : l'écran de connexion affiche « Recommandé·e par … » avant
-- l'inscription (docs/DEVIATIONS.md).
grant execute on function public.get_referral_preview(text) to anon, authenticated, service_role;

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

-- Conformité : double authentification obligatoire pour le back-office (AIPD, mesure n° 1).
--
-- `public.is_admin()` est le seul point de vérité : la RLS des tables d'administration, chaque RPC
-- `admin_*` (par `private.require_admin()`), les règles de stockage des diplômes et la fonction
-- `review-diploma` (qui l'appelle avec le JWT de l'utilisateur) en dépendent. Exiger ici un JWT de
-- niveau `aal2` (session validée par un code TOTP) suffit donc à fermer tous les chemins d'admin à une
-- session qui n'a passé que l'email.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

comment on function public.is_admin() is
  'Vrai si l''appelant figure dans public.admins ET que sa session est de niveau aal2 (double authentification).';

-- Sert uniquement à aiguiller le back-office avant la double authentification : un compte admin en
-- aal1 est envoyé vers l'enrôlement ou la vérification du code, les autres reçoivent « accès refusé ».
-- Ne donne aucun droit et ne renseigne que sur soi-même.
create function public.is_admin_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin_account() from public, anon;
grant execute on function public.is_admin_account() to authenticated;

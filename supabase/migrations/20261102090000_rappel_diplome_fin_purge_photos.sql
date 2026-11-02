-- Deux nettoyages après la suppression du dating (20261031090000_nettoyage_dating) :
-- 1. fin de la purge transitoire des photos du dating, si le bucket `photos` a disparu ;
-- 2. l'invitation « Vérifions votre diplôme » est mémorisée sur le compte, plus sur l'appareil.

------------------------------------------------------------------------------------------------
-- 1. Purge des photos du dating
------------------------------------------------------------------------------------------------

-- Bucket disparu (base neuve, ou staging déjà purgé) : on retire la tâche et sa fonction d'appel.
-- Bucket encore présent : on laisse la tâche finir seule ; elle se désinscrit quand le bucket n'existe plus.
do $$
begin
  if exists (select 1 from storage.buckets b where b.id = 'photos') then
    raise notice 'Bucket photos encore présent : la tâche purge-dating-photos reste en place jusqu''à ce qu''il soit vidé et supprimé.';
  else
    if exists (select 1 from cron.job j where j.jobname = 'purge-dating-photos') then
      perform cron.unschedule('purge-dating-photos');
    end if;
    drop function if exists private.kick_dating_photo_purge();
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- 2. Invitation au diplôme mémorisée sur le compte
------------------------------------------------------------------------------------------------

alter table public.candidates add column diploma_prompt_dismissed_at timestamptz;

comment on column public.candidates.diploma_prompt_dismissed_at is
  'Invitation « Vérifions votre diplôme » écartée (« Plus tard » ou diplôme envoyé) ; null = à proposer.';

-- « Plus tard » : l'invitation ne revient sur aucun appareil. Idempotent (la première date est gardée).
create function public.dismiss_diploma_prompt()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_candidate();
begin
  update public.candidates c
     set diploma_prompt_dismissed_at = coalesce(c.diploma_prompt_dismissed_at, now())
   where c.user_id = v_uid;
  if not found then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.dismiss_diploma_prompt() from public, anon;
grant execute on function public.dismiss_diploma_prompt() to authenticated;

-- get_emploi_state et export_my_emploi_data gardent leur corps (20261028090200) sous un nom privé ; les versions
-- publiques ajoutent seulement le nouveau champ.
alter function public.get_emploi_state() set schema private;
alter function private.get_emploi_state() rename to emploi_state_base;
revoke all on function private.emploi_state_base() from public, anon, authenticated;

create function public.get_emploi_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb := private.emploi_state_base();
begin
  if jsonb_typeof(v_state -> 'candidate') = 'object' then
    v_state := jsonb_set(v_state, '{candidate,diploma_prompt_dismissed}', to_jsonb(exists (
      select 1 from public.candidates c
       where c.user_id = auth.uid() and c.diploma_prompt_dismissed_at is not null)));
  end if;
  return v_state;
end;
$$;

revoke all on function public.get_emploi_state() from public, anon;
grant execute on function public.get_emploi_state() to authenticated;

alter function public.export_my_emploi_data() set schema private;
alter function private.export_my_emploi_data() rename to export_emploi_data_base;
revoke all on function private.export_emploi_data_base() from public, anon, authenticated;

create function public.export_my_emploi_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb := private.export_emploi_data_base();
begin
  if v_out ->> 'kind' = 'candidate' then
    v_out := v_out || jsonb_build_object('diploma_prompt_dismissed_at', (
      select c.diploma_prompt_dismissed_at from public.candidates c where c.user_id = auth.uid()));
  end if;
  return v_out;
end;
$$;

revoke all on function public.export_my_emploi_data() from public, anon;
grant execute on function public.export_my_emploi_data() to authenticated;

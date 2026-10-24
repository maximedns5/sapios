-- Sapios Emploi : suppression d'un compte recruteur (Edge Functions delete-account et purge-inactive,
-- docs/EMPLOI_CONTRACT.md §5). Appelée avant la suppression de l'utilisateur d'authentification.
-- Recruteur seul membre de son entreprise : ses offres ouvertes passent `archived` (les candidatures en
-- attente reçoivent une réponse), les photos des offres sont effacées, l'entreprise reste pour
-- l'historique des candidats. Renvoie les chemins des photos à supprimer du stockage.
create function public.server_prepare_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_members;
  v_offer uuid;
  v_paths text[] := '{}';
  v_closed int := 0;
begin
  if not private.is_server_call() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_member from public.company_members cm where cm.user_id = p_user;
  if not found or exists (select 1 from public.company_members cm
                           where cm.company_id = v_member.company_id and cm.user_id <> p_user) then
    return jsonb_build_object('company_id', v_member.company_id, 'sole_member', false, 'photo_paths', '[]'::jsonb);
  end if;

  for v_offer in
    update public.offers o set status = 'archived', closed_at = now(),
           status_reason = 'Compte du recruteur supprimé'
     where o.company_id = v_member.company_id and o.status in ('draft', 'pending_review', 'published', 'rejected')
    returning o.id
  loop
    v_closed := v_closed + private.close_open_applications(v_offer, 'other',
      'Merci pour votre candidature. L’entreprise a retiré cette offre ; nous ne pouvons pas y donner suite.', null);
  end loop;

  with gone as (
    delete from public.offer_photos ph where ph.company_id = v_member.company_id returning ph.storage_path
  )
  select coalesce(array_agg(gone.storage_path), '{}') into v_paths from gone;

  perform private.audit(null, 'company.owner_deleted', 'companies', v_member.company_id::text,
                        jsonb_build_object('applications_closed', v_closed, 'photos', cardinality(v_paths)));
  return jsonb_build_object('company_id', v_member.company_id, 'sole_member', true, 'photo_paths', to_jsonb(v_paths));
end;
$$;

revoke all on function public.server_prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.server_prepare_account_deletion(uuid) to service_role;

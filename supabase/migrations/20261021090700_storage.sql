-- Buckets privés et politiques storage.objects (contrat §4, brief §7.3).
-- Chemin d'objet : `{user_id}/{uuid}.{ext}` ; le premier dossier est l'uid du propriétaire.
-- Les suppressions de fichiers passent par l'API Storage (Edge Functions), jamais par SQL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('diplomas', 'diplomas', false, 15728640,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('photos', 'photos', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture d'une photo : propriétaire, admin, ou profil visible (can_view_profile) et photo non
-- refusée par la modération.
create function private.can_read_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := (storage.foldername(p_name))[1];
  v_owner uuid;
begin
  if auth.uid() is null or v_folder is null then
    return false;
  end if;
  if v_folder = auth.uid()::text or public.is_admin() then
    return true;
  end if;
  if v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_owner := v_folder::uuid;
  return public.can_view_profile(v_owner)
     and not exists (select 1 from public.profile_photos ph
                      where ph.storage_path = p_name and ph.moderation_status = 'rejected');
end;
$$;

revoke all on function private.can_read_photo_object(text) from public, anon;
grant execute on function private.can_read_photo_object(text) to authenticated, service_role;

-- diplomas : dépôt dans son dossier uniquement, aucune lecture/modification/suppression client.
create policy diplomas_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'diplomas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- photos : dépôt et suppression dans son dossier, lecture selon can_view_profile.
create policy photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy photos_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy photos_select_visible on storage.objects for select to authenticated
  using (bucket_id = 'photos' and private.can_read_photo_object(name));

-- Lot 1 : droits et politiques RLS des nouvelles tables et colonnes.
-- Mêmes principes que 20261021090400_rls.sql : rien par défaut, puis table par table.

revoke all on public.profile_prompts, public.profile_answers, public.profile_books, public.profile_theses,
  public.discovery_prefs, public.content_flags, public.member_notices
from anon, authenticated;
grant all on public.profile_prompts, public.profile_answers, public.profile_books, public.profile_theses,
  public.discovery_prefs, public.content_flags, public.member_notices
to service_role;

-- profiles : nouvelles colonnes modifiables par le membre -------------------------------------
grant update (study_field, show_institution, show_quiz_badge) on public.profiles to authenticated;

-- profile_prompts : lecture membres, écriture admins ------------------------------------------
grant select, insert, update, delete on public.profile_prompts to authenticated;
create policy profile_prompts_select on public.profile_prompts for select to authenticated using (true);
create policy profile_prompts_admin_insert on public.profile_prompts for insert to authenticated
  with check (public.is_admin());
create policy profile_prompts_admin_update on public.profile_prompts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profile_prompts_admin_delete on public.profile_prompts for delete to authenticated
  using (public.is_admin());

-- profile_answers / profile_books : comme les photos -------------------------------------------
-- Lecture : soi, admin, ou profil visible (can_view_profile) et texte non retiré.
-- Écriture : le propriétaire seulement, jamais le statut de modération.
grant select, delete on public.profile_answers, public.profile_books to authenticated;
grant insert (user_id, position, prompt_key, answer) on public.profile_answers to authenticated;
grant update (position, prompt_key, answer) on public.profile_answers to authenticated;
grant insert (user_id, position, title, author, ol_work_id) on public.profile_books to authenticated;
grant update (position, title, author, ol_work_id) on public.profile_books to authenticated;

create policy profile_answers_select on public.profile_answers for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or (moderation_status <> 'rejected' and public.can_view_profile(user_id))
  );
create policy profile_answers_insert_own on public.profile_answers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_answers_update_own on public.profile_answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profile_answers_delete_own on public.profile_answers for delete to authenticated
  using (user_id = (select auth.uid()));

create policy profile_books_select on public.profile_books for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or (moderation_status <> 'rejected' and public.can_view_profile(user_id))
  );
create policy profile_books_insert_own on public.profile_books for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_books_update_own on public.profile_books for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profile_books_delete_own on public.profile_books for delete to authenticated
  using (user_id = (select auth.uid()));

-- profile_theses : en plus, « après un match » sauf si le membre l'ouvre à tous (D3) ------------
grant select, delete on public.profile_theses to authenticated;
grant insert (user_id, line, visibility) on public.profile_theses to authenticated;
grant update (line, visibility) on public.profile_theses to authenticated;

create policy profile_theses_select on public.profile_theses for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or (moderation_status <> 'rejected'
        and public.can_view_profile(user_id)
        and (visibility = 'everyone' or private.is_matched((select auth.uid()), user_id)))
  );
create policy profile_theses_insert_own on public.profile_theses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_theses_update_own on public.profile_theses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profile_theses_delete_own on public.profile_theses for delete to authenticated
  using (user_id = (select auth.uid()));

-- discovery_prefs : le membre seul ------------------------------------------------------------
grant select, delete on public.discovery_prefs to authenticated;
grant insert (user_id, max_distance_km, levels, strict_levels, fields, strict_fields, sort)
  on public.discovery_prefs to authenticated;
grant update (max_distance_km, levels, strict_levels, fields, strict_fields, sort)
  on public.discovery_prefs to authenticated;

create policy discovery_prefs_select_own on public.discovery_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy discovery_prefs_insert_own on public.discovery_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy discovery_prefs_update_own on public.discovery_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy discovery_prefs_delete_own on public.discovery_prefs for delete to authenticated
  using (user_id = (select auth.uid()));

-- content_flags : lecture admins ; écriture par les fonctions (triggers, RPC) ------------------
grant select on public.content_flags to authenticated;
create policy content_flags_select_admin on public.content_flags for select to authenticated
  using (public.is_admin());

-- member_notices : le membre lit les siens ; lecture marquée par ack_notice --------------------
grant select on public.member_notices to authenticated;
create policy member_notices_select_own on public.member_notices for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Fonctions internes utilisées par les politiques et triggers ---------------------------------
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

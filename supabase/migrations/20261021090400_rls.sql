-- Droits et politiques RLS (brief §6, §7.3).
-- Principe : on retire tout à anon/authenticated, puis on rend table par table, colonne par
-- colonne si nécessaire. service_role garde ses droits (il contourne la RLS).
-- Toutes les politiques ciblent `authenticated` (anon n'en a qu'une : l'insertion waitlist).

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- Fonctions internes : rien par défaut, puis le strict nécessaire aux politiques et aux
-- triggers `security invoker` qui s'exécutent avec le rôle du client.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_privileged(),
  private.is_server_call(),
  private.age_years(date),
  private.photo_count(uuid),
  private.can_access_match(uuid),
  private.is_not_banned()
to authenticated;
grant execute on all functions in schema private to service_role;

-- profiles ------------------------------------------------------------------------------------
grant select on public.profiles to authenticated;
-- Ni status, ni location (via set_location), ni last_active_at : colonnes non modifiables.
grant update (display_name, gender, seeking_genders, age_min, age_max, bio, city)
  on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.can_view_profile(id) or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- profile_private -----------------------------------------------------------------------------
-- Écriture par les RPC set_identity / set_sensitive_consent ; correction par un admin seulement.
grant select on public.profile_private to authenticated;
grant update (legal_name, birthdate, consent_sensitive_at, consent_version)
  on public.profile_private to authenticated;

create policy profile_private_select on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy profile_private_update_admin on public.profile_private for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profile_photos ------------------------------------------------------------------------------
grant select on public.profile_photos to authenticated;
grant insert (user_id, storage_path, position) on public.profile_photos to authenticated;
grant update (position, moderation_status) on public.profile_photos to authenticated;
grant delete on public.profile_photos to authenticated;

create policy profile_photos_select on public.profile_photos for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or (moderation_status <> 'rejected' and public.can_view_profile(user_id))
  );
create policy profile_photos_insert_own on public.profile_photos for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_photos_update_own on public.profile_photos for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy profile_photos_delete_own on public.profile_photos for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- degree_submissions --------------------------------------------------------------------------
-- Création par l'Edge Function submit-diploma (service_role). Le client lit ses lignes sans
-- signals / moderator_note / extracted / confidence / doc_sha256 / reviewer_id.
grant select (id, user_id, storage_path, mime, status, level_verified, rejection_reason,
              reviewed_at, file_deleted_at, attempts, created_at)
  on public.degree_submissions to authenticated;
grant update (moderator_note) on public.degree_submissions to authenticated;

create policy degree_submissions_select on public.degree_submissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy degree_submissions_update_admin on public.degree_submissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create view public.my_submissions
with (security_invoker = true) as
  select s.id, s.storage_path, s.mime, s.status, s.level_verified, s.rejection_reason,
         s.reviewed_at, s.file_deleted_at, s.created_at
  from public.degree_submissions s
  where s.user_id = (select auth.uid());
revoke all on public.my_submissions from anon, authenticated;
grant select on public.my_submissions to authenticated;

-- user_access : lecture de sa ligne, aucune écriture client -----------------------------------
grant select on public.user_access to authenticated;
create policy user_access_select on public.user_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- access_policy, app_copy, app_settings : lecture membres, écriture admins ---------------------
grant select, insert, update, delete on public.access_policy, public.app_copy, public.app_settings
  to authenticated;

create policy access_policy_select on public.access_policy for select to authenticated using (true);
create policy access_policy_admin_insert on public.access_policy for insert to authenticated
  with check (public.is_admin());
create policy access_policy_admin_update on public.access_policy for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy access_policy_admin_delete on public.access_policy for delete to authenticated
  using (public.is_admin());

create policy app_copy_select on public.app_copy for select to authenticated using (true);
create policy app_copy_admin_insert on public.app_copy for insert to authenticated
  with check (public.is_admin());
create policy app_copy_admin_update on public.app_copy for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy app_copy_admin_delete on public.app_copy for delete to authenticated
  using (public.is_admin());

create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_insert on public.app_settings for insert to authenticated
  with check (public.is_admin());
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy app_settings_admin_delete on public.app_settings for delete to authenticated
  using (public.is_admin());

-- swipes / matches : écrits uniquement par la RPC swipe ---------------------------------------
grant select on public.swipes, public.matches to authenticated;
create policy swipes_select_own on public.swipes for select to authenticated
  using (swiper_id = (select auth.uid()));
create policy matches_select_participant on public.matches for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- messages : participant d'un match actif, sans blocage ---------------------------------------
grant select on public.messages to authenticated;
grant insert (match_id, sender_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy messages_select_participant on public.messages for select to authenticated
  using (private.can_access_match(match_id));
create policy messages_insert_participant on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.can_access_match(match_id)
    and private.is_not_banned()
  );
-- Seul le destinataire marque comme lu.
create policy messages_mark_read on public.messages for update to authenticated
  using (private.can_access_match(match_id) and sender_id <> (select auth.uid()))
  with check (private.can_access_match(match_id) and sender_id <> (select auth.uid()));

-- blocks : création via block_user (qui dé-matche), lecture et levée de ses propres blocages ---
grant select, delete on public.blocks to authenticated;
create policy blocks_select_own on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_delete_own on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- reports : création via report_user, lecture/traitement admins -------------------------------
grant select on public.reports to authenticated;
create policy reports_select_admin on public.reports for select to authenticated
  using (public.is_admin());

-- push_tokens : chacun gère ses jetons --------------------------------------------------------
grant select, insert, update, delete on public.push_tokens to authenticated;
create policy push_tokens_select_own on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_insert_own on public.push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy push_tokens_update_own on public.push_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- admins --------------------------------------------------------------------------------------
grant select on public.admins to authenticated;
create policy admins_select on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- audit_log : lecture et ajout par les admins (le serveur écrit via service_role / RPC) --------
grant select, insert on public.audit_log to authenticated;
create policy audit_log_select_admin on public.audit_log for select to authenticated
  using (public.is_admin());
create policy audit_log_insert_admin on public.audit_log for insert to authenticated
  with check (public.is_admin() and actor_id = (select auth.uid()));

-- waitlist_signups : anon et membres peuvent seulement s'inscrire ------------------------------
grant insert (email, source) on public.waitlist_signups to anon, authenticated;
grant select, delete on public.waitlist_signups to authenticated;
create policy waitlist_insert_anon on public.waitlist_signups for insert to anon
  with check (true);
create policy waitlist_insert_authenticated on public.waitlist_signups for insert to authenticated
  with check (true);
create policy waitlist_select_admin on public.waitlist_signups for select to authenticated
  using (public.is_admin());
create policy waitlist_delete_admin on public.waitlist_signups for delete to authenticated
  using (public.is_admin());

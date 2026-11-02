-- Invitation « Vérifions votre diplôme » mémorisée sur le compte (20261102090000) : état, RPC, droits, export.
begin;
\ir _helpers.psql
\ir _emploi_helpers.psql
select plan(16);

do $$
begin
  perform pg_temp.new_candidate(1);
  perform pg_temp.new_candidate(2);
  perform pg_temp.new_recruiter(3);
  -- Candidat déclaré, sans profil encore créé.
  perform pg_temp.new_user(4);
  insert into public.emploi_accounts (user_id, kind) values (pg_temp.uid(4), 'candidate');
end;
$$;

-- État et RPC ------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(1), 'aal1');
select is((public.get_emploi_state() -> 'candidate' ->> 'diploma_prompt_dismissed')::boolean, false,
  'invitation à proposer tant qu''elle n''est pas écartée');
select lives_ok($$select public.dismiss_diploma_prompt()$$, '« Plus tard » enregistré');
select is((public.get_emploi_state() -> 'candidate' ->> 'diploma_prompt_dismissed')::boolean, true,
  'l''état le dit sur tous les appareils');
select ok((public.get_emploi_state() -> 'candidate' ->> 'number') is not null, 'le reste de l''état est inchangé');
select set_config('t.first', (select diploma_prompt_dismissed_at::text from public.candidates where user_id = pg_temp.uid(1)), true);
select lives_ok($$select public.dismiss_diploma_prompt()$$, 'deuxième appel accepté');
select is((select diploma_prompt_dismissed_at::text from public.candidates where user_id = pg_temp.uid(1)),
  current_setting('t.first'), 'la première date est gardée');
select ok((public.export_my_emploi_data() ->> 'diploma_prompt_dismissed_at') is not null, 'date présente dans l''export');

-- Écriture directe interdite, lecture limitée à soi -------------------------------------------------------
select throws_ok($$update public.candidates set diploma_prompt_dismissed_at = null where user_id = pg_temp.uid(1)$$,
  '42501', null, 'aucune écriture directe de la colonne');
select pg_temp.login(pg_temp.uid(2), 'aal1');
select is((select count(*)::int from public.candidates where user_id = pg_temp.uid(1)), 0,
  'un autre candidat ne lit pas la ligne');
select is((public.get_emploi_state() -> 'candidate' ->> 'diploma_prompt_dismissed')::boolean, false,
  'l''écart d''un candidat ne touche pas les autres');

-- Erreurs -----------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.uid(3), 'aal1');
select throws_ok($$select public.dismiss_diploma_prompt()$$, 'P0001', 'not_candidate', 'refusé à un recruteur');
select ok(not (public.export_my_emploi_data() ? 'diploma_prompt_dismissed_at'), 'export recruteur sans ce champ');
select pg_temp.login(pg_temp.uid(4), 'aal1');
select throws_ok($$select public.dismiss_diploma_prompt()$$, 'P0001', 'profile_incomplete', 'refusé sans profil');
select pg_temp.logout();

select ok(not has_function_privilege('anon', 'public.dismiss_diploma_prompt()', 'execute'), 'fermé aux anonymes');
select ok(not has_function_privilege('authenticated', 'private.emploi_state_base()', 'execute'),
  'le corps privé de get_emploi_state n''est pas appelable');
select ok(not has_function_privilege('authenticated', 'private.export_emploi_data_base()', 'execute'),
  'le corps privé de l''export n''est pas appelable');

select * from finish();
rollback;

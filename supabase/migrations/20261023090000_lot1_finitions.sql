-- Finitions du lot 1 :
-- 1. get_profile renvoie l'identifiant de chaque réponse et de chaque livre, cible d'un
--    signalement précis (report_user, p_content_kind / p_content_item) ;
-- 2. quota par membre des appels sortants, pour la recherche de livres (Edge Function
--    search-books, relais vers Open Library) ;
-- 3. textes de l'app du lot 1 dans app_copy, modifiables dans le back-office (« Textes »).

-- 1. Identifiants des textes dans la fiche ------------------------------------------------------
create or replace function public.get_profile(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_self boolean := p_target = v_uid;
  v_p public.profiles;
  v_me public.profiles;
  v_access public.user_access;
  v_thesis public.profile_theses;
  v_match uuid;
begin
  if p_target is null or not public.can_view_profile(p_target) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_p from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_me from public.profiles p where p.id = v_uid;
  select * into v_access from public.user_access ua where ua.user_id = p_target;
  select * into v_thesis from public.profile_theses t
   where t.user_id = p_target and t.moderation_status <> 'rejected';
  select m.id into v_match from public.matches m
   where m.user_a = least(v_uid, p_target) and m.user_b = greatest(v_uid, p_target)
     and m.unmatched_at is null and not v_self;

  if not v_self then
    perform private.touch_activity(v_uid);
  end if;

  return jsonb_build_object(
    'id', v_p.id,
    'is_self', v_self,
    'display_name', v_p.display_name,
    'age', (select private.age_years(pp.birthdate) from public.profile_private pp where pp.user_id = p_target),
    'city', v_p.city,
    'bio', v_p.bio,
    'distance_km', case when v_self or v_me.location is null or v_p.location is null then null
                        else greatest(1, round(extensions.st_distance(v_p.location, v_me.location) / 1000.0))::int end,
    'level', v_access.level,
    'study_field', v_p.study_field,
    'field_verified', coalesce(v_p.study_field = v_access.study_field, false),
    'institution', case when v_p.show_institution or v_self then v_access.institution end,
    'quiz_badge', v_p.show_quiz_badge,
    'thesis', case
      when v_thesis.user_id is null then null
      when v_self then jsonb_build_object('line', v_thesis.line, 'visibility', v_thesis.visibility)
      when v_thesis.visibility = 'everyone' or v_match is not null then jsonb_build_object('line', v_thesis.line)
    end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path,
                                                            'position', ph.position)
                                         order by ph.position, ph.created_at)
                          from public.profile_photos ph
                         where ph.user_id = p_target and ph.moderation_status <> 'rejected'), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'position', a.position, 'prompt_key', a.prompt_key,
                                                             'answer', a.answer) order by a.position)
                           from public.profile_answers a
                          where a.user_id = p_target and a.moderation_status <> 'rejected'), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'position', b.position, 'title', b.title,
                                                           'author', b.author) order by b.position)
                         from public.profile_books b
                        where b.user_id = p_target and b.moderation_status <> 'rejected'), '[]'::jsonb),
    'affinity', case when v_self then null else private.affinity(v_uid, p_target) end,
    'match_id', v_match,
    'my_swipe', (select s.direction from public.swipes s where s.swiper_id = v_uid and s.target_id = p_target)
  );
end;
$$;

-- 2. Quota des appels sortants -------------------------------------------------------------------
-- Fenêtre fixe par membre et par usage. Seul le serveur (Edge Function, service_role) l'utilise :
-- le membre ne voit ni ne modifie son compteur.
create table private.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z_]{1,40}$'),
  window_start timestamptz not null default now(),
  hits int not null default 0 check (hits >= 0),
  primary key (user_id, bucket)
);
alter table private.rate_limits enable row level security;

create function public.consume_rate_limit(p_user uuid, p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  perform private.require_server();
  if p_user is null or p_bucket is null or p_bucket !~ '^[a-z_]{1,40}$'
     or coalesce(p_limit, 0) < 1 or coalesce(p_window_seconds, 0) < 1 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  insert into private.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                            then now() else r.window_start end,
        hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                    then 1 else r.hits + 1 end
  returning r.hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, int, int) to service_role;

-- 3. Textes de l'app du lot 1 --------------------------------------------------------------------
-- Valeurs identiques aux replis de l'app (apps/mobile/src/lib/copy.tsx). Les accolades sont des
-- emplacements remplis par l'app : {title}, {count}, {field}, {prompt}, {institution}.
insert into public.app_copy (key, locale, text)
values
  ('feed.ranking', 'fr', 'L’âge et la distance filtrent. Les niveaux et domaines choisis passent ensuite en premier, puis vos affinités (même domaine, livres et questions en commun), puis l’activité récente. Aucun profil n’est mis en avant contre paiement.'),
  ('intellect.sensitive', 'fr', 'Visibles par les membres admis. Évitez la santé, la religion, la politique et tout ce qui permettrait de vous retrouver (téléphone, réseaux sociaux).'),
  ('intellect.thesis_warning', 'fr', 'Un sujet de thèse permet souvent de retrouver un nom complet en ligne. D’où « après un match » par défaut.'),
  ('likes.teaser', 'fr', 'Elles sont déjà dans votre découverte. Likez-les en retour pour faire match.'),
  ('quiz.badge', 'fr', 'QI : non communiqué. Par modestie.'),
  ('affinity.book_one', 'fr', 'Vous avez tous deux lu « {title} ». Ou prétendu.'),
  ('affinity.books_many', 'fr', '{count} livres en commun, dont « {title} ».'),
  ('affinity.same_field', 'fr', 'Même domaine : {field}. L’interdisciplinarité attendra.'),
  ('affinity.prompt_one', 'fr', 'Vous avez répondu à la même question : « {prompt} ».'),
  ('affinity.prompts_many', 'fr', '{count} questions en commun.'),
  ('affinity.same_institution', 'fr', 'Même établissement : {institution}.'),
  ('profile.thesis_footnote', 'fr', 'Les autres en ont fait 400 pages.'),
  ('library.empty', 'fr', 'Aucun livre pour l’instant. Les titres en commun rapprochent les esprits.')
on conflict (key, locale) do nothing;

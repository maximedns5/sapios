-- Pipeline asynchrone : file pgmq d'extraction, tâches pg_cron, notifications pg_net,
-- publication Realtime. Les appels HTTP lisent `project_url` et `internal_secret` dans Vault
-- (voir l'en-tête de supabase/seed.sql) et n'échouent jamais la transaction appelante.

-- File d'extraction des diplômes ---------------------------------------------------------------
select pgmq.create('diploma_extraction');

create function private.enqueue_diploma_extraction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.send('diploma_extraction', jsonb_build_object(
    'submission_id', new.id,
    'user_id', new.user_id,
    'storage_path', new.storage_path,
    'mime', new.mime
  ));
  return new;
end;
$$;

create trigger degree_submissions_enqueue
  after insert on public.degree_submissions
  for each row execute function private.enqueue_diploma_extraction();

-- Enveloppes pgmq pour l'Edge Function process-diploma (service_role uniquement).
create function public.diploma_queue_read(p_qty int, p_vt int)
returns table (msg_id bigint, read_ct int, enqueued_at timestamptz, vt timestamptz, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_server();
  return query
  select r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  from pgmq.read('diploma_extraction', greatest(coalesce(p_vt, 60), 1), least(greatest(coalesce(p_qty, 1), 1), 50)) r;
end;
$$;

create function public.diploma_queue_delete(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_server();
  return pgmq.delete('diploma_extraction', p_msg_id);
end;
$$;

revoke all on function public.diploma_queue_read(int, int), public.diploma_queue_delete(bigint)
  from public, anon, authenticated;
grant execute on function public.diploma_queue_read(int, int), public.diploma_queue_delete(bigint)
  to service_role;

-- Tâches planifiées ---------------------------------------------------------------------------
-- N'appelle process-diploma que si un message est visible dans la file. Délai pg_net de 150 s :
-- un appel au modèle d'extraction prend souvent 10 à 60 s.
create function private.kick_diploma_processing()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from pgmq.q_diploma_extraction q where q.vt <= clock_timestamp()) then
    return private.invoke_edge_function('process-diploma', '{}'::jsonb, 150000);
  end if;
  return null;
end;
$$;

select cron.schedule('process-diploma', '* * * * *', $$select private.kick_diploma_processing()$$);
select cron.schedule('purge-diplomas', '17 3 * * *', $$select private.invoke_edge_function('purge-diplomas', '{}'::jsonb, 120000)$$);

-- Notifications push (Edge Function notify) ---------------------------------------------------
create function private.notify_new_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_edge_function('notify', jsonb_build_object('type', 'match', 'match_id', new.id));
  return null;
end;
$$;

create function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_edge_function('notify', jsonb_build_object('type', 'message', 'message_id', new.id));
  return null;
end;
$$;

create trigger matches_notify after insert on public.matches
  for each row execute function private.notify_new_match();
create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_new_message();

revoke all on all functions in schema private from public, anon;
revoke execute on function
  private.enqueue_diploma_extraction(),
  private.kick_diploma_processing(),
  private.notify_new_match(),
  private.notify_new_message(),
  private.invoke_edge_function(text, jsonb, int)
from authenticated;
grant execute on all functions in schema private to service_role;

-- Realtime : uniquement les messages et les matches (la diffusion respecte la RLS) -------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
alter publication supabase_realtime set table public.messages, public.matches;

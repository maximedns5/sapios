-- Extensions et schéma interne.
-- postgis/citext dans `extensions` (convention Supabase), pg_net crée `net`, pgmq crée `pgmq`,
-- pg_cron vit dans `cron` (base `postgres`).

create extension if not exists citext with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pgmq;
create extension if not exists supabase_vault with schema vault;

-- Schéma non exposé par l'API (absent de [api].schemas) : fonctions internes et triggers.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

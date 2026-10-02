-- =============================================================================
-- 0001 Foundation
-- Extensions, shared helper functions, and default privileges.
--
-- Security model (see docs/SECURITY.md):
--   * The browser never talks to Supabase. All reads/writes happen in Next.js
--     server code using the Supabase SECRET key (service_role).
--   * Every table has Row Level Security enabled with NO policies, so the
--     public `anon` / `authenticated` roles can read or write nothing.
--   * Privileges for anon/authenticated are revoked as a second layer.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Objects created by this role in `public` from now on are NOT granted to the
-- public API roles. (Supabase grants them by default.)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Generic "keep updated_at current" trigger function.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;  -- created_at is immutable
  end if;
  return new;
end;
$$;

-- Generic "this table is append-only" guard (history/version tables).
create or replace function public.prevent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Rows in % are permanent history and cannot be changed or deleted.', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- Business-day "today" in the application's timezone.
create or replace function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

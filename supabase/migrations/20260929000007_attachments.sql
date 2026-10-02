-- =============================================================================
-- 0007 Attachments (tables + private bucket)
-- The Photos UI ships after the First Milestone; the tables and the private
-- bucket are created now so the schema is complete.
-- Storage path: <ticket-number>/<uuid>-<original filename>
-- The bucket is PRIVATE and has no storage policies for anon/authenticated:
-- files are reachable only through short-lived signed URLs issued by the
-- server after a session check.
-- =============================================================================

create table public.ticket_photos (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.tickets (id) on delete restrict,
  storage_path       text not null unique check (char_length(storage_path) <= 500),
  original_filename  text not null check (char_length(original_filename) between 1 and 255),
  mime_type          text not null check (mime_type like 'image/%'),
  size_bytes         bigint not null check (size_bytes > 0),
  description        text check (char_length(description) <= 1000),
  uploaded_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);
create index ticket_photos_ticket_idx on public.ticket_photos (ticket_id, uploaded_at desc);

create table public.ticket_files (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.tickets (id) on delete restrict,
  storage_path       text not null unique check (char_length(storage_path) <= 500),
  original_filename  text not null check (char_length(original_filename) between 1 and 255),
  mime_type          text not null check (char_length(mime_type) <= 150),
  size_bytes         bigint not null check (size_bytes > 0),
  description        text check (char_length(description) <= 1000),
  uploaded_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);
create index ticket_files_ticket_idx on public.ticket_files (ticket_id, uploaded_at desc);

create or replace function public.attachments_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.uploaded_at := old.uploaded_at;
  new.ticket_id := old.ticket_id;
  new.storage_path := old.storage_path;
  return new;
end;
$$;
create trigger ticket_photos_touch before update on public.ticket_photos
  for each row execute function public.attachments_touch();
create trigger ticket_files_touch before update on public.ticket_files
  for each row execute function public.attachments_touch();

create or replace function public.attachments_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text := case when tg_table_name = 'ticket_photos' then 'photo' else 'file' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.ticket_id, v_kind || '_uploaded', initcap(v_kind) || ' uploaded',
            jsonb_build_object('id', new.id, 'filename', new.original_filename));
  elsif new.archived_at is not null and old.archived_at is null then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.ticket_id, v_kind || '_archived', initcap(v_kind) || ' deleted',
            jsonb_build_object('id', new.id, 'filename', new.original_filename));
  end if;
  return new;
end;
$$;
create trigger ticket_photos_audit after insert or update on public.ticket_photos
  for each row execute function public.attachments_audit();
create trigger ticket_files_audit after insert or update on public.ticket_files
  for each row execute function public.attachments_audit();

alter table public.ticket_photos enable row level security;
alter table public.ticket_files  enable row level security;
revoke all on public.ticket_photos, public.ticket_files from anon, authenticated;
grant all on public.ticket_photos, public.ticket_files to service_role;

-- Private bucket, 25 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-files', 'ticket-files', false, 26214400)
on conflict (id) do update set public = false;

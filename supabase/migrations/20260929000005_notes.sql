-- =============================================================================
-- 0005 Ticket notes + note version history
-- Every edit preserves the previous text in ticket_note_versions. This is
-- enforced by a trigger, so NO code path (app, SQL editor, future feature)
-- can overwrite a note without saving the prior version first.
-- =============================================================================

create table public.ticket_notes (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete restrict,
  note_text   text not null check (char_length(btrim(note_text)) between 1 and 20000),
  source      text not null default 'manual' check (source in ('manual', 'generated', 'wizard')),
  edit_count  integer not null default 0 check (edit_count >= 0),
  edited_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index ticket_notes_ticket_idx on public.ticket_notes (ticket_id, created_at desc);

-- version_number 1 = the original text, 2 = the text after the first edit, ...
-- The CURRENT text lives on ticket_notes and is version (edit_count + 1).
create table public.ticket_note_versions (
  id              uuid primary key default gen_random_uuid(),
  note_id         uuid not null references public.ticket_notes (id) on delete restrict,
  version_number  integer not null check (version_number >= 1),
  note_text       text not null,
  version_created_at timestamptz not null,           -- when this text was first saved
  replaced_at     timestamptz not null default now(), -- when it was replaced by an edit
  edit_reason     text check (char_length(edit_reason) <= 500), -- reason given for that edit
  unique (note_id, version_number)
);

create trigger ticket_note_versions_append_only
  before update or delete on public.ticket_note_versions
  for each row execute function public.prevent_modification();

create or replace function public.ticket_notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.ticket_id := old.ticket_id;       -- a note can't move to another ticket
  new.created_at := old.created_at;
  new.source := old.source;
  new.updated_at := now();

  if new.note_text is distinct from old.note_text then
    insert into public.ticket_note_versions
      (note_id, version_number, note_text, version_created_at, edit_reason)
    values
      (old.id, old.edit_count + 1, old.note_text,
       coalesce(old.edited_at, old.created_at),
       nullif(btrim(current_setting('app.edit_reason', true)), ''));
    new.edit_count := old.edit_count + 1;
    new.edited_at := now();
  else
    new.edit_count := old.edit_count;
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

create trigger ticket_notes_before_update
  before update on public.ticket_notes
  for each row execute function public.ticket_notes_before_update();

create or replace function public.ticket_notes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  new.edit_count := 0;
  new.edited_at := null;
  return new;
end;
$$;

create trigger ticket_notes_before_insert
  before insert on public.ticket_notes
  for each row execute function public.ticket_notes_before_insert();

-- Edit a note with an optional reason and optimistic-concurrency check.
-- Raises 'NOTE_CONFLICT' if the note changed since p_expected_updated_at.
create or replace function public.edit_ticket_note(
  p_note_id uuid,
  p_new_text text,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns public.ticket_notes
language plpgsql
set search_path = ''
as $$
declare
  v_note public.ticket_notes;
begin
  select * into v_note from public.ticket_notes where id = p_note_id for update;
  if not found then
    raise exception 'NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_note.archived_at is not null then
    raise exception 'NOTE_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v_note.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'NOTE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_note.note_text = p_new_text then
    return v_note;  -- nothing changed; no new version
  end if;

  perform set_config('app.edit_reason', coalesce(p_reason, ''), true);
  update public.ticket_notes set note_text = p_new_text where id = p_note_id
  returning * into v_note;
  perform set_config('app.edit_reason', '', true);
  return v_note;
end;
$$;

alter table public.ticket_notes         enable row level security;
alter table public.ticket_note_versions enable row level security;
revoke all on public.ticket_notes, public.ticket_note_versions from anon, authenticated;
grant all on public.ticket_notes, public.ticket_note_versions to service_role;
revoke all on function public.edit_ticket_note(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.edit_ticket_note(uuid, text, text, timestamptz) to service_role;

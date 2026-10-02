-- =============================================================================
-- 0006 Ticket history (audit trail)
-- Written by triggers, so every change is recorded regardless of which screen
-- (or SQL) made it. History rows are append-only.
-- =============================================================================

create table public.ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete restrict,
  event_type  text not null check (event_type in (
                'created', 'edited', 'status_changed', 'resolution_changed',
                'rush_started', 'rush_ended',
                'note_added', 'note_edited', 'note_archived',
                'photo_uploaded', 'photo_archived', 'file_uploaded', 'file_archived',
                'added_to_limits', 'added_to_claims',
                'closed', 'reopened', 'archived', 'restored')),
  summary     text not null,
  changes     jsonb not null default '{}'::jsonb,  -- {field: {from, to}} or event details
  actor       text not null default 'Jessica',
  created_at  timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at desc);

create trigger ticket_events_append_only
  before update or delete on public.ticket_events
  for each row execute function public.prevent_modification();

-- Fields whose changes are recorded as "resolution_changed" instead of "edited".
create or replace function public.ticket_resolution_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['resolution_type', 'resolution', 'reprint_order_number',
               'reprint_value', 'refund_value', 'discount_value', 'credit_value'];
$$;

-- {field: {from, to}} for every changed column, minus system-managed ones.
create or replace function public.jsonb_row_diff(p_old jsonb, p_new jsonb, p_exclude text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(p_new) n
  join jsonb_each(p_old) o on o.key = n.key
  where n.value is distinct from o.value
    and not (n.key = any (p_exclude));
$$;

create or replace function public.tickets_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_system  text[] := array['id', 'created_at', 'updated_at', 'status', 'status_changed_at',
                            'rush_started_at', 'closed_at', 'archived_at'];
  v_all     jsonb;
  v_edit    jsonb;
  v_res     jsonb;
  v_period  public.ticket_rush_periods;
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.id, 'created', 'Ticket created',
            jsonb_build_object('status', new.status, 'issue', new.issue));
    if new.status = 'rush_reprint' then
      insert into public.ticket_rush_periods (ticket_id, started_at) values (new.id, new.rush_started_at);
      insert into public.ticket_events (ticket_id, event_type, summary)
      values (new.id, 'rush_started', 'Rush Reprint started');
    end if;
    return new;
  end if;

  -- UPDATE: field edits
  v_all  := public.jsonb_row_diff(to_jsonb(old), to_jsonb(new), v_system);
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_res
    from jsonb_each(v_all) e
   where e.key = any (public.ticket_resolution_fields());
  v_edit := v_all - public.ticket_resolution_fields();

  if v_edit <> '{}'::jsonb then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.id, 'edited', 'Ticket edited', v_edit);
  end if;
  if coalesce(v_res, '{}'::jsonb) <> '{}'::jsonb then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.id, 'resolution_changed', 'Resolution changed', v_res);
  end if;

  -- Status transitions
  if new.status is distinct from old.status then
    if new.status = 'closed' then
      insert into public.ticket_events (ticket_id, event_type, summary, changes)
      values (new.id, 'closed', 'Ticket closed',
              jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)));
    elsif old.status = 'closed' then
      insert into public.ticket_events (ticket_id, event_type, summary, changes)
      values (new.id, 'reopened', 'Ticket reopened',
              jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)));
    else
      insert into public.ticket_events (ticket_id, event_type, summary, changes)
      values (new.id, 'status_changed', 'Status changed',
              jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)));
    end if;

    if old.status = 'rush_reprint' then
      update public.ticket_rush_periods
         set ended_at = now(), ended_status = new.status
       where ticket_id = new.id and ended_at is null
      returning * into v_period;
      insert into public.ticket_events (ticket_id, event_type, summary, changes)
      values (new.id, 'rush_ended', 'Rush Reprint ended',
              jsonb_build_object('started_at', old.rush_started_at, 'ended_at', now(),
                                 'minutes', round(extract(epoch from (now() - old.rush_started_at)) / 60.0, 1)));
    end if;
    if new.status = 'rush_reprint' then
      insert into public.ticket_rush_periods (ticket_id, started_at) values (new.id, new.rush_started_at);
      insert into public.ticket_events (ticket_id, event_type, summary)
      values (new.id, 'rush_started', 'Rush Reprint started');
    end if;
  end if;

  -- Archive / restore
  if new.archived_at is distinct from old.archived_at then
    insert into public.ticket_events (ticket_id, event_type, summary)
    values (new.id, case when new.archived_at is null then 'restored' else 'archived' end,
            case when new.archived_at is null then 'Ticket restored' else 'Ticket archived' end);
  end if;

  return new;
end;
$$;

create trigger tickets_audit
  after insert or update on public.tickets
  for each row execute function public.tickets_audit();

-- Notes -> history
create or replace function public.ticket_notes_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.ticket_id, 'note_added', 'Note added', jsonb_build_object('note_id', new.id));
  elsif new.note_text is distinct from old.note_text then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.ticket_id, 'note_edited', 'Note edited',
            jsonb_build_object('note_id', new.id, 'version', new.edit_count + 1,
                               'reason', nullif(btrim(current_setting('app.edit_reason', true)), '')));
  elsif new.archived_at is not null and old.archived_at is null then
    insert into public.ticket_events (ticket_id, event_type, summary, changes)
    values (new.ticket_id, 'note_archived', 'Note archived', jsonb_build_object('note_id', new.id));
  end if;
  return new;
end;
$$;

create trigger ticket_notes_audit
  after insert or update on public.ticket_notes
  for each row execute function public.ticket_notes_audit();

alter table public.ticket_events enable row level security;
revoke all on public.ticket_events from anon, authenticated;
grant all on public.ticket_events to service_role;
revoke all on function public.jsonb_row_diff(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.ticket_resolution_fields() from public, anon, authenticated;
grant execute on function public.jsonb_row_diff(jsonb, jsonb, text[]) to service_role;
grant execute on function public.ticket_resolution_fields() to service_role;

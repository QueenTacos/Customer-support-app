-- =============================================================================
-- 0004 Tickets
-- The hub table. Notes, history, attachments (and later LIMITS / Claims) all
-- reference tickets.id. Tickets are never hard-deleted (archived_at instead).
-- =============================================================================

create table public.tickets (
  id                  uuid primary key default gen_random_uuid(),

  -- Identity ------------------------------------------------------------------
  ticket_number       text not null
                      check (char_length(ticket_number) between 1 and 64 and ticket_number = btrim(ticket_number)),
  date_opened         date not null default public.app_today(),
  point_of_contact    text not null default 'SW' check (point_of_contact in ('SW', 'MC', 'LPU')),
  assigned_to         text not null default 'Jessica' check (char_length(assigned_to) between 1 and 80),

  -- Customer & order ------------------------------------------------------------
  customer_name       text not null check (char_length(btrim(customer_name)) between 1 and 200),
  contact_name        text check (char_length(contact_name) <= 200),
  order_number        text check (char_length(order_number) <= 64),
  department_id       uuid references public.departments (id) on delete restrict,
  material_id         uuid references public.materials (id) on delete restrict,
  material_type       text check (char_length(material_type) <= 200),
  size                text check (char_length(size) <= 100),
  quantity            integer check (quantity >= 0),
  sqft                numeric(12,2) check (sqft >= 0),
  sheets              integer check (sheets >= 0),
  order_value         numeric(12,2) check (order_value >= 0),
  shipping_cost       numeric(12,2) check (shipping_cost >= 0),
  tracking_number     text check (char_length(tracking_number) <= 100),

  -- Issue ---------------------------------------------------------------------
  issue               text not null
                      check (issue in ('damage', 'missing', 'late', 'color', 'cutting', 'production', 'file', 'other')),
  issue_summary       text check (char_length(issue_summary) <= 2000),
  fault               text check (fault in ('production_error', 'fedex_error', 'customer_error', 'other')),
  fault_suggested     text check (fault_suggested in ('production_error', 'fedex_error', 'customer_error', 'other')),

  -- Conditional answers (NULL = not asked / unknown; distinct from "No") -------
  usable_as_is                boolean,
  package_damaged             boolean,
  damaged_pieces              integer check (damaged_pieces >= 0),
  all_boxes_received          boolean,
  sorted_through              boolean,
  photos_received             boolean,
  missing_items               text check (char_length(missing_items) <= 2000),
  delivered                   boolean,
  still_usable                boolean,
  fedex_investigation_opened  boolean,
  carrier_responsible         boolean,
  in_hands_date               date,

  -- Resolution ----------------------------------------------------------------
  resolution_type       text check (resolution_type in ('reprint', 'refund', 'discount', 'credit', 'none', 'other')),
  resolution            text check (char_length(resolution) <= 4000),
  reprint_order_number  text check (char_length(reprint_order_number) <= 64),
  reprint_value         numeric(12,2) check (reprint_value >= 0),
  refund_value          numeric(12,2) check (refund_value >= 0),
  discount_value        numeric(12,2) check (discount_value >= 0),
  credit_value          numeric(12,2) check (credit_value >= 0),

  -- Workflow ------------------------------------------------------------------
  status              text not null default 'open'
                      check (status in ('open', 'in_progress', 'follow_up', 'waiting_photos',
                                        'waiting_customer', 'waiting_fedex', 'rush_reprint', 'closed')),
  status_changed_at   timestamptz not null default now(),
  follow_up_date      date,
  rush_started_at     timestamptz,
  add_to_limits       boolean not null default false,
  add_to_claims       boolean not null default false,

  -- Timestamps ------------------------------------------------------------------
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz,
  archived_at         timestamptz,

  constraint tickets_closed_consistent check ((status = 'closed') = (closed_at is not null)),
  constraint tickets_rush_consistent   check ((status = 'rush_reprint') = (rush_started_at is not null))
);

comment on column public.tickets.fault_suggested is 'Fault the app suggested at the time; kept for audit even if Jessica overrode it.';
comment on column public.tickets.carrier_responsible is 'Answer to "Is FedEx/the carrier responsible?" Drives the FedEx Error suggestion.';

-- Ticket numbers are unique regardless of case/whitespace.
create unique index tickets_ticket_number_key on public.tickets (lower(ticket_number));

-- Filtering / sorting
create index tickets_status_idx          on public.tickets (status) where archived_at is null;
create index tickets_follow_up_idx       on public.tickets (follow_up_date) where archived_at is null and status <> 'closed';
create index tickets_date_opened_idx     on public.tickets (date_opened);
create index tickets_issue_idx           on public.tickets (issue);
create index tickets_fault_idx           on public.tickets (fault);
create index tickets_department_idx      on public.tickets (department_id);
create index tickets_material_idx        on public.tickets (material_id);
create index tickets_order_number_idx    on public.tickets (lower(order_number));

-- Partial-match ("contains") search
create index tickets_ticket_number_trgm   on public.tickets using gin (ticket_number extensions.gin_trgm_ops);
create index tickets_order_number_trgm    on public.tickets using gin (order_number extensions.gin_trgm_ops);
create index tickets_customer_name_trgm   on public.tickets using gin (customer_name extensions.gin_trgm_ops);
create index tickets_contact_name_trgm    on public.tickets using gin (contact_name extensions.gin_trgm_ops);
create index tickets_tracking_number_trgm on public.tickets using gin (tracking_number extensions.gin_trgm_ops);

-- Each Rush Reprint period is preserved (a ticket can go in and out of rush).
create table public.ticket_rush_periods (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete restrict,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_status text,
  check (ended_at is null or ended_at >= started_at)
);
create index ticket_rush_periods_ticket_idx on public.ticket_rush_periods (ticket_id, started_at desc);
-- At most one open rush period per ticket.
create unique index ticket_rush_periods_one_open on public.ticket_rush_periods (ticket_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- BEFORE trigger: keeps system-managed columns honest no matter who writes.
-- ---------------------------------------------------------------------------
create or replace function public.tickets_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_material_department uuid;
begin
  -- Material always belongs to its department: auto-align department.
  if new.material_id is not null then
    select department_id into v_material_department from public.materials where id = new.material_id;
    new.department_id := v_material_department;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.status_changed_at := now();
    new.rush_started_at := case when new.status = 'rush_reprint' then now() else null end;
    new.closed_at       := case when new.status = 'closed' then now() else null end;
    return new;
  end if;

  -- UPDATE
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.rush_started_at := case when new.status = 'rush_reprint' then now() else null end;
    new.closed_at       := case when new.status = 'closed' then now() else null end;
  else
    -- Status unchanged: these can only move with a status change.
    new.status_changed_at := old.status_changed_at;
    new.rush_started_at   := old.rush_started_at;
    new.closed_at         := old.closed_at;
  end if;

  return new;
end;
$$;

create trigger tickets_before_write
  before insert or update on public.tickets
  for each row execute function public.tickets_before_write();

alter table public.tickets             enable row level security;
alter table public.ticket_rush_periods enable row level security;
revoke all on public.tickets, public.ticket_rush_periods from anon, authenticated;
grant all on public.tickets, public.ticket_rush_periods to service_role;

-- ---------------------------------------------------------------------------
-- Search: partial match on ticket #, order #, customer, contact, tracking #.
-- Returns tickets so callers can keep filtering/sorting with PostgREST.
-- ---------------------------------------------------------------------------
create or replace function public.search_tickets(p_query text default null)
returns setof public.tickets
language sql
stable
set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_query, '')) = '' as empty
  )
  select t.*
  from public.tickets t, q
  where t.archived_at is null
    and (q.empty
         or t.ticket_number   ilike q.pat
         or t.order_number    ilike q.pat
         or t.customer_name   ilike q.pat
         or t.contact_name    ilike q.pat
         or t.tracking_number ilike q.pat
         or t.reprint_order_number ilike q.pat);
$$;

revoke all on function public.search_tickets(text) from public, anon, authenticated;
grant execute on function public.search_tickets(text) to service_role;

-- =============================================================================
-- 0009 Quick Import support
--  * tickets.fedex_case_number  (a FedEx trace/claim case like C-259861376;
--    deliberately separate from tracking_number)
--  * material_aliases           (shorthand like "Coro 4m DS" -> a material)
--  * RIGID material "Coro 4mil Double Sided" + its known shorthand aliases
-- Safe to run once on a database that already has migrations 0001-0008.
-- =============================================================================

-- 1. FedEx case number -------------------------------------------------------
alter table public.tickets
  add column if not exists fedex_case_number text
  check (char_length(fedex_case_number) <= 64);

create index if not exists tickets_fedex_case_trgm
  on public.tickets using gin (fedex_case_number extensions.gin_trgm_ops);

-- Search now also matches FedEx case numbers.
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
         or t.fedex_case_number ilike q.pat
         or t.reprint_order_number ilike q.pat);
$$;
revoke all on function public.search_tickets(text) from public, anon, authenticated;
grant execute on function public.search_tickets(text) to service_role;

-- update_ticket must copy the new column too (same function, one column added).
create or replace function public.update_ticket(
  p_id uuid,
  p_changes jsonb,
  p_expected_updated_at timestamptz default null
)
returns public.tickets
language plpgsql
set search_path = ''
as $$
declare
  v public.tickets;
  n public.tickets;
begin
  select * into v from public.tickets where id = p_id for update;
  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'TICKET_CONFLICT' using errcode = 'P0001';
  end if;

  n := jsonb_populate_record(v, p_changes - array['id', 'created_at', 'updated_at', 'status_changed_at',
                                                  'rush_started_at', 'closed_at', 'archived_at']);

  update public.tickets set
    ticket_number = n.ticket_number, date_opened = n.date_opened, point_of_contact = n.point_of_contact,
    assigned_to = n.assigned_to, customer_name = n.customer_name, contact_name = n.contact_name,
    order_number = n.order_number, department_id = n.department_id, material_id = n.material_id,
    material_type = n.material_type, size = n.size, quantity = n.quantity, sqft = n.sqft, sheets = n.sheets,
    order_value = n.order_value, shipping_cost = n.shipping_cost, tracking_number = n.tracking_number,
    fedex_case_number = n.fedex_case_number,
    issue = n.issue, issue_summary = n.issue_summary, fault = n.fault, fault_suggested = n.fault_suggested,
    usable_as_is = n.usable_as_is, package_damaged = n.package_damaged, damaged_pieces = n.damaged_pieces,
    all_boxes_received = n.all_boxes_received, sorted_through = n.sorted_through,
    photos_received = n.photos_received, missing_items = n.missing_items, delivered = n.delivered,
    still_usable = n.still_usable, fedex_investigation_opened = n.fedex_investigation_opened,
    carrier_responsible = n.carrier_responsible, in_hands_date = n.in_hands_date,
    resolution_type = n.resolution_type, resolution = n.resolution,
    reprint_order_number = n.reprint_order_number, reprint_value = n.reprint_value,
    refund_value = n.refund_value, discount_value = n.discount_value, credit_value = n.credit_value,
    status = n.status, follow_up_date = n.follow_up_date,
    add_to_limits = n.add_to_limits, add_to_claims = n.add_to_claims
  where id = p_id
  returning * into v;

  return v;
end;
$$;
revoke all on function public.update_ticket(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.update_ticket(uuid, jsonb, timestamptz) to service_role;

-- 2. Material aliases -------------------------------------------------------
create table if not exists public.material_aliases (
  id                uuid primary key default gen_random_uuid(),
  material_id       uuid not null references public.materials (id) on delete restrict,
  alias             text not null check (char_length(btrim(alias)) between 1 and 120),
  -- lower-case, single-spaced form used for matching ("Coro  4M ds" -> "coro 4m ds")
  alias_normalized  text generated always as (lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) stored,
  created_at        timestamptz not null default now()
);
create unique index if not exists material_aliases_normalized_key on public.material_aliases (alias_normalized);
create index if not exists material_aliases_material_idx on public.material_aliases (material_id);

alter table public.material_aliases enable row level security;
revoke all on public.material_aliases from anon, authenticated;
grant all on public.material_aliases to service_role;

-- 3. Coro 4mil Double Sided (RIGID) + aliases --------------------------------
insert into public.materials (department_id, name, is_rigid, sort_order)
select d.id, 'Coro 4mil Double Sided', true, 10
from public.departments d
where d.code = 'RIGID'
on conflict do nothing;

insert into public.material_aliases (material_id, alias)
select m.id, a.alias
from public.materials m
join public.departments d on d.id = m.department_id and d.code = 'RIGID'
cross join (values ('Coro 4m DS'), ('Coro 4mil DS'), ('4mil Coro DS'), ('4m Coro DS')) as a(alias)
where m.name = 'Coro 4mil Double Sided'
on conflict do nothing;

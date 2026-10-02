-- =============================================================================
-- 0010 Affected Item Value
-- The dollar value of the product line involved in a ticket (e.g. $220.00 for
-- one line of a larger order). Kept separate from order_value, which is the
-- TOTAL order value and is only filled when a source explicitly labels it
-- (Grand Total / Order Total / Total Order Value).
-- Safe to run more than once.
-- =============================================================================

alter table public.tickets
  add column if not exists affected_item_value numeric(12,2)
  check (affected_item_value >= 0);

comment on column public.tickets.affected_item_value is
  'Value of the affected product/line (not the whole order). UI label: Affected Item Value.';
comment on column public.tickets.order_value is
  'TOTAL order value. Only from an explicit Grand Total / Order Total. UI label: Total Order Value.';

-- update_ticket must copy the new column (same as 0009 + affected_item_value).
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
    fedex_case_number = n.fedex_case_number, affected_item_value = n.affected_item_value,
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

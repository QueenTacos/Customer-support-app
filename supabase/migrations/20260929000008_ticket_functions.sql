-- =============================================================================
-- 0008 Ticket write functions
-- create_ticket: inserts a ticket and (optionally) its first note atomically.
-- update_ticket: partial update with an optimistic-concurrency check so two
--                open tabs can't silently overwrite each other.
-- System-managed columns (timestamps, rush/closed stamps) are always set by
-- the tickets_before_write trigger, never by these inputs.
-- =============================================================================

create or replace function public.create_ticket(p_ticket jsonb, p_note text default null)
returns public.tickets
language plpgsql
set search_path = ''
as $$
declare
  v public.tickets;
begin
  v := jsonb_populate_record(null::public.tickets, p_ticket);
  v.id                := gen_random_uuid();
  v.date_opened       := coalesce(v.date_opened, public.app_today());
  v.status            := coalesce(v.status, 'open');
  v.point_of_contact  := coalesce(v.point_of_contact, 'SW');
  v.assigned_to       := coalesce(v.assigned_to, 'Jessica');
  v.add_to_limits     := coalesce(v.add_to_limits, false);
  v.add_to_claims     := coalesce(v.add_to_claims, false);
  v.status_changed_at := now();
  v.created_at        := now();
  v.updated_at        := now();
  v.archived_at       := null;

  insert into public.tickets select v.* returning * into v;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.ticket_notes (ticket_id, note_text, source)
    values (v.id, btrim(p_note), 'wizard');
  end if;

  return v;
end;
$$;

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

  -- Keys not present in p_changes keep their current value.
  n := jsonb_populate_record(v, p_changes - array['id', 'created_at', 'updated_at', 'status_changed_at',
                                                  'rush_started_at', 'closed_at', 'archived_at']);

  update public.tickets set
    ticket_number = n.ticket_number, date_opened = n.date_opened, point_of_contact = n.point_of_contact,
    assigned_to = n.assigned_to, customer_name = n.customer_name, contact_name = n.contact_name,
    order_number = n.order_number, department_id = n.department_id, material_id = n.material_id,
    material_type = n.material_type, size = n.size, quantity = n.quantity, sqft = n.sqft, sheets = n.sheets,
    order_value = n.order_value, shipping_cost = n.shipping_cost, tracking_number = n.tracking_number,
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

revoke all on function public.create_ticket(jsonb, text) from public, anon, authenticated;
revoke all on function public.update_ticket(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.create_ticket(jsonb, text) to service_role;
grant execute on function public.update_ticket(uuid, jsonb, timestamptz) to service_role;

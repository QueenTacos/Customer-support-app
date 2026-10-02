-- =============================================================================
-- 0011 Ticket Assistant
--  * assistant_missing_rules: which fields matter for an issue / resolution /
--    fault (drives "Missing information"). Data, not code — edit rows to change.
--  * apply_ticket_update(): Quick Update applies approved field changes AND the
--    approved note in ONE transaction. History is written by the existing
--    triggers. The assistant itself never writes; only this confirmed action.
-- Safe to run more than once.
-- =============================================================================

create table if not exists public.assistant_missing_rules (
  id             uuid primary key default gen_random_uuid(),
  trigger_type   text not null check (trigger_type in ('issue', 'resolution', 'fault')),
  trigger_value  text not null check (char_length(trigger_value) between 1 and 40),
  field          text not null check (field in (
                   'tracking_number', 'shipping_cost', 'in_hands_date', 'usable_as_is', 'package_damaged',
                   'damaged_pieces', 'photos_received', 'sorted_through', 'all_boxes_received', 'missing_items',
                   'delivered', 'still_usable', 'reprint_value', 'reprint_order_number', 'refund_value',
                   'discount_value', 'credit_value', 'order_value', 'affected_item_value', 'fedex_case_number')),
  label          text not null check (char_length(label) between 1 and 80),
  -- Optional condition: 'has_tracking' = only once the order has shipped (tracking # or delivered = yes).
  condition      text check (condition in ('has_tracking')),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists assistant_missing_rules_key
  on public.assistant_missing_rules (trigger_type, trigger_value, field);

drop trigger if exists assistant_missing_rules_updated_at on public.assistant_missing_rules;
create trigger assistant_missing_rules_updated_at
  before update on public.assistant_missing_rules
  for each row execute function public.set_updated_at();

alter table public.assistant_missing_rules enable row level security;
revoke all on public.assistant_missing_rules from anon, authenticated;
grant all on public.assistant_missing_rules to service_role;

-- Seed: Jessica's workflow rules (approved 2026-10-02). Existing rows are kept.
insert into public.assistant_missing_rules (trigger_type, trigger_value, field, label, condition, sort_order) values
  ('issue',      'damage',      'usable_as_is',       'Usable As-Is',               null,           10),
  ('issue',      'damage',      'package_damaged',    'Package Damaged',            null,           20),
  ('issue',      'damage',      'damaged_pieces',     'How Many Damaged',           null,           30),
  ('issue',      'damage',      'photos_received',    'Photos',                     null,           40),
  ('issue',      'damage',      'sorted_through',     'Sorted Through',             'has_tracking', 50),
  ('issue',      'damage',      'all_boxes_received', 'All Boxes Received',         'has_tracking', 60),
  ('issue',      'missing',     'sorted_through',     'Sorted Through',             null,           10),
  ('issue',      'missing',     'all_boxes_received', 'All Boxes Received',         null,           20),
  ('issue',      'missing',     'in_hands_date',      'In-Hands Date',              null,           30),
  ('issue',      'late',        'tracking_number',    'Tracking Number',            null,           10),
  ('issue',      'late',        'shipping_cost',      'Shipping Cost',              null,           20),
  ('issue',      'late',        'in_hands_date',      'In-Hands Date',              null,           30),
  ('fault',      'fedex_error', 'tracking_number',    'Tracking Number',            null,           10),
  ('fault',      'fedex_error', 'shipping_cost',      'Shipping Cost',              null,           20),
  ('fault',      'fedex_error', 'in_hands_date',      'In-Hands Date',              null,           30),
  ('resolution', 'reprint',     'reprint_value',      'Reprint Value',              null,           10),
  ('resolution', 'reprint',     'shipping_cost',      'Shipping Cost',              null,           20),
  ('resolution', 'refund',      'refund_value',       'Refund Value',               null,           10),
  ('resolution', 'refund',      'shipping_cost',      'Shipping Cost',              null,           20),
  ('resolution', 'discount',    'discount_value',     'Discount Value',             null,           10),
  ('resolution', 'discount',    'order_value',        'Total Affected Order Value', null,           20)
on conflict (trigger_type, trigger_value, field) do nothing;

-- -----------------------------------------------------------------------------
-- Apply a confirmed Quick Update: field changes + optional note, atomically.
-- p_changes uses the same keys as update_ticket (allowlisted again in the app).
-- Closing is NOT allowed here — that belongs to the Close Ticket workflow.
-- -----------------------------------------------------------------------------
create or replace function public.apply_ticket_update(
  p_id uuid,
  p_changes jsonb,
  p_note text default null,
  p_expected_updated_at timestamptz default null
)
returns public.tickets
language plpgsql
set search_path = ''
as $$
declare
  v public.tickets;
begin
  if coalesce(p_changes ->> 'status', '') = 'closed' then
    raise exception 'TICKET_CLOSE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if p_changes is not null and p_changes <> '{}'::jsonb then
    v := public.update_ticket(p_id, p_changes, p_expected_updated_at);
  else
    select * into v from public.tickets where id = p_id for update;
    if not found then
      raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is not null
       and date_trunc('milliseconds', v.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
      raise exception 'TICKET_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.ticket_notes (ticket_id, note_text, source)
    values (p_id, btrim(p_note), 'generated');
  end if;

  return v;
end;
$$;

revoke all on function public.apply_ticket_update(uuid, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_ticket_update(uuid, jsonb, text, timestamptz) to service_role;

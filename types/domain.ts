import type { Fault, Issue, PointOfContact, ResolutionType, Status } from "@/lib/domain/options";

/** Row shape of public.tickets (numeric columns arrive as numbers from PostgREST). */
export interface Ticket {
  id: string;
  ticket_number: string;
  date_opened: string;
  point_of_contact: PointOfContact;
  assigned_to: string;

  customer_name: string;
  contact_name: string | null;
  order_number: string | null;
  department_id: string | null;
  material_id: string | null;
  material_type: string | null;
  size: string | null;
  quantity: number | null;
  sqft: number | null;
  sheets: number | null;
  order_value: number | null;
  shipping_cost: number | null;
  tracking_number: string | null;

  issue: Issue;
  issue_summary: string | null;
  fault: Fault | null;
  fault_suggested: Fault | null;

  usable_as_is: boolean | null;
  package_damaged: boolean | null;
  damaged_pieces: number | null;
  all_boxes_received: boolean | null;
  sorted_through: boolean | null;
  photos_received: boolean | null;
  missing_items: string | null;
  delivered: boolean | null;
  still_usable: boolean | null;
  fedex_investigation_opened: boolean | null;
  carrier_responsible: boolean | null;
  in_hands_date: string | null;

  resolution_type: ResolutionType | null;
  resolution: string | null;
  reprint_order_number: string | null;
  reprint_value: number | null;
  refund_value: number | null;
  discount_value: number | null;
  credit_value: number | null;

  status: Status;
  status_changed_at: string;
  follow_up_date: string | null;
  rush_started_at: string | null;
  add_to_limits: boolean;
  add_to_claims: boolean;

  created_at: string;
  updated_at: string;
  closed_at: string | null;
  archived_at: string | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Material {
  id: string;
  department_id: string;
  name: string;
  is_rigid: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface TicketWithLookups extends Ticket {
  department: Pick<Department, "id" | "code" | "name"> | null;
  material: Pick<Material, "id" | "name" | "is_rigid"> | null;
}

export interface TicketNote {
  id: string;
  ticket_id: string;
  note_text: string;
  source: "manual" | "generated" | "wizard";
  edit_count: number;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TicketNoteVersion {
  id: string;
  note_id: string;
  version_number: number;
  note_text: string;
  version_created_at: string;
  replaced_at: string;
  edit_reason: string | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  summary: string;
  changes: Record<string, unknown>;
  actor: string;
  created_at: string;
}

export interface RushPeriod {
  id: string;
  ticket_id: string;
  started_at: string;
  ended_at: string | null;
  ended_status: string | null;
}

/** Standard result from Server Actions. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

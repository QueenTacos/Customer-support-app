import { z } from "zod";
import { parseMoney } from "@/lib/utils/money";
import { EDITABLE_STATUSES, FAULTS, ISSUES, POINTS_OF_CONTACT, RESOLUTION_TYPES, STATUSES } from "@/lib/domain/options";
import type { Ticket } from "@/types/domain";

/* ------------------------------------------------------------------------- *
 * Form values: every input is a string so partially-typed values are never
 * lost. The schema converts them into clean database values.
 * ------------------------------------------------------------------------- */

export type YesNo = "yes" | "no" | "";

export interface TicketFormValues {
  ticket_number: string;
  date_opened: string;
  point_of_contact: string;
  customer_name: string;
  contact_name: string;
  order_number: string;
  department_id: string;
  material_id: string;
  material_type: string;
  size: string;
  quantity: string;
  sqft: string;
  sheets: string;
  order_value: string;
  shipping_cost: string;
  tracking_number: string;

  issue: string;
  issue_summary: string;
  fault: string;
  fault_suggested: string;

  usable_as_is: YesNo;
  package_damaged: YesNo;
  damaged_pieces: string;
  all_boxes_received: YesNo;
  sorted_through: YesNo;
  photos_received: YesNo;
  missing_items: string;
  delivered: YesNo;
  still_usable: YesNo;
  fedex_investigation_opened: YesNo;
  carrier_responsible: YesNo;
  in_hands_date: string;

  resolution_type: string;
  resolution: string;
  reprint_order_number: string;
  reprint_value: string;
  refund_value: string;
  discount_value: string;
  credit_value: string;

  status: string;
  follow_up_date: string;
  add_to_limits: boolean;
  add_to_claims: boolean;
}

export function emptyTicketForm(today: string): TicketFormValues {
  return {
    ticket_number: "",
    date_opened: today,
    point_of_contact: "SW",
    customer_name: "",
    contact_name: "",
    order_number: "",
    department_id: "",
    material_id: "",
    material_type: "",
    size: "",
    quantity: "",
    sqft: "",
    sheets: "",
    order_value: "",
    shipping_cost: "",
    tracking_number: "",
    issue: "",
    issue_summary: "",
    fault: "",
    fault_suggested: "",
    usable_as_is: "",
    package_damaged: "",
    damaged_pieces: "",
    all_boxes_received: "",
    sorted_through: "",
    photos_received: "",
    missing_items: "",
    delivered: "",
    still_usable: "",
    fedex_investigation_opened: "",
    carrier_responsible: "",
    in_hands_date: "",
    resolution_type: "",
    resolution: "",
    reprint_order_number: "",
    reprint_value: "",
    refund_value: "",
    discount_value: "",
    credit_value: "",
    status: "open",
    follow_up_date: "",
    add_to_limits: false,
    add_to_claims: false,
  };
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const yn = (v: boolean | null): YesNo => (v === null ? "" : v ? "yes" : "no");

/** Database row → form values (for Edit Ticket). */
export function ticketToForm(t: Ticket): TicketFormValues {
  return {
    ticket_number: t.ticket_number,
    date_opened: t.date_opened,
    point_of_contact: t.point_of_contact,
    customer_name: t.customer_name,
    contact_name: s(t.contact_name),
    order_number: s(t.order_number),
    department_id: s(t.department_id),
    material_id: s(t.material_id),
    material_type: s(t.material_type),
    size: s(t.size),
    quantity: s(t.quantity),
    sqft: t.sqft === null ? "" : Number(t.sqft).toString(),
    sheets: s(t.sheets),
    order_value: t.order_value === null ? "" : Number(t.order_value).toFixed(2),
    shipping_cost: t.shipping_cost === null ? "" : Number(t.shipping_cost).toFixed(2),
    tracking_number: s(t.tracking_number),
    issue: t.issue,
    issue_summary: s(t.issue_summary),
    fault: s(t.fault),
    fault_suggested: s(t.fault_suggested),
    usable_as_is: yn(t.usable_as_is),
    package_damaged: yn(t.package_damaged),
    damaged_pieces: s(t.damaged_pieces),
    all_boxes_received: yn(t.all_boxes_received),
    sorted_through: yn(t.sorted_through),
    photos_received: yn(t.photos_received),
    missing_items: s(t.missing_items),
    delivered: yn(t.delivered),
    still_usable: yn(t.still_usable),
    fedex_investigation_opened: yn(t.fedex_investigation_opened),
    carrier_responsible: yn(t.carrier_responsible),
    in_hands_date: s(t.in_hands_date),
    resolution_type: s(t.resolution_type),
    resolution: s(t.resolution),
    reprint_order_number: s(t.reprint_order_number),
    reprint_value: t.reprint_value === null ? "" : Number(t.reprint_value).toFixed(2),
    refund_value: t.refund_value === null ? "" : Number(t.refund_value).toFixed(2),
    discount_value: t.discount_value === null ? "" : Number(t.discount_value).toFixed(2),
    credit_value: t.credit_value === null ? "" : Number(t.credit_value).toFixed(2),
    status: t.status,
    follow_up_date: s(t.follow_up_date),
    add_to_limits: t.add_to_limits,
    add_to_claims: t.add_to_claims,
  };
}

/* ------------------------------------------------------------------------- *
 * Field schemas
 * ------------------------------------------------------------------------- */

const MAX_MONEY = 9_999_999.99;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

const reqText = (max: number, msg: string) =>
  z.string().trim().min(1, msg).max(max, `Keep this under ${max} characters.`);

const money = z.string().transform((v, ctx) => {
  const n = parseMoney(v);
  if (n === null) return null;
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 17.50" });
    return z.NEVER;
  }
  if (n > MAX_MONEY) {
    ctx.addIssue({ code: "custom", message: "That amount is too large." });
    return z.NEVER;
  }
  return n;
});

const decimal = z.string().transform((v, ctx) => {
  const t = v.replace(/[,\s]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) {
    ctx.addIssue({ code: "custom", message: "Enter a number like 12.5" });
    return z.NEVER;
  }
  return Number(t);
});

const int = z.string().transform((v, ctx) => {
  const t = v.replace(/[,\s]/g, "");
  if (t === "") return null;
  if (!/^\d{1,9}$/.test(t)) {
    ctx.addIssue({ code: "custom", message: "Enter a whole number." });
    return z.NEVER;
  }
  return Number(t);
});

const yesNo = z.enum(["yes", "no", ""]).transform((v) => (v === "" ? null : v === "yes"));

const isoDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return v;
  });

const optUuid = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    if (!UUID_RE.test(v)) {
      ctx.addIssue({ code: "custom", message: "Pick an option from the list." });
      return z.NEVER;
    }
    return v;
  });

function optEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), z.literal("")]).transform((v) => (v === "" ? null : (v as T[number])));
}

/* ------------------------------------------------------------------------- *
 * Full ticket schema
 * ------------------------------------------------------------------------- */

export const ticketSchema = z.object({
  ticket_number: reqText(64, "Ticket number is required."),
  date_opened: isoDate.refine((v) => v !== null, "Date opened is required."),
  point_of_contact: z.enum(POINTS_OF_CONTACT, { message: "Pick SW, MC or LPU." }),
  customer_name: reqText(200, "Customer is required."),
  contact_name: optText(200),
  order_number: optText(64),
  department_id: optUuid,
  material_id: optUuid,
  material_type: optText(200),
  size: optText(100),
  quantity: int,
  sqft: decimal,
  sheets: int,
  order_value: money,
  shipping_cost: money,
  tracking_number: optText(100),

  issue: z.enum(ISSUES, { message: "Pick the problem." }),
  issue_summary: optText(2000),
  fault: optEnum(FAULTS),
  fault_suggested: optEnum(FAULTS),

  usable_as_is: yesNo,
  package_damaged: yesNo,
  damaged_pieces: int,
  all_boxes_received: yesNo,
  sorted_through: yesNo,
  photos_received: yesNo,
  missing_items: optText(2000),
  delivered: yesNo,
  still_usable: yesNo,
  fedex_investigation_opened: yesNo,
  carrier_responsible: yesNo,
  in_hands_date: isoDate,

  resolution_type: optEnum(RESOLUTION_TYPES),
  resolution: optText(4000),
  reprint_order_number: optText(64),
  reprint_value: money,
  refund_value: money,
  discount_value: money,
  credit_value: money,

  status: z.enum(STATUSES, { message: "Pick a status." }),
  follow_up_date: isoDate,
  add_to_limits: z.boolean(),
  add_to_claims: z.boolean(),
});

export type TicketInput = z.output<typeof ticketSchema>;

/** Which fields each wizard step owns (for per-step validation). */
export const WIZARD_STEP_FIELDS: Record<1 | 2 | 3, (keyof TicketFormValues)[]> = {
  1: [
    "ticket_number", "date_opened", "point_of_contact", "customer_name", "contact_name", "order_number",
    "department_id", "material_id", "material_type", "size", "quantity", "sqft", "sheets",
    "order_value", "shipping_cost", "tracking_number",
  ],
  2: [
    "issue", "issue_summary", "fault", "usable_as_is", "package_damaged", "damaged_pieces",
    "all_boxes_received", "sorted_through", "photos_received", "missing_items", "delivered",
    "still_usable", "fedex_investigation_opened", "carrier_responsible", "in_hands_date",
  ],
  3: [
    "resolution_type", "resolution", "reprint_order_number", "reprint_value", "refund_value",
    "discount_value", "credit_value", "status", "follow_up_date", "add_to_limits", "add_to_claims",
  ],
};

export type FieldErrors = Partial<Record<keyof TicketFormValues | "form" | "note", string>>;

export function validateTicket(
  values: TicketFormValues,
): { success: true; data: TicketInput } | { success: false; errors: FieldErrors } {
  const r = ticketSchema.safeParse(values);
  if (r.success) return { success: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof FieldErrors | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}

export function pickErrors(errors: FieldErrors, fields: (keyof TicketFormValues)[]): FieldErrors {
  const out: FieldErrors = {};
  for (const f of fields) if (errors[f]) out[f] = errors[f];
  return out;
}

/** Status options while editing: Closed only appears if the ticket is already closed. */
export function statusOptionsFor(current: string) {
  return current === "closed" ? [...EDITABLE_STATUSES, "closed" as const] : EDITABLE_STATUSES;
}

export const noteSchema = z.object({
  text: z.string().trim().min(1, "Note can't be empty.").max(20000, "Note is too long (20,000 characters max)."),
});

export const noteEditSchema = noteSchema.extend({
  reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters.")
    .transform((v) => (v === "" ? null : v)),
});

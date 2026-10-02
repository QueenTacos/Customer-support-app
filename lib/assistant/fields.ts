/**
 * The ONLY ticket fields the Ticket Assistant (deterministic or AI) may propose.
 * Anything not listed here is rejected. Status "closed" is never a field change —
 * closing is a suggested action that goes through the Close Ticket workflow.
 */
import { FAULTS, ISSUES, POINTS_OF_CONTACT, RESOLUTION_TYPES, EDITABLE_STATUSES } from "@/lib/domain/options";

export type FieldKind = "text" | "money" | "int" | "decimal" | "date" | "yesno" | "enum" | "department" | "material";

export type Section = "ticket" | "product" | "issue" | "resolution" | "shipping";

export interface FieldMeta {
  label: string;
  kind: FieldKind;
  section: Section;
  options?: readonly string[];
}

export const ASSISTANT_FIELDS = {
  ticket_number: { label: "Ticket Number", kind: "text", section: "ticket" },
  date_opened: { label: "Date Opened", kind: "date", section: "ticket" },
  point_of_contact: { label: "Point of Contact", kind: "enum", section: "ticket", options: POINTS_OF_CONTACT },
  customer_name: { label: "Customer", kind: "text", section: "ticket" },
  contact_name: { label: "Contact", kind: "text", section: "ticket" },
  order_number: { label: "Order Number", kind: "text", section: "ticket" },
  order_value: { label: "Total Order Value", kind: "money", section: "ticket" },

  department_id: { label: "Department", kind: "department", section: "product" },
  material_id: { label: "Material", kind: "material", section: "product" },
  size: { label: "Size", kind: "text", section: "product" },
  quantity: { label: "Quantity", kind: "int", section: "product" },
  affected_item_value: { label: "Affected Item Value", kind: "money", section: "product" },

  issue: { label: "Issue", kind: "enum", section: "issue", options: ISSUES },
  fault: { label: "Fault", kind: "enum", section: "issue", options: FAULTS },
  usable_as_is: { label: "Usable As-Is", kind: "yesno", section: "issue" },
  package_damaged: { label: "Package Damaged", kind: "yesno", section: "issue" },
  damaged_pieces: { label: "How Many Damaged", kind: "int", section: "issue" },
  photos_received: { label: "Photos Received", kind: "yesno", section: "issue" },
  sorted_through: { label: "Sorted Through", kind: "yesno", section: "issue" },
  all_boxes_received: { label: "All Boxes Received", kind: "yesno", section: "issue" },
  missing_items: { label: "What Is Missing", kind: "text", section: "issue" },
  still_usable: { label: "Still Usable", kind: "yesno", section: "issue" },
  in_hands_date: { label: "In-Hands Date", kind: "date", section: "issue" },
  status: { label: "Status", kind: "enum", section: "issue", options: EDITABLE_STATUSES },

  resolution_type: { label: "Resolution Type", kind: "enum", section: "resolution", options: RESOLUTION_TYPES },
  reprint_order_number: { label: "Reprint Order", kind: "text", section: "resolution" },
  reprint_value: { label: "Reprint Value", kind: "money", section: "resolution" },
  refund_value: { label: "Refund Value", kind: "money", section: "resolution" },
  discount_value: { label: "Discount Value", kind: "money", section: "resolution" },
  credit_value: { label: "Credit Value", kind: "money", section: "resolution" },

  tracking_number: { label: "Tracking Number", kind: "text", section: "shipping" },
  fedex_case_number: { label: "FedEx Case #", kind: "text", section: "shipping" },
  shipping_cost: { label: "Shipping Cost", kind: "money", section: "shipping" },
  delivered: { label: "Delivered", kind: "yesno", section: "shipping" },
  fedex_investigation_opened: { label: "FedEx Investigation Opened", kind: "yesno", section: "shipping" },
  carrier_responsible: { label: "FedEx / Carrier Responsible", kind: "yesno", section: "shipping" },
} as const satisfies Record<string, FieldMeta>;

export type AssistantFieldKey = keyof typeof ASSISTANT_FIELDS;
export const ASSISTANT_FIELD_KEYS = Object.keys(ASSISTANT_FIELDS) as AssistantFieldKey[];

export const isAssistantField = (k: string): k is AssistantFieldKey => k in ASSISTANT_FIELDS;

export const SECTION_TITLES: Record<Section, string> = {
  ticket: "Ticket Information",
  product: "Affected Product",
  issue: "Issue",
  resolution: "Resolution",
  shipping: "Shipping / FedEx",
};

/** Fields whose values must come from deterministic parsing when present (AI may never override). */
export const DETERMINISTIC_FIELDS: AssistantFieldKey[] = [
  "ticket_number", "order_number", "tracking_number", "fedex_case_number", "date_opened", "in_hands_date",
  "quantity", "shipping_cost", "affected_item_value", "order_value", "reprint_value", "refund_value",
  "discount_value", "credit_value", "reprint_order_number", "material_id", "department_id",
];

/** Validate/normalise a proposed value for its field. Returns null when invalid. */
export function normalizeFieldValue(key: AssistantFieldKey, raw: unknown): string | null {
  const meta: FieldMeta = ASSISTANT_FIELDS[key];
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (!v) return null;
  switch (meta.kind) {
    case "money": {
      const n = Number(v.replace(/[$,\s]/g, ""));
      return Number.isFinite(n) && n >= 0 && n <= 9_999_999.99 ? n.toFixed(2) : null;
    }
    case "int":
      return /^\d{1,9}$/.test(v.replace(/,/g, "")) ? String(Number(v.replace(/,/g, ""))) : null;
    case "decimal":
      return /^\d+(\.\d+)?$/.test(v) ? v : null;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
    case "yesno": {
      const l = v.toLowerCase();
      return l === "yes" || l === "true" ? "yes" : l === "no" || l === "false" ? "no" : null;
    }
    case "enum":
      return meta.options!.includes(v) ? v : null;
    case "department":
    case "material":
      return /^[0-9a-z-]{8,64}$/i.test(v) ? v : null;
    default:
      return v.length <= 500 ? v : null;
  }
}

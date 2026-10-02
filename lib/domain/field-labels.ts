import {
  FAULT_LABELS,
  ISSUE_LABELS,
  RESOLUTION_LABELS,
  STATUS_META,
  type Fault,
  type Issue,
  type ResolutionType,
  type Status,
} from "./options";

/** Human labels for ticket columns (used in History). */
export const FIELD_LABELS: Record<string, string> = {
  ticket_number: "Ticket Number",
  date_opened: "Date Opened",
  point_of_contact: "Point of Contact",
  assigned_to: "Assigned To",
  customer_name: "Customer",
  contact_name: "Contact",
  order_number: "Order Number",
  department_id: "Department",
  material_id: "Material",
  material_type: "Material Type",
  size: "Size",
  quantity: "Quantity",
  sqft: "Sq/Ft",
  sheets: "Sheets",
  order_value: "Order Value",
  shipping_cost: "Shipping Cost",
  tracking_number: "Tracking Number",
  issue: "Issue",
  issue_summary: "Issue Description",
  fault: "Fault",
  fault_suggested: "Suggested Fault",
  usable_as_is: "Usable As-Is",
  package_damaged: "Package Damaged",
  damaged_pieces: "Damaged Pieces",
  all_boxes_received: "All Boxes Received",
  sorted_through: "Sorted Through",
  photos_received: "Photos Received",
  missing_items: "What Is Missing",
  delivered: "Delivered",
  still_usable: "Still Usable",
  fedex_investigation_opened: "FedEx Investigation Opened",
  carrier_responsible: "FedEx/Carrier Responsible",
  in_hands_date: "In-Hands Date",
  resolution_type: "Resolution Type",
  resolution: "Resolution",
  reprint_order_number: "Reprint Order",
  reprint_value: "Reprint Value",
  refund_value: "Refund Value",
  discount_value: "Discount Value",
  credit_value: "Credit Value",
  status: "Status",
  follow_up_date: "Follow-Up Date",
  add_to_limits: "Needs LIMITS",
  add_to_claims: "Needs Claims",
};

const MONEY_FIELDS = new Set(["order_value", "shipping_cost", "reprint_value", "refund_value", "discount_value", "credit_value"]);

/** Format a stored value for the History "From → To" display. */
export function formatFieldValue(
  field: string,
  value: unknown,
  names: { departments: Record<string, string>; materials: Record<string, string> },
): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (MONEY_FIELDS.has(field)) return Number(value).toFixed(2);
  switch (field) {
    case "status":
      return STATUS_META[value as Status]?.label ?? String(value);
    case "issue":
      return ISSUE_LABELS[value as Issue] ?? String(value);
    case "fault":
    case "fault_suggested":
      return FAULT_LABELS[value as Fault] ?? String(value);
    case "resolution_type":
      return RESOLUTION_LABELS[value as ResolutionType] ?? String(value);
    case "department_id":
      return names.departments[String(value)] ?? "(removed department)";
    case "material_id":
      return names.materials[String(value)] ?? "(removed material)";
  }
  return String(value);
}

/**
 * Missing-information engine. Rules are DATA (Supabase table
 * assistant_missing_rules); DEFAULT_MISSING_RULES mirrors the seed in migration
 * 0011 and is used only if the table can't be read.
 */
import { FAULT_LABELS, ISSUE_LABELS, RESOLUTION_LABELS, type Fault, type Issue, type ResolutionType } from "@/lib/domain/options";
import type { FieldValues, MissingItem, MissingRule } from "./types";

const r = (
  trigger_type: MissingRule["trigger_type"],
  trigger_value: string,
  field: MissingRule["field"],
  label: string,
  sort_order: number,
  condition: MissingRule["condition"] = null,
): MissingRule => ({ trigger_type, trigger_value, field, label, condition, sort_order });

export const DEFAULT_MISSING_RULES: MissingRule[] = [
  r("issue", "damage", "usable_as_is", "Usable As-Is", 10),
  r("issue", "damage", "package_damaged", "Package Damaged", 20),
  r("issue", "damage", "damaged_pieces", "How Many Damaged", 30),
  r("issue", "damage", "photos_received", "Photos", 40),
  r("issue", "damage", "sorted_through", "Sorted Through", 50, "has_tracking"),
  r("issue", "damage", "all_boxes_received", "All Boxes Received", 60, "has_tracking"),
  r("issue", "missing", "sorted_through", "Sorted Through", 10),
  r("issue", "missing", "all_boxes_received", "All Boxes Received", 20),
  r("issue", "missing", "in_hands_date", "In-Hands Date", 30),
  r("issue", "late", "tracking_number", "Tracking Number", 10),
  r("issue", "late", "shipping_cost", "Shipping Cost", 20),
  r("issue", "late", "in_hands_date", "In-Hands Date", 30),
  r("fault", "fedex_error", "tracking_number", "Tracking Number", 10),
  r("fault", "fedex_error", "shipping_cost", "Shipping Cost", 20),
  r("fault", "fedex_error", "in_hands_date", "In-Hands Date", 30),
  r("resolution", "reprint", "reprint_value", "Reprint Value", 10),
  r("resolution", "reprint", "shipping_cost", "Shipping Cost", 20),
  r("resolution", "refund", "refund_value", "Refund Value", 10),
  r("resolution", "refund", "shipping_cost", "Shipping Cost", 20),
  r("resolution", "discount", "discount_value", "Discount Value", 10),
  r("resolution", "discount", "order_value", "Total Affected Order Value", 20),
];

function becauseLabel(rule: MissingRule): string {
  if (rule.trigger_type === "issue") return `${ISSUE_LABELS[rule.trigger_value as Issue] ?? rule.trigger_value} issue`;
  if (rule.trigger_type === "fault") return FAULT_LABELS[rule.trigger_value as Fault] ?? rule.trigger_value;
  return `${RESOLUTION_LABELS[rule.trigger_value as ResolutionType] ?? rule.trigger_value} resolution`;
}

/** "Answered" means a real value — for Photos only "yes" counts (photos not received yet = still missing). */
function isAnswered(field: MissingRule["field"], v: string | undefined): boolean {
  const s = (v ?? "").trim();
  if (field === "photos_received") return s === "yes";
  return s !== "";
}

/**
 * What's still needed for this ticket, given its (proposed) state.
 * Order: issue rules, then fault, then resolution; each field listed once.
 */
export function computeMissing(values: FieldValues, rules: MissingRule[] = DEFAULT_MISSING_RULES): MissingItem[] {
  const shipped = !!values.tracking_number?.trim() || values.delivered === "yes";
  const active = (t: MissingRule["trigger_type"]) => (t === "issue" ? values.issue : t === "fault" ? values.fault : values.resolution_type);
  const typeOrder = { issue: 0, fault: 1, resolution: 2 } as const;

  const out: MissingItem[] = [];
  const seen = new Set<string>();
  const sorted = [...rules].sort((a, b) => typeOrder[a.trigger_type] - typeOrder[b.trigger_type] || a.sort_order - b.sort_order);
  for (const rule of sorted) {
    if (!active(rule.trigger_type) || active(rule.trigger_type) !== rule.trigger_value) continue;
    if (rule.condition === "has_tracking" && !shipped) continue;
    if (seen.has(rule.field)) continue;
    seen.add(rule.field);
    if (!isAnswered(rule.field, values[rule.field])) out.push({ key: rule.field, label: rule.label, because: becauseLabel(rule) });
  }
  return out;
}

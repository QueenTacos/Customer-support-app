/**
 * Compare proposed values with what's already there (New Ticket form, or the
 * existing ticket for Quick Update) and decide the review defaults.
 *  - never overwrite something Jessica entered without her ticking it
 *  - inferred values always start unticked
 *  - "same" rows are not changes and are not applied
 */
import type { FieldValues, ProposedField, AssistantMode } from "./types";
import type { AssistantFieldKey } from "./fields";

export type RowState = "new" | "same" | "conflict";

export interface MergeRow {
  field: ProposedField;
  /** Current value ("" when empty or still the untouched form default). */
  current: string;
  state: RowState;
}

export interface RowDecision {
  accept: boolean;
  /** The (possibly edited) proposed value. */
  value: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * @param defaults the form's untouched defaults (today's date, SW …) in New Ticket
 *                 mode — those count as empty. Pass null for Quick Update.
 */
export function planMerge(current: FieldValues, defaults: FieldValues | null, fields: ProposedField[]): MergeRow[] {
  return fields.map((field) => {
    const cur = String(current[field.key] ?? "");
    const isDefault = defaults !== null && cur === String(defaults[field.key] ?? "");
    const effective = isDefault ? "" : cur;
    let state: RowState = "new";
    if (effective && same(effective, field.value)) state = "same";
    else if (effective) state = "conflict";
    return { field, current: effective, state };
  });
}

export function defaultDecision(row: MergeRow, mode: AssistantMode): RowDecision {
  const extracted = row.field.confidence === "extracted";
  let accept = false;
  if (row.state === "new") accept = extracted;
  // New ticket: keep what's already typed. Quick Update: a newly stated fact replaces the old one.
  else if (row.state === "conflict") accept = mode === "update" && extracted;
  return { accept, value: row.field.value };
}

/** The accepted changes, as a field → value map. */
export function buildChanges(
  rows: MergeRow[],
  decisions: Partial<Record<AssistantFieldKey, RowDecision>>,
  mode: AssistantMode,
): FieldValues {
  const out: FieldValues = {};
  for (const row of rows) {
    if (row.state === "same") continue;
    const d = decisions[row.field.key] ?? defaultDecision(row, mode);
    if (!d.accept) continue;
    const v = d.value.trim();
    if (!v) continue;
    out[row.field.key] = v;
  }
  return out;
}

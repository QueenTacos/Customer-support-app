/**
 * Decide how parsed values combine with what's already in the New Ticket form.
 * Rule: never overwrite a value Jessica entered without asking.
 */
import type { TicketFormValues } from "@/lib/validation/ticket";
import type { ImportField, ImportFieldKey } from "./types";

export type RowState = "new" | "same" | "conflict";

export interface MergeRow {
  field: ImportField;
  /** Value currently in the form ("" when empty or still the default). */
  current: string;
  state: RowState;
}

export interface RowDecision {
  /** Include this row when applying (extracted rows default on, inferred rows default off). */
  accept: boolean;
  /** For conflicts: which value wins. */
  choice: "existing" | "imported";
  /** The (possibly edited) imported value. */
  value: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * @param current  the form right now
 * @param defaults the form's untouched defaults (today's date, SW, …) — these
 *                 count as empty, so importing a real value isn't a "conflict"
 */
export function planMerge(current: TicketFormValues, defaults: TicketFormValues, fields: ImportField[]): MergeRow[] {
  return fields.map((field) => {
    const cur = String(current[field.key] ?? "");
    const isDefault = cur === String(defaults[field.key] ?? "");
    const effective = isDefault ? "" : cur;
    let state: RowState = "new";
    if (effective && same(effective, field.value)) state = "same";
    else if (effective) state = "conflict";
    return { field, current: effective, state };
  });
}

export function defaultDecision(row: MergeRow): RowDecision {
  return {
    accept: row.state !== "same" && row.field.confidence === "extracted",
    choice: "existing",
    value: row.field.value,
  };
}

/** Build the form patch from the review decisions. */
export function buildPatch(rows: MergeRow[], decisions: Record<string, RowDecision>): Partial<Record<ImportFieldKey, string>> {
  const patch: Partial<Record<ImportFieldKey, string>> = {};
  for (const row of rows) {
    const d = decisions[row.field.key] ?? defaultDecision(row);
    if (!d.accept || row.state === "same") continue;
    if (row.state === "conflict" && d.choice === "existing") continue;
    if (d.value.trim() === "") continue;
    patch[row.field.key] = d.value.trim();
  }
  return patch;
}

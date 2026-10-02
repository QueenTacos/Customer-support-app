import type { Fault, Issue } from "./options";

export interface FaultSuggestion {
  fault: Fault;
  reason: string;
}

export interface FaultInput {
  issue: Issue | "" | null | undefined;
  carrier_responsible: boolean | null | undefined;
}

/**
 * Suggest a fault from established rules only (approved decision D6).
 * These are suggestions — Jessica can always override the fault.
 *
 *  1. FedEx / carrier established as responsible → FedEx Error
 *  2. File issue → Customer Error
 *  3. Production issue → Production Error
 *
 * Deliberately NOT suggested: Late without carrier responsibility, Damage
 * without carrier responsibility, Color, Cutting, Other.
 */
export function suggestFault(input: FaultInput): FaultSuggestion | null {
  if (input.carrier_responsible === true && (input.issue === "late" || input.issue === "damage" || input.issue === "missing")) {
    return { fault: "fedex_error", reason: "FedEx / the carrier was marked responsible." };
  }
  if (input.issue === "file") {
    return { fault: "customer_error", reason: "File problems are customer error." };
  }
  if (input.issue === "production") {
    return { fault: "production_error", reason: "Production / manufacturing issue." };
  }
  return null;
}

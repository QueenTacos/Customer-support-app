import type { Issue } from "./options";

export type QuestionKind = "yesno" | "int" | "date" | "text" | "textarea";

export interface Question {
  field:
    | "usable_as_is"
    | "package_damaged"
    | "damaged_pieces"
    | "all_boxes_received"
    | "sorted_through"
    | "photos_received"
    | "in_hands_date"
    | "missing_items"
    | "tracking_number"
    | "delivered"
    | "still_usable"
    | "fedex_investigation_opened"
    | "carrier_responsible";
  label: string;
  kind: QuestionKind;
}

/**
 * Which follow-up questions appear for each issue (spec §10).
 * `carrier_responsible` is how the app knows FedEx is responsible (D6);
 * it is never assumed.
 */
export const ISSUE_QUESTIONS: Record<Issue, Question[]> = {
  damage: [
    { field: "usable_as_is", label: "Can the customer use it as-is?", kind: "yesno" },
    { field: "package_damaged", label: "Was the package damaged?", kind: "yesno" },
    { field: "damaged_pieces", label: "How many pieces are damaged?", kind: "int" },
    { field: "all_boxes_received", label: "Were all boxes received?", kind: "yesno" },
    { field: "sorted_through", label: "Was everything sorted through?", kind: "yesno" },
    { field: "photos_received", label: "Have photos been received?", kind: "yesno" },
    { field: "in_hands_date", label: "What is the in-hands date?", kind: "date" },
    { field: "carrier_responsible", label: "Is FedEx / the carrier responsible for the damage?", kind: "yesno" },
  ],
  missing: [
    { field: "missing_items", label: "What is missing?", kind: "textarea" },
    { field: "all_boxes_received", label: "Were all boxes received?", kind: "yesno" },
    { field: "sorted_through", label: "Was everything sorted through?", kind: "yesno" },
    { field: "tracking_number", label: "Tracking number", kind: "text" },
    { field: "in_hands_date", label: "In-hands date", kind: "date" },
    { field: "carrier_responsible", label: "Is FedEx / the carrier responsible (lost in transit)?", kind: "yesno" },
  ],
  late: [
    { field: "delivered", label: "Has the order been delivered?", kind: "yesno" },
    { field: "still_usable", label: "Can the customer still use it?", kind: "yesno" },
    { field: "in_hands_date", label: "When was it needed?", kind: "date" },
    { field: "tracking_number", label: "Tracking number", kind: "text" },
    { field: "fedex_investigation_opened", label: "Was a FedEx investigation opened?", kind: "yesno" },
    { field: "carrier_responsible", label: "Is FedEx / the carrier responsible for the delay?", kind: "yesno" },
  ],
  color: [],
  cutting: [],
  production: [],
  file: [],
  other: [],
};

/** Every field that is issue-specific (tracking_number is also a Step 1 field, so it is excluded). */
export const CONDITIONAL_FIELDS = [
  "usable_as_is",
  "package_damaged",
  "damaged_pieces",
  "all_boxes_received",
  "sorted_through",
  "photos_received",
  "in_hands_date",
  "missing_items",
  "delivered",
  "still_usable",
  "fedex_investigation_opened",
  "carrier_responsible",
] as const;

export function questionsFor(issue: Issue | "" | null | undefined): Question[] {
  return issue ? ISSUE_QUESTIONS[issue] : [];
}

/** Conditional fields that do NOT apply to this issue. */
export function irrelevantConditionalFields(issue: Issue): string[] {
  const relevant = new Set(ISSUE_QUESTIONS[issue].map((q) => q.field));
  return CONDITIONAL_FIELDS.filter((f) => !relevant.has(f));
}

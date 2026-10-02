import type { TicketFormValues } from "@/lib/validation/ticket";

/** Form fields Quick Import is allowed to fill. */
export type ImportFieldKey = Extract<
  keyof TicketFormValues,
  | "ticket_number"
  | "date_opened"
  | "point_of_contact"
  | "customer_name"
  | "contact_name"
  | "order_number"
  | "department_id"
  | "material_id"
  | "size"
  | "quantity"
  | "order_value"
  | "tracking_number"
  | "fedex_case_number"
  | "issue"
  | "fault"
  | "fedex_investigation_opened"
>;

/**
 * extracted = stated explicitly in the pasted text.
 * inferred  = a reasonable guess that must be confirmed by Jessica.
 */
export type Confidence = "extracted" | "inferred";

export interface ImportField {
  key: ImportFieldKey;
  /** Value in form format (ISO date, uuid for lookups, "yes"/"no", plain numbers). */
  value: string;
  confidence: Confidence;
  /** Where it came from, e.g. "Ticket information · Order Number". */
  source: string;
  /** Why an inferred value was suggested. */
  reason?: string;
}

export interface ImportNote {
  /** The note exactly as pasted. */
  raw: string;
  /** Cleaned-up version in Jessica's preferred format (editable before use). */
  normalized: string;
}

export interface UnusedValue {
  label: string;
  value: string;
}

export interface ImportLookups {
  departments: { id: string; code: string; name: string; is_active?: boolean }[];
  materials: { id: string; department_id: string; name: string; is_active?: boolean }[];
  aliases: { material_id: string; alias: string }[];
}

export interface ParseResult {
  fields: ImportField[];
  note: ImportNote | null;
  /** Recognised information that has no matching ticket field. */
  unused: UnusedValue[];
  /**
   * Material text found in the paste that matches no material or alias.
   * Never discarded: the review shows it so Jessica can leave it blank or pick one.
   */
  unmatchedMaterials: { raw: string; source: string; departmentId: string | null }[];
  /** Plain-language notes (e.g. more than one product line). */
  warnings: string[];
  /** Which kinds of sections were recognised. */
  sections: ("ticket_info" | "line_info" | "ticket_note")[];
}

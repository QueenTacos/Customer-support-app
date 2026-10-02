import type { AssistantFieldKey } from "./fields";

/**
 * extracted = explicitly present in the pasted text
 * inferred  = interpretation / suggestion — must be confirmed
 * (missing  = relevant but not provided — see MissingItem)
 */
export type Confidence = "extracted" | "inferred";

export type AssistantMode = "new" | "update";

export type EntryKind = "new_ticket" | "customer_update" | "carrier_update" | "resolution" | "internal_update";

export interface ProposedField {
  key: AssistantFieldKey;
  /** Form-format value (ISO date, uuid, "yes"/"no", "15.48"). */
  value: string;
  confidence: Confidence;
  /** Where it came from (shown under the value). */
  source: string;
  /** The exact text it was taken from, when there is one. */
  evidence?: string;
  /** Why an inferred value is suggested. */
  reason?: string;
  /** Produced by deterministic rules (true) or the AI layer (false). */
  deterministic: boolean;
}

export interface MissingItem {
  key: AssistantFieldKey;
  label: string;
  /** e.g. "Late issue", "Reprint resolution". */
  because: string;
}

export interface SuggestedAction {
  type: "close_ticket";
  reason: string;
  evidence?: string;
}

export interface GeneratedNote {
  text: string;
  /** How the "SW/ Greg -" prefix was decided. */
  prefixSource: "pasted" | "ticket" | "none";
  generator: "rules" | "ai";
  /** Numbers/IDs from the paste that are missing from the note (should be empty). */
  droppedIdentifiers: string[];
}

export interface UnmatchedMaterial {
  raw: string;
  source: string;
  departmentId: string | null;
}

export interface Proposal {
  mode: AssistantMode;
  kind: EntryKind;
  /** Proposed values (before comparison with the form/ticket). */
  fields: ProposedField[];
  note: GeneratedNote | null;
  /** Why no note was produced (when note is null). */
  noteSkippedReason?: string;
  actions: SuggestedAction[];
  /** Missing information assuming every proposal is applied (the UI recomputes live). */
  missing: MissingItem[];
  unmatchedMaterials: UnmatchedMaterial[];
  /** Recognised information with no ticket field. */
  unused: { label: string; value: string }[];
  warnings: string[];
  /** Original text, preserved for "View original". */
  original: string;
  ai: { enabled: boolean; used: boolean; provider: string | null; error?: string };
}

/** Lookup data the engine matches against (from Supabase). */
export interface AssistantLookups {
  departments: { id: string; code: string; name: string; is_active?: boolean }[];
  materials: { id: string; department_id: string; name: string; is_active?: boolean }[];
  aliases: { material_id: string; alias: string }[];
}

/** Current ticket (update mode) or current form (new mode), in form-value format. */
export type FieldValues = Partial<Record<AssistantFieldKey, string>>;

export interface TicketContext {
  values: FieldValues;
  /** e.g. "Greg Kiel" / "Greg" / "SW" — used for the note prefix in updates. */
  customerName?: string;
  contactName?: string;
  pointOfContact?: string;
  materialName?: string;
  ticketNumber?: string;
  recentNotes?: string[];
}

export interface MissingRule {
  trigger_type: "issue" | "resolution" | "fault";
  trigger_value: string;
  field: AssistantFieldKey;
  label: string;
  condition: "has_tracking" | null;
  sort_order: number;
}

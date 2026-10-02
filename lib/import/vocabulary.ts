/**
 * Quick Import vocabulary — the one place to teach the parser new words.
 * Everything here is matched by whole word/phrase, never inside other words.
 */
import type { Fault, Issue } from "@/lib/domain/options";

/** Labels used by the internal "Ticket information" view → what they mean. */
export const TICKET_INFO_LABELS: Record<string, LabeledKey> = {
  "ticket id": "ticket_number",
  "ticket #": "ticket_number",
  "ticket number": "ticket_number",
  "ticket no": "ticket_number",
  "ordering user": "customer",
  customer: "customer",
  "customer name": "customer",
  company: "customer",
  contact: "contact",
  "contact name": "contact",
  category: "category",
  "category description": "category_description",
  opened: "opened",
  "date opened": "opened",
  "opened on": "opened",
  created: "opened",
  "order number": "order_number",
  "order #": "order_number",
  "order no": "order_number",
  description: "description",
  subject: "description",
  "phone number": "phone",
  phone: "phone",
  email: "email",
  "email address": "email",
  tracking: "tracking",
  "tracking number": "tracking",
  "tracking #": "tracking",
  status: "status",
};

export type LabeledKey =
  | "ticket_number"
  | "customer"
  | "contact"
  | "category"
  | "category_description"
  | "opened"
  | "order_number"
  | "description"
  | "phone"
  | "email"
  | "tracking"
  | "status";

/** Section headings that carry no data. */
export const SECTION_HEADINGS = [/^ticket information:?$/i, /^line information:?$/i, /^ticket notes?:?$/i, /^notes?:?$/i];

/** Order/line status words in line information (not stored anywhere). */
export const LINE_STATUS_RE =
  /^(shipped|delivered|in production|printing|printed|pending|processing|on hold|cancell?ed|ready|picked up|complete(d)?)$/i;

/** Point-of-contact prefixes at the start of a ticket note. */
export const POC_PREFIX_RE = /^(SW|MC|LPU)\s*\/\s*/i;

/**
 * Ticket-note abbreviations, expanded only as whole tokens in the note body.
 * (SW / MC / LPU stay as the note prefix — that's Jessica's format.)
 */
export const NOTE_ABBREVIATIONS: Record<string, string> = {
  TKG: "tracking",
  DMG: "damaged",
  PKG: "package",
};

/** Phrase-level clean-ups applied to the note body, in order. */
export const NOTE_PHRASES: { pattern: RegExp; replace: string }[] = [
  { pattern: /\bopened\s+(?:a\s+)?trace\s+with\s+fedex\b(\s+#?\s*(C-\d+))?/gi, replace: "opened FedEx trace$1" },
  { pattern: /\bopened\s+(?:a\s+)?fedex\s+trace\s+#\s*/gi, replace: "opened FedEx trace " },
  { pattern: /\b(tracking)\s+shows\s+delay\b/gi, replace: "$1 shows a delay" },
  { pattern: /\bfed\s?ex\b/gi, replace: "FedEx" },
];

/** Words that stay capitalised when a Title Case sentence is converted to sentence case. */
export const PROPER_WORDS = new Set(["FedEx", "UPS", "USPS", "DHL", "LIMITS", "Pantone"]);

/** Material shorthand → full words, used only when comparing material names. */
export const MATERIAL_TOKENS: Record<string, string> = {
  ds: "double sided",
  ss: "single sided",
  "2s": "double sided",
  "1s": "single sided",
  "4m": "4mil",
  "6m": "6mil",
  "10m": "10mm",
  "4mm": "4mm",
  dbl: "double",
  sgl: "single",
};

/** Exact issue words (e.g. the " - Late" at the end of a Description). */
export const ISSUE_WORDS: Record<string, Issue> = {
  late: "late",
  delayed: "late",
  delay: "late",
  damage: "damage",
  damaged: "damage",
  missing: "missing",
  color: "color",
  colour: "color",
  cutting: "cutting",
  "cut wrong": "cutting",
  production: "production",
  file: "file",
  "file issue": "file",
  other: "other",
};

/** Keyword patterns in free text → issue. First match wins, so order matters. */
export const ISSUE_KEYWORDS: { issue: Issue; pattern: RegExp }[] = [
  { issue: "damage", pattern: /\b(damaged?|dmg|broken|bent|crushed|torn|scratched)\b/i },
  { issue: "missing", pattern: /\b(missing|not received|never received|never arrived|short shipped|lost)\b/i },
  { issue: "late", pattern: /\b(late|delay(ed|s)?|not delivered yet|past due)\b/i },
  { issue: "cutting", pattern: /\b(cut wrong|mis-?cut|cutting|contour cut)\b/i },
  { issue: "color", pattern: /\b(colou?r (is )?(off|wrong)|wrong colou?r|colou?r match)\b/i },
  { issue: "file", pattern: /\b(file issue|low[- ]res|wrong file|bad file)\b/i },
];

/** Explicit fault statements. */
export const FAULT_PHRASES: { fault: Fault; pattern: RegExp }[] = [
  { fault: "production_error", pattern: /\bproduction error\b/i },
  { fault: "fedex_error", pattern: /\bfedex error\b/i },
  { fault: "customer_error", pattern: /\bcustomer error\b/i },
];

/** Mentions of the carrier (used only to SUGGEST FedEx Error). */
export const CARRIER_RE = /\b(fedex|fed ex|carrier|ups|usps)\b/i;

/** "Opened a trace with FedEx", "FedEx investigation opened", … */
export const FEDEX_INVESTIGATION_RE =
  /\b((opened|open|started|submitted|filed)\s+(a\s+)?(trace|investigation|case)\b[^.]*\bfed\s?ex\b|fed\s?ex\s+(trace|investigation|case)\b)/i;

/** FedEx case numbers look like C-259861376. */
export const FEDEX_CASE_RE = /\bC-\d{6,}\b/i;

/** Tracking numbers only count when introduced by a tracking word. */
export const TRACKING_IN_TEXT_RE =
  /\b(?:tkg|trk|tracking(?:\s*(?:number|no\.?|#))?)\s*[:#]?\s*(1Z[0-9A-Z]{16}|\d{12}|\d{15}|\d{20}|\d{22})\b/i;

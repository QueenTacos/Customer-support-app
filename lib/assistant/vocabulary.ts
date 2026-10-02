/**
 * Ticket Assistant vocabulary — the one place to teach the assistant new words.
 * These are DATA tables, read by small generic matchers (extract.ts / interpret.ts / note.ts).
 * Everything is matched as whole words/phrases, never inside other words.
 */
import type { Fault, Issue, ResolutionType } from "@/lib/domain/options";
import type { AssistantFieldKey } from "./fields";

/* ------------------------------------------------------------------------- *
 * Value patterns (what a value looks like)
 * ------------------------------------------------------------------------- */
export const VALUE_PATTERNS = {
  /** A clear dollar amount: "$15.48", "$20", "15.48". Bare integers are NOT money unless alone with a keyword. */
  money: String.raw`\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\$\s*\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}`,
  /** FedEx (12/15/20/22 digits, optional spaces every 4) or UPS 1Z. */
  tracking: String.raw`1Z[0-9A-Z]{16}|\d{4}\s\d{4}\s\d{4}|\d{22}|\d{20}|\d{15}|\d{12}`,
  /** Order-style identifiers: at least 6 characters with at least 5 digits. */
  id: String.raw`(?=[A-Za-z0-9-]*\d{5})[A-Za-z0-9][A-Za-z0-9-]{5,}`,
  date: String.raw`\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?`,
  int: String.raw`\d{1,6}`,
} as const;

export type ValueType = keyof typeof VALUE_PATTERNS;

/**
 * Keyword → value rules. Work both as "Keyword: value" / "Keyword value" in text
 * and as a two-line "Keyword" / "value" pair. Targets that aren't ticket fields
 * (subtotal, tax, value) are handled by the engine.
 */
export interface ValueRule {
  target: AssistantFieldKey | "subtotal" | "tax" | "value";
  keywords: string[];
  type: ValueType;
  label: string;
}

export const VALUE_RULES: ValueRule[] = [
  { target: "tracking_number", type: "tracking", label: "Tracking", keywords: ["tracking number", "tracking no", "tracking #", "tracking", "tkg#", "tkg", "trk#", "trk"] },
  { target: "shipping_cost", type: "money", label: "Shipping", keywords: ["shipping and handling", "shipping & handling", "shipping cost", "ship cost", "shipping", "freight", "s&h"] },
  { target: "order_value", type: "money", label: "Order total", keywords: ["total order value", "grand total", "order total", "order value", "total"] },
  { target: "subtotal", type: "money", label: "Sub-total", keywords: ["sub-total", "subtotal", "sub total"] },
  { target: "tax", type: "money", label: "Tax", keywords: ["sales tax", "tax"] },
  { target: "reprint_value", type: "money", label: "Reprint value", keywords: ["reprint value", "reprint cost", "reprint amount"] },
  { target: "refund_value", type: "money", label: "Refund", keywords: ["refund value", "refund amount", "refunded", "refund"] },
  { target: "discount_value", type: "money", label: "Discount", keywords: ["discount value", "discount amount", "discounted", "discount"] },
  { target: "credit_value", type: "money", label: "Credit", keywords: ["credit value", "credit amount", "credited", "credit"] },
  { target: "affected_item_value", type: "money", label: "Item value", keywords: ["affected item value", "item value", "line value", "line total"] },
  { target: "value", type: "money", label: "Value", keywords: ["value", "amount", "val"] },
  { target: "reprint_order_number", type: "id", label: "Reprint order", keywords: ["reprint order number", "reprint order #", "reprint order", "reprint #", "processed reprint", "reprint"] },
  { target: "order_number", type: "id", label: "Order", keywords: ["order number", "order no", "order #", "order", "ord#", "ord"] },
  { target: "in_hands_date", type: "date", label: "In-hands", keywords: ["in-hands date", "in hands date", "in-hands", "in hands", "needed by", "needs by", "need by", "event date"] },
  { target: "quantity", type: "int", label: "Quantity", keywords: ["quantity", "qty"] },
  { target: "damaged_pieces", type: "int", label: "Damaged", keywords: ["damaged pieces", "pieces damaged", "# damaged", "qty damaged"] },
  { target: "fedex_case_number", type: "id", label: "FedEx case", keywords: ["fedex case number", "fedex case #", "fedex case", "case number", "case #"] },
];

/** FedEx case numbers look like C-259861376 (recognised anywhere). */
export const FEDEX_CASE_RE = /\bC-\d{6,}\b/i;

/* ------------------------------------------------------------------------- *
 * Labeled "header" fields (two-line or "Label: value")
 * ------------------------------------------------------------------------- */
export type HeaderKey = "ticket_number" | "customer" | "contact" | "category" | "opened" | "description" | "phone" | "email" | "status";

export const HEADER_LABELS: Record<string, HeaderKey> = {
  "ticket id": "ticket_number",
  "ticket #": "ticket_number",
  "ticket number": "ticket_number",
  "ticket no": "ticket_number",
  "ordering user": "customer",
  customer: "customer",
  "customer name": "customer",
  company: "customer",
  account: "customer",
  contact: "contact",
  "contact name": "contact",
  category: "category",
  "category description": "category",
  department: "category",
  opened: "opened",
  "date opened": "opened",
  "opened on": "opened",
  created: "opened",
  description: "description",
  subject: "description",
  "phone number": "phone",
  phone: "phone",
  email: "email",
  "email address": "email",
  status: "status",
  "order status": "status",
};

/** Lines that are section headings, e.g. "Ticket information:", "LINE:", "NOTE:". */
export const HEADING_RE = /^(?:[A-Za-z][A-Za-z ]{1,30}:|ticket information|line information|order totals?|notes?)$/i;

/** Line/order status words (never a ticket field). */
export const LINE_STATUS_RE =
  /^(shipped|delivered|in production|printing|printed|pending|processing|on hold|cancell?ed|ready|picked up|complete(d)?|backordered)$/i;

/* ------------------------------------------------------------------------- *
 * Interpretation tables
 * ------------------------------------------------------------------------- */

/** Who the note is from/about. */
export const POC_RE = /(?:^|[\s:>•*-])(SW|MC|LPU)\s*\/\s*(?=\S)/i;
/** Text allowed before an SW/ prefix: labels or timestamps ("Note:", "10/02 9:14am -"). */
export const NOTE_PREFIX_ALLOWED_RE = /^(?:(?:ticket\s+)?notes?|comment|internal(?:\s+note)?|update|[\d/:.\s]+(?:am|pm)?)?\s*[:\-–•*>]*\s*$/i;

export const CARRIERS = ["FedEx", "Fed Ex", "UPS", "USPS", "DHL", "Carrier"];

/** Exact issue word, e.g. the " - Late" at the end of a Description. */
export const ISSUE_WORDS: Record<string, Issue> = {
  late: "late", delayed: "late", delay: "late",
  damage: "damage", damaged: "damage",
  missing: "missing",
  color: "color", colour: "color",
  cutting: "cutting", production: "production",
  file: "file", "file issue": "file", other: "other",
};

/** Free-text issue cues. All matches are collected; one clear winner = extracted. */
export const ISSUE_CUES: { issue: Issue; pattern: RegExp }[] = [
  { issue: "damage", pattern: /\b(damaged?|dmg|broken|bent|crushed|torn|scratched|cracked)\b/i },
  { issue: "missing", pattern: /\b(missing|not received|never received|never arrived|short[- ]shipped|lost in transit)\b/i },
  { issue: "late", pattern: /\b(late|delay(?:ed|s)?|past due|won'?t make (?:it|the date)|not delivered yet)\b/i },
  { issue: "cutting", pattern: /\b(cut wrong|mis-?cut|cutting (?:issue|error)|contour cut wrong)\b/i },
  { issue: "color", pattern: /\b(colou?r (?:is )?(?:off|wrong)|wrong colou?r|colou?r match(?:ing)? issue)\b/i },
  { issue: "file", pattern: /\b(file issue|low[- ]res(?:olution)?|wrong file|bad file|customer file)\b/i },
  { issue: "production", pattern: /\b(production (?:error|issue)|printed wrong|wrong side printed|misprint(?:ed)?)\b/i },
];

export const FAULT_PHRASES: { fault: Fault; pattern: RegExp }[] = [
  { fault: "production_error", pattern: /\bproduction error\b/i },
  { fault: "fedex_error", pattern: /\bfed\s?ex error\b/i },
  { fault: "customer_error", pattern: /\bcustomer error\b/i },
];

export const RESOLUTION_CUES: { type: ResolutionType; pattern: RegExp }[] = [
  { type: "reprint", pattern: /\b(re-?print(?:ed|ing)?)\b/i },
  { type: "refund", pattern: /\b(refund(?:ed|ing)?)\b/i },
  { type: "discount", pattern: /\b(discount(?:ed)?)\b/i },
  { type: "credit", pattern: /\b((?:store )?credit(?:ed)?)\b/i },
];
/** A resolution counts as done/explicit (extracted) when one of these verbs accompanies it. */
export const RESOLUTION_DONE_RE = /\b(processed|issued|placed|sent|approved|submitted|entered|refunded|credited|discounted|reprinted)\b/i;

/** State statements → yes/no answers. `field: "usable"` maps to usable_as_is (damage) or still_usable (otherwise). */
export const STATE_PHRASES: { field: AssistantFieldKey | "usable"; value: "yes" | "no"; pattern: RegExp }[] = [
  { field: "delivered", value: "no", pattern: /\b(not (?:been )?delivered|hasn'?t (?:been )?delivered|undelivered)\b/i },
  { field: "delivered", value: "yes", pattern: /\b(?<!not |n't |be |will be )(?:confirmed )?(?:was |has been |been )?delivered\b(?! (?:tomorrow|today|later|by|on|monday|tuesday|wednesday|thursday|friday))/i },
  { field: "usable", value: "no", pattern: /\b(can'?t use|cannot use|can not use|unusable|not usable|unable to use)\b/i },
  { field: "usable", value: "yes", pattern: /\b(can (?:still )?use(?: it| them)?|usable|able to use|okay to use|ok to use)\b/i },
  { field: "photos_received", value: "yes", pattern: /\b(photos? (?:received|rec'?v?d|came in)|received (?:the )?photos?|got (?:the )?photos?)\b/i },
  { field: "package_damaged", value: "yes", pattern: /\b((?:box|package|pkg|carton)s? (?:was |were |is |are )?(?:damaged|crushed|torn))\b/i },
  { field: "package_damaged", value: "no", pattern: /\b((?:box|package|pkg|carton)s? (?:was |were |is |are )?(?:fine|ok|okay|not damaged|undamaged))\b/i },
  { field: "all_boxes_received", value: "yes", pattern: /\b(all (?:the )?boxes (?:were )?received|received all (?:the )?boxes)\b/i },
  { field: "all_boxes_received", value: "no", pattern: /\b(not all boxes|missing (?:a |one |\d+ )?box(?:es)?|only (?:received )?\d+ of \d+ boxes)\b/i },
  { field: "sorted_through", value: "yes", pattern: /\b(sorted through|went through everything|checked (?:all|everything))\b/i },
  { field: "fedex_investigation_opened", value: "yes", pattern: /\b((?:opened|open|started|submitted|filed)\s+(?:a\s+)?(?:trace|investigation|claim|case)\b[^.]*\bfed\s?ex\b|fed\s?ex\s+(?:trace|investigation|case)\s+(?:opened|submitted|filed)|opened\s+(?:a\s+)?fed\s?ex\s+(?:trace|investigation|case))/i },
];

export const ACTION_PHRASES: { type: "close_ticket"; pattern: RegExp }[] = [
  { type: "close_ticket", pattern: /\b(close (?:the |this )?ticket|ok(?:ay)? to close|can close|closing (?:the |this )?ticket|ticket can be closed)\b/i },
];

/* ------------------------------------------------------------------------- *
 * Note style
 * ------------------------------------------------------------------------- */

/** Abbreviations expanded only as whole tokens in note text (SW/MC/LPU stay as the prefix). */
export const NOTE_ABBREVIATIONS: Record<string, string> = {
  tkg: "tracking",
  trk: "tracking",
  dmg: "damaged",
  pkg: "package",
  img: "image",
  imgs: "images",
  cust: "customer",
  rcvd: "received",
  recd: "received",
  approx: "approximately",
  qty: "quantity",
};

/** Words used to repair accidental splits like "r eprint" → "reprint". */
export const DOMAIN_WORDS = new Set([
  "reprint", "reprinted", "refund", "refunded", "discount", "credit", "tracking", "delivered", "delivery",
  "damaged", "missing", "customer", "package", "received", "confirmed", "processed", "shipping", "shipped",
  "investigation", "reattempt", "building", "approved", "replacement", "contacted", "photos", "image",
]);

/** Phrase clean-ups, applied in order. */
export const NOTE_PHRASES: { pattern: RegExp; replace: string }[] = [
  { pattern: /\bopened\s+(?:a\s+)?trace\s+with\s+fed\s?ex\b(\s+#?\s*(C-\d+))?/gi, replace: "opened FedEx trace$1" },
  { pattern: /\bfed\s?ex\s+says\b/gi, replace: "FedEx reports" },
  { pattern: /\bcarrier\s+says\b/gi, replace: "carrier reports" },
  { pattern: /\b(tracking)\s+shows\s+delay\b/gi, replace: "$1 shows a delay" },
  { pattern: /\bfed\s?ex\b/gi, replace: "FedEx" },
  { pattern: /\b(to|at|from|the) wrong (address|building|door|location|house|suite)\b/gi, replace: "$1 the wrong $2" },
  { pattern: /\bthe the\b/gi, replace: "the" },
];

/** Keywords that start their own sentence when followed by ":" in a note ("… 9/15 value: 17.50"). */
export const NOTE_LABEL_WORDS = ["value", "shipping", "total", "refund", "credit", "discount", "reprint value", "tracking"];

/** Words kept capitalised when a Title Case sentence is converted to sentence case. */
export const PROPER_WORDS = new Set(["FedEx", "UPS", "USPS", "DHL", "LIMITS", "Pantone"]);

/** Material shorthand → full words (used only when comparing material names). */
export const MATERIAL_TOKENS: Record<string, string> = {
  ds: "double sided",
  ss: "single sided",
  "2s": "double sided",
  "1s": "single sided",
  "4m": "4mil",
  "6m": "6mil",
  "10m": "10mm",
  dbl: "double",
  sgl: "single",
};

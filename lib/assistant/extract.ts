/**
 * Deterministic extraction — exact facts only, no interpretation.
 * Every line is classified independently, so information can arrive in any
 * order and any mix (header data, line items, order totals, notes, free text).
 */
import { basicNormalize, matchDepartment, matchMaterial } from "./materials";
import { moneyToPlain, normalizeLines } from "./normalize";
import { noteStartIndex, parseNote, type ParsedNote } from "./note";
import type { AssistantLookups } from "./types";
import {
  FEDEX_CASE_RE,
  HEADER_LABELS,
  HEADING_RE,
  LINE_STATUS_RE,
  VALUE_PATTERNS,
  VALUE_RULES,
  type HeaderKey,
  type ValueRule,
} from "./vocabulary";

export type FactSource = "Ticket information" | "Line item" | "Order totals" | "Ticket note" | "Pasted text";

export interface ValueFact {
  target: ValueRule["target"];
  /** Raw matched value ("$15.48", "877732421485"). */
  raw: string;
  evidence: string;
  source: FactSource;
}

export interface LineItem {
  lineNo?: string;
  department?: string;
  material?: string;
  size?: string;
  weight?: string;
  quantity?: string;
  value?: string;
  status?: string;
}

export interface NoteBlock {
  raw: string;
  parsed: ParsedNote;
}

export interface Extraction {
  lines: string[];
  header: Partial<Record<HeaderKey, string>>;
  values: ValueFact[];
  lineItems: LineItem[];
  notes: NoteBlock[];
  /** Narrative lines that aren't part of an SW/ note (e.g. "FedEx says delivery tomorrow"). */
  narrative: string[];
  unused: { label: string; value: string }[];
}

/* ------------------------------------------------------------------------- *
 * Line classification helpers
 * ------------------------------------------------------------------------- */
const full = (p: string) => new RegExp(`^(?:${p})$`, "i");
const MONEY_FULL = full(VALUE_PATTERNS.money);
const LOOSE_MONEY_FULL = /^\$?\s*\d{1,7}(?:\.\d{1,2})?$/;
const INT_FULL = /^\d{1,6}$/;
const WEIGHT_FULL = /^\d+(\.\d+)?\s*(lbs?|pounds?|oz)$/i;
const SIZE_RE = /\d+(\.\d+)?\s*(?:"|in\b|inch(?:es)?|')?\s*[x×]\s*\d/i;

const isMoney = (l: string) => MONEY_FULL.test(l);
const isNarrative = (l: string) => (l.match(/[A-Za-z]{3,}/g) ?? []).length >= 2;

/** All (rule, keyword) pairs, longest keyword first, so "order total" beats "order". */
const KEYWORDS = VALUE_RULES.flatMap((rule) => rule.keywords.map((kw) => ({ rule, kw }))).sort(
  (a, b) => b.kw.length - a.kw.length,
);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");

function keywordRule(label: string) {
  const n = basicNormalize(label).replace(/\s*:$/, "");
  return KEYWORDS.find((k) => k.kw === n) ?? null;
}

function valueFits(rule: ValueRule, v: string, loose: boolean): boolean {
  const s = v.trim();
  if (rule.type === "money") return loose ? LOOSE_MONEY_FULL.test(s) : isMoney(s);
  return full(VALUE_PATTERNS[rule.type]).test(s);
}

/**
 * Find "keyword [:#=] value" facts inside a piece of text.
 * Returns facts plus the text with the matched spans blanked out.
 */
export function scanValues(text: string, source: FactSource): { facts: ValueFact[]; rest: string } {
  let rest = text;
  const facts: ValueFact[] = [];
  for (const { rule, kw } of KEYWORDS) {
    const re = new RegExp(
      String.raw`(?<![A-Za-z0-9])(${escapeRe(kw)})(?![A-Za-z])\s*(?:[:#=]|-(?=\s)|\bis\b|\bof\b)?\s*(${VALUE_PATTERNS[rule.type]})(?![\d.])`,
      "gi",
    );
    rest = rest.replace(re, (whole, _kw: string, value: string) => {
      facts.push({ target: rule.target, raw: value.trim(), evidence: whole.trim(), source });
      return " ".repeat(whole.length);
    });
  }
  // A whole line that is just "keyword number" may use a bare number for money ("shipping 20").
  const loose = rest.trim().match(/^([A-Za-z#&/ -]{2,30}?)\s*[:#=]?\s*(\$?\s*\d{1,7}(?:\.\d{1,2})?)$/);
  if (loose) {
    const k = keywordRule(loose[1]);
    if (k && k.rule.type === "money") {
      facts.push({ target: k.rule.target, raw: loose[2], evidence: rest.trim(), source });
      rest = "";
    }
  }
  rest = rest.replace(FEDEX_CASE_RE, (whole) => {
    facts.push({ target: "fedex_case_number", raw: whole.toUpperCase(), evidence: whole, source });
    return " ".repeat(whole.length);
  });
  return { facts, rest };
}

/* ------------------------------------------------------------------------- *
 * Main
 * ------------------------------------------------------------------------- */
export function extract(raw: string, lookups: AssistantLookups): Extraction {
  const lines = normalizeLines(raw);
  const used = new Array(lines.length).fill(false);
  const header: Extraction["header"] = {};
  const values: ValueFact[] = [];
  const lineItems: LineItem[] = [];
  const notes: NoteBlock[] = [];
  const narrative: string[] = [];
  const unused: Extraction["unused"] = [];

  const headerLabel = (l: string): HeaderKey | null => HEADER_LABELS[basicNormalize(l).replace(/\s*:$/, "")] ?? null;
  const isLabel = (l: string) => !!headerLabel(l) || !!keywordRule(l);

  lines.forEach((l, i) => {
    if (HEADING_RE.test(l) && !isLabel(l.replace(/:$/, ""))) used[i] = true;
  });

  /* 1. Labeled pairs: "Label" + value on the next line, or "Label: value". */
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const line = lines[i];
    const inline = line.match(/^([A-Za-z][A-Za-z #&/-]{1,30}?)\s*:\s*(.+)$/);
    if (inline && headerLabel(inline[1])) {
      const key = headerLabel(inline[1])!;
      if (!(key in header)) header[key] = inline[2].trim();
      used[i] = true;
      continue;
    }
    const next = lines[i + 1];
    if (next === undefined || used[i + 1]) continue;
    const hk = headerLabel(line);
    if (hk && !isLabel(next)) {
      if (!(hk in header)) header[hk] = next;
      used[i] = used[i + 1] = true;
      i++;
      continue;
    }
    const k = keywordRule(line);
    if (k && valueFits(k.rule, next, true)) {
      const source: FactSource = k.rule.target === "order_value" || k.rule.target === "subtotal" || k.rule.target === "tax" || k.rule.target === "shipping_cost" ? "Order totals" : "Ticket information";
      values.push({ target: k.rule.target, raw: next.trim(), evidence: `${line} ${next}`, source });
      used[i] = used[i + 1] = true;
      i++;
    }
  }

  /* 2. Line items: a department or material line surrounded by item-like data. */
  const kindOf = (l: string) =>
    WEIGHT_FULL.test(l) ? "weight"
      : isMoney(l) ? "money"
      : INT_FULL.test(l) ? "int"
      : SIZE_RE.test(l) && l.length < 80 ? "size"
      : LINE_STATUS_RE.test(l) ? "status"
      : matchDepartment(l, lookups) ? "department"
      : "text";

  for (let j = 0; j < lines.length; j++) {
    if (used[j]) continue;
    const anchorKind = kindOf(lines[j]);
    const anchorIsMaterial = anchorKind === "text" && lines[j].length < 70 && !!matchMaterial(lines[j], lookups);
    if (anchorKind !== "department" && !anchorIsMaterial) continue;

    // Grow a window of consecutive unused, non-narrative-sentence lines around the anchor.
    let start = j;
    if (j > 0 && !used[j - 1] && INT_FULL.test(lines[j - 1])) start = j - 1;
    let end = j;
    while (end + 1 < lines.length && !used[end + 1] && end - start < 9) {
      const l = lines[end + 1];
      if (noteStartIndex(l) >= 0) break;
      const k = kindOf(l);
      if (k === "text" && (l.length > 70 || /[.!?]$/.test(l) || isNarrative(l) && !matchMaterial(l, lookups) && end > j)) break;
      end++;
    }
    const window = lines.slice(start, end + 1);
    const kinds = window.map(kindOf);
    if (!kinds.some((k) => k === "money" || k === "weight" || k === "size") || window.length < 3) continue;

    const item: LineItem = {};
    let sawAnchor = false;
    window.forEach((l, idx) => {
      const k = kinds[idx];
      const atAnchor = start + idx === j;
      if (atAnchor) sawAnchor = true;
      if (k === "department" && !item.department) item.department = l;
      else if (k === "int" && !sawAnchor && !item.lineNo) item.lineNo = l;
      else if (k === "int" && !item.quantity) item.quantity = l;
      else if (k === "money" && !item.value) item.value = l;
      else if (k === "weight" && !item.weight) item.weight = l;
      else if (k === "size" && !item.size) item.size = l;
      else if (k === "status" && !item.status) item.status = l;
      else if (k === "text" && !item.material) item.material = l;
      else unused.push({ label: "Line item (extra)", value: l });
    });
    lineItems.push(item);
    for (let x = start; x <= end; x++) used[x] = true;
    j = end;
  }

  /* 3. Notes ("SW/ …" anywhere a line starts with it, after an optional "Note:" / timestamp). */
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const at = noteStartIndex(lines[i]);
    if (at < 0) continue;
    const before = lines[i].slice(0, at).trim();
    if (before && !/^[\s:>•*-]*$/.test(before)) unused.push({ label: "Before note", value: before });
    let text = lines[i].slice(at).trim();
    used[i] = true;
    // Continuation lines: following narrative lines that aren't data or another note.
    while (i + 1 < lines.length && !used[i + 1] && noteStartIndex(lines[i + 1]) < 0 && isNarrative(lines[i + 1])) {
      const { facts, rest } = scanValues(lines[i + 1], "Ticket note");
      if (!isNarrative(rest)) break; // pure data line — handled below
      void facts;
      text += " " + lines[i + 1];
      used[++i] = true;
    }
    notes.push({ raw: text, parsed: parseNote(text) });
  }

  /* 4. Values inside notes and remaining lines; classify what's left. */
  for (const n of notes) values.push(...scanValues(n.parsed.narrative, "Ticket note").facts);
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const { facts, rest } = scanValues(lines[i], "Pasted text");
    values.push(...facts);
    used[i] = true;
    if (isNarrative(rest)) narrative.push(lines[i]);
    else if (!facts.length) {
      const t = lines[i];
      if (LINE_STATUS_RE.test(t)) unused.push({ label: "Status", value: t });
      else unused.push({ label: "Not recognised", value: t });
    }
  }

  // Header extras that never become fields
  if (header.phone) unused.push({ label: "Phone Number", value: header.phone });
  if (header.email) unused.push({ label: "Email", value: header.email });
  if (header.status) unused.push({ label: "Status (internal)", value: header.status });

  return { lines, header, values, lineItems, notes, narrative, unused };
}

export { moneyToPlain };

/**
 * Local interpretation: turns the deterministic Extraction into proposed field
 * values. Everything read literally from the paste is "extracted"; anything that
 * is a judgement (contact name from a note, fault from context) is "inferred".
 */
import { FAULT_LABELS, ISSUE_LABELS, RESOLUTION_LABELS, type Fault, type Issue, type ResolutionType } from "@/lib/domain/options";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import { normalizeFieldValue, type AssistantFieldKey } from "./fields";
import type { Extraction, ValueFact } from "./extract";
import { matchDepartment, matchMaterial } from "./materials";
import { toIsoDate } from "./normalize";
import type {
  AssistantLookups,
  AssistantMode,
  EntryKind,
  ProposedField,
  SuggestedAction,
  TicketContext,
  UnmatchedMaterial,
} from "./types";
import {
  ACTION_PHRASES,
  CARRIERS,
  FAULT_PHRASES,
  ISSUE_CUES,
  ISSUE_WORDS,
  RESOLUTION_CUES,
  RESOLUTION_DONE_RE,
  STATE_PHRASES,
} from "./vocabulary";
import { basicNormalize } from "./materials";

export interface Interpretation {
  fields: ProposedField[];
  kind: EntryKind;
  actions: SuggestedAction[];
  unmatchedMaterials: UnmatchedMaterial[];
  unused: { label: string; value: string }[];
  warnings: string[];
  /** All narrative text (note narratives + free lines), for the note and the AI. */
  narrativeText: string;
}

export interface InterpretOptions {
  mode: AssistantMode;
  lookups: AssistantLookups;
  context?: TicketContext;
  /** YYYY-MM-DD, used for dates without a year. */
  today: string;
}

const CARRIER_RE = new RegExp(`\\b(${CARRIERS.map((c) => c.replace(/ /g, "\\s?")).join("|")})\\b`, "i");

function firstNameOf(full: string): string | null {
  const first = full.trim().split(/\s+/)[0];
  return first && /^[A-Za-z][A-Za-z'.-]+$/.test(first) && first.length <= 30 ? first : null;
}

export function interpret(ex: Extraction, opts: InterpretOptions): Interpretation {
  const { lookups, mode, context, today } = opts;
  const fields: ProposedField[] = [];
  const warnings: string[] = [];
  const unused = [...ex.unused];
  const unmatchedMaterials: UnmatchedMaterial[] = [];
  const actions: SuggestedAction[] = [];

  const get = (key: AssistantFieldKey) => fields.find((f) => f.key === key);
  /** Add a proposal. The first value for a field wins; a different later value becomes a warning. */
  const add = (f: Omit<ProposedField, "deterministic" | "value"> & { value: string | null | undefined }) => {
    const value = f.value == null ? null : normalizeFieldValue(f.key, f.value);
    if (value === null) return;
    const existing = get(f.key);
    if (existing) {
      if (existing.value !== value) {
        warnings.push(`Two different values found for ${f.key.replace(/_/g, " ")}: "${existing.value}" (kept) and "${value}".`);
      }
      return;
    }
    fields.push({ ...f, value, deterministic: true });
  };

  /* ---- Ticket information header ---------------------------------------- */
  const h = ex.header;
  if (h.ticket_number) add({ key: "ticket_number", value: h.ticket_number.replace(/^#/, ""), confidence: "extracted", source: "Ticket information", evidence: h.ticket_number });
  if (h.opened) {
    const d = toIsoDate(h.opened.slice(0, 10).trim(), today) ?? toIsoDate(h.opened.split(/\s+/)[0], today);
    if (d) add({ key: "date_opened", value: d.iso, confidence: d.yearInferred ? "inferred" : "extracted", source: "Ticket information · Opened", evidence: h.opened, reason: d.yearInferred ? "No year given — assumed the next occurrence." : undefined });
  }
  if (h.customer) add({ key: "customer_name", value: h.customer, confidence: "extracted", source: "Ticket information", evidence: h.customer });
  if (h.contact) add({ key: "contact_name", value: h.contact, confidence: "extracted", source: "Ticket information", evidence: h.contact });

  let descriptionIssue: Issue | null = null;
  let descriptionMaterial: string | null = null;
  if (h.description) {
    const parts = h.description.split(/\s+-\s+/);
    const last = basicNormalize(parts[parts.length - 1] ?? "");
    if (parts.length > 1 && ISSUE_WORDS[last]) {
      descriptionIssue = ISSUE_WORDS[last];
      descriptionMaterial = parts.slice(0, -1).join(" - ");
    } else if (ISSUE_WORDS[basicNormalize(h.description)]) {
      descriptionIssue = ISSUE_WORDS[basicNormalize(h.description)];
    } else {
      descriptionMaterial = h.description;
    }
  }
  if (h.category) {
    const d = matchDepartment(h.category, lookups);
    if (d) add({ key: "department_id", value: d.id, confidence: "extracted", source: "Ticket information · Category", evidence: h.category });
    else unused.push({ label: "Category (no matching department)", value: h.category });
  }

  /* ---- Line items -------------------------------------------------------- */
  if (ex.lineItems.length > 1) warnings.push(`${ex.lineItems.length} line items found — only the first was used. Edit the fields if a different item is affected.`);
  const item = ex.lineItems[0];
  const materialCandidates: { text: string; source: string }[] = [];
  if (item) {
    if (item.department) {
      const d = matchDepartment(item.department, lookups);
      if (d) add({ key: "department_id", value: d.id, confidence: "extracted", source: "Line item", evidence: item.department });
    }
    if (item.material) materialCandidates.push({ text: item.material, source: "Line item" });
    if (item.size) add({ key: "size", value: item.size, confidence: "extracted", source: "Line item", evidence: item.size });
    if (item.quantity) add({ key: "quantity", value: item.quantity, confidence: "extracted", source: "Line item", evidence: item.quantity });
    if (item.value) add({ key: "affected_item_value", value: item.value, confidence: "extracted", source: "Line item value", evidence: item.value });
    if (item.lineNo) unused.push({ label: "Line number", value: item.lineNo });
    if (item.weight) unused.push({ label: "Weight", value: item.weight });
    if (item.status) unused.push({ label: "Line status", value: item.status });
  }
  if (descriptionMaterial) materialCandidates.push({ text: descriptionMaterial, source: "Ticket information · Description" });

  /* ---- Notes -------------------------------------------------------------- */
  const firstNote = ex.notes[0]?.parsed;
  if (firstNote?.product) materialCandidates.push({ text: firstNote.product, source: "Ticket note" });
  if (firstNote?.poc) add({ key: "point_of_contact", value: firstNote.poc, confidence: "extracted", source: "Ticket note prefix", evidence: `${firstNote.poc}/` });

  /* ---- Material ----------------------------------------------------------- */
  for (const c of materialCandidates) {
    const m = matchMaterial(c.text, lookups);
    if (m) {
      add({
        key: "material_id",
        value: m.materialId,
        confidence: "extracted",
        source: `${c.source} · ${m.how === "name" ? "exact name" : m.how === "alias" ? "alias" : "shorthand"}`,
        evidence: c.text,
      });
      if (!get("department_id")) add({ key: "department_id", value: m.departmentId, confidence: "extracted", source: "Material's department", evidence: m.name });
    }
  }
  if (!get("material_id")) {
    // Report the first candidate that didn't match (line item beats description beats note shorthand).
    const c = materialCandidates[0];
    if (c) unmatchedMaterials.push({ raw: c.text, source: c.source, departmentId: get("department_id")?.value ?? null });
  }

  /* ---- Values (keyword facts) ------------------------------------------- */
  const byTarget = new Map<string, ValueFact[]>();
  for (const v of ex.values) byTarget.set(v.target, [...(byTarget.get(v.target) ?? []), v]);
  const first = (t: string) => byTarget.get(t)?.[0];

  for (const v of ex.values) {
    switch (v.target) {
      case "subtotal":
        unused.push({ label: "Sub-total", value: v.raw });
        break;
      case "tax":
        unused.push({ label: "Tax", value: v.raw });
        break;
      case "value":
        break; // resolved below once the resolution type is known
      case "tracking_number":
        add({ key: "tracking_number", value: v.raw.replace(/\s+/g, ""), confidence: "extracted", source: v.source, evidence: v.evidence });
        break;
      case "in_hands_date": {
        const d = toIsoDate(v.raw, today);
        if (d) add({ key: "in_hands_date", value: d.iso, confidence: "extracted", source: v.source, evidence: v.evidence, reason: d.yearInferred ? "No year given — assumed the next occurrence." : undefined });
        break;
      }
      case "fedex_case_number":
        add({ key: "fedex_case_number", value: v.raw.toUpperCase(), confidence: "extracted", source: v.source, evidence: v.evidence });
        break;
      default:
        add({ key: v.target, value: v.raw, confidence: "extracted", source: v.source, evidence: v.evidence });
    }
  }

  /* ---- Free-text interpretation ------------------------------------------ */
  const narrativeParts = [...ex.notes.map((n) => n.parsed.narrative), ...ex.narrative].filter(Boolean);
  const narrativeText = narrativeParts.join(" ");

  // Issue
  if (descriptionIssue) {
    add({ key: "issue", value: descriptionIssue, confidence: "extracted", source: "Ticket information · Description", evidence: h.description });
  } else if (narrativeText) {
    const hits = ISSUE_CUES.filter((c) => c.pattern.test(narrativeText));
    if (hits.length === 1) {
      const word = narrativeText.match(hits[0].pattern)![0];
      const ctxIssue = context?.values.issue;
      add({
        key: "issue",
        value: hits[0].issue,
        // In an update, a different issue than the ticket already has is a judgement call.
        confidence: mode === "update" && ctxIssue && ctxIssue !== hits[0].issue ? "inferred" : "extracted",
        source: "Text",
        evidence: word,
        reason: mode === "update" && ctxIssue && ctxIssue !== hits[0].issue ? `Text mentions "${word}" — the ticket is currently ${ISSUE_LABELS[ctxIssue as Issue] ?? ctxIssue}.` : undefined,
      });
    } else if (hits.length > 1) {
      warnings.push(`The text mentions more than one kind of issue (${hits.map((x) => ISSUE_LABELS[x.issue]).join(", ")}) — choose the issue yourself.`);
    }
  }

  // Resolution
  const resHits = RESOLUTION_CUES.filter((c) => c.pattern.test(narrativeText));
  let resolution: ResolutionType | null = null;
  if (resHits.length === 1) {
    resolution = resHits[0].type;
    const done = RESOLUTION_DONE_RE.test(narrativeText);
    add({
      key: "resolution_type",
      value: resolution,
      confidence: done ? "extracted" : "inferred",
      source: "Text",
      evidence: narrativeText.match(resHits[0].pattern)![0],
      reason: done ? undefined : `The text mentions a ${RESOLUTION_LABELS[resolution].toLowerCase()} but doesn't say it was processed.`,
    });
  } else if (resHits.length > 1) {
    warnings.push(`The text mentions more than one resolution (${resHits.map((x) => RESOLUTION_LABELS[x.type]).join(", ")}) — choose the resolution yourself.`);
  }
  if (!resolution && context?.values.resolution_type) resolution = context.values.resolution_type as ResolutionType;

  // A bare "value: 17.50" belongs to the resolution, if there is one.
  const bareValue = first("value");
  if (bareValue) {
    const target = resolution && ["reprint", "refund", "discount", "credit"].includes(resolution) ? (`${resolution}_value` as AssistantFieldKey) : null;
    if (target) add({ key: target, value: bareValue.raw, confidence: "extracted", source: `${bareValue.source} · ${RESOLUTION_LABELS[resolution!]} value`, evidence: bareValue.evidence });
    else unused.push({ label: "Value (no resolution to attach it to)", value: bareValue.raw });
  }

  // State statements
  const issueNow = (get("issue")?.value ?? context?.values.issue ?? "") as Issue | "";
  for (const s of STATE_PHRASES) {
    const m = narrativeText.match(s.pattern);
    if (!m) continue;
    const key: AssistantFieldKey = s.field === "usable" ? (issueNow === "damage" ? "usable_as_is" : "still_usable") : s.field;
    if (get(key)) continue;
    add({ key, value: s.value, confidence: "extracted", source: "Text", evidence: m[0] });
  }

  // Fault
  const allText = [h.description, narrativeText].filter(Boolean).join(" ");
  const explicitFault = FAULT_PHRASES.find((f) => f.pattern.test(allText));
  if (explicitFault) {
    add({ key: "fault", value: explicitFault.fault, confidence: "extracted", source: "Text", evidence: FAULT_LABELS[explicitFault.fault] });
  } else if (!context?.values.fault) {
    const carrierMentioned = CARRIER_RE.test(narrativeText) || !!get("fedex_case_number") || !!ex.notes.some((n) => n.parsed.isCarrier);
    if (carrierMentioned && (issueNow === "late" || issueNow === "damage" || issueNow === "missing")) {
      add({
        key: "fault",
        value: "fedex_error" satisfies Fault,
        confidence: "inferred",
        source: "Text mentions FedEx",
        reason: `FedEx is involved in a ${ISSUE_LABELS[issueNow].toLowerCase()} order. That doesn't prove FedEx is responsible — confirm before accepting.`,
      });
    } else if (issueNow) {
      const s = suggestFault({ issue: issueNow, carrier_responsible: null });
      if (s) add({ key: "fault", value: s.fault, confidence: "inferred", source: "Fault rules", reason: s.reason });
    }
  }

  // Contact (never a carrier)
  if (!get("contact_name")) {
    const noteName = ex.notes.find((n) => n.parsed.name && !n.parsed.isCarrier)?.parsed.name;
    const customer = get("customer_name")?.value;
    if (noteName) {
      add({
        key: "contact_name",
        value: noteName,
        confidence: "inferred",
        source: "Ticket note",
        evidence: noteName,
        reason: `Name after the note prefix${customer ? ` (customer is ${customer})` : ""} — confirm this is who you spoke with.`,
      });
    } else if (customer && mode === "new" && firstNameOf(customer)) {
      add({
        key: "contact_name",
        value: firstNameOf(customer)!,
        confidence: "inferred",
        source: "Customer's first name",
        reason: "First name of the customer — confirm this is who you're speaking with.",
      });
    }
  }

  // Suggested actions (never applied automatically)
  for (const a of ACTION_PHRASES) {
    const m = narrativeText.match(a.pattern);
    if (m) actions.push({ type: a.type, reason: "The text says the ticket can be closed.", evidence: m[0] });
  }

  /* ---- Entry kind -------------------------------------------------------- */
  let kind: EntryKind = "new_ticket";
  if (mode === "update") {
    if (ex.notes.some((n) => n.parsed.isCarrier) || (!ex.notes.length && /^\s*(fed\s?ex|ups|usps|dhl|carrier)\b/i.test(ex.narrative[0] ?? ""))) kind = "carrier_update";
    else if (get("resolution_type")) kind = "resolution";
    else if (ex.notes.some((n) => n.parsed.name)) kind = "customer_update";
    else kind = "internal_update";
  }

  return { fields, kind, actions, unmatchedMaterials, unused, warnings, narrativeText };
}

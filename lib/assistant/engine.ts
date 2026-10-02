/**
 * Ticket Assistant engine — ONE proposal model for both New Ticket and Quick Update.
 *
 *   paste → extract (deterministic) → interpret (local rules) → [optional AI,
 *   validated + reconciled; deterministic always wins] → note → missing → Proposal
 *
 * Pure functions: no I/O, nothing is written anywhere. Saving happens only when
 * Jessica confirms (form submit / Apply Update).
 */
import type { AiInterpretation } from "@/lib/ai/types";
import { DETERMINISTIC_FIELDS, type AssistantFieldKey } from "./fields";
import { extract, type Extraction } from "./extract";
import { interpret, type Interpretation } from "./interpret";
import { computeMissing, DEFAULT_MISSING_RULES } from "./missing";
import { droppedIdentifiers, formatPrefix, normalizeNarrative } from "./note";
import type {
  AssistantLookups,
  AssistantMode,
  FieldValues,
  GeneratedNote,
  MissingRule,
  Proposal,
  ProposedField,
  TicketContext,
} from "./types";

export interface AnalyzeInput {
  text: string;
  mode: AssistantMode;
  lookups: AssistantLookups;
  /** Existing ticket (update) or current form values (new). */
  context?: TicketContext;
  /** YYYY-MM-DD (business timezone). */
  today: string;
  rules?: MissingRule[];
}

export const MAX_ASSISTANT_TEXT = 20000;

function firstName(full?: string | null): string | null {
  const f = full?.trim().split(/\s+/)[0];
  return f && /^[A-Za-z][A-Za-z'.-]+$/.test(f) ? f : null;
}

/** Note prefix: pasted "SW/ Name" → existing ticket → parsed fields → none. */
export function notePrefixFor(ex: Extraction, fields: ProposedField[], mode: AssistantMode, context?: TicketContext) {
  const pasted = ex.notes.find((n) => n.parsed.poc)?.parsed;
  if (pasted?.poc) return { prefix: formatPrefix(pasted.poc, pasted.name), source: "pasted" as const };
  const v = (k: AssistantFieldKey) => fields.find((f) => f.key === k)?.value;
  if (mode === "update" && context) {
    const poc = context.pointOfContact || context.values.point_of_contact;
    const name = context.contactName || context.values.contact_name || firstName(context.customerName ?? context.values.customer_name);
    if (poc) return { prefix: formatPrefix(poc, name), source: "ticket" as const };
  }
  const poc = v("point_of_contact") || context?.values.point_of_contact;
  const name = v("contact_name") || context?.values.contact_name || firstName(v("customer_name"));
  if (poc && (mode === "new" ? ex.notes.length > 0 || ex.narrative.length > 0 : true)) {
    return { prefix: formatPrefix(poc, name), source: "ticket" as const };
  }
  return { prefix: "", source: "none" as const };
}

/** The rules-based note (always available; used when AI is off or fails). */
export function buildRulesNote(
  ex: Extraction,
  interp: Interpretation,
  mode: AssistantMode,
  context?: TicketContext,
): { note: GeneratedNote | null; skipped?: string; prefix: string; source: string } {
  const { prefix, source } = notePrefixFor(ex, interp.fields, mode, context);
  const parts = [...ex.notes.map((n) => n.parsed.narrative), ...ex.narrative].filter((p) => p.trim());
  let body = parts.map((p) => normalizeNarrative(p)).filter(Boolean).join(" ");

  // New identifiers that came in as data lines (not mentioned in the narrative) are added.
  const digits = body.replace(/\s+/g, "");
  const appendIf = (key: AssistantFieldKey, label: string) => {
    const f = interp.fields.find((x) => x.key === key && x.confidence === "extracted");
    if (!f) return;
    if (mode === "update" && context?.values[key] === f.value) return;
    if (digits.toUpperCase().includes(f.value.toUpperCase())) return;
    body = `${body} ${label} ${f.value}.`.trim();
  };
  appendIf("tracking_number", "Tracking");
  appendIf("fedex_case_number", "FedEx case");
  appendIf("reprint_order_number", "Reprint order");

  if (!body) return { note: null, skipped: "No update text to turn into a note.", prefix, source };
  const text = `${prefix}${body}`.trim();
  return {
    note: { text, prefixSource: source as GeneratedNote["prefixSource"], generator: "rules", droppedIdentifiers: droppedIdentifiers(parts.join(" "), text) },
    prefix,
    source,
  };
}

function stateAfter(proposalFields: ProposedField[], mode: AssistantMode, context?: TicketContext): FieldValues {
  const out: FieldValues = { ...(context?.values ?? {}) };
  for (const f of proposalFields) {
    const cur = out[f.key];
    // New ticket keeps typed values; update applies new facts.
    if (mode === "new" && cur) continue;
    out[f.key] = f.value;
  }
  return out;
}

/** Deterministic analysis only (no AI). */
export function analyzeDeterministic(input: AnalyzeInput): { proposal: Proposal; extraction: Extraction; prefix: string } {
  const text = input.text.slice(0, MAX_ASSISTANT_TEXT);
  const ex = extract(text, input.lookups);
  const interp = interpret(ex, { mode: input.mode, lookups: input.lookups, context: input.context, today: input.today });
  const n = buildRulesNote(ex, interp, input.mode, input.context);

  const warnings = [...interp.warnings];
  if (n.note?.droppedIdentifiers.length) warnings.push(`Check the note — these weren't kept: ${n.note.droppedIdentifiers.join(", ")}.`);

  const proposal: Proposal = {
    mode: input.mode,
    kind: interp.kind,
    fields: interp.fields,
    note: n.note,
    noteSkippedReason: n.skipped,
    actions: interp.actions,
    missing: computeMissing(stateAfter(interp.fields, input.mode, input.context), input.rules ?? DEFAULT_MISSING_RULES),
    unmatchedMaterials: interp.unmatchedMaterials,
    unused: interp.unused,
    warnings,
    original: input.text,
    ai: { enabled: false, used: false, provider: null },
  };
  return { proposal, extraction: ex, prefix: n.prefix };
}

const normText = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/**
 * Merge a validated AI interpretation into a deterministic proposal.
 *  - a field deterministic parsing found is NEVER changed by AI
 *  - for deterministic-type fields (IDs, money, dates, qty, material) the AI may only
 *    fill a gap if the value literally appears in the pasted text
 *  - AI values whose evidence isn't in the text are downgraded to "inferred"
 *  - an AI note that drops a number/ID from the rules note is not used
 */
export function reconcileAi(
  proposal: Proposal,
  ai: AiInterpretation,
  provider: string,
  input: Pick<AnalyzeInput, "mode" | "context" | "rules">,
): Proposal {
  const text = normText(proposal.original);
  const fields = [...proposal.fields];
  const warnings = [...proposal.warnings];
  for (const f of ai.fields) {
    const existing = fields.find((x) => x.key === f.key);
    if (existing) {
      if (existing.value !== f.value) warnings.push(`AI suggested ${f.key.replace(/_/g, " ")} "${f.value}" — kept the parsed value "${existing.value}".`);
      continue;
    }
    const evidenceOk = !!f.evidence && text.includes(normText(f.evidence));
    if (DETERMINISTIC_FIELDS.includes(f.key) && f.key !== "material_id" && f.key !== "department_id") {
      // AI may not invent numbers/IDs/dates: the value must appear as a whole token in the text.
      const literal = f.value.replace(/\.00$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase();
      if (!new RegExp(`(?<![\\w.-])\\$?${literal}(?:\\.00)?(?![\\w]|\\.\\d)`).test(text)) continue;
    }
    fields.push({
      key: f.key,
      value: f.value,
      confidence: evidenceOk && !DETERMINISTIC_FIELDS.includes(f.key) ? "extracted" : "inferred",
      source: "AI suggestion",
      evidence: evidenceOk ? f.evidence : undefined,
      reason: f.reason ?? (evidenceOk ? undefined : "AI suggestion — not stated word-for-word in the text."),
      deterministic: false,
    });
  }

  let note = proposal.note;
  if (ai.note) {
    const mustKeep = proposal.note ? droppedIdentifiers(proposal.note.text, ai.note) : [];
    if (mustKeep.length === 0) {
      note = {
        text: ai.note,
        prefixSource: proposal.note?.prefixSource ?? "none",
        generator: "ai",
        droppedIdentifiers: [],
      };
    } else {
      warnings.push(`AI note left out ${mustKeep.join(", ")} — using the standard note instead.`);
    }
  }

  const actions = [...proposal.actions];
  for (const a of ai.actions) if (!actions.some((x) => x.type === a.type)) actions.push({ type: a.type, reason: a.reason || "AI suggestion." });
  if (ai.rejected.length) warnings.push(`Ignored ${ai.rejected.length} unsupported AI suggestion(s).`);

  return {
    ...proposal,
    fields,
    note,
    actions,
    warnings,
    missing: computeMissing(stateAfter(fields, input.mode, input.context), input.rules ?? DEFAULT_MISSING_RULES),
    ai: { enabled: true, used: true, provider },
  };
}

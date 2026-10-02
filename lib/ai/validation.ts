/**
 * Strict validation of untrusted AI output.
 *  - unknown top-level keys → rejected (strict schema)
 *  - field names not on the assistant allowlist → dropped
 *  - values must pass the same normaliser as deterministic values
 *    (enum values: issue, fault, resolution, status — "closed" is never allowed)
 *  - material / department names must exist in Supabase lookups
 *  - only known action types
 */
import { z } from "zod";
import { isAssistantField, normalizeFieldValue } from "@/lib/assistant/fields";
import { basicNormalize } from "@/lib/assistant/materials";
import type { AssistantLookups } from "@/lib/assistant/types";
import type { AiInterpretation } from "./types";

const FieldSchema = z
  .object({
    field: z.string().max(60),
    value: z.union([z.string().max(500), z.number(), z.boolean()]),
    evidence: z.string().max(500).optional(),
    reason: z.string().max(300).optional(),
  })
  .strict();

export const AiOutputSchema = z
  .object({
    fields: z.array(FieldSchema).max(60).default([]),
    note: z.string().max(2000).nullable().optional(),
    actions: z
      .array(z.object({ type: z.string().max(40), reason: z.string().max(300).default("") }).strict())
      .max(5)
      .default([]),
  })
  .strict();

const ALLOWED_ACTIONS = new Set(["close_ticket"]);

export function validateAiOutput(raw: unknown, lookups: AssistantLookups): { ok: true; value: AiInterpretation } | { ok: false; error: string } {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: "AI response was not valid JSON." };
    }
  }
  const parsed = AiOutputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: `AI response failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}` };

  const rejected: string[] = [];
  const fields: AiInterpretation["fields"] = [];
  const seen = new Set<string>();
  for (const f of parsed.data.fields) {
    if (!isAssistantField(f.field)) {
      rejected.push(`Unsupported field "${f.field}"`);
      continue;
    }
    let raw = String(f.value);
    // The AI names materials/departments; ids are resolved locally and must exist.
    if (f.field === "material_id") {
      const m = lookups.materials.find((x) => x.id === raw || basicNormalize(x.name) === basicNormalize(raw));
      if (!m || m.is_active === false) {
        rejected.push(`Unknown material "${raw}"`);
        continue;
      }
      raw = m.id;
    }
    if (f.field === "department_id") {
      const d = lookups.departments.find((x) => x.id === raw || basicNormalize(x.code) === basicNormalize(raw) || basicNormalize(x.name) === basicNormalize(raw));
      if (!d) {
        rejected.push(`Unknown department "${raw}"`);
        continue;
      }
      raw = d.id;
    }
    const value = normalizeFieldValue(f.field, raw);
    if (value === null) {
      rejected.push(`Invalid value for ${f.field}: "${String(f.value).slice(0, 60)}"`);
      continue;
    }
    if (seen.has(f.field)) continue;
    seen.add(f.field);
    fields.push({ key: f.field, value, evidence: f.evidence, reason: f.reason });
  }

  const actions: AiInterpretation["actions"] = [];
  for (const a of parsed.data.actions) {
    if (ALLOWED_ACTIONS.has(a.type)) actions.push({ type: "close_ticket", reason: a.reason });
    else rejected.push(`Unsupported action "${a.type}"`);
  }

  const note = parsed.data.note?.trim() || null;
  return { ok: true, value: { fields, note, actions, rejected } };
}

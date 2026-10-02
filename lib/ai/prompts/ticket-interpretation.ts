/**
 * Prompt for AI ticket interpretation. Used only when an approved provider is
 * configured AND enabled (see lib/ai/provider.ts). Kept provider-neutral.
 */
import { ASSISTANT_FIELDS } from "@/lib/assistant/fields";
import type { AiInterpretationRequest } from "../types";

export const TICKET_INTERPRETATION_SYSTEM = `You help a customer-support agent turn pasted text into ticket field PROPOSALS.
Rules:
- Return ONLY JSON: {"fields":[{"field","value","evidence","reason"}],"note":string|null,"actions":[{"type","reason"}]}.
- Use only the field names listed. Never invent values. "evidence" must be copied exactly from the text.
- Never change a value listed under "deterministic".
- Tracking number, FedEx case number and shipping cost are different things — never derive one from another.
- Never set status to closed. The only action allowed is "close_ticket", and only if the text says so.
- material_id / department_id: use an exact name from the lists given.
- note: one short, clean internal note starting with the given prefix. Keep every number, ID, date and amount. Do not add facts.`;

export function buildTicketInterpretationPrompt(req: AiInterpretationRequest): string {
  const fields = Object.entries(ASSISTANT_FIELDS)
    .map(([k, m]) => `${k} (${m.kind}${"options" in m && m.options ? `: ${m.options.join("|")}` : ""})`)
    .join("\n");
  return [
    `Mode: ${req.mode === "new" ? "new ticket" : "update to an existing ticket (propose only new or changed information)"}`,
    `Allowed fields:\n${fields}`,
    `Departments: ${req.departments.join(", ")}`,
    `Materials: ${req.materials.join(" | ")}`,
    `Existing ticket: ${JSON.stringify(req.context)}`,
    `Deterministic (do not change): ${JSON.stringify(req.deterministic)}`,
    `Note prefix: ${JSON.stringify(req.notePrefix)}`,
    `Pasted text:\n"""\n${req.text}\n"""`,
  ].join("\n\n");
}

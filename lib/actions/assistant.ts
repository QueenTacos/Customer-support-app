"use server";

/**
 * Ticket Assistant server actions.
 *  - analyzeTicketText: read-only. Returns a Proposal; writes nothing.
 *  - applyTicketUpdate: the ONLY write — runs after Jessica confirms Apply Update.
 *    Field changes + note are applied atomically (apply_ticket_update RPC);
 *    history is recorded by the existing triggers. Closing is never allowed here.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { getTicket, isUuid } from "@/lib/data/tickets";
import { getLookups } from "@/lib/data/lookups";
import { getMissingRules } from "@/lib/data/assistant";
import { analyzeDeterministic, reconcileAi, MAX_ASSISTANT_TEXT } from "@/lib/assistant/engine";
import { ASSISTANT_FIELD_KEYS, isAssistantField, normalizeFieldValue, type AssistantFieldKey } from "@/lib/assistant/fields";
import type { AssistantLookups, AssistantMode, FieldValues, MissingRule, Proposal, TicketContext } from "@/lib/assistant/types";
import { getAiConfig, interpretTicketText } from "@/lib/ai/provider";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import { ticketToForm, validateTicket, type FieldErrors, type TicketFormValues } from "@/lib/validation/ticket";
import { logServerError, raisedCode } from "@/lib/utils/errors";
import { todayISO } from "@/lib/utils/dates";
import type { TicketWithLookups } from "@/types/domain";

export type AnalyzeResult =
  | { ok: true; proposal: Proposal; rules: MissingRule[]; current: FieldValues; updatedAt: string | null }
  | { ok: false; error: string };

function pickAssistantValues(src: Record<string, unknown>): FieldValues {
  const out: FieldValues = {};
  for (const k of ASSISTANT_FIELD_KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
  }
  return out;
}

function contextFromTicket(t: TicketWithLookups): TicketContext {
  const form = ticketToForm(t);
  return {
    values: pickAssistantValues(form as unknown as Record<string, unknown>),
    customerName: t.customer_name ?? undefined,
    contactName: t.contact_name ?? undefined,
    pointOfContact: t.point_of_contact ?? undefined,
    materialName: t.material?.name ?? undefined,
    ticketNumber: t.ticket_number,
  };
}

async function assistantLookups(): Promise<AssistantLookups> {
  const l = await getLookups();
  // Only ACTIVE materials are matched; nothing is ever created from pasted text.
  const active = l.materials.filter((m) => m.is_active);
  const ids = new Set(active.map((m) => m.id));
  return {
    departments: l.departments,
    materials: active,
    aliases: l.aliases.filter((a) => ids.has(a.material_id)),
  };
}

export async function analyzeTicketText(input: {
  mode: AssistantMode;
  text: string;
  ticketId?: string;
  /** New Ticket: values Jessica already typed (defaults removed). */
  formValues?: Record<string, string>;
}): Promise<AnalyzeResult> {
  await requireSession();
  const mode: AssistantMode = input.mode === "update" ? "update" : "new";
  const text = String(input.text ?? "");
  if (!text.trim()) return { ok: false, error: "Paste some text first." };
  if (text.length > MAX_ASSISTANT_TEXT) return { ok: false, error: "That's too much text — paste 20,000 characters or fewer." };

  try {
    const [lookups, rules] = await Promise.all([assistantLookups(), getMissingRules()]);
    let context: TicketContext | undefined;
    let updatedAt: string | null = null;
    if (mode === "update") {
      if (!input.ticketId || !isUuid(input.ticketId)) return { ok: false, error: "Ticket not found." };
      const t = await getTicket(input.ticketId);
      if (!t) return { ok: false, error: "Ticket not found." };
      if (t.status === "closed") return { ok: false, error: "This ticket is closed." };
      context = contextFromTicket(t);
      updatedAt = t.updated_at;
    } else if (input.formValues) {
      context = { values: pickAssistantValues(input.formValues) };
    }

    const today = todayISO();
    const { proposal, prefix } = analyzeDeterministic({ text, mode, lookups, context, today, rules });
    let result = proposal;

    // Optional AI — only when Jessica has enabled an approved provider (off by default).
    const cfg = getAiConfig();
    if (cfg.enabled) {
      const deterministic: FieldValues = {};
      for (const f of proposal.fields) deterministic[f.key] = f.value;
      const ai = await interpretTicketText(
        {
          mode,
          text,
          context: context?.values ?? {},
          deterministic,
          materials: lookups.materials.map((m) => m.name),
          departments: lookups.departments.map((d) => d.code),
          notePrefix: prefix,
        },
        lookups,
      );
      if (ai.ok) result = reconcileAi(proposal, ai.interpretation, ai.provider, { mode, context, rules });
      else result = { ...proposal, ai: { enabled: true, used: false, provider: ai.provider, error: ai.error } };
    }

    return { ok: true, proposal: result, rules, current: context?.values ?? {}, updatedAt };
  } catch (err) {
    logServerError("assistant-analyze", err);
    return { ok: false, error: "The text couldn't be analyzed. Please try again." };
  }
}

export type ApplyUpdateResult =
  | { ok: true; updated_at: string; changed: number; noteAdded: boolean }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export async function applyTicketUpdate(input: {
  ticketId: string;
  changes: Record<string, string>;
  note: string | null;
  expectedUpdatedAt: string;
}): Promise<ApplyUpdateResult> {
  await requireSession();
  if (!isUuid(input.ticketId)) return { ok: false, error: "Ticket not found." };

  // Allowlist + normalise every proposed change again on the server.
  const changes: FieldValues = {};
  for (const [k, raw] of Object.entries(input.changes ?? {})) {
    if (!isAssistantField(k)) return { ok: false, error: `"${k}" can't be changed from Quick Update.` };
    const v = normalizeFieldValue(k, raw);
    if (v === null) return { ok: false, error: `Invalid value for ${k.replace(/_/g, " ")}.` };
    changes[k] = v;
  }
  if (changes.status === ("closed" as string)) return { ok: false, error: "Tickets are closed with the Close Ticket workflow." };
  const note = (input.note ?? "").trim();
  if (note.length > 20000) return { ok: false, error: "The note is too long." };
  if (!Object.keys(changes).length && !note) return { ok: false, error: "Nothing to apply." };

  try {
    const current = await getTicket(input.ticketId);
    if (!current) return { ok: false, error: "Ticket not found." };
    if (current.status === "closed") return { ok: false, error: "This ticket is closed." };

    // A material always carries its own department.
    if (changes.material_id) {
      const { materials } = await getLookups();
      const m = materials.find((x) => x.id === changes.material_id);
      if (!m) return { ok: false, error: "That material doesn't exist." };
      changes.department_id = m.department_id;
    }

    const merged: TicketFormValues = { ...ticketToForm(current), ...(changes as Partial<TicketFormValues>) };
    const v = validateTicket(merged);
    if (!v.success) {
      const relevant = Object.fromEntries(Object.entries(v.errors).filter(([k]) => k in changes));
      return {
        ok: false,
        error: Object.keys(relevant).length ? "Some values aren't valid — fix them and try again." : "This ticket has invalid data — edit it first.",
        fieldErrors: relevant,
      };
    }

    // Only the changed columns, in their typed form.
    const data = v.data as unknown as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(changes) as AssistantFieldKey[]) payload[k] = data[k];
    if ("issue" in changes || "carrier_responsible" in changes) {
      payload.fault_suggested = suggestFault({ issue: v.data.issue, carrier_responsible: v.data.carrier_responsible })?.fault ?? null;
    }

    const { data: row, error } = await db().rpc("apply_ticket_update", {
      p_id: input.ticketId,
      p_changes: payload,
      p_note: note || null,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
    if (error) {
      const code = raisedCode(error);
      if (code === "TICKET_CONFLICT") {
        return { ok: false, error: "This ticket changed since you analyzed the update. Analyze it again to see the latest values." };
      }
      if (code === "TICKET_CLOSE_NOT_ALLOWED") return { ok: false, error: "Tickets are closed with the Close Ticket workflow." };
      throw error;
    }
    revalidatePath("/", "layout");
    return { ok: true, updated_at: row.updated_at, changed: Object.keys(changes).length, noteAdded: !!note };
  } catch (err) {
    logServerError("assistant-apply", err);
    return { ok: false, error: "The update couldn't be applied. Nothing was changed." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { findTicketIdByNumber, getTicket, isUuid } from "@/lib/data/tickets";
import { validateTicket, type FieldErrors, type TicketFormValues, type TicketInput } from "@/lib/validation/ticket";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import { irrelevantConditionalFields } from "@/lib/domain/conditional-questions";
import { EDITABLE_STATUSES, type Status } from "@/lib/domain/options";
import { isUniqueViolation, logServerError, raisedCode } from "@/lib/utils/errors";
import { getSettings } from "@/lib/data/settings";

export type SaveTicketResult =
  | { ok: true; id: string; updated_at: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

const DUPLICATE = "This ticket number already exists.";

function toPayload(data: TicketInput) {
  // fault_suggested is recomputed on the server from the saved facts (audit trail).
  const suggestion = suggestFault({ issue: data.issue, carrier_responsible: data.carrier_responsible });
  return { ...data, fault_suggested: suggestion?.fault ?? null };
}

export async function createTicket(values: TicketFormValues, initialNote: string): Promise<SaveTicketResult> {
  await requireSession();

  const v = validateTicket(values);
  if (!v.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: v.errors };
  const note = (initialNote ?? "").trim();
  if (note.length > 20000) return { ok: false, error: "The note is too long.", fieldErrors: { note: "20,000 characters max." } };

  const payload: Record<string, unknown> = toPayload(v.data);
  // Answers to questions that don't apply to the chosen problem are not saved.
  for (const f of irrelevantConditionalFields(v.data.issue)) payload[f] = null;
  const { agent_name } = await getSettings();
  payload.assigned_to = agent_name;

  try {
    if (await findTicketIdByNumber(v.data.ticket_number)) {
      return { ok: false, error: DUPLICATE, fieldErrors: { ticket_number: DUPLICATE } };
    }
    const { data, error } = await db().rpc("create_ticket", { p_ticket: payload, p_note: note || null });
    if (error) {
      if (isUniqueViolation(error, "tickets_ticket_number_key")) {
        return { ok: false, error: DUPLICATE, fieldErrors: { ticket_number: DUPLICATE } };
      }
      throw error;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: data.id, updated_at: data.updated_at };
  } catch (err) {
    logServerError("create-ticket", err);
    return { ok: false, error: "Ticket could not be saved. Please try again." };
  }
}

export async function updateTicket(
  id: string,
  values: TicketFormValues,
  expectedUpdatedAt: string,
): Promise<SaveTicketResult> {
  await requireSession();
  if (!isUuid(id)) return { ok: false, error: "Ticket not found." };

  const v = validateTicket(values);
  if (!v.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: v.errors };

  try {
    const current = await getTicket(id);
    if (!current) return { ok: false, error: "Ticket not found." };
    if (v.data.status === "closed" && current.status !== "closed") {
      return {
        ok: false,
        error: "Tickets are closed with the Close Ticket workflow (coming in Phase 3).",
        fieldErrors: { status: "Pick an active status." },
      };
    }
    if (await findTicketIdByNumber(v.data.ticket_number, id)) {
      return { ok: false, error: DUPLICATE, fieldErrors: { ticket_number: DUPLICATE } };
    }

    const { data, error } = await db().rpc("update_ticket", {
      p_id: id,
      p_changes: toPayload(v.data),
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) {
      if (isUniqueViolation(error, "tickets_ticket_number_key")) {
        return { ok: false, error: DUPLICATE, fieldErrors: { ticket_number: DUPLICATE } };
      }
      if (raisedCode(error) === "TICKET_CONFLICT") {
        return {
          ok: false,
          error: "This ticket was changed somewhere else since you opened it. Copy anything you need, then reload to get the latest version.",
        };
      }
      throw error;
    }
    revalidatePath("/", "layout");
    return { ok: true, id, updated_at: data.updated_at };
  } catch (err) {
    logServerError("update-ticket", err);
    return { ok: false, error: "Ticket could not be saved. Please try again." };
  }
}

/** Fast status / follow-up change from the ticket page (daily follow-up work). */
export async function quickUpdateTicket(
  id: string,
  changes: { status?: string; follow_up_date?: string | null },
): Promise<SaveTicketResult> {
  await requireSession();
  if (!isUuid(id)) return { ok: false, error: "Ticket not found." };

  const patch: { status?: Status; follow_up_date?: string | null } = {};
  if (changes.status !== undefined) {
    if (!(EDITABLE_STATUSES as readonly string[]).includes(changes.status)) {
      return { ok: false, error: "Pick an active status. Closing uses the Close Ticket workflow." };
    }
    patch.status = changes.status as Status;
  }
  if (changes.follow_up_date !== undefined) {
    const d = changes.follow_up_date;
    if (d !== null && d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "Enter a valid date." };
    patch.follow_up_date = d || null;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  try {
    const { data, error } = await db().rpc("update_ticket", { p_id: id, p_changes: patch, p_expected_updated_at: null });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, id, updated_at: data.updated_at };
  } catch (err) {
    logServerError("quick-update", err);
    return { ok: false, error: "Ticket could not be saved. Please try again." };
  }
}

/** Live duplicate check while typing the ticket number. */
export async function checkTicketNumber(ticketNumber: string, excludeId?: string): Promise<{ exists: boolean; id?: string }> {
  await requireSession();
  try {
    const id = await findTicketIdByNumber(String(ticketNumber ?? "").slice(0, 64), excludeId);
    return id ? { exists: true, id } : { exists: false };
  } catch (err) {
    logServerError("check-ticket-number", err);
    return { exists: false };
  }
}

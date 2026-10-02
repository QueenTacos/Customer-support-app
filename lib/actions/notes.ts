"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { getNoteVersions } from "@/lib/data/notes";
import { isUuid } from "@/lib/data/tickets";
import { noteEditSchema, noteSchema } from "@/lib/validation/ticket";
import { logServerError, raisedCode } from "@/lib/utils/errors";
import type { TicketNote, TicketNoteVersion } from "@/types/domain";

export type NoteResult = { ok: true; note: TicketNote } | { ok: false; error: string };

export async function addNote(ticketId: string, text: string): Promise<NoteResult> {
  await requireSession();
  if (!isUuid(ticketId)) return { ok: false, error: "Ticket not found." };
  const parsed = noteSchema.safeParse({ text });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const { data, error } = await db()
      .from("ticket_notes")
      .insert({ ticket_id: ticketId, note_text: parsed.data.text, source: "manual" })
      .select("*")
      .single();
    if (error) throw error;
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true, note: data as TicketNote };
  } catch (err) {
    logServerError("add-note", err);
    return { ok: false, error: "Note could not be saved. Please try again." };
  }
}

export async function editNote(
  noteId: string,
  text: string,
  reason: string,
  expectedUpdatedAt: string,
): Promise<NoteResult> {
  await requireSession();
  if (!isUuid(noteId)) return { ok: false, error: "Note not found." };
  const parsed = noteEditSchema.safeParse({ text, reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const { data, error } = await db().rpc("edit_ticket_note", {
      p_note_id: noteId,
      p_new_text: parsed.data.text,
      p_reason: parsed.data.reason,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) {
      const code = raisedCode(error);
      if (code === "NOTE_CONFLICT")
        return { ok: false, error: "This note was changed somewhere else. Copy your text, then reload the page." };
      if (code === "NOTE_NOT_FOUND" || code === "NOTE_ARCHIVED") return { ok: false, error: "Note not found." };
      throw error;
    }
    const note = data as TicketNote;
    revalidatePath(`/tickets/${note.ticket_id}`);
    return { ok: true, note };
  } catch (err) {
    logServerError("edit-note", err);
    return { ok: false, error: "Note could not be saved. Please try again." };
  }
}

export async function loadNoteHistory(
  noteId: string,
): Promise<{ ok: true; versions: TicketNoteVersion[] } | { ok: false; error: string }> {
  await requireSession();
  if (!isUuid(noteId)) return { ok: false, error: "Note not found." };
  try {
    return { ok: true, versions: await getNoteVersions(noteId) };
  } catch (err) {
    logServerError("note-history", err);
    return { ok: false, error: "Edit history could not be loaded." };
  }
}

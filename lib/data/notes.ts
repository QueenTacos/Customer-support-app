import "server-only";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { TicketNote, TicketNoteVersion } from "@/types/domain";

export async function getNotes(ticketId: string): Promise<TicketNote[]> {
  await requireSession();
  const { data, error } = await db()
    .from("ticket_notes")
    .select("*")
    .eq("ticket_id", ticketId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as TicketNote[];
}

export async function getNoteVersions(noteId: string): Promise<TicketNoteVersion[]> {
  await requireSession();
  const { data, error } = await db()
    .from("ticket_note_versions")
    .select("*")
    .eq("note_id", noteId)
    .order("version_number", { ascending: true });
  if (error) throw error;
  return data as TicketNoteVersion[];
}

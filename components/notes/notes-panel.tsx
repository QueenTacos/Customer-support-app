"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, MessageSquarePlus, Pencil, Save } from "lucide-react";
import { addNote, editNote, loadNoteHistory } from "@/lib/actions/notes";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { CopyButton, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";
import { formatDateTime } from "@/lib/utils/dates";
import type { TicketNote, TicketNoteVersion } from "@/types/domain";

/** Add-note box. Ctrl+Enter saves. */
export function AddNoteForm({
  ticketId,
  placeholder,
  compact,
  onAdded,
  autoFocus,
}: {
  ticketId: string;
  placeholder?: string;
  compact?: boolean;
  onAdded?: (note: TicketNote) => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  useUnsavedChanges(text.trim() !== "");

  function submit() {
    if (!text.trim()) return;
    start(async () => {
      const r = await addNote(ticketId, text);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setText("");
      toast.success("Note added.");
      onAdded?.(r.note);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <Textarea
        id={compact ? "quick-note" : "new-note"}
        aria-label="New note"
        rows={compact ? 3 : 4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-faint">Ctrl+Enter to save · timestamped automatically</span>
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!text.trim()}>
          <MessageSquarePlus className="size-4" /> Add Note
        </Button>
      </div>
    </form>
  );
}

export function NotesPanel({
  ticketId,
  notes: initialNotes,
  placeholder,
  focusNew,
}: {
  ticketId: string;
  notes: TicketNote[];
  placeholder: string;
  focusNew?: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  // Keep in sync after router.refresh().
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror fresh server data
  useEffect(() => setNotes(initialNotes), [initialNotes]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-bg/40 p-4">
        <AddNoteForm
          ticketId={ticketId}
          placeholder={placeholder}
          autoFocus={focusNew}
          onAdded={(n) => setNotes((prev) => [n, ...prev])}
        />
      </div>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Notes you add here are kept with their full edit history." />
      ) : (
        <ol className="space-y-3">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} onSaved={(u) => setNotes((prev) => prev.map((p) => (p.id === u.id ? u : p)))} />
          ))}
        </ol>
      )}
    </div>
  );
}

function NoteItem({ note, onSaved }: { note: TicketNote; onSaved: (n: TicketNote) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note_text);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = editing && (text !== note.note_text || reason.trim() !== "");
  useUnsavedChanges(dirty);

  function save() {
    if (text.trim() === note.note_text.trim()) {
      setEditing(false);
      return;
    }
    start(async () => {
      const r = await editNote(note.id, text, reason, note.updated_at);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Note updated. The previous version was kept in the edit history.");
      onSaved(r.note);
      setEditing(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-medium text-ink">{formatDateTime(note.created_at)}</span>
          <span>·</span>
          <span>Jessica</span>
          {note.source === "wizard" && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">from New Ticket</span>}
          {note.edited_at && (
            <>
              <span>·</span>
              <span className="text-amber-300/90">Edited {formatDateTime(note.edited_at)}</span>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <CopyButton text={note.note_text} />
            {note.edit_count > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
                <History className="size-3.5" /> View Edit History
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Textarea
            aria-label="Edit note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape" && !dirty) setEditing(false);
            }}
          />
          <Field label="Reason for edit (optional)" htmlFor={`reason-${note.id}`}>
            <Input
              id={`reason-${note.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong reprint order number"
              maxLength={500}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (dirty && !window.confirm("Discard your changes to this note?")) return;
                setText(note.note_text);
                setReason("");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={pending} disabled={!text.trim()}>
              <Save className="size-3.5" /> Save Note
            </Button>
          </div>
          <p className="text-xs text-faint">The current text is saved to the edit history before your change is applied.</p>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{note.note_text}</p>
      )}

      {historyOpen && <NoteHistoryModal note={note} onClose={() => setHistoryOpen(false)} />}
    </li>
  );
}

function NoteHistoryModal({ note, onClose }: { note: TicketNote; onClose: () => void }) {
  const [versions, setVersions] = useState<TicketNoteVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadNoteHistory(note.id).then((r) => {
      if (!alive) return;
      if (r.ok) setVersions(r.versions);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [note.id]);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Note edit history" description="Oldest first. Previous versions are never deleted." size="lg">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!versions && !error && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {versions && (
        <ol className="space-y-3">
          {versions.map((v) => (
            <li key={v.id} className="rounded-xl border border-line bg-bg/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  <span className="font-semibold text-ink">{v.version_number === 1 ? "Original" : `Version ${v.version_number}`}</span>
                  {" · "}saved {formatDateTime(v.version_created_at)} · replaced {formatDateTime(v.replaced_at)}
                </span>
                <CopyButton text={v.note_text} />
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink/90">{v.note_text}</p>
              {v.edit_reason && <p className="mt-2 text-xs text-amber-300/90">Reason for the edit that replaced this version: {v.edit_reason}</p>}
            </li>
          ))}
          <li className="rounded-xl border border-primary/40 bg-primary-soft p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                <span className="font-semibold text-ink">Current (version {note.edit_count + 1})</span>
                {note.edited_at && <> · saved {formatDateTime(note.edited_at)}</>}
              </span>
              <CopyButton text={note.note_text} />
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{note.note_text}</p>
          </li>
        </ol>
      )}
    </Modal>
  );
}

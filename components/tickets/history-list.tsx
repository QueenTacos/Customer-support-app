import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  History,
  MessageSquare,
  MessageSquareDiff,
  Pencil,
  RefreshCcw,
  Shuffle,
  Upload,
  Zap,
  ZapOff,
} from "lucide-react";
import { FIELD_LABELS, formatFieldValue } from "@/lib/domain/field-labels";
import { formatDateTime } from "@/lib/utils/dates";
import { EmptyState } from "@/components/ui/misc";
import type { TicketEvent } from "@/types/domain";

const ICONS: Record<string, typeof History> = {
  created: FilePlus2,
  edited: Pencil,
  resolution_changed: Pencil,
  status_changed: Shuffle,
  rush_started: Zap,
  rush_ended: ZapOff,
  note_added: MessageSquare,
  note_edited: MessageSquareDiff,
  photo_uploaded: Upload,
  file_uploaded: Upload,
  closed: CheckCircle2,
  reopened: RefreshCcw,
};

type Change = { from: unknown; to: unknown };

function isChangeMap(c: Record<string, unknown>): c is Record<string, Change> {
  return Object.values(c).every((v) => v !== null && typeof v === "object" && "from" in (v as object) && "to" in (v as object));
}

export function HistoryList({
  events,
  names,
}: {
  events: TicketEvent[];
  names: { departments: Record<string, string>; materials: Record<string, string> };
}) {
  if (events.length === 0) return <EmptyState title="No history yet" />;

  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {events.map((e) => {
        const Icon = ICONS[e.event_type] ?? History;
        const changes = e.changes ?? {};
        const fieldChanges =
          (e.event_type === "edited" || e.event_type === "resolution_changed" || e.event_type === "status_changed" ||
            e.event_type === "closed" || e.event_type === "reopened") &&
          isChangeMap(changes)
            ? Object.entries(changes)
            : [];
        const rush = e.event_type === "rush_ended" ? (changes as { minutes?: number }) : null;
        const noteEdit = e.event_type === "note_edited" ? (changes as { version?: number; reason?: string | null }) : null;

        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[34px] grid size-7 place-items-center rounded-full border border-line bg-surface">
              <Icon className="size-3.5 text-primary-bright" aria-hidden />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm font-medium text-ink">{e.summary}</span>
              <span className="text-xs text-faint">
                {formatDateTime(e.created_at)} · {e.actor}
              </span>
            </div>

            {fieldChanges.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2/60 text-left text-xs text-faint">
                      <th className="px-3 py-1.5 font-medium">Field</th>
                      <th className="px-3 py-1.5 font-medium">From</th>
                      <th className="w-6" />
                      <th className="px-3 py-1.5 font-medium">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldChanges.map(([field, c]) => (
                      <tr key={field} className="border-t border-line/70 align-top">
                        <td className="px-3 py-1.5 text-muted">{FIELD_LABELS[field] ?? field}</td>
                        <td className="max-w-72 whitespace-pre-wrap break-words px-3 py-1.5 text-red-300/90 line-through decoration-red-400/40">
                          {formatFieldValue(field, c.from, names)}
                        </td>
                        <td className="py-1.5 text-faint">
                          <ArrowRight className="size-3.5" aria-hidden />
                        </td>
                        <td className="max-w-72 whitespace-pre-wrap break-words px-3 py-1.5 text-emerald-300">
                          {formatFieldValue(field, c.to, names)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rush?.minutes !== undefined && (
              <p className="mt-1 text-xs text-muted">Time in Rush Reprint: {rush.minutes} minutes</p>
            )}
            {noteEdit && (
              <p className="mt-1 text-xs text-muted">
                Now version {noteEdit.version}
                {noteEdit.reason ? ` · Reason: ${noteEdit.reason}` : ""}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

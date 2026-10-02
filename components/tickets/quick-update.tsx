"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { quickUpdateTicket } from "@/lib/actions/tickets";
import { EDITABLE_STATUSES, STATUS_META, type Status } from "@/lib/domain/options";
import { addDaysISO } from "@/lib/utils/dates";

/** Status + next follow-up date without opening the full edit form. */
export function QuickUpdate({
  ticketId,
  status,
  followUpDate,
  today,
}: {
  ticketId: string;
  status: Status;
  followUpDate: string | null;
  today: string;
}) {
  const router = useRouter();
  const [s, setS] = useState<string>(status);
  const [f, setF] = useState(followUpDate ?? "");
  const [pending, start] = useTransition();
  const closed = status === "closed";
  const changed = s !== status || f !== (followUpDate ?? "");

  function save() {
    start(async () => {
      const r = await quickUpdateTicket(ticketId, {
        ...(s !== status ? { status: s } : {}),
        ...(f !== (followUpDate ?? "") ? { follow_up_date: f || null } : {}),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Ticket updated.");
      router.refresh();
    });
  }

  if (closed) {
    return <p className="text-sm text-muted">This ticket is closed. Reopening arrives with the Close/Reopen workflow in Phase 3.</p>;
  }

  return (
    <div className="space-y-4">
      <Field label="Status" htmlFor="qu-status">
        <Select id="qu-status" value={s} onChange={(e) => setS(e.target.value)}>
          {EDITABLE_STATUSES.map((x) => (
            <option key={x} value={x}>
              {STATUS_META[x].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Next follow-up" htmlFor="qu-follow">
        <Input id="qu-follow" type="date" value={f} onChange={(e) => setF(e.target.value)} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[
            { label: "Today", d: today },
            { label: "Tomorrow", d: addDaysISO(today, 1) },
            { label: "+2 days", d: addDaysISO(today, 2) },
            { label: "+1 week", d: addDaysISO(today, 7) },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setF(o.d)}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              {o.label}
            </button>
          ))}
          {f && (
            <button type="button" onClick={() => setF("")} className="rounded-md px-2 py-0.5 text-xs text-faint hover:text-ink">
              Clear
            </button>
          )}
        </div>
      </Field>
      <Button variant="primary" size="sm" className="w-full" onClick={save} loading={pending} disabled={!changed}>
        Save
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CustomerOrderSection,
  IssueSection,
  ResolutionSection,
  WorkflowSection,
  type Lookups,
} from "@/components/tickets/ticket-fields";
import { updateTicket } from "@/lib/actions/tickets";
import { statusOptionsFor, validateTicket, type FieldErrors, type TicketFormValues } from "@/lib/validation/ticket";
import { FIELD_LABELS } from "@/lib/domain/field-labels";
import { useUnsavedChanges, confirmDiscard } from "@/lib/hooks/use-unsaved-changes";

export function EditTicketForm({
  ticketId,
  initial,
  updatedAt,
  lookups,
}: {
  ticketId: string;
  initial: TicketFormValues;
  updatedAt: string;
  lookups: Lookups;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, start] = useTransition();
  const [done, setDone] = useState(false);

  const changedFields = (Object.keys(values) as (keyof TicketFormValues)[]).filter(
    (k) => JSON.stringify(values[k]) !== JSON.stringify(initial[k]),
  );
  const dirty = !done && changedFields.length > 0;
  useUnsavedChanges(dirty);

  function set<K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function save() {
    const v = validateTicket(values);
    if (!v.success) {
      setErrors(v.errors);
      const first = Object.keys(v.errors)[0];
      if (first) document.getElementById(`f-${first}`)?.focus();
      toast.error("Please fix the highlighted fields.");
      return;
    }
    start(async () => {
      const r = await updateTicket(ticketId, values, updatedAt);
      if (!r.ok) {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.error, { duration: 10000 });
        return;
      }
      setDone(true);
      toast.success("Ticket saved.");
      router.push(`/tickets/${ticketId}`);
      router.refresh();
    });
  }

  function cancel() {
    if (dirty && !confirmDiscard()) return;
    setDone(true);
    router.push(`/tickets/${ticketId}`);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      }}
      className="space-y-6 pb-24"
    >
      <Card>
        <CardHeader title="Customer & Order" />
        <div className="p-5">
          <CustomerOrderSection values={values} set={set} errors={errors} lookups={lookups} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Issue Details" />
        <div className="p-5">
          <IssueSection values={values} set={set} errors={errors} showOtherAnswers />
        </div>
      </Card>
      <Card>
        <CardHeader title="Resolution" />
        <div className="p-5">
          <ResolutionSection values={values} set={set} errors={errors} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Status & Follow-Up" />
        <div className="p-5">
          <WorkflowSection values={values} set={set} errors={errors} statusOptions={statusOptionsFor(initial.status)} />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <span className="truncate text-sm text-muted">
            {changedFields.length === 0
              ? "No changes yet"
              : `${changedFields.length} change${changedFields.length === 1 ? "" : "s"}: ${changedFields
                  .map((f) => FIELD_LABELS[f] ?? f)
                  .slice(0, 4)
                  .join(", ")}${changedFields.length > 4 ? "…" : ""}`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={changedFields.length === 0}>
              <Save className="size-4" /> Save Changes
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

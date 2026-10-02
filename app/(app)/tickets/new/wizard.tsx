"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, History, Pencil, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import {
  CustomerOrderSection,
  IssueSection,
  ResolutionSection,
  WorkflowSection,
  type Lookups,
} from "@/components/tickets/ticket-fields";
import { DetailList, yesNoText, type DetailItem } from "@/components/tickets/detail-list";
import { StatusBadge } from "@/components/tickets/status-badge";
import { checkTicketNumber, createTicket } from "@/lib/actions/tickets";
import { QuickImportPanel } from "@/components/tickets/quick-import/quick-import-panel";
import type { ApplyPayload } from "@/components/tickets/quick-import/import-review";
import {
  WIZARD_STEP_FIELDS,
  emptyTicketForm,
  pickErrors,
  validateTicket,
  type FieldErrors,
  type TicketFormValues,
} from "@/lib/validation/ticket";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import { questionsFor } from "@/lib/domain/conditional-questions";
import {
  EDITABLE_STATUSES,
  FAULT_LABELS,
  ISSUE_LABELS,
  POC_LABELS,
  RESOLUTION_LABELS,
  label,
  type Fault,
  type Issue,
  type PointOfContact,
  type ResolutionType,
  type Status,
} from "@/lib/domain/options";
import { useUnsavedChanges, confirmDiscard } from "@/lib/hooks/use-unsaved-changes";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Customer & Order", "Issue Details", "Additional Information", "Review"] as const;
const DRAFT_KEY = "cs:new-ticket-draft:v1";

interface Draft {
  values: TicketFormValues;
  note: string;
  step: number;
  savedAt: string;
  faultManual: boolean;
}

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable — the unsaved-changes warning still protects the entry */
  }
}

export function NewTicketWizard({
  lookups,
  today,
  defaultFollowUp,
}: {
  lookups: Lookups;
  today: string;
  defaultFollowUp: string;
}) {
  const router = useRouter();
  const initial = useMemo(() => ({ ...emptyTicketForm(today), follow_up_date: defaultFollowUp }), [today, defaultFollowUp]);
  const [values, setValues] = useState<TicketFormValues>(initial);
  const [note, setNote] = useState("");
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [faultManual, setFaultManual] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [saving, startSaving] = useTransition();
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const dirty = !saved && (JSON.stringify(values) !== JSON.stringify(initial) || note.trim() !== "");
  useUnsavedChanges(dirty);

  // Offer to restore a draft left from an interrupted entry.
  useEffect(() => {
    const d = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (d && (d.values.ticket_number || d.values.customer_name || d.note)) setPendingDraft(d);
  }, []);

  // Autosave a local draft while typing.
  useEffect(() => {
    if (!dirty || pendingDraft) return;
    const t = setTimeout(() => writeDraft({ values, note, step, faultManual, savedAt: new Date().toISOString() }), 400);
    return () => clearTimeout(t);
  }, [values, note, step, faultManual, dirty, pendingDraft]);

  function set<K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-apply the suggested fault until Jessica picks one herself.
      if (!faultManual && (key === "issue" || key === "carrier_responsible")) {
        const s = suggestFault({
          issue: next.issue as Issue,
          carrier_responsible: next.carrier_responsible === "" ? null : next.carrier_responsible === "yes",
        });
        next.fault = s?.fault ?? "";
      }
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === "ticket_number") setDuplicateOf(null);
  }

  /** Merge values confirmed in the Quick Import review into the form (nothing is saved). */
  function applyImport({ patch, note: importedNote }: ApplyPayload) {
    const keys = Object.keys(patch) as (keyof TicketFormValues)[];
    setValues((prev) => {
      const next = { ...prev, ...(patch as Partial<TicketFormValues>) };
      // A material always carries its own department.
      if (patch.material_id) {
        const m = lookups.materials.find((x) => x.id === patch.material_id);
        if (m) next.department_id = m.department_id;
      }
      // Same fault behaviour as typing: auto-suggest unless a fault was chosen.
      if (!("fault" in patch) && !faultManual && ("issue" in patch || "carrier_responsible" in patch)) {
        const s = suggestFault({
          issue: next.issue as Issue,
          carrier_responsible: next.carrier_responsible === "" ? null : next.carrier_responsible === "yes",
        });
        next.fault = s?.fault ?? "";
      }
      return next;
    });
    if ("fault" in patch) setFaultManual(true);
    if (importedNote) {
      setNote((prev) =>
        importedNote.mode === "append" && prev.trim() ? `${prev.trimEnd()}\n${importedNote.text}` : importedNote.text,
      );
    }
    if (keys.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k as keyof TicketFormValues))));
    if (patch.ticket_number) setDuplicateOf(null);
    const total = keys.length + (importedNote ? 1 : 0);
    toast.success(`Filled ${total} item${total === 1 ? "" : "s"} from Quick Import. Review each step before saving.`);
  }

  function focusFirstError(errs: FieldErrors) {
    const first = Object.keys(errs).find((k) => errs[k as keyof FieldErrors]);
    if (first) setTimeout(() => document.getElementById(`f-${first}`)?.focus(), 50);
  }

  async function checkDuplicate(): Promise<boolean> {
    const num = values.ticket_number.trim();
    if (!num) return false;
    setChecking(true);
    try {
      const r = await checkTicketNumber(num);
      setDuplicateOf(r.exists ? (r.id ?? null) : null);
      return r.exists;
    } finally {
      setChecking(false);
    }
  }

  function go(to: number) {
    setStep(to);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function next() {
    if (step >= 4) return;
    const all = validateTicket(values);
    const stepErrors = all.success ? {} : pickErrors(all.errors, WIZARD_STEP_FIELDS[step as 1 | 2 | 3]);
    if (step === 1 && !stepErrors.ticket_number && (await checkDuplicate())) {
      stepErrors.ticket_number = "This ticket number already exists.";
    }
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      focusFirstError(stepErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    go(step + 1);
  }

  function save() {
    const v = validateTicket(values);
    if (!v.success) {
      setErrors(v.errors);
      const firstStep = ([1, 2, 3] as const).find((s) => Object.keys(pickErrors(v.errors, WIZARD_STEP_FIELDS[s])).length);
      if (firstStep) go(firstStep);
      focusFirstError(v.errors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    startSaving(async () => {
      const res = await createTicket(values, note);
      if (!res.ok) {
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          const firstStep = ([1, 2, 3] as const).find(
            (s) => Object.keys(pickErrors(res.fieldErrors!, WIZARD_STEP_FIELDS[s])).length,
          );
          if (firstStep) go(firstStep);
          focusFirstError(res.fieldErrors);
        }
        toast.error(res.error);
        return;
      }
      setSaved(true);
      writeDraft(null);
      toast.success(`Ticket #${values.ticket_number.trim()} saved.`);
      router.push(`/tickets/${res.id}`);
    });
  }

  function cancel() {
    if (dirty && !confirmDiscard()) return;
    setSaved(true);
    writeDraft(null);
    router.push("/dashboard");
  }

  return (
    <div ref={topRef} className="scroll-mt-24">
      {pendingDraft && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-amber-100">
            <History className="size-4" aria-hidden />
            You have an unsaved ticket draft from {formatDateTime(pendingDraft.savedAt)}
            {pendingDraft.values.ticket_number && <> (#{pendingDraft.values.ticket_number})</>}.
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setValues({ ...initial, ...pendingDraft.values });
                setNote(pendingDraft.note);
                setStep(Math.min(4, Math.max(1, pendingDraft.step)));
                setFaultManual(pendingDraft.faultManual);
                setPendingDraft(null);
              }}
            >
              Restore draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm("Discard the saved draft? This can't be undone.")) return;
                writeDraft(null);
                setPendingDraft(null);
              }}
            >
              Discard
            </Button>
          </span>
        </div>
      )}

      <QuickImportPanel
        lookups={lookups}
        values={values}
        defaults={initial}
        currentNote={note}
        onApply={applyImport}
      />

      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((name, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={name}>
              <button
                type="button"
                disabled={n > step}
                onClick={() => n < step && go(n)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  current && "border-primary/60 bg-primary-soft",
                  done && "border-line bg-surface hover:border-line-strong",
                  !current && !done && "border-line bg-surface/50 opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    current && "bg-primary text-white",
                    done && "bg-emerald-500/20 text-emerald-300",
                    !current && !done && "bg-surface-3 text-faint",
                  )}
                >
                  {done ? <Check className="size-4" /> : n}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-faint">Step {n}</span>
                  <span className="block truncate text-sm font-medium">{name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 4) void next();
          else save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (step < 4) void next();
            else save();
          }
        }}
      >
        <Card className="p-5 md:p-6">
          <h2 className="mb-5 text-lg font-semibold">{STEPS[step - 1]}</h2>

          {step === 1 && (
            <CustomerOrderSection
              values={values}
              set={set}
              errors={errors}
              lookups={lookups}
              duplicateOf={duplicateOf}
              onTicketNumberBlur={() => void checkDuplicate()}
              autoFocus
            />
          )}
          {step === 2 && (
            <IssueSection values={values} set={set} errors={errors} onFaultChosen={() => setFaultManual(true)} />
          )}
          {step === 3 && (
            <div className="space-y-8">
              <ResolutionSection values={values} set={set} errors={errors} />
              <div className="border-t border-line pt-6">
                <WorkflowSection values={values} set={set} errors={errors} statusOptions={EDITABLE_STATUSES} />
              </div>
              <div className="border-t border-line pt-6">
                <Field
                  label="First note (optional)"
                  htmlFor="f-note"
                  error={errors.note}
                  hint="Saved to the ticket with today's timestamp. You can add more notes any time."
                >
                  <Textarea
                    id="f-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="SW/ Contact - what happened, what was done…"
                  />
                </Field>
              </div>
            </div>
          )}
          {step === 4 && <Review values={values} note={note} lookups={lookups} onEdit={go} />}
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            {step > 1 && (
              <Button variant="secondary" onClick={() => go(step - 1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-faint sm:inline">Ctrl+Enter to continue</span>
            {step < 4 ? (
              <Button type="submit" variant="primary" loading={checking}>
                Next <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" loading={saving} className="min-w-40">
                <Save className="size-4" /> Save Ticket
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Review({
  values,
  note,
  lookups,
  onEdit,
}: {
  values: TicketFormValues;
  note: string;
  lookups: Lookups;
  onEdit: (step: number) => void;
}) {
  const dept = lookups.departments.find((d) => d.id === values.department_id);
  const mat = lookups.materials.find((m) => m.id === values.material_id);
  const money = (v: string) => (v ? formatMoney(v) : "");
  const issue = values.issue as Issue;

  const sections: { title: string; step: number; items: DetailItem[] }[] = [
    {
      title: "Customer & Order",
      step: 1,
      items: [
        { label: "Ticket #", value: values.ticket_number },
        { label: "Date Opened", value: formatDate(values.date_opened) },
        { label: "Point of Contact", value: label(POC_LABELS, values.point_of_contact as PointOfContact, "") },
        { label: "Customer", value: values.customer_name },
        { label: "Contact", value: values.contact_name },
        { label: "Order #", value: values.order_number },
        { label: "Department", value: dept?.code },
        { label: "Material", value: mat?.name },
        { label: "Material Type", value: values.material_type },
        { label: "Size", value: values.size },
        { label: "Quantity", value: values.quantity },
        { label: "Sq/Ft", value: values.sqft },
        { label: "Sheets", value: values.sheets },
        { label: "Order Value", value: money(values.order_value) },
        { label: "Shipping Cost", value: money(values.shipping_cost) },
        { label: "Tracking #", value: values.tracking_number },
      ],
    },
    {
      title: "Issue Details",
      step: 2,
      items: [
        { label: "Problem", value: label(ISSUE_LABELS, issue, "") },
        { label: "Fault", value: label(FAULT_LABELS, values.fault as Fault, "") },
        { label: "Description", value: values.issue_summary, wide: true },
        ...questionsFor(issue)
          .filter((q) => q.field !== "tracking_number")
          .map((q) => ({
            label: q.label,
            value:
              q.kind === "yesno"
                ? yesNoText(values[q.field] as "yes" | "no" | "")
                : q.kind === "date"
                  ? values[q.field]
                    ? formatDate(values[q.field] as string)
                    : ""
                  : (values[q.field] as string),
          })),
      ],
    },
    {
      title: "Additional Information",
      step: 3,
      items: [
        { label: "Status", value: <StatusBadge status={values.status as Status} /> },
        { label: "Follow-Up", value: values.follow_up_date ? formatDate(values.follow_up_date) : "" },
        { label: "Resolution Type", value: label(RESOLUTION_LABELS, values.resolution_type as ResolutionType, "") },
        { label: "Resolution", value: values.resolution, wide: true },
        { label: "Reprint Order #", value: values.reprint_order_number },
        { label: "Reprint Value", value: money(values.reprint_value) },
        { label: "Refund Value", value: money(values.refund_value) },
        { label: "Discount Value", value: money(values.discount_value) },
        { label: "Credit Value", value: money(values.credit_value) },
        { label: "Flags", value: [values.add_to_limits && "LIMITS", values.add_to_claims && "Claims"].filter(Boolean).join(", ") },
        { label: "First note", value: note.trim() ? <span className="whitespace-pre-wrap">{note.trim()}</span> : "", wide: true },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.title} className="rounded-xl border border-line p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary-bright">{s.title}</h3>
            <Button size="sm" variant="ghost" onClick={() => onEdit(s.step)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          </div>
          <DetailList items={s.items} />
        </section>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Lightbulb, ShieldAlert } from "lucide-react";
import { Checkbox, Field, Input, Select, Textarea, YesNo } from "@/components/ui/form";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  FAULT_LABELS,
  FAULTS,
  ISSUE_LABELS,
  ISSUES,
  POC_LABELS,
  POINTS_OF_CONTACT,
  RESOLUTION_LABELS,
  RESOLUTION_TYPES,
  STATUS_META,
  type Issue,
  type Status,
} from "@/lib/domain/options";
import { CONDITIONAL_FIELDS, questionsFor, type Question } from "@/lib/domain/conditional-questions";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import type { FieldErrors, TicketFormValues, YesNo as YesNoValue } from "@/lib/validation/ticket";
import type { Department, Material } from "@/types/domain";

export type SetField = <K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) => void;

export interface Lookups {
  departments: Department[];
  materials: Material[];
}

interface SectionProps {
  values: TicketFormValues;
  set: SetField;
  errors: FieldErrors;
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-5",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

function TextField({
  name,
  label,
  values,
  set,
  errors,
  required,
  placeholder,
  inputMode,
  hint,
  autoFocus,
  className,
  onBlur,
}: SectionProps & {
  name: keyof TicketFormValues;
  label: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: React.ReactNode;
  autoFocus?: boolean;
  className?: string;
  onBlur?: () => void;
}) {
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={errors[name]} required={required} hint={hint} className={className}>
      <Input
        id={id}
        name={name}
        value={values[name] as string}
        onChange={(e) => set(name, e.target.value as never)}
        invalid={!!errors[name]}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onBlur={onBlur}
        autoComplete="off"
      />
    </Field>
  );
}

function MoneyField(props: SectionProps & { name: keyof TicketFormValues; label: string }) {
  const id = `f-${props.name}`;
  return (
    <Field label={props.label} htmlFor={id} error={props.errors[props.name]}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">$</span>
        <Input
          id={id}
          name={props.name}
          inputMode="decimal"
          className="pl-7"
          placeholder="0.00"
          value={props.values[props.name] as string}
          onChange={(e) => props.set(props.name, e.target.value as never)}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(/[$,\s]/g, ""));
            if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) props.set(props.name, n.toFixed(2) as never);
          }}
          invalid={!!props.errors[props.name]}
          autoComplete="off"
        />
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------------- *
 * Step 1 — Customer & Order
 * ------------------------------------------------------------------------- */

export function CustomerOrderSection({
  values,
  set,
  errors,
  lookups,
  duplicateOf,
  onTicketNumberBlur,
  autoFocus,
}: SectionProps & {
  lookups: Lookups;
  duplicateOf?: string | null;
  onTicketNumberBlur?: () => void;
  autoFocus?: boolean;
}) {
  const deptName = useMemo(
    () => Object.fromEntries(lookups.departments.map((d) => [d.id, d.name])),
    [lookups.departments],
  );

  const materialOptions: ComboOption[] = useMemo(() => {
    const deptOrder = Object.fromEntries(lookups.departments.map((d) => [d.id, d.sort_order]));
    return lookups.materials
      .filter((m) => (m.is_active || m.id === values.material_id) && (!values.department_id || m.department_id === values.department_id))
      .sort((a, b) => (deptOrder[a.department_id] ?? 0) - (deptOrder[b.department_id] ?? 0) || a.sort_order - b.sort_order)
      .map((m) => ({ value: m.id, label: m.name, group: deptName[m.department_id], inactive: !m.is_active }));
  }, [lookups, values.department_id, values.material_id, deptName]);

  return (
    <div className="space-y-6">
      <Grid cols={4}>
        <TextField
          name="ticket_number"
          label="Ticket Number"
          required
          values={values}
          set={set}
          errors={errors}
          autoFocus={autoFocus}
          onBlur={onTicketNumberBlur}
          hint={
            duplicateOf ? (
              <span className="text-amber-300">
                This ticket number already exists.{" "}
                <Link href={`/tickets/${duplicateOf}`} className="underline" target="_blank">
                  Open it
                </Link>
              </span>
            ) : undefined
          }
        />
        <Field label="Date Opened" htmlFor="f-date_opened" error={errors.date_opened} required>
          <Input
            id="f-date_opened"
            type="date"
            value={values.date_opened}
            onChange={(e) => set("date_opened", e.target.value)}
            invalid={!!errors.date_opened}
          />
        </Field>
        <Field label="Point of Contact" htmlFor="f-poc" error={errors.point_of_contact} required>
          <Select id="f-poc" value={values.point_of_contact} onChange={(e) => set("point_of_contact", e.target.value)}>
            {POINTS_OF_CONTACT.map((p) => (
              <option key={p} value={p}>
                {POC_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <TextField name="order_number" label="Order Number" values={values} set={set} errors={errors} />
      </Grid>

      <Grid cols={2}>
        <TextField name="customer_name" label="Customer" required values={values} set={set} errors={errors} />
        <TextField
          name="contact_name"
          label="Contact Name"
          values={values}
          set={set}
          errors={errors}
          hint="The customer's contact — used in notes as “SW/ [Contact]”."
        />
      </Grid>

      <Grid cols={3}>
        <Field label="Department" htmlFor="f-department" error={errors.department_id}>
          <Select
            id="f-department"
            value={values.department_id}
            onChange={(e) => {
              const dept = e.target.value;
              set("department_id", dept);
              const mat = lookups.materials.find((m) => m.id === values.material_id);
              if (mat && dept && mat.department_id !== dept) set("material_id", "");
            }}
          >
            <option value="">—</option>
            {lookups.departments
              .filter((d) => d.is_active || d.id === values.department_id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Material" htmlFor="f-material" error={errors.material_id} hint="Type to search. Picking a material sets its department.">
          <Combobox
            id="f-material"
            value={values.material_id}
            options={materialOptions}
            placeholder="Search materials…"
            invalid={!!errors.material_id}
            onChange={(id) => {
              set("material_id", id);
              const mat = lookups.materials.find((m) => m.id === id);
              if (mat) set("department_id", mat.department_id);
            }}
          />
        </Field>
        <TextField
          name="material_type"
          label="Material Type"
          values={values}
          set={set}
          errors={errors}
          hint="Optional extra classification/details."
        />
      </Grid>

      <Grid cols={4}>
        <TextField name="size" label="Size" placeholder='e.g. 24" x 36"' values={values} set={set} errors={errors} />
        <TextField name="quantity" label="Quantity" inputMode="numeric" values={values} set={set} errors={errors} />
        <TextField name="sqft" label="Sq/Ft" inputMode="decimal" values={values} set={set} errors={errors} />
        <TextField name="sheets" label="Sheets" inputMode="numeric" values={values} set={set} errors={errors} />
      </Grid>

      <Grid cols={3}>
        <MoneyField name="order_value" label="Order Value" values={values} set={set} errors={errors} />
        <MoneyField name="shipping_cost" label="Shipping Cost" values={values} set={set} errors={errors} />
        <TextField name="tracking_number" label="Tracking Number" values={values} set={set} errors={errors} />
      </Grid>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Step 2 — Issue Details (conditional questions + fault suggestion)
 * ------------------------------------------------------------------------- */

function QuestionInput({ q, values, set, errors }: SectionProps & { q: Question }) {
  const id = `f-${q.field}`;
  const err = errors[q.field];
  switch (q.kind) {
    case "yesno":
      return (
        <Field label={q.label} error={err}>
          <YesNo
            name={q.field}
            label={q.label}
            value={values[q.field] as YesNoValue}
            onChange={(v) => set(q.field, v as never)}
            invalid={!!err}
          />
        </Field>
      );
    case "date":
      return (
        <Field label={q.label} htmlFor={id} error={err}>
          <Input id={id} type="date" value={values[q.field] as string} onChange={(e) => set(q.field, e.target.value as never)} invalid={!!err} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={q.label} htmlFor={id} error={err} className="sm:col-span-2">
          <Textarea id={id} rows={2} className="min-h-16" value={values[q.field] as string} onChange={(e) => set(q.field, e.target.value as never)} invalid={!!err} />
        </Field>
      );
    default:
      return (
        <Field label={q.label} htmlFor={id} error={err}>
          <Input
            id={id}
            inputMode={q.kind === "int" ? "numeric" : undefined}
            value={values[q.field] as string}
            onChange={(e) => set(q.field, e.target.value as never)}
            invalid={!!err}
            autoComplete="off"
          />
        </Field>
      );
  }
}

export function IssueSection({
  values,
  set,
  errors,
  onFaultChosen,
  showOtherAnswers,
}: SectionProps & {
  /** Called when Jessica picks a fault by hand (stops auto-apply). */
  onFaultChosen?: () => void;
  /** Edit mode: also show answers saved for questions that belong to a different problem. */
  showOtherAnswers?: boolean;
}) {
  const issue = values.issue as Issue | "";
  const questions = questionsFor(issue);
  const suggestion = suggestFault({
    issue,
    carrier_responsible: values.carrier_responsible === "" ? null : values.carrier_responsible === "yes",
  });

  const shown = new Set<string>(questions.map((q) => q.field));
  const otherAnswered = showOtherAnswers
    ? CONDITIONAL_FIELDS.filter((f) => !shown.has(f) && values[f] !== "")
    : [];
  const allQuestions = Object.values(
    Object.fromEntries(ISSUES.flatMap((i) => questionsFor(i)).map((q) => [q.field, q])),
  ) as Question[];

  return (
    <div className="space-y-6">
      <Field label="Problem" error={errors.issue} required>
        <div role="radiogroup" aria-label="Problem" className="flex flex-wrap gap-2">
          {ISSUES.map((i) => {
            const active = values.issue === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set("issue", i)}
                className={cn(
                  "h-10 rounded-lg border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary-soft text-ink ring-2 ring-primary/30"
                    : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {ISSUE_LABELS[i]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Concise issue description" htmlFor="f-issue_summary" error={errors.issue_summary} hint="e.g. “Confirmed image 8 missing.”">
        <Textarea
          id="f-issue_summary"
          rows={2}
          className="min-h-16"
          value={values.issue_summary}
          onChange={(e) => set("issue_summary", e.target.value)}
          invalid={!!errors.issue_summary}
        />
      </Field>

      {questions.length > 0 && (
        <div className="rounded-xl border border-line bg-bg/40 p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary-bright">
            {ISSUE_LABELS[issue as Issue]} questions
          </p>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {questions.map((q) => (
              <QuestionInput key={q.field} q={q} values={values} set={set} errors={errors} />
            ))}
          </div>
        </div>
      )}

      {otherAnswered.length > 0 && (
        <details className="rounded-xl border border-dashed border-line p-4">
          <summary className="cursor-pointer text-sm text-muted">
            Answers saved for other problem types ({otherAnswered.length})
          </summary>
          <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {allQuestions
              .filter((q) => otherAnswered.includes(q.field as (typeof CONDITIONAL_FIELDS)[number]))
              .map((q) => (
                <QuestionInput key={q.field} q={q} values={values} set={set} errors={errors} />
              ))}
          </div>
        </details>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fault" htmlFor="f-fault" error={errors.fault}>
          <Select
            id="f-fault"
            value={values.fault}
            onChange={(e) => {
              set("fault", e.target.value);
              onFaultChosen?.();
            }}
          >
            <option value="">Not determined yet</option>
            {FAULTS.map((f) => (
              <option key={f} value={f}>
                {FAULT_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          {suggestion ? (
            <div
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                values.fault === suggestion.fault
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-primary/40 bg-primary-soft text-ink",
              )}
            >
              <span className="flex items-center gap-2">
                <Lightbulb className="size-4 shrink-0" aria-hidden />
                <span>
                  Suggested: <strong>{FAULT_LABELS[suggestion.fault]}</strong>
                  <span className="text-muted"> — {suggestion.reason}</span>
                </span>
              </span>
              {values.fault !== suggestion.fault && (
                <Button size="sm" variant="outline" onClick={() => set("fault", suggestion.fault)}>
                  Use
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-faint">No fault suggestion — not enough information for an established rule.</p>
          )}
        </div>
      </div>

      {values.fault === "fedex_error" && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-blue-300" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold text-blue-100">FedEx Error — this ticket may need a Claim.</p>
            <p className="mt-0.5 text-blue-200/80">The Claims workflow arrives in Phase 3. Flag it now so it isn&apos;t missed.</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-blue-100">
              <input
                type="checkbox"
                className="size-4 accent-violet-500"
                checked={values.add_to_claims}
                onChange={(e) => set("add_to_claims", e.target.checked)}
              />
              Flag for Claims
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Step 3 — Resolution & workflow
 * ------------------------------------------------------------------------- */

export function ResolutionSection({ values, set, errors }: SectionProps) {
  return (
    <div className="space-y-6">
      <Grid cols={3}>
        <Field label="Resolution Type" htmlFor="f-resolution_type" error={errors.resolution_type}>
          <Select id="f-resolution_type" value={values.resolution_type} onChange={(e) => set("resolution_type", e.target.value)}>
            <option value="">Not decided yet</option>
            {RESOLUTION_TYPES.map((r) => (
              <option key={r} value={r}>
                {RESOLUTION_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <TextField name="reprint_order_number" label="Reprint Order #" values={values} set={set} errors={errors} className="lg:col-span-2" />
      </Grid>
      <Field label="Resolution Description" htmlFor="f-resolution" error={errors.resolution}>
        <Textarea id="f-resolution" rows={2} className="min-h-16" value={values.resolution} onChange={(e) => set("resolution", e.target.value)} invalid={!!errors.resolution} />
      </Field>
      <Grid cols={4}>
        <MoneyField name="reprint_value" label="Reprint Value" values={values} set={set} errors={errors} />
        <MoneyField name="refund_value" label="Refund Value" values={values} set={set} errors={errors} />
        <MoneyField name="discount_value" label="Discount Value" values={values} set={set} errors={errors} />
        <MoneyField name="credit_value" label="Credit Value" values={values} set={set} errors={errors} />
      </Grid>
    </div>
  );
}

export function WorkflowSection({
  values,
  set,
  errors,
  statusOptions,
}: SectionProps & { statusOptions: readonly Status[] }) {
  return (
    <div className="space-y-6">
      <Grid cols={3}>
        <Field label="Status" htmlFor="f-status" error={errors.status} required>
          <Select id="f-status" value={values.status} onChange={(e) => set("status", e.target.value)} invalid={!!errors.status}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Follow-Up Date" htmlFor="f-follow_up_date" error={errors.follow_up_date}>
          <Input id="f-follow_up_date" type="date" value={values.follow_up_date} onChange={(e) => set("follow_up_date", e.target.value)} invalid={!!errors.follow_up_date} />
        </Field>
      </Grid>
      {values.status === "rush_reprint" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <AlertTriangle className="size-4" aria-hidden />
          Rush Reprint: the rush timer starts when this is saved.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox
          checked={values.add_to_limits}
          onChange={(v) => set("add_to_limits", v)}
          label="Needs LIMITS entry"
          description="Flag only. The LIMITS workflow arrives in Phase 3."
        />
        <Checkbox
          checked={values.add_to_claims}
          onChange={(v) => set("add_to_claims", v)}
          label="Needs Claims entry"
          description="Flag only. The Claims workflow arrives in Phase 3."
        />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleHelp, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { CopyButton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { buildPatch, defaultDecision, planMerge, type ImportFieldKey, type MergeRow, type ParseResult, type RowDecision } from "@/lib/import";
import { FIELD_LABELS } from "@/lib/domain/field-labels";
import {
  FAULT_LABELS,
  FAULTS,
  ISSUE_LABELS,
  ISSUES,
  POC_LABELS,
  POINTS_OF_CONTACT,
  type Fault,
  type Issue,
  type PointOfContact,
} from "@/lib/domain/options";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { TicketFormValues } from "@/lib/validation/ticket";
import type { Lookups } from "@/components/tickets/ticket-fields";

export interface ApplyPayload {
  patch: Partial<Record<ImportFieldKey, string>>;
  note: { mode: "replace" | "append"; text: string } | null;
}

const ORDER: ImportFieldKey[] = [
  "ticket_number", "date_opened", "point_of_contact", "customer_name", "contact_name", "order_number",
  "department_id", "material_id", "size", "quantity", "order_value", "tracking_number", "fedex_case_number",
  "issue", "fault", "fedex_investigation_opened",
];

const LABELS: Partial<Record<ImportFieldKey, string>> = {
  ...FIELD_LABELS,
  department_id: "Department",
  material_id: "Material",
  fedex_investigation_opened: "FedEx investigation opened",
};

export function ImportReview({
  result,
  lookups,
  values,
  defaults,
  currentNote,
  onCancel,
  onApply,
}: {
  result: ParseResult;
  lookups: Lookups;
  values: TicketFormValues;
  defaults: TicketFormValues;
  currentNote: string;
  onCancel: () => void;
  onApply: (payload: ApplyPayload) => void;
}) {
  const rows = useMemo(
    () =>
      planMerge(values, defaults, result.fields).sort((a, b) => ORDER.indexOf(a.field.key) - ORDER.indexOf(b.field.key)),
    // The review reflects the form as it was when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>(() =>
    Object.fromEntries(rows.map((r) => [r.field.key, defaultDecision(r)])),
  );
  const update = (key: string, d: Partial<RowDecision>) => setDecisions((all) => ({ ...all, [key]: { ...all[key], ...d } }));

  // Unmatched material: leave blank (default) or pick an existing one.
  const [materialChoice, setMaterialChoice] = useState<"blank" | "select">("blank");
  const [pickedMaterial, setPickedMaterial] = useState("");

  // Note preview
  const [noteText, setNoteText] = useState(result.note?.normalized ?? "");
  const [noteAccepted, setNoteAccepted] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteMode, setNoteMode] = useState<"replace" | "append">(currentNote.trim() ? "append" : "replace");
  const [showRawNote, setShowRawNote] = useState(false);

  const names = useMemo(
    () => ({
      dept: Object.fromEntries(lookups.departments.map((d) => [d.id, d.code])),
      mat: Object.fromEntries(lookups.materials.map((m) => [m.id, m.name])),
    }),
    [lookups],
  );
  const materialOptions: ComboOption[] = useMemo(
    () =>
      lookups.materials
        .filter((m) => m.is_active)
        .map((m) => ({ value: m.id, label: m.name, group: names.dept[m.department_id] })),
    [lookups, names],
  );

  const show = (key: ImportFieldKey, v: string): string => {
    if (!v) return "(empty)";
    switch (key) {
      case "date_opened":
        return formatDate(v);
      case "department_id":
        return names.dept[v] ?? v;
      case "material_id":
        return names.mat[v] ?? v;
      case "issue":
        return ISSUE_LABELS[v as Issue] ?? v;
      case "fault":
        return FAULT_LABELS[v as Fault] ?? v;
      case "point_of_contact":
        return POC_LABELS[v as PointOfContact] ?? v;
      case "order_value":
        return formatMoney(v);
      case "fedex_investigation_opened":
        return v === "yes" ? "Yes" : v === "no" ? "No" : v;
      default:
        return v;
    }
  };

  const patch = buildPatch(rows, decisions);
  if (materialChoice === "select" && pickedMaterial) {
    patch.material_id = pickedMaterial;
    const m = lookups.materials.find((x) => x.id === pickedMaterial);
    if (m) patch.department_id = m.department_id;
  }
  const count = Object.keys(patch).length + (noteAccepted && noteText.trim() ? 1 : 0);

  function editor(row: MergeRow) {
    const key = row.field.key;
    const d = decisions[key];
    const set = (value: string) => update(key, { value });
    const common = "h-9";
    switch (key) {
      case "date_opened":
        return <Input type="date" className={common} value={d.value} onChange={(e) => set(e.target.value)} />;
      case "point_of_contact":
        return (
          <Select className={common} value={d.value} onChange={(e) => set(e.target.value)}>
            {POINTS_OF_CONTACT.map((p) => (
              <option key={p} value={p}>
                {POC_LABELS[p]}
              </option>
            ))}
          </Select>
        );
      case "department_id":
        return (
          <Select className={common} value={d.value} onChange={(e) => set(e.target.value)}>
            {lookups.departments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code}
              </option>
            ))}
          </Select>
        );
      case "material_id":
        return <Combobox value={d.value} onChange={set} options={materialOptions} placeholder="Search materials…" />;
      case "issue":
        return (
          <Select className={common} value={d.value} onChange={(e) => set(e.target.value)}>
            {ISSUES.map((i) => (
              <option key={i} value={i}>
                {ISSUE_LABELS[i]}
              </option>
            ))}
          </Select>
        );
      case "fault":
        return (
          <Select className={common} value={d.value} onChange={(e) => set(e.target.value)}>
            {FAULTS.map((f) => (
              <option key={f} value={f}>
                {FAULT_LABELS[f]}
              </option>
            ))}
          </Select>
        );
      case "fedex_investigation_opened":
        return (
          <Select className={common} value={d.value} onChange={(e) => set(e.target.value)}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        );
      default:
        return <Input className={common} value={d.value} onChange={(e) => set(e.target.value)} />;
    }
  }

  const extractedCount = rows.filter((r) => r.field.confidence === "extracted").length;
  const inferredCount = rows.length - extractedCount;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onCancel()}
      size="lg"
      title="Quick Import results"
      description={
        <>
          <span className="text-emerald-300">✓ {extractedCount} extracted</span>
          {inferredCount > 0 && <span className="text-amber-300"> · ? {inferredCount} inferred — confirm before using</span>}
          <span> · Nothing is saved until you press Save Ticket.</span>
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={count === 0}
            onClick={() =>
              onApply({ patch, note: noteAccepted && noteText.trim() ? { mode: noteMode, text: noteText.trim() } : null })
            }
            className="uppercase tracking-wider"
          >
            Apply to Ticket{count > 0 ? ` (${count})` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Unmatched materials — very visible, never discarded */}
        {result.unmatchedMaterials.length > 0 && (
          <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4" role="alert">
            {result.unmatchedMaterials.map((m) => (
              <p key={m.raw} className="flex items-start gap-2 font-semibold text-amber-100">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
                <span>
                  Material not found: <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono">{m.raw}</span>
                  <span className="ml-2 text-xs font-normal text-amber-200/70">({m.source})</span>
                </span>
              </p>
            ))}
            <p className="mt-1 pl-7 text-xs text-amber-200/80">
              It isn&apos;t in your Materials list or aliases. Nothing was created — choose what to do:
            </p>
            <div className="mt-3 flex flex-wrap gap-2 pl-7">
              <Button
                size="sm"
                variant={materialChoice === "blank" ? "primary" : "secondary"}
                onClick={() => setMaterialChoice("blank")}
              >
                Leave Blank
              </Button>
              <Button
                size="sm"
                variant={materialChoice === "select" ? "primary" : "secondary"}
                onClick={() => setMaterialChoice("select")}
              >
                Select Existing Material
              </Button>
            </div>
            {materialChoice === "select" && (
              <div className="mt-3 max-w-md pl-7">
                <Combobox value={pickedMaterial} onChange={setPickedMaterial} options={materialOptions} placeholder="Search materials…" />
                {values.material_id && pickedMaterial && pickedMaterial !== values.material_id && (
                  <p className="mt-1 text-xs text-amber-200/80">
                    Replaces the material already on the ticket ({names.mat[values.material_id]}).
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Field rows */}
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {rows.map((row) => {
            const key = row.field.key;
            const d = decisions[key];
            const inferred = row.field.confidence === "inferred";
            const label = LABELS[key] ?? key;
            return (
              <li key={key} className={cn("px-4 py-3", inferred && "bg-amber-500/[0.04]", row.state === "same" && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-3">
                  {row.state !== "same" ? (
                    <input
                      type="checkbox"
                      className="mt-1.5 size-4 accent-violet-500"
                      checked={d.accept}
                      onChange={(e) => update(key, { accept: e.target.checked })}
                      aria-label={`${inferred ? "Accept" : "Use"} ${label}`}
                    />
                  ) : (
                    <span className="mt-1 size-4" />
                  )}
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      inferred ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300",
                    )}
                    title={inferred ? "Inferred — needs confirmation" : "Extracted from the pasted text"}
                  >
                    {inferred ? <CircleHelp className="size-3.5" /> : <Check className="size-3.5" />}
                  </span>
                  <div className="w-44 shrink-0">
                    <div className="text-sm font-medium text-ink">{label}</div>
                    <div className="text-[11px] text-faint">{inferred ? "Inferred / confirm" : "Extracted"}</div>
                  </div>

                  <div className="min-w-56 flex-1 space-y-2">
                    {row.state === "same" && <p className="pt-1 text-sm text-muted">Already set to {show(key, row.current)}</p>}

                    {row.state === "new" && editor(row)}

                    {row.state === "conflict" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label
                          className={cn(
                            "cursor-pointer rounded-lg border p-2.5",
                            d.choice === "existing" ? "border-primary bg-primary-soft" : "border-line hover:border-line-strong",
                          )}
                        >
                          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                            <input
                              type="radio"
                              className="accent-violet-500"
                              checked={d.choice === "existing"}
                              onChange={() => update(key, { choice: "existing" })}
                            />
                            Keep existing
                          </span>
                          <span className="mt-1 block text-sm text-ink">{show(key, row.current)}</span>
                        </label>
                        <div
                          className={cn(
                            "rounded-lg border p-2.5",
                            d.choice === "imported" ? "border-primary bg-primary-soft" : "border-line",
                          )}
                        >
                          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                            <input
                              type="radio"
                              className="accent-violet-500"
                              checked={d.choice === "imported"}
                              onChange={() => update(key, { choice: "imported", accept: true })}
                            />
                            Use imported
                          </label>
                          <div className="mt-1.5">{editor(row)}</div>
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-faint">
                      From {row.field.source}
                      {row.field.reason && <span className="block text-amber-200/80">{row.field.reason}</span>}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-3 text-sm text-muted">No field values were found.</li>}
        </ul>

        {/* Initial note preview */}
        {result.note && (
          <div className={cn("rounded-xl border p-4", noteAccepted ? "border-emerald-500/50 bg-emerald-500/[0.06]" : "border-line")}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Initial Ticket Note (cleaned up)</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setNoteEditing((e) => !e)}>
                  <Pencil className="size-3.5" /> {noteEditing ? "Done" : "Edit"}
                </Button>
                <CopyButton text={noteText} />
                <Button
                  size="sm"
                  variant={noteAccepted ? "secondary" : "outline"}
                  onClick={() => setNoteAccepted((a) => !a)}
                  disabled={!noteText.trim()}
                >
                  {noteAccepted ? (
                    <>
                      <Check className="size-3.5" /> Note accepted
                    </>
                  ) : (
                    "Accept Note"
                  )}
                </Button>
              </div>
            </div>
            {noteEditing ? (
              <Textarea aria-label="Edit note" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
            ) : (
              <p className="whitespace-pre-wrap rounded-lg bg-bg/50 px-3 py-2 text-sm text-ink">{noteText}</p>
            )}
            {noteAccepted && currentNote.trim() && (
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                <span>The First note box already has text:</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" className="accent-violet-500" checked={noteMode === "append"} onChange={() => setNoteMode("append")} />
                  Add below it
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" className="accent-violet-500" checked={noteMode === "replace"} onChange={() => setNoteMode("replace")} />
                  Replace it
                </label>
              </div>
            )}
            <button type="button" className="mt-2 text-xs text-primary-bright hover:underline" onClick={() => setShowRawNote((s) => !s)}>
              {showRawNote ? "Hide" : "Compare with"} original note
            </button>
            {showRawNote && (
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-dashed border-line px-3 py-2 font-mono text-xs text-muted">
                {result.note.raw}
              </p>
            )}
            <p className="mt-2 text-[11px] text-faint">
              Accepting puts it in the &ldquo;First note&rdquo; box on Step 3. It&apos;s saved only when you press Save Ticket.
            </p>
          </div>
        )}

        {(result.unused.length > 0 || result.warnings.length > 0) && (
          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">Not imported</h3>
            {result.warnings.map((w) => (
              <p key={w} className="mb-1 flex items-start gap-2 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </p>
            ))}
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              {result.unused.map((u, i) => (
                <div key={`${u.label}-${i}`} className="contents">
                  <dt className="text-faint">{u.label}</dt>
                  <dd className="break-words text-muted">{u.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-faint">These have no matching ticket field, so they weren&apos;t put anywhere.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

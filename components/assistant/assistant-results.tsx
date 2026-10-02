"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleHelp, CircleX, Eye, EyeOff, FileText, Lightbulb, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { CopyButton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { ASSISTANT_FIELDS, SECTION_TITLES, type AssistantFieldKey, type FieldMeta, type Section } from "@/lib/assistant/fields";
import { buildChanges, defaultDecision, planMerge, type MergeRow, type RowDecision } from "@/lib/assistant/merge";
import { computeMissing } from "@/lib/assistant/missing";
import type { EntryKind, FieldValues, MissingRule, Proposal } from "@/lib/assistant/types";
import {
  FAULT_LABELS,
  ISSUE_LABELS,
  POC_LABELS,
  RESOLUTION_LABELS,
  STATUS_META,
  type Fault,
  type Issue,
  type PointOfContact,
  type ResolutionType,
  type Status,
} from "@/lib/domain/options";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { Lookups } from "@/components/tickets/ticket-fields";

const KIND_LABELS: Record<EntryKind, string> = {
  new_ticket: "New ticket",
  customer_update: "Customer update",
  carrier_update: "Carrier update",
  resolution: "Resolution",
  internal_update: "Internal update",
};

const SECTIONS: Section[] = ["ticket", "product", "issue", "resolution", "shipping"];
const FIELD_ORDER = Object.keys(ASSISTANT_FIELDS) as AssistantFieldKey[];

export function ConfidenceBadge({ kind }: { kind: "extracted" | "inferred" | "missing" }) {
  const map = {
    extracted: { cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40", icon: <Check className="size-3" />, text: "Extracted" },
    inferred: { cls: "bg-amber-500/15 text-amber-300 ring-amber-500/40", icon: <CircleHelp className="size-3" />, text: "Inferred" },
    missing: { cls: "bg-red-500/15 text-red-300 ring-red-500/40", icon: <CircleX className="size-3" />, text: "Missing" },
  }[kind];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1", map.cls)}
      data-confidence={kind}
    >
      {map.icon}
      {map.text}
    </span>
  );
}

function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-bright">
      {children}
    </h3>
  );
}

export interface AssistantApply {
  changes: FieldValues;
  note: string | null;
}

/**
 * Shared review UI for the Ticket Assistant (New Ticket and Quick Update).
 * Shows the generated note first, then the proposed values by section,
 * missing information, suggested actions and anything not imported.
 */
export function AssistantResults({
  proposal,
  rules,
  lookups,
  current,
  defaults,
  applyLabel,
  applying,
  onApply,
  onUseNote,
}: {
  proposal: Proposal;
  rules: MissingRule[];
  lookups: Lookups;
  /** Existing values: the form (new) or the ticket (update). */
  current: FieldValues;
  /** Untouched form defaults (new ticket only). */
  defaults: FieldValues | null;
  applyLabel: string;
  applying?: boolean;
  onApply: (a: AssistantApply) => void;
  /** New Ticket: put the note into the First Ticket Note field. */
  onUseNote?: (text: string) => void;
}) {
  const mode = proposal.mode;
  const rows = useMemo(
    () =>
      planMerge(current, defaults, proposal.fields).sort((a, b) => FIELD_ORDER.indexOf(a.field.key) - FIELD_ORDER.indexOf(b.field.key)),
    // The review reflects the values at the time of analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposal],
  );
  const [decisions, setDecisions] = useState<Partial<Record<AssistantFieldKey, RowDecision>>>(() =>
    Object.fromEntries(rows.map((r) => [r.field.key, defaultDecision(r, mode)])),
  );
  const update = (key: AssistantFieldKey, d: Partial<RowDecision>) =>
    setDecisions((all) => ({ ...all, [key]: { ...(all[key] as RowDecision), ...d } }));

  const [materialChoice, setMaterialChoice] = useState<"blank" | "select">("blank");
  const [pickedMaterial, setPickedMaterial] = useState("");

  const [noteText, setNoteText] = useState(proposal.note?.text ?? "");
  const [editingNote, setEditingNote] = useState(!proposal.note && mode === "update");
  const [includeNote, setIncludeNote] = useState(!!proposal.note);
  const [noteUsed, setNoteUsed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showSame, setShowSame] = useState(false);

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
        .map((m) => ({
          value: m.id,
          label: m.name,
          group: names.dept[m.department_id],
          keywords: (lookups.aliases ?? []).filter((a) => a.material_id === m.id).map((a) => a.alias).join(" "),
        })),
    [lookups, names],
  );

  const show = (key: AssistantFieldKey, v: string | undefined): string => {
    if (!v) return "blank";
    const meta: FieldMeta = ASSISTANT_FIELDS[key];
    if (meta.kind === "money") return formatMoney(v);
    if (meta.kind === "date") return formatDate(v);
    if (meta.kind === "yesno") return v === "yes" ? "Yes" : v === "no" ? "No" : v;
    if (meta.kind === "department") return names.dept[v] ?? v;
    if (meta.kind === "material") return names.mat[v] ?? v;
    if (key === "issue") return ISSUE_LABELS[v as Issue] ?? v;
    if (key === "fault") return FAULT_LABELS[v as Fault] ?? v;
    if (key === "resolution_type") return RESOLUTION_LABELS[v as ResolutionType] ?? v;
    if (key === "point_of_contact") return POC_LABELS[v as PointOfContact] ?? v;
    if (key === "status") return STATUS_META[v as Status]?.label ?? v;
    return v;
  };
  const optionLabel = (key: AssistantFieldKey, o: string) => show(key, o);

  // What will be applied
  const changes = buildChanges(rows, decisions, mode);
  if (materialChoice === "select" && pickedMaterial) changes.material_id = pickedMaterial;
  if (changes.material_id) {
    const m = lookups.materials.find((x) => x.id === changes.material_id);
    if (m) changes.department_id = m.department_id;
  }
  const changeCount = Object.keys(changes).length;
  const noteForApply = mode === "update" && includeNote && noteText.trim() ? noteText.trim() : null;

  // Live missing information: existing values + what will be applied.
  const effective: FieldValues = { ...current };
  if (defaults) for (const k of Object.keys(effective) as AssistantFieldKey[]) if (effective[k] === defaults[k]) delete effective[k];
  Object.assign(effective, changes);
  const missing = computeMissing(effective, rules);

  function editor(row: MergeRow) {
    const key = row.field.key;
    const d = decisions[key]!;
    const set = (value: string) => update(key, { value, accept: true });
    const meta: FieldMeta = ASSISTANT_FIELDS[key];
    const cls = "h-9";
    const label = `${meta.label} value`;
    if (meta.kind === "date") return <Input aria-label={label} type="date" className={cls} value={d.value} onChange={(e) => set(e.target.value)} />;
    if (meta.kind === "yesno")
      return (
        <Select aria-label={label} className={cls} value={d.value} onChange={(e) => set(e.target.value)}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      );
    if (meta.kind === "enum")
      return (
        <Select aria-label={label} className={cls} value={d.value} onChange={(e) => set(e.target.value)}>
          {meta.options!.map((o) => (
            <option key={o} value={o}>
              {optionLabel(key, o)}
            </option>
          ))}
        </Select>
      );
    if (meta.kind === "department")
      return (
        <Select aria-label={label} className={cls} value={d.value} onChange={(e) => set(e.target.value)}>
          {lookups.departments.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code}
            </option>
          ))}
        </Select>
      );
    if (meta.kind === "material") return <Combobox value={d.value} onChange={set} options={materialOptions} placeholder="Search materials…" />;
    return <Input aria-label={label} className={cls} value={d.value} onChange={(e) => set(e.target.value)} inputMode={meta.kind === "money" || meta.kind === "int" ? "decimal" : undefined} />;
  }

  function renderRow(row: MergeRow) {
    const key = row.field.key;
    const d = decisions[key]!;
    const meta: FieldMeta = ASSISTANT_FIELDS[key];
    const inferred = row.field.confidence === "inferred";
    return (
      <li
        key={key}
        data-field={key}
        className={cn("px-4 py-3", inferred && "bg-amber-500/[0.05]", row.state === "same" && "opacity-60")}
      >
        <div className="flex flex-wrap items-start gap-3">
          {row.state !== "same" ? (
            <input
              type="checkbox"
              className="mt-2 size-4 accent-violet-500"
              checked={d.accept}
              onChange={(e) => update(key, { accept: e.target.checked })}
              aria-label={`Use ${meta.label}`}
            />
          ) : (
            <span className="mt-2 size-4" />
          )}
          <div className="w-44 shrink-0 pt-1">
            <div className="text-sm font-medium text-ink">{meta.label}</div>
            <div className="mt-1">
              <ConfidenceBadge kind={row.field.confidence} />
            </div>
          </div>
          <div className="min-w-56 flex-1 space-y-1.5">
            {row.state === "same" ? (
              <p className="pt-1.5 text-sm text-muted">Already {show(key, row.current)}</p>
            ) : (
              <>
                {(mode === "update" || row.state === "conflict") && (
                  <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="from-to">
                    <span className={cn("rounded px-1.5 py-0.5", row.current ? "bg-surface-3 text-muted line-through decoration-red-400/60" : "text-faint italic")}>
                      {show(key, row.current)}
                    </span>
                    <span className="text-faint">→</span>
                    <span className="font-medium text-ink">{show(key, d.value)}</span>
                    {mode === "new" && row.state === "conflict" && !d.accept && (
                      <span className="text-xs text-amber-200/80">Form value kept — tick to replace</span>
                    )}
                  </p>
                )}
                {editor(row)}
              </>
            )}
            <p className="text-[11px] text-faint">
              From {row.field.source}
              {row.field.evidence && (
                <>
                  {" · "}
                  <span className="font-mono text-muted">“{row.field.evidence}”</span>
                </>
              )}
              {row.field.reason && <span className="block text-amber-200/80">{row.field.reason}</span>}
            </p>
          </div>
        </div>
      </li>
    );
  }

  const changeRows = rows.filter((r) => r.state !== "same");
  const sameRows = rows.filter((r) => r.state === "same");
  const extracted = rows.filter((r) => r.field.confidence === "extracted").length;
  const inferredCount = rows.length - extracted;

  return (
    <div className="space-y-5" data-testid="assistant-results">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary-bright">{KIND_LABELS[proposal.kind]}</span>
        <span className="text-emerald-300">{extracted} extracted</span>
        <span className="text-faint">·</span>
        <span className="text-amber-300">{inferredCount} inferred</span>
        <span className="text-faint">·</span>
        <span className="text-red-300">{missing.length} missing</span>
        <span className="ml-auto inline-flex items-center gap-1 text-faint">
          <Sparkles className="size-3" aria-hidden />
          {proposal.ai.used ? `AI-assisted (${proposal.ai.provider})` : proposal.ai.enabled ? `AI unavailable — rules only${proposal.ai.error ? ` (${proposal.ai.error})` : ""}` : "Rules only · AI off"}
        </span>
      </div>

      {/* GENERATED NOTE — always first */}
      <section aria-labelledby="gen-note" className={cn("rounded-xl border p-4", noteUsed || (mode === "update" && includeNote) ? "border-emerald-500/50 bg-emerald-500/[0.05]" : "border-primary/40 bg-primary-soft/40")}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle id="gen-note">
            <FileText className="mr-1 inline size-3.5" aria-hidden />
            Generated Note
          </SectionTitle>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditingNote((e) => !e)}>
              <Pencil className="size-3.5" /> {editingNote ? "Done" : "Edit Note"}
            </Button>
            <CopyButton text={noteText} label="Copy Note" />
            {onUseNote && (
              <Button
                size="sm"
                variant={noteUsed ? "secondary" : "outline"}
                disabled={!noteText.trim()}
                onClick={() => {
                  onUseNote(noteText.trim());
                  setNoteUsed(true);
                }}
              >
                {noteUsed ? (
                  <>
                    <Check className="size-3.5" /> Note Used
                  </>
                ) : (
                  "Use Note"
                )}
              </Button>
            )}
          </div>
        </div>
        {editingNote ? (
          <Textarea aria-label="Generated note" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
        ) : noteText ? (
          <p className="whitespace-pre-wrap rounded-lg bg-bg/60 px-3 py-2 text-sm text-ink" data-testid="generated-note">
            {noteText}
          </p>
        ) : (
          <p className="text-sm text-muted">{proposal.noteSkippedReason ?? "No note was generated."} Use Edit Note to write one.</p>
        )}
        {proposal.note?.droppedIdentifiers.length ? (
          <p className="mt-2 text-xs text-amber-300">Check the note — not included: {proposal.note.droppedIdentifiers.join(", ")}</p>
        ) : null}
        {mode === "update" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-violet-500" checked={includeNote} onChange={(e) => setIncludeNote(e.target.checked)} disabled={!noteText.trim()} />
            Add this note to the ticket when I click Apply Update
          </label>
        )}
        {mode === "new" && !noteUsed && <p className="mt-2 text-xs text-faint">Use Note puts it in the First Ticket Note box. It&apos;s saved only when you save the ticket.</p>}
      </section>

      {/* Unmatched material */}
      {proposal.unmatchedMaterials.length > 0 && (
        <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4" role="alert">
          {proposal.unmatchedMaterials.map((m) => (
            <div key={m.raw} className="flex items-start gap-2 text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
              <div>
                <p className="font-semibold">⚠ Material Not Found</p>
                <p className="text-sm">
                  Detected: <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono">{m.raw}</span>
                  <span className="ml-2 text-xs text-amber-200/70">({m.source})</span>
                </p>
              </div>
            </div>
          ))}
          <p className="mt-1 pl-7 text-xs text-amber-200/80">It isn&apos;t in your Materials list or aliases. Nothing was created.</p>
          <div className="mt-3 flex flex-wrap gap-2 pl-7">
            <Button size="sm" variant={materialChoice === "select" ? "primary" : "secondary"} onClick={() => setMaterialChoice("select")}>
              Select Existing Material
            </Button>
            <Button size="sm" variant={materialChoice === "blank" ? "primary" : "secondary"} onClick={() => setMaterialChoice("blank")}>
              Leave Blank
            </Button>
          </div>
          {materialChoice === "select" && (
            <div className="mt-3 max-w-md pl-7">
              <Combobox value={pickedMaterial} onChange={setPickedMaterial} options={materialOptions} placeholder="Search materials…" />
            </div>
          )}
        </div>
      )}

      {proposal.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100">
          {proposal.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}

      {/* Fields */}
      {mode === "new" ? (
        SECTIONS.map((s) => {
          const list = rows.filter((r) => ASSISTANT_FIELDS[r.field.key].section === s);
          return (
            <section key={s} aria-label={SECTION_TITLES[s]}>
              <SectionTitle>{SECTION_TITLES[s]}</SectionTitle>
              {list.length ? (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {list.map((r) => renderRow(r))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line px-4 py-2.5 text-sm text-faint">Nothing found.</p>
              )}
            </section>
          );
        })
      ) : (
        <section aria-label="Proposed field changes">
          <SectionTitle>Proposed Field Changes</SectionTitle>
          {changeRows.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {changeRows.map((r) => renderRow(r))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-2.5 text-sm text-faint">No field changes — this update only adds a note.</p>
          )}
          {sameRows.length > 0 && (
            <button type="button" className="mt-2 text-xs text-faint hover:text-muted" onClick={() => setShowSame((s) => !s)}>
              {showSame ? "Hide" : "Show"} {sameRows.length} value{sameRows.length === 1 ? "" : "s"} already on the ticket
            </button>
          )}
          {showSame && (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {sameRows.map((r) => renderRow(r))}
            </ul>
          )}
        </section>
      )}

      {/* MISSING INFORMATION (live) */}
      <section aria-label="Missing information">
        <SectionTitle>Missing Information</SectionTitle>
        {missing.length ? (
          <ul className="flex flex-wrap gap-2" data-testid="missing-list">
            {missing.map((m) => (
              <li key={m.key} className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-1.5 text-sm">
                <ConfidenceBadge kind="missing" />
                <span className="font-medium text-ink">{m.label}</span>
                <span className="text-xs text-faint">{m.because}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-300">Nothing missing for this issue / resolution.</p>
        )}
      </section>

      {/* SUGGESTED ACTIONS */}
      {(proposal.actions.length > 0 || mode === "update") && (
        <section aria-label="Suggested actions">
          <SectionTitle>Suggested Actions</SectionTitle>
          {proposal.actions.length ? (
            <ul className="space-y-2">
              {proposal.actions.map((a) => (
                <li key={a.type} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
                  <Lightbulb className="size-4 text-primary-bright" aria-hidden />
                  <span className="text-sm">
                    <span className="font-semibold">Close Ticket</span> — {a.reason}
                    {a.evidence && <span className="ml-1 font-mono text-xs text-faint">“{a.evidence}”</span>}
                  </span>
                  <Button size="sm" variant="secondary" className="ml-auto" disabled title="The Close Ticket workflow arrives in Phase 3">
                    Close Ticket
                  </Button>
                  <span className="basis-full text-xs text-faint">Suggestion only — nothing is closed. Close Ticket will use the Close Ticket workflow (Phase 3).</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">No actions suggested.</p>
          )}
        </section>
      )}

      {/* Not imported */}
      {proposal.unused.length > 0 && (
        <details className="rounded-xl border border-line px-4 py-2.5 text-sm">
          <summary className="cursor-pointer text-muted">Not imported ({proposal.unused.length}) — recognised but no ticket field</summary>
          <ul className="mt-2 space-y-1">
            {proposal.unused.map((u, i) => (
              <li key={`${u.label}-${i}`} className="text-muted">
                <span className="text-faint">{u.label}:</span> <span className="font-mono">{u.value}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* VIEW ORIGINAL */}
      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowOriginal((s) => !s)}>
          {showOriginal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showOriginal ? "Hide Original" : "View Original"}
        </Button>
        {showOriginal && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-bg/60 p-3 font-mono text-xs text-muted" data-testid="original-text">
            {proposal.original}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        <span className="text-xs text-faint">
          {mode === "new"
            ? "Fills the form only. Nothing is saved until you press Save Ticket."
            : `Applies ${changeCount} field change${changeCount === 1 ? "" : "s"}${noteForApply ? " + the note" : ""} in one step. History is recorded.`}
        </span>
        <Button
          variant="primary"
          className="uppercase tracking-wider"
          loading={applying}
          disabled={applying || (changeCount === 0 && !noteForApply)}
          onClick={() => onApply({ changes, note: noteForApply })}
        >
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}

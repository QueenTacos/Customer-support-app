"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ClipboardPaste, Eraser, FileSearch, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { parseQuickImport, type ParseResult } from "@/lib/import";
import type { TicketFormValues } from "@/lib/validation/ticket";
import type { Lookups } from "@/components/tickets/ticket-fields";
import { ImportReview, type ApplyPayload } from "./import-review";

/**
 * ⚡ Quick Import — paste raw ticket text, review what was found, then fill the
 * New Ticket form. Never saves anything; Save Ticket is still the only save.
 */
export function QuickImportPanel({
  lookups,
  values,
  defaults,
  currentNote,
  onApply,
}: {
  lookups: Lookups;
  values: TicketFormValues;
  defaults: TicketFormValues;
  currentNote: string;
  onApply: (payload: ApplyPayload) => void;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  /** The text behind the most recent import, kept for the whole New Ticket session. */
  const [lastImported, setLastImported] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const importLookups = useMemo(
    () => ({ departments: lookups.departments, materials: lookups.materials, aliases: lookups.aliases ?? [] }),
    [lookups],
  );

  function parse() {
    const raw = text.trim();
    if (!raw) return;
    const r = parseQuickImport(raw, importLookups);
    if (r.fields.length === 0 && !r.note && r.unmatchedMaterials.length === 0) {
      toast.error("Nothing recognisable was found in that text.");
      return;
    }
    setResult(r);
    setLastImported(raw);
    setReviewOpen(true);
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-violet-500/[0.08] to-transparent">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-bright">
            <Zap className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-ink">Quick Import</span>
            <span className="block text-sm text-muted">
              Paste ticket information, line information, or ticket notes and I&apos;ll fill in the matching fields automatically.
            </span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line/70 px-5 pb-5 pt-4">
          <Textarea
            id="quick-import-text"
            aria-label="Text to import"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                parse();
              }
            }}
            placeholder={"Paste one section or several at once — e.g.\n\nTicket ID\n376522\nOrdering User\nGreg Kiel\n…\n\nSW/ Greg / Coro 4m DS - Order Delayed. TKG shows delay…"}
            className="font-mono text-[13px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">Nothing is saved until you press Save Ticket. Ctrl+Enter to parse.</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!text}
                onClick={() => {
                  setText("");
                }}
              >
                <Eraser className="size-3.5" /> Clear
              </Button>
              {result && !reviewOpen && (
                <Button size="sm" variant="secondary" onClick={() => setReviewOpen(true)}>
                  <FileSearch className="size-3.5" /> Last results
                </Button>
              )}
              <Button size="sm" variant="primary" disabled={!text.trim()} onClick={parse}>
                <ClipboardPaste className="size-3.5" /> Parse &amp; Fill
              </Button>
            </div>
          </div>

          {lastImported && (
            <div className="rounded-lg border border-line bg-bg/40">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-muted hover:text-ink"
                onClick={() => setShowOriginal((s) => !s)}
                aria-expanded={showOriginal}
              >
                Original pasted text (kept for this ticket so you can compare)
                <ChevronDown className={cn("size-4 transition-transform", showOriginal && "rotate-180")} aria-hidden />
              </button>
              {showOriginal && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-mono text-xs text-ink/90">
                  {lastImported}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {result && reviewOpen && (
        <ImportReview
          result={result}
          lookups={lookups}
          values={values}
          defaults={defaults}
          currentNote={currentNote}
          onCancel={() => setReviewOpen(false)}
          onApply={(payload) => {
            onApply(payload);
            setReviewOpen(false);
          }}
        />
      )}
    </section>
  );
}

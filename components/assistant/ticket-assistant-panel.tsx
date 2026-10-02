"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Eraser, ScanSearch, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { analyzeTicketText } from "@/lib/actions/assistant";
import type { FieldValues, MissingRule, Proposal } from "@/lib/assistant/types";
import type { TicketFormValues } from "@/lib/validation/ticket";
import type { Lookups } from "@/components/tickets/ticket-fields";
import { AssistantResults, type AssistantApply } from "./assistant-results";

/**
 * ⚡ TICKET ASSISTANT (New Ticket). Paste → Analyze → review → Apply to New Ticket.
 * Fills the wizard form only; Save Ticket is still the only save.
 */
export function TicketAssistantPanel({
  lookups,
  values,
  defaults,
  onApply,
  onUseNote,
}: {
  lookups: Lookups;
  values: TicketFormValues;
  defaults: TicketFormValues;
  onApply: (changes: FieldValues) => void;
  onUseNote: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ proposal: Proposal; rules: MissingRule[]; current: FieldValues; defaults: FieldValues } | null>(null);
  const [run, setRun] = useState(0);
  const [pending, start] = useTransition();

  function analyze() {
    const raw = text.trim();
    if (!raw) return;
    // Send only what Jessica typed (untouched defaults like today's date count as empty).
    const typed: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "string" && v && v !== defaults[k as keyof TicketFormValues]) typed[k] = v;
    }
    start(async () => {
      const r = await analyzeTicketText({ mode: "new", text: raw, formValues: typed });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult({
        proposal: r.proposal,
        rules: r.rules,
        current: values as unknown as FieldValues,
        defaults: defaults as unknown as FieldValues,
      });
      setRun((n) => n + 1);
    });
  }

  function apply(a: AssistantApply) {
    onApply(a.changes);
    setOpen(false);
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-violet-500/[0.08] to-transparent" aria-label="Ticket Assistant">
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
            <span className="block font-bold uppercase tracking-wider text-ink">⚡ Ticket Assistant</span>
            <span className="block text-sm text-muted">
              Paste ticket information, line items, order totals, notes or free text — in any order.
            </span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line/70 px-5 pb-5 pt-4">
          <Textarea
            id="assistant-text"
            aria-label="Text for the Ticket Assistant"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                analyze();
              }
            }}
            placeholder={"e.g.\nTicket ID\n376522\nOrdering User\nGreg Kiel\n…\nSW/ Greg / Coro 4m DS - Order Delayed. TKG shows delay…"}
            className="font-mono text-[13px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">Nothing is saved from here. Ctrl+Enter to analyze.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={!text} onClick={() => setText("")}>
                <Eraser className="size-3.5" /> Clear
              </Button>
              <Button size="sm" variant="primary" disabled={!text.trim() || pending} loading={pending} onClick={analyze} className="uppercase tracking-wider">
                <ScanSearch className="size-3.5" /> Analyze
              </Button>
            </div>
          </div>

          {result && (
            <AssistantResults
              key={run}
              proposal={result.proposal}
              rules={result.rules}
              lookups={lookups}
              current={result.current}
              defaults={result.defaults}
              applyLabel="Apply to New Ticket"
              onApply={apply}
              onUseNote={onUseNote}
            />
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Eraser, ScanSearch, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";
import { analyzeTicketText, applyTicketUpdate } from "@/lib/actions/assistant";
import type { FieldValues, MissingRule, Proposal } from "@/lib/assistant/types";
import type { Lookups } from "@/components/tickets/ticket-fields";
import { AssistantResults, type AssistantApply } from "./assistant-results";

/**
 * ⚡ QUICK UPDATE (Ticket Details). Paste an update → Analyze Update → review
 * from → to changes + note → Apply Update (one atomic write, history recorded).
 */
export function QuickUpdatePanel({ ticketId, lookups }: { ticketId: string; lookups: Lookups }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ proposal: Proposal; rules: MissingRule[]; current: FieldValues; updatedAt: string } | null>(null);
  const [run, setRun] = useState(0);
  const [analyzing, startAnalyze] = useTransition();
  const [applying, startApply] = useTransition();

  function analyze() {
    const raw = text.trim();
    if (!raw) return;
    startAnalyze(async () => {
      const r = await analyzeTicketText({ mode: "update", text: raw, ticketId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult({ proposal: r.proposal, rules: r.rules, current: r.current, updatedAt: r.updatedAt ?? "" });
      setRun((n) => n + 1);
    });
  }

  function apply(a: AssistantApply) {
    if (!result) return;
    startApply(async () => {
      const r = await applyTicketUpdate({
        ticketId,
        changes: a.changes as Record<string, string>,
        note: a.note,
        expectedUpdatedAt: result.updatedAt,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Update applied: ${r.changed} field${r.changed === 1 ? "" : "s"}${r.noteAdded ? " + note" : ""}.`,
      );
      setResult(null);
      setText("");
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-violet-500/[0.08] to-transparent" aria-label="Quick Update">
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
            <span className="block font-bold uppercase tracking-wider text-ink">⚡ Quick Update</span>
            <span className="block text-sm text-muted">Paste a customer, FedEx or internal update — only new or changed information is proposed.</span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line/70 px-5 pb-5 pt-4">
          <Textarea
            id="quick-update-text"
            aria-label="Update text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                analyze();
              }
            }}
            placeholder={"e.g.\nFedEx says delivery tomorrow\nTKG 877732421485\nshipping 15.48"}
            className="font-mono text-[13px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">Nothing changes until you click Apply Update.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={!text} onClick={() => setText("")}>
                <Eraser className="size-3.5" /> Clear
              </Button>
              <Button size="sm" variant="primary" disabled={!text.trim() || analyzing} loading={analyzing} onClick={analyze} className="uppercase tracking-wider">
                <ScanSearch className="size-3.5" /> Analyze Update
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
              defaults={null}
              applyLabel="Apply Update"
              applying={applying}
              onApply={apply}
            />
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FAULT_LABELS, FAULTS, ISSUE_LABELS, ISSUES, STATUS_META, STATUSES } from "@/lib/domain/options";
import type { TicketListParams } from "@/lib/data/tickets";
import type { Department, Material } from "@/types/domain";

export function TicketFilters({
  params,
  lookups,
}: {
  params: TicketListParams;
  lookups: { departments: Department[]; materials: Material[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.q);
  const first = useRef(true);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  }

  // Debounced search-as-you-type.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update({ q: q.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered =
    params.status || params.issue || params.fault || params.department || params.material || params.fu || params.q;

  const materials = lookups.materials.filter((m) => !params.department || m.department_id === params.department);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticket #, order #, customer, contact, tracking #, FedEx case…"
            className="pl-9"
            aria-label="Search tickets"
          />
          {pending && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />}
        </div>
        <Select
          aria-label="Show"
          className="w-auto"
          value={params.view}
          onChange={(e) => update({ view: e.target.value === "active" ? "" : e.target.value, tab: "" })}
        >
          <option value="active">Active tickets</option>
          <option value="closed">Closed tickets</option>
          <option value="all">All tickets</option>
        </Select>
        <Select aria-label="Sort" className="w-auto" value={params.sort} onChange={(e) => update({ sort: e.target.value === "priority" ? "" : e.target.value })}>
          <option value="priority">Sort: Follow-up, then oldest</option>
          <option value="oldest">Sort: Oldest opened</option>
          <option value="newest">Sort: Newest created</option>
          <option value="updated">Sort: Recently updated</option>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Select aria-label="Status" value={params.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Issue" value={params.issue} onChange={(e) => update({ issue: e.target.value })}>
          <option value="">Any issue</option>
          {ISSUES.map((i) => (
            <option key={i} value={i}>
              {ISSUE_LABELS[i]}
            </option>
          ))}
        </Select>
        <Select aria-label="Fault" value={params.fault} onChange={(e) => update({ fault: e.target.value })}>
          <option value="">Any fault</option>
          {FAULTS.map((f) => (
            <option key={f} value={f}>
              {FAULT_LABELS[f]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Department"
          value={params.department}
          onChange={(e) => update({ department: e.target.value, material: "" })}
        >
          <option value="">Any department</option>
          {lookups.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code}
            </option>
          ))}
        </Select>
        <Select aria-label="Material" value={params.material} onChange={(e) => update({ material: e.target.value })}>
          <option value="">Any material</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Follow-up date" value={params.fu} onChange={(e) => update({ fu: e.target.value })}>
          <option value="">Any follow-up date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="due">Today or earlier</option>
          <option value="week">Next 7 days</option>
          <option value="none">No follow-up date</option>
        </Select>
      </div>

      {filtered && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname + (params.tab !== "all" ? `?tab=${params.tab}` : "")));
          }}
        >
          <X className="size-3.5" /> Clear filters
        </Button>
      )}
    </div>
  );
}

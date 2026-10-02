"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";

/**
 * Top-bar search. Enter opens Active Tickets filtered by the text, including
 * closed tickets (partial match on ticket #, order #, customer, contact, tracking #).
 * Press "/" anywhere to focus it.
 */
export function GlobalSearch() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/tickets?q=${encodeURIComponent(term)}&view=all`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ticket #, order #, customer, contact, tracking…"
        aria-label="Search tickets"
        className={cn(inputClass, "h-10 bg-surface pl-9 pr-10")}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-faint sm:block">
        /
      </kbd>
    </form>
  );
}

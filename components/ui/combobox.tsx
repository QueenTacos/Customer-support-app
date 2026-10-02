"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "./form";

export interface ComboOption {
  value: string;
  label: string;
  group?: string;
  inactive?: boolean;
  /** Extra search terms (e.g. material aliases). */
  keywords?: string;
}

/**
 * Searchable dropdown for long lists (e.g. materials).
 * Type to filter · ↑/↓ to move · Enter to pick · Esc to close.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Search…",
  invalid,
  emptyText = "No matches",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  invalid?: boolean;
  emptyText?: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q) || o.keywords?.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className={cn(inputClass, "h-10 pr-16")}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              className="rounded p-1 text-faint hover:text-ink"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear selection"
            >
              <X className="size-3.5" />
            </button>
          )}
          <ChevronDown className="size-4 text-faint" aria-hidden />
        </div>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line-strong bg-surface-2 py-1 shadow-2xl"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-faint">{emptyText}</li>}
          {filtered.map((o, i) => {
            const header = o.group && o.group !== filtered[i - 1]?.group;
            return (
              <li key={o.value} role="presentation">
                {header && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {o.group}
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm",
                    i === active ? "bg-primary-soft text-ink" : "text-ink/90",
                    o.inactive && "text-faint",
                  )}
                >
                  <span>
                    {o.label}
                    {o.inactive && <span className="ml-2 text-xs">(inactive)</span>}
                  </span>
                  {o.value === value && <Check className="size-4 text-primary-bright" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

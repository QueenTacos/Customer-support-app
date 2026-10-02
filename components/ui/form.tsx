"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const inputClass =
  "w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-faint " +
  "transition-colors hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 " +
  "focus:ring-primary/30 disabled:opacity-60 aria-[invalid=true]:border-red-500/70";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-muted">
        {label}
        {required && <span className="ml-0.5 text-primary-bright">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, "h-10", className)} aria-invalid={invalid || undefined} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputClass, "min-h-24 py-2 leading-relaxed", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(inputClass, "h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239aa0b8'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")",
      }}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
});

/** Yes / No / (unanswered) segmented control. Keyboard: Tab to focus, arrows/space to pick. */
export function YesNo({
  value,
  onChange,
  name,
  invalid,
  label,
}: {
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no" | "") => void;
  name: string;
  invalid?: boolean;
  label?: string;
}) {
  const opts: { v: "yes" | "no"; label: string }[] = [
    { v: "yes", label: "Yes" },
    { v: "no", label: "No" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-fit overflow-hidden rounded-lg border border-line bg-surface-2",
        invalid && "border-red-500/70",
      )}
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            onClick={() => onChange(active ? "" : o.v)}
            className={cn(
              "min-w-16 px-4 text-sm font-medium transition-colors",
              active
                ? o.v === "yes"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-red-500/20 text-red-200"
                : "text-muted hover:bg-surface-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="border-l border-line px-2.5 text-xs text-faint hover:text-ink"
          title="Clear answer"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-2 p-3 hover:border-line-strong">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-violet-500"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

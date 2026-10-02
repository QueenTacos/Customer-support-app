import { cn } from "@/lib/utils/cn";

export interface DetailItem {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}

export function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.wide && "sm:col-span-2 lg:col-span-3")}>
          <dt className="text-xs font-medium tracking-wide text-faint">{it.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{isEmpty(it.value) ? <span className="text-faint">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function isEmpty(v: React.ReactNode) {
  return v === null || v === undefined || v === "" || v === false;
}

export function yesNoText(v: boolean | null | undefined | "yes" | "no" | ""): string {
  if (v === true || v === "yes") return "Yes";
  if (v === false || v === "no") return "No";
  return "";
}

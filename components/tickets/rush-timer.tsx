"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatElapsed } from "@/lib/utils/dates";

/**
 * Live elapsed timer for Rush Reprints. Turns into an urgent, pulsing
 * "OVERDUE" state once `overdueMinutes` (default 30) have passed.
 */
export function RushTimer({
  startedAt,
  overdueMinutes = 30,
  size = "sm",
  className,
}: {
  startedAt: string;
  overdueMinutes?: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the clock on mount (avoids SSR/client mismatch)
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = now === null ? 0 : now - start;
  const overdue = now !== null && elapsed >= overdueMinutes * 60_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-mono font-semibold tabular-nums ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        overdue
          ? "rush-pulse bg-red-500 text-white ring-red-400"
          : "bg-red-500/15 text-red-300 ring-red-500/40",
        className,
      )}
      title={`Rush started ${new Date(startedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}`}
      suppressHydrationWarning
    >
      <Zap className={size === "sm" ? "size-3" : "size-4"} aria-hidden />
      {now === null ? "--:--" : formatElapsed(elapsed)}
      {overdue && <span className="font-sans text-[10px] uppercase tracking-wider">Overdue</span>}
    </span>
  );
}

import { AlertTriangle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { followUpLabel, followUpState, formatDate } from "@/lib/utils/dates";

/** Follow-up date with urgency styling: overdue = red, today = amber, upcoming = muted. */
export function FollowUpCell({ date, today, active = true }: { date: string | null; today: string; active?: boolean }) {
  if (!date) return <span className="text-faint">—</span>;
  const state = active ? followUpState(date, today) : "upcoming";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-sm",
        state === "overdue" && "font-semibold text-red-400",
        state === "today" && "font-medium text-amber-300",
        state === "upcoming" && "text-muted",
      )}
      title={formatDate(date)}
    >
      {state === "overdue" ? (
        <AlertTriangle className="size-3.5" aria-hidden />
      ) : (
        <CalendarClock className="size-3.5" aria-hidden />
      )}
      {active ? followUpLabel(date, today) : formatDate(date)}
      {active && state !== "today" && <span className="text-xs font-normal text-faint">{formatDate(date)}</span>}
    </span>
  );
}

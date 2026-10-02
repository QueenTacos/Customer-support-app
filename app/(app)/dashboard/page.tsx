import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CalendarClock,
  Gauge,
  PlusCircle,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Tag,
  Ticket,
  Truck,
  UserRound,
  Zap,
} from "lucide-react";
import { getDashboardCounts, getPriorities } from "@/lib/data/dashboard";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/tickets/status-badge";
import { RushTimer } from "@/components/tickets/rush-timer";
import { FollowUpCell } from "@/components/tickets/follow-up-cell";
import { ISSUE_LABELS } from "@/lib/domain/options";
import { BUCKET_LABELS, type PriorityBucket } from "@/lib/domain/priorities";
import { todayISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { AutoRefresh } from "@/components/layout/auto-refresh";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [counts, priorities] = await Promise.all([getDashboardCounts(), getPriorities(25)]);
  const today = todayISO();
  const longDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const cards = [
    { label: "Active Tickets", value: counts.active, icon: Ticket, href: "/tickets", tone: "violet" },
    {
      label: "Follow-Ups",
      value: counts.followUps,
      icon: CalendarClock,
      href: "/tickets?tab=followups",
      tone: counts.followUpsOverdue > 0 ? "red" : "violet",
      sub: counts.followUpsOverdue > 0 ? `${counts.followUpsOverdue} overdue` : "Due today or earlier",
    },
    { label: "Waiting on Photos", value: counts.waitingPhotos, icon: Camera, href: "/tickets?tab=photos", tone: "amber" },
    { label: "Waiting on Customer", value: counts.waitingCustomer, icon: UserRound, href: "/tickets?tab=customer", tone: "sky" },
    { label: "FedEx Investigations", value: counts.fedex, icon: Truck, href: "/tickets?tab=fedex", tone: "blue" },
    { label: "Rush Reprints", value: counts.rush, icon: Zap, href: "/tickets?tab=rush", tone: "red", urgent: counts.rush > 0 },
  ] as const;

  const tones: Record<string, string> = {
    violet: "text-violet-300 bg-violet-500/15",
    amber: "text-amber-300 bg-amber-500/15",
    sky: "text-sky-300 bg-sky-500/15",
    blue: "text-blue-300 bg-blue-500/15",
    red: "text-red-300 bg-red-500/15",
  };

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title="Dashboard" subtitle={<>Here&apos;s what&apos;s happening today. <span className="text-faint">· {longDate}</span></>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon;
          const urgent = "urgent" in c && c.urgent;
          return (
            <Link
              key={c.label}
              href={c.href}
              className={cn(
                "group rounded-2xl border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong",
                urgent ? "border-red-500/50 bg-red-500/[0.06]" : "border-line",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted group-hover:text-ink">{c.label}</span>
                <span className={cn("grid size-8 place-items-center rounded-lg", tones[c.tone])}>
                  <Icon className="size-4" aria-hidden />
                </span>
              </div>
              <div className={cn("mt-3 text-3xl font-semibold tabular-nums", urgent && "text-red-300")}>{c.value}</div>
              {"sub" in c && c.sub && (
                <div className={cn("mt-1 text-xs", counts.followUpsOverdue > 0 ? "font-medium text-red-400" : "text-faint")}>
                  {c.sub}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader
            title="Today's Priorities"
            description="Overdue rush → overdue follow-ups → rush → due today → other active"
            actions={
              <Link href="/tickets" className="text-sm text-primary-bright hover:underline">
                View all ({priorities.total})
              </Link>
            }
          />
          {priorities.rows.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-8" />}
              title="No active tickets"
              description="New tickets will show up here, ordered by what needs attention first."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-3 font-medium">Ticket #</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">Issue</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Follow-Up</th>
                  </tr>
                </thead>
                <tbody>
                  {priorities.rows.map((t) => (
                    <PriorityRow key={t.id} t={t} today={today} rushMinutes={priorities.rushOverdueMinutes} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Quick Actions" />
          <div className="space-y-2 p-4">
            <Link
              href="/tickets/new"
              className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-medium text-white shadow-[var(--shadow-glow)] hover:from-violet-500 hover:to-fuchsia-500"
            >
              <PlusCircle className="size-5" /> New Ticket
            </Link>
            {[
              { label: "Create Reprint Request", icon: RotateCcw },
              { label: "Create Refund Request", icon: Receipt },
              { label: "Create Discount Request", icon: Tag },
              { label: "Add to LIMITS", icon: Gauge },
              { label: "Add to Claims", icon: ShieldAlert },
            ].map((a) => (
              <div
                key={a.label}
                aria-disabled
                title="Arrives in Phase 3"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-sm text-faint"
              >
                <a.icon className="size-4" aria-hidden />
                <span className="flex-1">{a.label}</span>
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Phase 3</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function PriorityRow({
  t,
  today,
  rushMinutes,
}: {
  t: Awaited<ReturnType<typeof getPriorities>>["rows"][number];
  today: string;
  rushMinutes: number;
}) {
  const rowTone: Record<PriorityBucket, string> = {
    rush_overdue: "bg-red-500/[0.10] hover:bg-red-500/[0.16] border-l-2 border-l-red-500",
    followup_overdue: "bg-red-500/[0.04] hover:bg-red-500/[0.08] border-l-2 border-l-red-500/60",
    rush: "bg-red-500/[0.05] hover:bg-red-500/[0.10] border-l-2 border-l-red-400/70",
    followup_today: "hover:bg-surface-2 border-l-2 border-l-amber-400/70",
    attention: "hover:bg-surface-2 border-l-2 border-l-transparent",
  };
  return (
    <tr className={cn("border-b border-line/70 last:border-0", rowTone[t.bucket])}>
      <td className="px-5 py-3">
        <Link href={`/tickets/${t.id}`} className="whitespace-nowrap font-mono font-medium text-primary-bright hover:underline">
          {t.ticket_number}
        </Link>
        {(t.bucket === "rush_overdue" || t.bucket === "followup_overdue") && (
          <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-red-400">
            <AlertTriangle className="size-3" /> {BUCKET_LABELS[t.bucket]}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="max-w-56 truncate">{t.customer_name}</div>
        {t.contact_name && <div className="max-w-56 truncate text-xs text-faint">{t.contact_name}</div>}
      </td>
      <td className="px-3 py-3 text-muted">{ISSUE_LABELS[t.issue]}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
          {t.status === "rush_reprint" && t.rush_started_at && (
            <RushTimer startedAt={t.rush_started_at} overdueMinutes={rushMinutes} />
          )}
        </div>
      </td>
      <td className="px-5 py-3">
        <FollowUpCell date={t.follow_up_date} today={today} />
      </td>
    </tr>
  );
}

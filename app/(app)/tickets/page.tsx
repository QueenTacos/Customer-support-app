import type { Metadata } from "next";
import Link from "next/link";
import { PlusCircle, SearchX } from "lucide-react";
import { listTickets, parseListParams, PAGE_SIZE, type TicketListParams } from "@/lib/data/tickets";
import { getLookups } from "@/lib/data/lookups";
import { getDashboardCounts } from "@/lib/data/dashboard";
import { getSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/tickets/status-badge";
import { RushTimer } from "@/components/tickets/rush-timer";
import { FollowUpCell } from "@/components/tickets/follow-up-cell";
import { TicketFilters } from "./ticket-filters";
import { ISSUE_LABELS } from "@/lib/domain/options";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Active Tickets" };

function hrefWith(p: TicketListParams, changes: Partial<TicketListParams>) {
  const merged = { ...p, ...changes };
  const sp = new URLSearchParams();
  const defaults: Partial<Record<keyof TicketListParams, unknown>> = { view: "active", tab: "all", sort: "priority", page: 1 };
  for (const [k, v] of Object.entries(merged)) {
    if (v === "" || v === undefined || defaults[k as keyof TicketListParams] === v) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}

export default async function TicketsPage(props: PageProps<"/tickets">) {
  const params = parseListParams(await props.searchParams);
  const [{ rows, total }, lookups, counts, settings] = await Promise.all([
    listTickets(params),
    getLookups(),
    getDashboardCounts(),
    getSettings(),
  ]);
  const today = todayISO();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { key: "all", label: "All", count: undefined },
    { key: "followups", label: "Follow-Ups", count: counts.followUps, urgent: counts.followUpsOverdue > 0 },
    { key: "photos", label: "Photos", count: counts.waitingPhotos },
    { key: "customer", label: "Customer", count: counts.waitingCustomer },
    { key: "fedex", label: "FedEx", count: counts.fedex },
    { key: "rush", label: "Rush", count: counts.rush, urgent: counts.rush > 0 },
  ] as const;

  const title = params.view === "closed" && params.tab === "all" ? "Closed Tickets" : params.view === "all" && params.tab === "all" ? "All Tickets" : "Active Tickets";

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${total} ticket${total === 1 ? "" : "s"}${params.q ? ` matching “${params.q}”` : ""}`}
        actions={
          <ButtonLink href="/tickets/new" variant="primary">
            <PlusCircle className="size-4" /> New Ticket
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = params.tab === t.key;
          return (
            <Link
              key={t.key}
              href={hrefWith(params, { tab: t.key, page: 1, view: t.key === "all" ? params.view : "active" })}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors",
                active ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    "urgent" in t && t.urgent ? "bg-red-500/20 text-red-300" : "bg-surface-3 text-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <TicketFilters params={params} lookups={lookups} />

      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-8" />}
            title="No tickets match"
            description={params.q ? "Try part of the number or name, or search all tickets including closed." : "Try clearing some filters."}
            action={
              params.q && params.view !== "all" ? (
                <ButtonLink href={hrefWith(params, { view: "all", tab: "all", page: 1 })} size="sm">
                  Search closed tickets too
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/40 text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Ticket #</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Order #</th>
                  <th className="px-3 py-3 font-medium">Issue</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Follow-Up</th>
                  <th className="px-5 py-3 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const rush = t.status === "rush_reprint";
                  const overdue = t.status !== "closed" && !!t.follow_up_date && t.follow_up_date < today;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "relative border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2",
                        rush && "bg-red-500/[0.07]",
                        overdue && !rush && "bg-red-500/[0.03]",
                      )}
                    >
                      <td className="px-5 py-3">
                        {/* The whole row is clickable via this stretched link. */}
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-mono font-medium text-primary-bright after:absolute after:inset-0 hover:underline"
                        >
                          {t.ticket_number}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <div className="max-w-60 truncate">{t.customer_name}</div>
                        {t.contact_name && <div className="max-w-60 truncate text-xs text-faint">{t.contact_name}</div>}
                      </td>
                      <td className="px-3 py-3 font-mono text-muted">{t.order_number ?? "—"}</td>
                      <td className="px-3 py-3 text-muted">{ISSUE_LABELS[t.issue]}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={t.status} />
                          {rush && t.rush_started_at && (
                            <RushTimer startedAt={t.rush_started_at} overdueMinutes={settings.rush_overdue_minutes} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <FollowUpCell date={t.follow_up_date} today={today} active={t.status !== "closed"} />
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDate(t.date_opened)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {params.page} of {pages}
          </span>
          <div className="flex gap-2">
            {params.page > 1 && (
              <ButtonLink size="sm" href={hrefWith(params, { page: params.page - 1 })}>
                Previous
              </ButtonLink>
            )}
            {params.page < pages && (
              <ButtonLink size="sm" href={hrefWith(params, { page: params.page + 1 })}>
                Next
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </>
  );
}

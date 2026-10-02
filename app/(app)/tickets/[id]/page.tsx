import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  Gauge,
  MessageSquarePlus,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import { getRelatedTickets, getRushPeriods, getTicket, getTicketEvents } from "@/lib/data/tickets";
import { getNotes } from "@/lib/data/notes";
import { getLookups } from "@/lib/data/lookups";
import { getSettings } from "@/lib/data/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/tickets/status-badge";
import { RushTimer } from "@/components/tickets/rush-timer";
import { FollowUpCell } from "@/components/tickets/follow-up-cell";
import { DetailList, yesNoText } from "@/components/tickets/detail-list";
import { HistoryList } from "@/components/tickets/history-list";
import { QuickUpdate } from "@/components/tickets/quick-update";
import { AddNoteForm, NotesPanel } from "@/components/notes/notes-panel";
import { questionsFor } from "@/lib/domain/conditional-questions";
import { FAULT_LABELS, ISSUE_LABELS, POC_LABELS, RESOLUTION_LABELS, label } from "@/lib/domain/options";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const TABS = ["details", "notes", "photos", "tracking", "related", "history"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata(props: PageProps<"/tickets/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await getTicket(id);
  return { title: t ? `Ticket #${t.ticket_number}` : "Ticket" };
}

export default async function TicketPage(props: PageProps<"/tickets/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "details";

  const ticket = await getTicket(id);
  if (!ticket) notFound();

  const [notes, settings, lookups] = await Promise.all([getNotes(ticket.id), getSettings(), getLookups()]);
  const today = todayISO();
  const active = ticket.status !== "closed";
  const contactLabel = ticket.contact_name || "Contact";
  const notePlaceholder = `${ticket.point_of_contact}/ ${contactLabel} - `;

  const tabHref = (t: Tab) => (t === "details" ? `/tickets/${ticket.id}` : `/tickets/${ticket.id}?tab=${t}`);
  const counts: Partial<Record<Tab, number>> = { notes: notes.length };

  return (
    <>
      <Link href="/tickets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Active Tickets
      </Link>

      {/* Header */}
      <div
        className={cn(
          "mb-6 rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)]",
          ticket.status === "rush_reprint" ? "border-red-500/60 bg-red-500/[0.06]" : "border-line",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">Ticket #{ticket.ticket_number}</h1>
              <StatusBadge status={ticket.status} />
              {ticket.status === "rush_reprint" && ticket.rush_started_at && (
                <RushTimer startedAt={ticket.rush_started_at} overdueMinutes={settings.rush_overdue_minutes} size="lg" />
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted">
              <span className="text-ink">{ticket.customer_name}</span>
              {ticket.contact_name && <> · {ticket.contact_name}</>}
              {ticket.order_number && (
                <>
                  {" "}
                  · Order <span className="font-mono">{ticket.order_number}</span>
                </>
              )}
              {" · "}
              {ISSUE_LABELS[ticket.issue]}
            </p>
            <p className="mt-1 text-xs text-faint">
              Opened {formatDate(ticket.date_opened)} · Last updated {formatDateTime(ticket.updated_at)}
              {ticket.closed_at && <> · Closed {formatDateTime(ticket.closed_at)}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/tickets/${ticket.id}/edit`} variant="primary">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
            <ButtonLink href={`/tickets/${ticket.id}?tab=notes&new=1`}>
              <MessageSquarePlus className="size-4" /> Add Note
            </ButtonLink>
            <Button disabled title="Photos arrive right after the milestone">
              <Camera className="size-4" /> Add Photo
            </Button>
            <Button disabled title="LIMITS workflow arrives in Phase 3">
              <Gauge className="size-4" /> Add to LIMITS
            </Button>
            <Button disabled title="Claims workflow arrives in Phase 3">
              <ShieldAlert className="size-4" /> Add to Claims
            </Button>
            <Button disabled title="Close workflow arrives in Phase 3">
              <CheckCircle2 className="size-4" /> Close Ticket
            </Button>
          </div>
        </div>

        {(ticket.fault === "fedex_error" || ticket.add_to_limits || ticket.add_to_claims) && active && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ticket.fault === "fedex_error" && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-sm text-blue-100">
                <ShieldAlert className="size-4" /> FedEx Error — this ticket may need to be added to Claims.
              </span>
            )}
            {ticket.add_to_limits && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100">
                <AlertTriangle className="size-4" /> Flagged: needs LIMITS entry
              </span>
            )}
            {ticket.add_to_claims && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100">
                <AlertTriangle className="size-4" /> Flagged: needs Claims entry
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* Tabs */}
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Ticket sections">
            {TABS.map((t) => (
              <Link
                key={t}
                href={tabHref(t)}
                scroll={false}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm capitalize transition-colors",
                  tab === t ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t}
                {counts[t] !== undefined && counts[t]! > 0 && (
                  <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular-nums text-muted">{counts[t]}</span>
                )}
              </Link>
            ))}
          </nav>

          {tab === "details" && <DetailsTab ticket={ticket} />}
          {tab === "notes" && (
            <NotesPanel ticketId={ticket.id} notes={notes} placeholder={notePlaceholder} focusNew={sp.new === "1"} />
          )}
          {tab === "photos" && (
            <Card>
              <EmptyState
                icon={<Camera className="size-8" />}
                title="Photos arrive right after this milestone"
                description="Storage is already set up privately for this ticket. Upload, preview, download and delete will appear here."
              />
            </Card>
          )}
          {tab === "tracking" && <TrackingTab ticket={ticket} />}
          {tab === "related" && <RelatedTab ticket={ticket} today={today} />}
          {tab === "history" && <HistoryTab ticketId={ticket.id} lookups={lookups} />}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Follow-up" description={<FollowUpCell date={ticket.follow_up_date} today={today} active={active} />} />
            <div className="p-5">
              <QuickUpdate ticketId={ticket.id} status={ticket.status} followUpDate={ticket.follow_up_date} today={today} />
            </div>
          </Card>
          {tab !== "notes" && (
            <Card>
              <CardHeader
                title="Quick note"
                actions={
                  <Link href={tabHref("notes")} className="text-xs text-primary-bright hover:underline">
                    All notes ({notes.length})
                  </Link>
                }
              />
              <div className="p-5">
                <AddNoteForm ticketId={ticket.id} placeholder={notePlaceholder} compact />
                {notes[0] && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-xs text-faint">Latest · {formatDateTime(notes[0].created_at)}</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{notes[0].note_text}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

type T = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

function DetailsTab({ ticket: t }: { ticket: T }) {
  const m = (v: number | null) => (v === null ? "" : formatMoney(v));
  const issueAnswers = questionsFor(t.issue)
    .filter((q) => q.field !== "tracking_number")
    .map((q) => {
      const v = t[q.field as keyof T];
      return {
        label: q.label,
        value:
          q.kind === "yesno"
            ? yesNoText(v as boolean | null)
            : q.kind === "date"
              ? v
                ? formatDate(v as string)
                : ""
              : v === null
                ? ""
                : String(v),
      };
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Customer & Order" />
        <div className="p-5">
          <DetailList
            items={[
              { label: "Customer", value: t.customer_name },
              { label: "Contact", value: t.contact_name },
              { label: "Point of Contact", value: POC_LABELS[t.point_of_contact] },
              { label: "Order Number", value: t.order_number && <span className="font-mono">{t.order_number}</span> },
              { label: "Department", value: t.department?.code },
              { label: "Material", value: t.material?.name },
              { label: "Material Type", value: t.material_type },
              { label: "Size", value: t.size },
              { label: "Quantity", value: t.quantity },
              { label: "Sq/Ft", value: t.sqft },
              { label: "Sheets", value: t.sheets },
              { label: "Order Value", value: m(t.order_value) },
              { label: "Shipping Cost", value: m(t.shipping_cost) },
              { label: "Tracking Number", value: t.tracking_number && <span className="font-mono">{t.tracking_number}</span> },
              { label: "Assigned To", value: t.assigned_to },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Issue" />
        <div className="p-5">
          <DetailList
            items={[
              { label: "Issue", value: ISSUE_LABELS[t.issue] },
              {
                label: "Fault",
                value: t.fault ? (
                  <>
                    {FAULT_LABELS[t.fault]}
                    {t.fault_suggested && t.fault_suggested !== t.fault && (
                      <span className="ml-2 text-xs text-faint">(suggested: {FAULT_LABELS[t.fault_suggested]})</span>
                    )}
                  </>
                ) : t.fault_suggested ? (
                  <span className="text-muted">Not set (suggested: {FAULT_LABELS[t.fault_suggested]})</span>
                ) : (
                  ""
                ),
              },
              { label: "In-Hands Date", value: t.in_hands_date ? formatDate(t.in_hands_date) : "" },
              { label: "Description", value: t.issue_summary && <span className="whitespace-pre-wrap">{t.issue_summary}</span>, wide: true },
              ...issueAnswers,
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Resolution" />
        <div className="p-5">
          <DetailList
            items={[
              { label: "Resolution Type", value: label(RESOLUTION_LABELS, t.resolution_type, "") },
              { label: "Reprint Order", value: t.reprint_order_number && <span className="font-mono">{t.reprint_order_number}</span> },
              { label: "Reprint Value", value: m(t.reprint_value) },
              { label: "Refund Value", value: m(t.refund_value) },
              { label: "Discount Value", value: m(t.discount_value) },
              { label: "Credit Value", value: m(t.credit_value) },
              { label: "Resolution", value: t.resolution && <span className="whitespace-pre-wrap">{t.resolution}</span>, wide: true },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Workflow" />
        <div className="p-5">
          <DetailList
            items={[
              { label: "LIMITS status", value: t.add_to_limits ? "Flagged — entry not started (Phase 3)" : "Not flagged" },
              { label: "Claims status", value: t.add_to_claims ? "Flagged — entry not started (Phase 3)" : "Not flagged" },
              { label: "Status changed", value: formatDateTime(t.status_changed_at) },
              { label: "Date Opened", value: formatDate(t.date_opened) },
              { label: "Date Closed", value: t.closed_at ? formatDateTime(t.closed_at) : "" },
              { label: "Created", value: formatDateTime(t.created_at) },
              { label: "Last Updated", value: formatDateTime(t.updated_at) },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

async function TrackingTab({ ticket: t }: { ticket: T }) {
  const periods = await getRushPeriods(t.id);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Shipping & Tracking" />
        <div className="p-5">
          <DetailList
            items={[
              {
                label: "Tracking Number",
                value: t.tracking_number && (
                  <a
                    href={`https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t.tracking_number)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-primary-bright hover:underline"
                  >
                    {t.tracking_number} <ExternalLink className="size-3.5" />
                  </a>
                ),
              },
              { label: "Shipping Cost", value: t.shipping_cost === null ? "" : formatMoney(t.shipping_cost) },
              { label: "Delivered", value: yesNoText(t.delivered) },
              { label: "All Boxes Received", value: yesNoText(t.all_boxes_received) },
              { label: "Package Damaged", value: yesNoText(t.package_damaged) },
              { label: "FedEx Investigation Opened", value: yesNoText(t.fedex_investigation_opened) },
              { label: "FedEx / Carrier Responsible", value: yesNoText(t.carrier_responsible) },
              { label: "In-Hands Date", value: t.in_hands_date ? formatDate(t.in_hands_date) : "" },
            ]}
          />
        </div>
      </Card>
      {periods.length > 0 && (
        <Card>
          <CardHeader title="Rush Reprint periods" />
          <ul className="divide-y divide-line">
            {periods.map((p) => {
              const mins = p.ended_at ? Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 60000) : null;
              return (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                  <span>Started {formatDateTime(p.started_at)}</span>
                  <span className="text-muted">
                    {p.ended_at ? `Ended ${formatDateTime(p.ended_at)} · ${mins} min` : <span className="font-medium text-red-300">In progress</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function RelatedTab({ ticket, today }: { ticket: T; today: string }) {
  const related = await getRelatedTickets(ticket);
  return (
    <Card>
      <CardHeader title="Related tickets" description="Same order number or same customer" />
      {related.length === 0 ? (
        <EmptyState title="No related tickets" />
      ) : (
        <ul className="divide-y divide-line">
          {related.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/tickets/${r.id}`} className="font-mono font-medium text-primary-bright hover:underline">
                  #{r.ticket_number}
                </Link>
                <span className="ml-2 text-muted">
                  {r.customer_name}
                  {r.order_number && <> · Order {r.order_number}</>} · {ISSUE_LABELS[r.issue]} · opened {formatDate(r.date_opened)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <FollowUpCell date={r.follow_up_date} today={today} active={r.status !== "closed"} />
                <StatusBadge status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function HistoryTab({ ticketId, lookups }: { ticketId: string; lookups: Awaited<ReturnType<typeof getLookups>> }) {
  const events = await getTicketEvents(ticketId);
  const names = {
    departments: Object.fromEntries(lookups.departments.map((d) => [d.id, d.code])),
    materials: Object.fromEntries(lookups.materials.map((m) => [m.id, m.name])),
  };
  return (
    <Card className="p-5 pl-8">
      <HistoryList events={events} names={names} />
    </Card>
  );
}

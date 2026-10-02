import "server-only";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { addDaysISO, todayISO } from "@/lib/utils/dates";
import { FAULTS, ISSUES, STATUSES } from "@/lib/domain/options";
import type { RushPeriod, Ticket, TicketEvent, TicketWithLookups } from "@/types/domain";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

const WITH_LOOKUPS = "*, department:departments(id, code, name), material:materials(id, name, is_rigid)";

export async function getTicket(id: string): Promise<TicketWithLookups | null> {
  await requireSession();
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("tickets").select(WITH_LOOKUPS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TicketWithLookups | null;
}

export async function findTicketIdByNumber(ticketNumber: string, excludeId?: string): Promise<string | null> {
  await requireSession();
  const num = ticketNumber.trim();
  if (!num) return null;
  // Case-insensitive exact match (mirrors the unique index on lower(ticket_number)).
  const escaped = num.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  let q = db().from("tickets").select("id").ilike("ticket_number", escaped).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

/* ------------------------------------------------------------------------- *
 * Active Tickets list
 * ------------------------------------------------------------------------- */

export const TABS = ["all", "followups", "photos", "customer", "fedex", "rush"] as const;
export type Tab = (typeof TABS)[number];
export const VIEWS = ["active", "closed", "all"] as const;
export type View = (typeof VIEWS)[number];
export const FOLLOW_UP_FILTERS = ["", "overdue", "today", "due", "week", "none"] as const;
export const SORTS = ["priority", "newest", "oldest", "updated"] as const;

export interface TicketListParams {
  q: string;
  view: View;
  tab: Tab;
  status: string;
  issue: string;
  fault: string;
  department: string;
  material: string;
  fu: (typeof FOLLOW_UP_FILTERS)[number];
  sort: (typeof SORTS)[number];
  page: number;
}

const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

export function parseListParams(sp: Record<string, string | string[] | undefined>): TicketListParams {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Math.min(1000, Number.parseInt(str("page"), 10) || 1));
  return {
    q: str("q").slice(0, 100),
    view: pick(VIEWS, sp.view, "active"),
    tab: pick(TABS, sp.tab, "all"),
    status: pick(["", ...STATUSES] as const, sp.status, ""),
    issue: pick(["", ...ISSUES] as const, sp.issue, ""),
    fault: pick(["", ...FAULTS] as const, sp.fault, ""),
    department: isUuid(str("department")) ? str("department") : "",
    material: isUuid(str("material")) ? str("material") : "",
    fu: pick(FOLLOW_UP_FILTERS, sp.fu, ""),
    sort: pick(SORTS, sp.sort, "priority"),
    page,
  };
}

export const PAGE_SIZE = 50;

export type TicketListRow = Pick<
  Ticket,
  | "id" | "ticket_number" | "customer_name" | "contact_name" | "order_number" | "issue" | "fault" | "status"
  | "follow_up_date" | "rush_started_at" | "date_opened" | "tracking_number" | "updated_at" | "created_at"
>;

export async function listTickets(p: TicketListParams): Promise<{ rows: TicketListRow[]; total: number }> {
  await requireSession();
  const today = todayISO();

  let q = db()
    .rpc("search_tickets", { p_query: p.q || null }, { count: "exact" })
    .select(
      "id, ticket_number, customer_name, contact_name, order_number, issue, fault, status, follow_up_date, rush_started_at, date_opened, tracking_number, updated_at, created_at",
    );

  // A quick-filter tab always means active tickets.
  const view: View = p.tab !== "all" ? "active" : p.view;
  if (view === "active") q = q.neq("status", "closed");
  if (view === "closed") q = q.eq("status", "closed");

  switch (p.tab) {
    case "followups":
      q = q.lte("follow_up_date", today);
      break;
    case "photos":
      q = q.eq("status", "waiting_photos");
      break;
    case "customer":
      q = q.eq("status", "waiting_customer");
      break;
    case "fedex":
      q = q.or("status.eq.waiting_fedex,fedex_investigation_opened.is.true");
      break;
    case "rush":
      q = q.eq("status", "rush_reprint");
      break;
  }

  if (p.status) q = q.eq("status", p.status);
  if (p.issue) q = q.eq("issue", p.issue);
  if (p.fault) q = q.eq("fault", p.fault);
  if (p.department) q = q.eq("department_id", p.department);
  if (p.material) q = q.eq("material_id", p.material);

  switch (p.fu) {
    case "overdue":
      q = q.lt("follow_up_date", today);
      break;
    case "today":
      q = q.eq("follow_up_date", today);
      break;
    case "due":
      q = q.lte("follow_up_date", today);
      break;
    case "week":
      q = q.gte("follow_up_date", today).lte("follow_up_date", addDaysISO(today, 7));
      break;
    case "none":
      q = q.is("follow_up_date", null);
      break;
  }

  switch (p.sort) {
    case "newest":
      q = q.order("created_at", { ascending: false });
      break;
    case "oldest":
      q = q.order("date_opened", { ascending: true }).order("created_at", { ascending: true });
      break;
    case "updated":
      q = q.order("updated_at", { ascending: false });
      break;
    default:
      // Follow-up date first (overdue → today → upcoming → none), then oldest opened.
      q = q
        .order("follow_up_date", { ascending: true, nullsFirst: false })
        .order("date_opened", { ascending: true })
        .order("created_at", { ascending: true });
  }

  const from = (p.page - 1) * PAGE_SIZE;
  const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as TicketListRow[], total: count ?? 0 };
}

/* ------------------------------------------------------------------------- *
 * Details helpers
 * ------------------------------------------------------------------------- */

export async function getTicketEvents(ticketId: string): Promise<TicketEvent[]> {
  await requireSession();
  const { data, error } = await db()
    .from("ticket_events")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as TicketEvent[];
}

export async function getRushPeriods(ticketId: string): Promise<RushPeriod[]> {
  await requireSession();
  const { data, error } = await db()
    .from("ticket_rush_periods")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data as RushPeriod[];
}

export async function getRelatedTickets(t: Ticket): Promise<TicketListRow[]> {
  await requireSession();
  const cols =
    "id, ticket_number, customer_name, contact_name, order_number, issue, fault, status, follow_up_date, rush_started_at, date_opened, tracking_number, updated_at, created_at";
  const filters: string[] = [];
  const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (t.order_number) filters.push(`order_number.eq.${quote(t.order_number)}`);
  filters.push(`customer_name.ilike.${quote(t.customer_name.replace(/[%_\\]/g, (c) => "\\" + c))}`);
  const { data, error } = await db()
    .from("tickets")
    .select(cols)
    .or(filters.join(","))
    .neq("id", t.id)
    .is("archived_at", null)
    .order("date_opened", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data as TicketListRow[];
}

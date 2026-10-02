import "server-only";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/data/settings";
import { todayISO } from "@/lib/utils/dates";
import { prioritize, type PriorityBucket } from "@/lib/domain/priorities";
import type { Ticket } from "@/types/domain";

export interface DashboardCounts {
  active: number;
  followUps: number;
  followUpsOverdue: number;
  waitingPhotos: number;
  waitingCustomer: number;
  fedex: number;
  rush: number;
}

export type PriorityRow = Pick<
  Ticket,
  "id" | "ticket_number" | "customer_name" | "contact_name" | "issue" | "status" | "follow_up_date" | "rush_started_at" | "date_opened" | "created_at"
> & { bucket: PriorityBucket };

function activeCount() {
  return db().from("tickets").select("id", { count: "exact", head: true }).is("archived_at", null).neq("status", "closed");
}

/** Card counts, straight from the database. */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  await requireSession();
  const today = todayISO();
  const results = await Promise.all([
    activeCount(),
    activeCount().lte("follow_up_date", today),
    activeCount().lt("follow_up_date", today),
    activeCount().eq("status", "waiting_photos"),
    activeCount().eq("status", "waiting_customer"),
    activeCount().or("status.eq.waiting_fedex,fedex_investigation_opened.is.true"),
    activeCount().eq("status", "rush_reprint"),
  ]);
  for (const r of results) if (r.error) throw r.error;
  const [active, followUps, followUpsOverdue, waitingPhotos, waitingCustomer, fedex, rush] = results.map((r) => r.count ?? 0);
  return { active, followUps, followUpsOverdue, waitingPhotos, waitingCustomer, fedex, rush };
}

/** Today's Priorities, ordered per the approved priority rules. */
export async function getPriorities(limit = 25): Promise<{ rows: PriorityRow[]; total: number; rushOverdueMinutes: number }> {
  await requireSession();
  const settings = await getSettings();
  const { data, error } = await db()
    .from("tickets")
    .select("id, ticket_number, customer_name, contact_name, issue, status, follow_up_date, rush_started_at, date_opened, created_at")
    .is("archived_at", null)
    .neq("status", "closed")
    .order("date_opened", { ascending: true })
    .limit(1000);
  if (error) throw error;
  const ordered = prioritize(data as Omit<PriorityRow, "bucket">[], todayISO(), Date.now(), settings.rush_overdue_minutes);
  return { rows: ordered.slice(0, limit), total: ordered.length, rushOverdueMinutes: settings.rush_overdue_minutes };
}

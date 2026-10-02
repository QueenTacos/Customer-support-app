import type { Status } from "./options";

export interface PriorityInput {
  id: string;
  status: Status;
  follow_up_date: string | null;
  rush_started_at: string | null;
  date_opened: string;
  created_at: string;
}

export type PriorityBucket =
  | "rush_overdue"      // 1. Overdue Rush Reprints
  | "followup_overdue"  // 2. Other overdue follow-ups
  | "rush"              // 3. Rush Reprints under the limit
  | "followup_today"    // 4. Follow-ups due today
  | "attention";        // 5. Other active tickets

export const BUCKET_ORDER: PriorityBucket[] = ["rush_overdue", "followup_overdue", "rush", "followup_today", "attention"];

export const BUCKET_LABELS: Record<PriorityBucket, string> = {
  rush_overdue: "Rush overdue",
  followup_overdue: "Follow-up overdue",
  rush: "Rush Reprint",
  followup_today: "Follow-up today",
  attention: "Active",
};

export function bucketFor(t: PriorityInput, today: string, nowMs: number, rushOverdueMinutes: number): PriorityBucket {
  if (t.status === "rush_reprint" && t.rush_started_at) {
    const elapsed = nowMs - new Date(t.rush_started_at).getTime();
    return elapsed >= rushOverdueMinutes * 60_000 ? "rush_overdue" : "rush";
  }
  if (t.follow_up_date && t.follow_up_date < today) return "followup_overdue";
  if (t.follow_up_date === today) return "followup_today";
  return "attention";
}

/**
 * Sort active tickets into Today's Priorities order (approved list):
 *  1 overdue rush · 2 overdue follow-ups · 3 rush < limit · 4 follow-ups today · 5 other active.
 * Within a bucket: rush by start time (oldest first); others by follow-up date,
 * then date opened (oldest first).
 */
export function prioritize<T extends PriorityInput>(
  tickets: T[],
  today: string,
  nowMs: number,
  rushOverdueMinutes: number,
): (T & { bucket: PriorityBucket })[] {
  const rank = (b: PriorityBucket) => BUCKET_ORDER.indexOf(b);
  return tickets
    .filter((t) => t.status !== "closed")
    .map((t) => ({ ...t, bucket: bucketFor(t, today, nowMs, rushOverdueMinutes) }))
    .sort((a, b) => {
      const r = rank(a.bucket) - rank(b.bucket);
      if (r !== 0) return r;
      if (a.bucket === "rush" || a.bucket === "rush_overdue") {
        return (a.rush_started_at ?? "").localeCompare(b.rush_started_at ?? "");
      }
      const fa = a.follow_up_date ?? "9999-12-31";
      const fb = b.follow_up_date ?? "9999-12-31";
      if (fa !== fb) return fa.localeCompare(fb);
      if (a.date_opened !== b.date_opened) return a.date_opened.localeCompare(b.date_opened);
      return a.created_at.localeCompare(b.created_at);
    });
}

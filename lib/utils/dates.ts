/**
 * All "today", "overdue" and display logic uses the business timezone,
 * regardless of where the server (Vercel = UTC) or browser is.
 */
export const APP_TIMEZONE = "America/New_York";

/** YYYY-MM-DD for "now" in the app timezone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add days to a YYYY-MM-DD date string (calendar math, no timezone drift). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b (YYYY-MM-DD). */
export function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type FollowUpState = "overdue" | "today" | "upcoming" | "none";

export function followUpState(date: string | null | undefined, today = todayISO()): FollowUpState {
  if (!date) return "none";
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

/** "Sep 29, 2026" from YYYY-MM-DD (date-only values are not timezone-shifted). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** "9/15" short form used in generated notes. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
}

/** "Sep 29, 2026, 3:04 PM" for timestamps. */
export function formatDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** Relative follow-up label: "Today", "Tomorrow", "2 days overdue", "in 3 days". */
export function followUpLabel(date: string | null | undefined, today = todayISO()): string {
  if (!date) return "—";
  const diff = diffDaysISO(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "1 day overdue";
  if (diff < 0) return `${-diff} days overdue`;
  return `in ${diff} days`;
}

/** Elapsed "mm:ss" or "h:mm:ss" from a start timestamp. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Age in whole days since a YYYY-MM-DD date. */
export function ageDays(dateOpened: string, today = todayISO()): number {
  return Math.max(0, diffDaysISO(dateOpened, today));
}

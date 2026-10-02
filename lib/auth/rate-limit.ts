import "server-only";
import { db } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data/settings";

export type AttemptKind = "login" | "change_pin";

export interface LockoutState {
  locked: boolean;
  minutesLeft: number;
  failuresInWindow: number;
  maxAttempts: number;
}

/**
 * Lockout policy (app_settings.lockout, default 5 wrong PINs in 15 minutes →
 * 15-minute lockout). Counted globally — this is a single-user app, so
 * switching IP addresses does not reset the counter. Attempts made while
 * locked are rejected before the PIN is checked and are not counted.
 */
export async function getLockout(kind: AttemptKind): Promise<LockoutState> {
  const { lockout } = await getSettings();
  const since = new Date(Date.now() - lockout.window_minutes * 60_000).toISOString();

  const { data, error } = await db()
    .from("auth_attempts")
    .select("succeeded, attempted_at")
    .eq("kind", kind)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: false })
    .limit(lockout.max_attempts + 5);
  if (error) throw error;

  // Consecutive failures since the most recent success.
  const failures: string[] = [];
  for (const row of data ?? []) {
    if (row.succeeded) break;
    failures.push(row.attempted_at as string);
  }

  if (failures.length >= lockout.max_attempts) {
    const lockedUntil = new Date(failures[0]).getTime() + lockout.lockout_minutes * 60_000;
    const msLeft = lockedUntil - Date.now();
    if (msLeft > 0) {
      return {
        locked: true,
        minutesLeft: Math.max(1, Math.ceil(msLeft / 60_000)),
        failuresInWindow: failures.length,
        maxAttempts: lockout.max_attempts,
      };
    }
  }
  return { locked: false, minutesLeft: 0, failuresInWindow: failures.length, maxAttempts: lockout.max_attempts };
}

export async function recordAttempt(kind: AttemptKind, succeeded: boolean, ip: string | null) {
  const { error } = await db().from("auth_attempts").insert({ kind, succeeded, ip });
  if (error) throw error;
}

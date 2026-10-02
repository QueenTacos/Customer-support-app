import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/server";
import { logServerError } from "@/lib/utils/errors";

export interface AppSettings {
  display_name: string;
  app_name: string;
  agent_name: string;
  timezone: string;
  session_hours: number;
  lockout: { max_attempts: number; window_minutes: number; lockout_minutes: number };
  rush_overdue_minutes: number;
  default_follow_up_days: number | null;
}

const DEFAULTS: AppSettings = {
  display_name: "Jessica",
  app_name: "Customer Support",
  agent_name: "Jessica",
  timezone: "America/New_York",
  session_hours: 12,
  lockout: { max_attempts: 5, window_minutes: 15, lockout_minutes: 15 },
  rush_overdue_minutes: 30,
  default_follow_up_days: null,
};

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** All settings, read once per request. Falls back to safe defaults. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const { data, error } = await db().from("app_settings").select("key, value");
  if (error) {
    logServerError("settings", error);
    return DEFAULTS;
  }
  const map = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as unknown]));
  const lockout = (map.lockout ?? {}) as Partial<AppSettings["lockout"]>;
  return {
    display_name: typeof map.display_name === "string" ? map.display_name : DEFAULTS.display_name,
    app_name: typeof map.app_name === "string" ? map.app_name : DEFAULTS.app_name,
    agent_name: typeof map.agent_name === "string" ? map.agent_name : DEFAULTS.agent_name,
    timezone: typeof map.timezone === "string" ? map.timezone : DEFAULTS.timezone,
    session_hours: clampInt(map.session_hours, 1, 24 * 30, DEFAULTS.session_hours),
    lockout: {
      max_attempts: clampInt(lockout.max_attempts, 1, 100, DEFAULTS.lockout.max_attempts),
      window_minutes: clampInt(lockout.window_minutes, 1, 1440, DEFAULTS.lockout.window_minutes),
      lockout_minutes: clampInt(lockout.lockout_minutes, 1, 1440, DEFAULTS.lockout.lockout_minutes),
    },
    rush_overdue_minutes: clampInt(map.rush_overdue_minutes, 1, 1440, DEFAULTS.rush_overdue_minutes),
    default_follow_up_days:
      map.default_follow_up_days === null || map.default_follow_up_days === undefined
        ? null
        : clampInt(map.default_follow_up_days, 0, 365, 0),
  };
});

"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth/pin";
import { clientInfo, createSession, destroySession } from "@/lib/auth/session";
import { getLockout, recordAttempt } from "@/lib/auth/rate-limit";
import { PIN_RE } from "@/lib/validation/pin";
import { logServerError } from "@/lib/utils/errors";

export interface LoginState {
  error?: string;
}

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  // Only same-site relative paths; never "//evil.com" or "/\evil".
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(n) && !n.startsWith("/login") ? n : "/dashboard";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pin = String(formData.get("pin") ?? "");
  if (!PIN_RE.test(pin)) return { error: "Please enter your six-digit PIN." };

  let ok = false;
  try {
    const lock = await getLockout("login");
    if (lock.locked) {
      return {
        error: `Too many incorrect attempts. Try again in ${lock.minutesLeft} minute${lock.minutesLeft === 1 ? "" : "s"}.`,
      };
    }

    const { data: cred, error } = await db().from("auth_credentials").select("pin_hash").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!cred) return { error: "No PIN has been set up yet. Run `npm run set-pin` (see docs/SETUP.md)." };

    ok = await verifyPin(pin, cred.pin_hash);
    const { ip } = await clientInfo();
    await recordAttempt("login", ok, ip);

    if (!ok) {
      const after = await getLockout("login");
      if (after.locked) {
        return { error: `PIN is incorrect. Too many attempts — locked for ${after.minutesLeft} minutes.` };
      }
      const left = after.maxAttempts - after.failuresInWindow;
      return {
        error:
          left <= 2
            ? `PIN is incorrect. ${left} attempt${left === 1 ? "" : "s"} left before a temporary lockout.`
            : "PIN is incorrect.",
      };
    }

    await createSession();
  } catch (err) {
    logServerError("login", err);
    return { error: "Sign-in failed. Please try again." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

"use server";

import { db } from "@/lib/supabase/server";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { clientInfo, requireSession, revokeOtherSessions } from "@/lib/auth/session";
import { getLockout, recordAttempt } from "@/lib/auth/rate-limit";
import { changePinSchema } from "@/lib/validation/pin";
import { logServerError } from "@/lib/utils/errors";

export interface ChangePinState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<"current" | "next" | "confirm", string>>;
  /** Increments on success so the form can reset itself. */
  nonce?: number;
}

export async function changePin(_prev: ChangePinState, formData: FormData): Promise<ChangePinState> {
  const session = await requireSession();

  const parsed = changePinSchema.safeParse({
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: ChangePinState["fieldErrors"] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as "current" | "next" | "confirm";
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const lock = await getLockout("change_pin");
    if (lock.locked) {
      return { error: `Too many incorrect attempts. Try again in ${lock.minutesLeft} minutes.` };
    }

    const { data: cred, error } = await db().from("auth_credentials").select("pin_hash").eq("id", 1).single();
    if (error) throw error;

    const ok = await verifyPin(parsed.data.current, cred.pin_hash);
    const { ip } = await clientInfo();
    await recordAttempt("change_pin", ok, ip);
    if (!ok) return { error: "Current PIN is incorrect.", fieldErrors: { current: "Current PIN is incorrect." } };

    const pin_hash = await hashPin(parsed.data.next);
    const now = new Date().toISOString();
    const { error: upErr } = await db()
      .from("auth_credentials")
      .update({ pin_hash, pin_updated_at: now })
      .eq("id", 1);
    if (upErr) throw upErr;

    await db()
      .from("app_settings")
      .update({ value: { length: 6, numeric_only: true, algorithm: "scrypt", last_changed_at: now } })
      .eq("key", "pin_metadata");

    // Sign out every other device/browser; keep this one signed in.
    await revokeOtherSessions(session.id, "pin_changed");
  } catch (err) {
    logServerError("change-pin", err);
    return { error: "PIN could not be changed. Please try again." };
  }

  return { ok: true, message: "PIN changed successfully.", nonce: Date.now() };
}

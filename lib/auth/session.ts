import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data/settings";
import { logServerError } from "@/lib/utils/errors";
import { SESSION_COOKIE, SESSION_TOKEN_RE } from "./constants";

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
}

function sha256(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 100) || null;
  const userAgent = (h.get("user-agent") ?? "").slice(0, 500) || null;
  return { ip, userAgent };
}

/** Create a server-side session row and set the httpOnly cookie. */
export async function createSession() {
  const settings = await getSettings();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + settings.session_hours * 3600_000);
  const { ip, userAgent } = await clientInfo();

  const { error } = await db().from("auth_sessions").insert({
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
    ip,
    user_agent: userAgent,
  });
  if (error) throw error;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
    priority: "high",
  });
}

/**
 * The current valid session, or null. Verified against the database on every
 * request (revoked / expired sessions are rejected immediately).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !SESSION_TOKEN_RE.test(token)) return null;

  const { data, error } = await db()
    .from("auth_sessions")
    .select("id, created_at, expires_at, last_seen_at")
    .eq("token_hash", sha256(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    logServerError("session", error);
    return null;
  }
  if (!data) return null;

  // Touch last_seen_at at most every 5 minutes.
  if (Date.now() - new Date(data.last_seen_at).getTime() > 5 * 60_000) {
    await db().from("auth_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { id: data.id, created_at: data.created_at, expires_at: data.expires_at };
});

/** Use at the top of every protected page and Server Action. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Revoke the current session and clear the cookie. */
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && SESSION_TOKEN_RE.test(token)) {
    const { error } = await db()
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "sign_out" })
      .eq("token_hash", sha256(token))
      .is("revoked_at", null);
    if (error) logServerError("sign-out", error);
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every active session except `keepId` (used after a PIN change). */
export async function revokeOtherSessions(keepId: string, reason: "pin_changed") {
  const { error } = await db()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .is("revoked_at", null)
    .neq("id", keepId);
  if (error) throw error;
}

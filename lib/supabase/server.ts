import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SECRET key (service role).
 * `server-only` makes the build fail if any client component imports this.
 * The browser never receives any Supabase key.
 */
let client: SupabaseClient | null = null;

/**
 * Accepts the Project URL however it was pasted and returns the bare
 * "https://<ref>.supabase.co" form. Strips spaces, quotes, trailing
 * slashes and an accidental "/rest/v1" (which would otherwise cause
 * PGRST125 "Invalid path specified in request URL").
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/^["']|["']$/g, "");
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/(rest|auth|storage)\/v1$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}

export function db(): SupabaseClient {
  if (client) return client;
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!rawUrl || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.example).");
  }
  client = createClient(normalizeSupabaseUrl(rawUrl), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return client;
}

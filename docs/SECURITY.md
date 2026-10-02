# Security model

## Authentication (single user)

- **PIN storage:** scrypt (N=32768, r=8, p=1, 16-byte random salt, 64-byte key) in `auth_credentials`.
  The PIN is never stored, logged, committed, or sent back to the browser. `app_settings` has a CHECK
  that refuses keys like `pin` / `pin_hash`.
- **Verification:** in a Server Action, constant-time comparison.
- **Sessions:** a random 256-bit token in an `httpOnly`, `Secure` (production), `SameSite=Lax` cookie.
  Only its SHA-256 hash is stored in `auth_sessions`. Default lifetime 12 hours (`app_settings.session_hours`).
- **Sign Out** revokes the session row and deletes the cookie. **Change PIN** revokes every other session.
- **Rate limiting:** `auth_attempts`. 5 wrong PINs within 15 minutes → 15-minute lockout, counted
  globally (single user, so switching IPs doesn't help). Change-PIN attempts are limited separately.
  Configurable in `app_settings.lockout`.

## Authorization — two layers on every request

1. `proxy.ts` redirects any request without a well-formed session cookie to `/login`.
2. Every page, data function (`lib/data/*`) and Server Action (`lib/actions/*`) calls
   `requireSession()`, which checks the session against the database. Hidden buttons are never the
   protection.

## Database

- The browser never talks to Supabase. No Supabase key is sent to the browser; there are no
  `NEXT_PUBLIC_` Supabase variables.
- Server code uses the **secret key** via `lib/supabase/server.ts`, which imports `server-only`, so
  the build fails if a client component ever imports it.
- **RLS is enabled on every table with no policies**, and all table/function privileges are revoked
  from `anon` and `authenticated`. The public API returns nothing even with the publishable key.
- Database functions use `set search_path = ''` and are executable only by `service_role`.
- History (`ticket_events`) and note versions (`ticket_note_versions`) are append-only: triggers
  reject UPDATE/DELETE. Tickets and notes use soft delete (`archived_at`); foreign keys are
  `ON DELETE RESTRICT`.

## Storage

- Bucket `ticket-files` is **private** with no storage policies for public roles. Files will be
  served only through short-lived signed URLs created by the server after a session check.

## Input & errors

- All input is validated with Zod on the server (lengths, formats, enums, money ≤ 9,999,999.99).
  Database CHECK constraints repeat the critical rules.
- Raw database errors are logged server-side (Vercel logs) and replaced with plain messages.

## Headers

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy: same-origin`,
`Permissions-Policy`, and `X-Robots-Tag: noindex`.

## Secrets checklist

- `.env.local` is git-ignored; `.env.example` holds placeholders only.
- Secrets live in Vercel Environment Variables, marked Sensitive.
- Rotate the Supabase secret key in the dashboard if it is ever exposed, then update Vercel.

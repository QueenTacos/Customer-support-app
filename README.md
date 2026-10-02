# Customer Support

Jessica's single-user customer-support workspace: tickets, follow-ups, notes with version history,
and (in later phases) LIMITS, Claims, templates, product rules, UAT and reports.

**Stack:** Next.js 16 (App Router, TypeScript) · React 19 · Tailwind CSS 4 · Supabase (Postgres + private Storage) · Vercel

→ **Setup and deployment:** [docs/SETUP.md](docs/SETUP.md)
→ **Security model:** [docs/SECURITY.md](docs/SECURITY.md)

## Status — First Milestone

| # | Feature | Status |
|---|---------|--------|
| 1–3 | Dark login, "Welcome Jessica", six-digit PIN (server-side, hashed, rate-limited) | ✅ |
| 4 | Dashboard: live counts, Today's Priorities, Quick Actions | ✅ |
| 5–6 | New Ticket 4-step wizard with conditional questions + fault suggestion, saved to Supabase | ✅ |
| 7 | Active Tickets: search, filters, quick-filter tabs | ✅ |
| 8 | Ticket Details: Details, Notes, Tracking, Related, History tabs | ✅ (Photos tab is next) |
| 9–11 | Add / edit notes, version history with edit reasons | ✅ |
| 12–13 | Edit Ticket with field-by-field change history | ✅ |
| 14–16 | My Account, Change PIN (signs out other sessions), Sign Out | ✅ |
| — | Rush Reprint live timer, 30-minute overdue flag, rush periods kept | ✅ |

Not yet built (by design, awaiting milestone approval): Photos UI, Close/Reopen, LIMITS, Claims,
Templates, generators, Product Rules/Materials screen, UAT, Reports.

## Project layout

```
app/
  (auth)/login/          Welcome Jessica + PIN pad
  (app)/                 everything behind the session
    dashboard/  tickets/  tickets/new/  tickets/[id]/  tickets/[id]/edit/  account/
    limits/ claims/ templates/ product-rules/ uat/ reports/   (placeholders)
components/  ui/  layout/  tickets/  notes/
lib/
  auth/        pin hashing, sessions, rate limiting
  actions/     Server Actions (every one re-checks the session)
  data/        server-only queries (every one re-checks the session)
  domain/      options, conditional questions, fault suggestion, priorities
  validation/  Zod schemas shared by browser and server
  supabase/    server-only Supabase client (secret key)
supabase/migrations/     the complete database schema, in order
scripts/set-pin.ts       set/reset the PIN (stores only the hash)
tests/unit  tests/e2e
proxy.ts                 first-line route gate (Next.js 16 "proxy", formerly middleware)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local development at http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run set-pin` | Set or reset the PIN (hidden prompt) |
| `npm run typecheck` · `npm run lint` | Type and lint checks |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end milestone tests (test database only) |


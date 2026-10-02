# Setup: Supabase → GitHub → Vercel

About 20–30 minutes the first time. You need Node.js 20.9+ on your computer.

---

## 1. Supabase (database)

1. In the Supabase dashboard, create a **new project** for this app (recommended: keep it separate from other apps).
   Choose a region near you and save the database password in your password manager.
2. Open **Project Settings → API Keys** and note:
   - **Project URL** — `https://<project-ref>.supabase.co`
   - **Secret key** (`sb_secret_…`). The legacy `service_role` key also works.
   Do **not** use the publishable/anon key — this app does not need it.

### Apply the database migrations

Option A — Supabase CLI (recommended; repeatable for future migrations):

```bash
npm install
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Option B — SQL Editor: open each file in `supabase/migrations/` **in filename order** and run it.

After either option you should see these tables in **Table Editor**: `tickets`, `ticket_notes`,
`ticket_note_versions`, `ticket_events`, `ticket_rush_periods`, `ticket_photos`, `ticket_files`,
`departments`, `materials`, `app_settings`, `auth_credentials`, `auth_sessions`, `auth_attempts`,
and a private Storage bucket `ticket-files`.

> Supabase's Security Advisor may note "RLS enabled, no policies". That is intentional: the public
> API is fully locked, and only the app's server (using the secret key) can read or write.

---

## 2. Run it locally and set your PIN

```bash
cp .env.example .env.local      # then paste SUPABASE_URL and SUPABASE_SECRET_KEY
npm install
npm run set-pin                 # type your six-digit PIN at the hidden prompt (twice)
npm run dev                     # open http://localhost:3000
```

`set-pin` hashes the PIN on your computer and stores **only the hash**. The PIN is never written to a
file, the repository, or the logs.

Prefer not to put the secret key on your computer? Run `npm run set-pin -- --print-sql` instead and
paste the printed SQL into the Supabase SQL Editor.

---

## 3. GitHub

1. Create a **private** repository (e.g. `customer-support-app`). Don't add a README or .gitignore.
2. From the project folder:

```bash
git remote add origin https://github.com/<you>/customer-support-app.git
git push -u origin main
```

Check on GitHub that `.env.local` is **not** in the repo (it is git-ignored).

---

## 4. Vercel

1. **Add New → Project**, import the GitHub repository. Framework is detected as Next.js; keep defaults.
2. Under **Environment Variables** add, for **Production** and **Preview**:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (mark it *Sensitive*)
3. **Deploy.** Open the URL, you should see **Welcome Jessica**.

From now on: push to `main` → Vercel builds and deploys automatically. Pull requests get preview URLs.

> Tip: Previews use the same database as Production unless you give Preview its own Supabase
> project. For testing risky changes later, create a second "test" Supabase project and use its
> keys for the Preview environment.

---

## 5. Changing the schema later

Never edit tables by hand in production. Add a new file in `supabase/migrations/`
(`npx supabase migration new <name>`), commit it, and apply it with `npx supabase db push`.

## 6. Tests

```bash
npm run typecheck
npm test                       # unit tests (no database needed)
# End-to-end — ONLY against a test database (it creates tickets):
E2E_BASE_URL=http://localhost:3000 E2E_PIN=<test pin> E2E_TEMP_PIN=<another pin> npm run test:e2e
```

## Resetting a forgotten PIN

Run `npm run set-pin` (or `--print-sql`) again. It replaces the hash and signs out every session.
If you're locked out after too many attempts, wait 15 minutes (configurable in `app_settings.lockout`).

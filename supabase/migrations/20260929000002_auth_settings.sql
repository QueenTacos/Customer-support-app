-- =============================================================================
-- 0002 Auth & settings
-- Single-user PIN authentication. The PIN itself is NEVER stored; only a
-- salted scrypt hash, written by `npm run set-pin` or the Change PIN screen.
-- =============================================================================

-- One row only (id = 1). No hash is seeded here: run `npm run set-pin`.
create table public.auth_credentials (
  id              smallint primary key default 1 check (id = 1),
  pin_hash        text not null check (pin_hash like 'scrypt$%'),
  pin_updated_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.auth_credentials is
  'Single-row table holding the scrypt hash of Jessica''s PIN. Never returned to the browser.';

create trigger auth_credentials_updated_at
  before update on public.auth_credentials
  for each row execute function public.set_updated_at();

-- Server-side sessions. The cookie holds a random token; only its SHA-256
-- hash is stored, so a database leak cannot be replayed as a cookie.
create table public.auth_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique check (char_length(token_hash) = 64),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_reason text check (revoked_reason in ('sign_out', 'pin_changed', 'expired', 'admin')),
  user_agent    text check (char_length(user_agent) <= 500),
  ip            text check (char_length(ip) <= 100),
  check (expires_at > created_at)
);
create index auth_sessions_active_idx on public.auth_sessions (expires_at) where revoked_at is null;

-- Every PIN attempt (login and change-PIN current-PIN checks), for lockout.
create table public.auth_attempts (
  id            bigint generated always as identity primary key,
  kind          text not null default 'login' check (kind in ('login', 'change_pin')),
  ip            text check (char_length(ip) <= 100),
  succeeded     boolean not null,
  attempted_at  timestamptz not null default now()
);
create index auth_attempts_recent_idx on public.auth_attempts (attempted_at desc);

-- Key/value settings. NEVER put the PIN or its hash here.
create table public.app_settings (
  key          text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value        jsonb not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (key not ilike '%pin_hash%' and key not in ('pin', 'pin_plain'))
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('display_name',            '"Jessica"',                 'Name shown on the login screen and account menu.'),
  ('app_name',                '"Customer Support"',        'Name shown at the top of the sidebar.'),
  ('agent_name',              '"Jessica"',                 'Default assigned_to value for new tickets.'),
  ('timezone',                '"America/New_York"',        'Timezone used for "today", overdue and follow-ups.'),
  ('session_hours',           '12',                        'How long a sign-in lasts, in hours.'),
  ('lockout',                 '{"max_attempts": 5, "window_minutes": 15, "lockout_minutes": 15}',
                                                           'Wrong-PIN lockout policy.'),
  ('rush_overdue_minutes',    '30',                        'Rush Reprints are flagged overdue after this many minutes.'),
  ('default_follow_up_days',  'null',                      'If set, new tickets get a follow-up date this many days out. null = no default.'),
  ('pin_metadata',            '{"length": 6, "numeric_only": true, "algorithm": "scrypt"}',
                                                           'PIN rules. The PIN and its hash are NOT stored here.');

-- Lock everything down.
alter table public.auth_credentials enable row level security;
alter table public.auth_sessions    enable row level security;
alter table public.auth_attempts    enable row level security;
alter table public.app_settings     enable row level security;

revoke all on public.auth_credentials, public.auth_sessions, public.auth_attempts, public.app_settings
  from anon, authenticated;
grant all on public.auth_credentials, public.auth_sessions, public.auth_attempts, public.app_settings
  to service_role;

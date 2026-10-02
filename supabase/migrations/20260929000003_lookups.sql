-- =============================================================================
-- 0003 Lookups: departments and materials
-- Department -> broad category.  Material -> actual product/material.
-- Both are data, not code: add / edit / deactivate / reactivate without a deploy.
-- Rows are never deleted; `is_active = false` hides them from new tickets while
-- keeping history on existing tickets intact.
-- =============================================================================

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code ~ '^[A-Z0-9_ -]{1,40}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index departments_code_key on public.departments (code);

create trigger departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create table public.materials (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments (id) on delete restrict,
  name           text not null check (char_length(btrim(name)) between 1 and 120 and name = btrim(name)),
  is_rigid       boolean not null default false,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index materials_department_name_key on public.materials (department_id, lower(name));
create index materials_department_idx on public.materials (department_id);

create trigger materials_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: departments (approved list, D4)
-- ---------------------------------------------------------------------------
insert into public.departments (code, name, sort_order) values
  ('ADHESIVE', 'Adhesive', 10),
  ('BANNER',   'Banner',   20),
  ('RIGID',    'Rigid',    30),
  ('HANDHELD', 'Handheld', 40),
  ('MAGNET',   'Magnet',   50),
  ('APPAREL',  'Apparel',  60),
  ('MISC',     'Misc',     70);

-- ---------------------------------------------------------------------------
-- Seed: materials (approved list, D4). Names are stored exactly as provided.
-- is_rigid defaults to false everywhere; mark rigid products in the app once
-- the Materials screen ships (Phase 4) or with a follow-up migration.
-- ---------------------------------------------------------------------------
insert into public.materials (department_id, name, sort_order)
select d.id, m.name, m.ord
from (values
  ('ADHESIVE', '3MIJ35C',          10),
  ('ADHESIVE', '3MIJ180C',         20),
  ('ADHESIVE', 'BOOTPRINT',        30),
  ('ADHESIVE', 'CLING-GF207',      40),
  ('ADHESIVE', 'CLING-GF208',      50),
  ('ADHESIVE', 'DRY ERASE',        60),
  ('ADHESIVE', 'DUALVIEW SS',      70),
  ('ADHESIVE', 'DUALVIEW DS',      80),
  ('ADHESIVE', 'FOOTPRINT',        90),
  ('ADHESIVE', 'GF203OAPAE',      100),
  ('ADHESIVE', 'GF830',           110),
  ('ADHESIVE', 'LOW WALL TAC',    120),
  ('ADHESIVE', 'ORAJET CLEAR',    130),
  ('ADHESIVE', 'ONE WAY-50/50',   140),
  ('ADHESIVE', 'ONE WAY-70/30',   150),
  ('ADHESIVE', 'REFLECTIVE',      160),
  ('BANNER',   'svg13OZ',          10),
  ('BANNER',   'svg15OZ',          20),
  ('BANNER',   'svg18OZ',          30),
  ('BANNER',   'svg18OZ DS',       40),
  ('BANNER',   'svgCANVAS',        50),
  ('BANNER',   'svgECONOSTAND',    60),
  ('BANNER',   'svgHDPE',          70),
  ('BANNER',   'svgMESH',          80),
  ('BANNER',   'svgNO CURL',       90),
  ('BANNER',   'svgPOSTER',       100),
  ('HANDHELD', 'HANDHELD SS',      10),
  ('HANDHELD', 'HANDHELD DS',      20),
  ('HANDHELD', 'HARD CARDS .025"', 30),
  ('HANDHELD', 'HARD CARDS .04"',  40),
  ('MAGNET',   'CUSTOM MAGNET',    10),
  ('MAGNET',   'VEHICLE MAGNET',   20),
  ('APPAREL',  'DTF',              10),
  ('APPAREL',  'T-SHIRTS',         20),
  ('MISC',     'CUSTOM BRANDED PRODUCT CATALOG', 10),
  ('MISC',     'PRODUCT CATALOG',              20),
  ('MISC',     'HEAVY DUTY STEP STAKES',       30),
  ('MISC',     'STANDOFFS SILVER',             40),
  ('MISC',     'STANDOFFS BLACK',              50),
  ('MISC',     'STEP STAKES',                  60)
) as m(dept, name, ord)
join public.departments d on d.code = m.dept;

alter table public.departments enable row level security;
alter table public.materials   enable row level security;
revoke all on public.departments, public.materials from anon, authenticated;
grant all on public.departments, public.materials to service_role;

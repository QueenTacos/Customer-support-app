-- =============================================================================
-- 0012 Material catalog correction (approved 2026-10-02)
--  * Canonical RIGID materials: ACRYLIC, ALUMINUM, BACKLIT, CORO, FOAMCORE,
--    JBOND, POLYAIR, POLYSTYRENE, PVC.
--  * "Coro 4mil Double Sided" is order-description wording, not a material:
--    the record created by 0009 is reconciled into CORO (same id, so every
--    ticket that referenced it still does) and the wording becomes an alias.
--  * Verifies the full required list for every department (adds anything
--    missing, re-activates required records that were inactive).
--  * Matching ignores case, extra spaces and spaces around hyphens, so
--    "CLING - GF207" / "cling-gf207" never create a duplicate of CLING-GF207.
-- Ticket rows are NOT modified. Safe to run more than once.
-- =============================================================================

-- Comparison key: lower case, single spaces, no spaces around hyphens.
create or replace function public.material_name_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(regexp_replace(btrim(coalesce(p, '')), '\s*-\s*', '-', 'g'), '\s+', ' ', 'g'))
$$;
revoke all on function public.material_name_key(text) from public, anon, authenticated;
grant execute on function public.material_name_key(text) to service_role;

-- -----------------------------------------------------------------------------
-- 1. Reconcile "Coro 4mil Double Sided" into CORO
-- -----------------------------------------------------------------------------
do $$
declare
  v_rigid uuid;
  v_old   uuid;
  v_coro  uuid;
begin
  select id into v_rigid from public.departments where code = 'RIGID';
  if v_rigid is null then
    raise exception 'RIGID department not found';
  end if;

  select id into v_coro from public.materials
   where department_id = v_rigid and public.material_name_key(name) = 'coro'
   order by created_at limit 1;
  select id into v_old from public.materials
   where department_id = v_rigid and public.material_name_key(name) = 'coro 4mil double sided'
   order by created_at limit 1;

  if v_old is not null and v_coro is null then
    -- Rename in place: same id, so historical tickets keep their reference.
    update public.materials set name = 'CORO', is_rigid = true, is_active = true where id = v_old;
  elsif v_old is not null and v_coro is not null and v_old <> v_coro then
    -- Both exist: CORO is canonical. Move aliases; retire the old record
    -- (kept, inactive, so tickets that reference it still display).
    update public.material_aliases set material_id = v_coro where material_id = v_old;
    update public.materials set is_active = false where id = v_old;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Required catalog (insert missing, re-activate required)
-- -----------------------------------------------------------------------------
with required(dept, name, ord) as (
  values
  ('ADHESIVE', '3MIJ35C', 10), ('ADHESIVE', '3MIJ180C', 20), ('ADHESIVE', 'BOOTPRINT', 30),
  ('ADHESIVE', 'CLING-GF207', 40), ('ADHESIVE', 'CLING-GF208', 50), ('ADHESIVE', 'DRY ERASE', 60),
  ('ADHESIVE', 'DUALVIEW SS', 70), ('ADHESIVE', 'DUALVIEW DS', 80), ('ADHESIVE', 'FOOTPRINT', 90),
  ('ADHESIVE', 'GF203OAPAE', 100), ('ADHESIVE', 'GF830', 110), ('ADHESIVE', 'LOW WALL TAC', 120),
  ('ADHESIVE', 'ORAJET CLEAR', 130), ('ADHESIVE', 'ONE WAY-50/50', 140), ('ADHESIVE', 'ONE WAY-70/30', 150),
  ('ADHESIVE', 'REFLECTIVE', 160),
  ('BANNER', 'svg13OZ', 10), ('BANNER', 'svg15OZ', 20), ('BANNER', 'svg18OZ', 30), ('BANNER', 'svg18OZ DS', 40),
  ('BANNER', 'svgCANVAS', 50), ('BANNER', 'svgECONOSTAND', 60), ('BANNER', 'svgHDPE', 70), ('BANNER', 'svgMESH', 80),
  ('BANNER', 'svgNO CURL', 90), ('BANNER', 'svgPOSTER', 100),
  ('RIGID', 'ACRYLIC', 10), ('RIGID', 'ALUMINUM', 20), ('RIGID', 'BACKLIT', 30), ('RIGID', 'CORO', 40),
  ('RIGID', 'FOAMCORE', 50), ('RIGID', 'JBOND', 60), ('RIGID', 'POLYAIR', 70), ('RIGID', 'POLYSTYRENE', 80),
  ('RIGID', 'PVC', 90),
  ('HANDHELD', 'HANDHELD SS', 10), ('HANDHELD', 'HANDHELD DS', 20),
  ('HANDHELD', 'HARD CARDS .025"', 30), ('HANDHELD', 'HARD CARDS .04"', 40),
  ('MAGNET', 'CUSTOM MAGNET', 10), ('MAGNET', 'VEHICLE MAGNET', 20),
  ('APPAREL', 'DTF', 10), ('APPAREL', 'T-SHIRTS', 20),
  ('MISC', 'CUSTOM BRANDED PRODUCT CATALOG', 10), ('MISC', 'PRODUCT CATALOG', 20),
  ('MISC', 'HEAVY DUTY STEP STAKES', 30), ('MISC', 'STANDOFFS SILVER', 40),
  ('MISC', 'STANDOFFS BLACK', 50), ('MISC', 'STEP STAKES', 60)
),
req as (
  select d.id as department_id, d.code, r.name, r.ord
  from required r join public.departments d on d.code = r.dept
),
activated as (
  update public.materials m
     set is_active = true,
         is_rigid  = (m.is_rigid or req.code = 'RIGID')
    from req
   where m.department_id = req.department_id
     and public.material_name_key(m.name) = public.material_name_key(req.name)
     and (m.is_active = false or (req.code = 'RIGID' and m.is_rigid = false))
  returning m.id
)
insert into public.materials (department_id, name, is_rigid, sort_order, is_active)
select req.department_id, req.name, req.code = 'RIGID', req.ord, true
from req
where not exists (
  select 1 from public.materials m
  where m.department_id = req.department_id
    and public.material_name_key(m.name) = public.material_name_key(req.name)
);

-- Keep the RIGID list in the approved order.
update public.materials m
   set sort_order = v.ord
  from (values ('acrylic', 10), ('aluminum', 20), ('backlit', 30), ('coro', 40), ('foamcore', 50),
               ('jbond', 60), ('polyair', 70), ('polystyrene', 80), ('pvc', 90)) as v(k, ord),
       public.departments d
 where d.code = 'RIGID' and m.department_id = d.id
   and public.material_name_key(m.name) = v.k and m.sort_order <> v.ord;

-- Any other RIGID "Coro …" variant record (e.g. "Coro 4mil Single Sided") is
-- order wording too: its name becomes a CORO alias, its aliases move to CORO,
-- and the record is retired (inactive, never deleted — tickets keep it).
do $$
declare
  v_coro uuid;
  r record;
begin
  select m.id into v_coro from public.materials m join public.departments d on d.id = m.department_id
   where d.code = 'RIGID' and public.material_name_key(m.name) = 'coro' and m.is_active
   order by m.created_at limit 1;
  if v_coro is null then return; end if;
  for r in
    select m.id, m.name from public.materials m join public.departments d on d.id = m.department_id
     where d.code = 'RIGID' and m.id <> v_coro and public.material_name_key(m.name) ~ '^coro[ -]'
  loop
    update public.material_aliases set material_id = v_coro where material_id = r.id;
    insert into public.material_aliases (material_id, alias) values (v_coro, r.name) on conflict do nothing;
    update public.materials set is_active = false where id = r.id and is_active;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Aliases: order-description wording → canonical material
--    (DS/SS/4m/4mil spelling variations are also matched automatically.)
-- -----------------------------------------------------------------------------
insert into public.material_aliases (material_id, alias)
select m.id, a.alias
from public.materials m
join public.departments d on d.id = m.department_id and d.code = 'RIGID'
cross join (values
  ('Coro 4mil Double Sided'), ('Coro 4mil Single Sided'),
  ('Coro 4m DS'), ('Coro 4m SS'), ('Coro 4mil DS'), ('Coro 4mil SS'),
  ('4mil Coro DS'), ('4mil Coro SS'), ('4m Coro DS'), ('4m Coro SS'),
  ('Coro Double Sided'), ('Coro Single Sided'), ('Coro DS'), ('Coro SS'),
  ('Coroplast'), ('Corrugated Plastic')
) as a(alias)
where public.material_name_key(m.name) = 'coro' and m.is_active
on conflict do nothing;

insert into public.material_aliases (material_id, alias)
select m.id, a.alias
from (values
  ('RIGID', 'jbond', 'J-Bond'), ('RIGID', 'jbond', 'J Bond'),
  ('RIGID', 'foamcore', 'Foam Core'), ('RIGID', 'foamcore', 'Foam Board'),
  ('RIGID', 'aluminum', 'Aluminium'),
  ('RIGID', 'polystyrene', 'Styrene'),
  ('ADHESIVE', 'one way-50/50', 'One Way 50/50'), ('ADHESIVE', 'one way-70/30', 'One Way 70/30'),
  ('ADHESIVE', 'cling-gf207', 'Cling GF207'), ('ADHESIVE', 'cling-gf208', 'Cling GF208'),
  ('APPAREL', 't-shirts', 'T Shirts'), ('APPAREL', 't-shirts', 'Tshirts')
) as a(dept, key, alias)
join public.departments d on d.code = a.dept
join public.materials m on m.department_id = d.id and public.material_name_key(m.name) = a.key
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4. Result — Department / Material / Status (check this list)
-- -----------------------------------------------------------------------------
select d.code as department,
       m.name as material,
       case when m.is_active then 'Active' else 'Inactive' end as status
from public.materials m
join public.departments d on d.id = m.department_id
order by d.sort_order, d.code, m.sort_order, m.name;

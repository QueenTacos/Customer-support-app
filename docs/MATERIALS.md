# Adding materials and aliases (no code changes)

Quick Import reads materials and aliases straight from the database, so new
products and shorthand work as soon as they're added — nothing in the code
needs to change.

- **Material**: the real product name (`materials` table).
- **Alias**: another way it gets written in tickets or notes (`material_aliases` table).
  Matching ignores upper/lower case and extra spaces.

Quick Import also understands common shorthand on its own, in any word order:
`DS` = double sided, `SS` = single sided, `4m` = 4mil. So "Coro 4m DS" finds
"Coro 4mil Double Sided" even without an alias. Add an alias when the shorthand is
something else entirely (e.g. "4mm coro 2s" or a nickname).

## Bulk-add materials + aliases (Supabase → SQL Editor)

Edit the two lists below, then run it. It's safe to run more than once —
existing rows are skipped.

```sql
-- 1) Materials: (department code, material name, is it a rigid product?)
insert into public.materials (department_id, name, is_rigid, sort_order)
select d.id, v.name, v.is_rigid, v.sort_order
from (values
  ('RIGID', 'Coro 4mil Single Sided', true, 20),
  ('RIGID', 'Coro 10mm Double Sided', true, 30)
  -- add more lines here: ('RIGID', 'Name', true, 40),
) as v(dept, name, is_rigid, sort_order)
join public.departments d on d.code = v.dept
on conflict do nothing;

-- 2) Aliases: (exact material name, alias)
insert into public.material_aliases (material_id, alias)
select m.id, v.alias
from (values
  ('Coro 4mil Single Sided', 'Coro 4m SS'),
  ('Coro 10mm Double Sided', 'Coro 10m DS')
  -- add more lines here: ('Material name', 'alias'),
) as v(material, alias)
join public.materials m on m.name = v.material
on conflict do nothing;
```

The examples above are placeholders. Replace them with your real list.

## One at a time

Supabase → **Table Editor** → `material_aliases` → **Insert row**: pick the
`material_id`, type the `alias`, save. `alias_normalized` fills itself in.

## Turning a material off

Set `is_active` to `false` in `materials`. It disappears from New Ticket and
Quick Import's picker but stays on old tickets.

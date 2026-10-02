# Materials and aliases (no code changes)

The Material dropdown and the Ticket Assistant use the SAME records from Supabase.

- **Material** (`materials`): the canonical product, e.g. `CORO`, `PVC`, `svg13OZ`.
- **Alias** (`material_aliases`): order/description wording that means that material,
  e.g. `Coro 4mil Double Sided`, `Coro 4m SS` → `CORO`.

Do **not** add a new material for a thickness/sided variation — add an alias. When the
assistant matches through an alias it sets Material = the canonical material and keeps
the original wording in **Material Type**.

Matching ignores upper/lower case, extra spaces and spaces around hyphens
(`CLING - GF207` = `CLING-GF207`, `SVG13OZ` = `svg13OZ`), and understands
`DS`/`SS`/`4m` shorthand in any word order. Nothing is ever created from pasted text —
an unknown material shows **⚠ Material Not Found**.

## Add aliases (Supabase → SQL Editor)

Safe to run more than once.

```sql
insert into public.material_aliases (material_id, alias)
select m.id, v.alias
from (values
  ('RIGID', 'CORO', 'Coro 10mm Double Sided'),
  ('RIGID', 'PVC',  'Sintra')
  -- add more lines: ('DEPARTMENT', 'MATERIAL', 'alias'),
) as v(dept, material, alias)
join public.departments d on d.code = v.dept
join public.materials m on m.department_id = d.id
 and public.material_name_key(m.name) = public.material_name_key(v.material)
on conflict do nothing;
```

## Add a new canonical material

```sql
insert into public.materials (department_id, name, is_rigid, sort_order)
select d.id, 'NEW MATERIAL', false, 100
from public.departments d
where d.code = 'MISC'
  and not exists (select 1 from public.materials m
                  where m.department_id = d.id
                    and public.material_name_key(m.name) = public.material_name_key('NEW MATERIAL'));
```

## Turning a material off

Set `is_active` to `false` in `materials`. It disappears from New Ticket and the
assistant but stays on old tickets.

## Check the list

```sql
select d.code as department, m.name as material,
       case when m.is_active then 'Active' else 'Inactive' end as status
from public.materials m join public.departments d on d.id = m.department_id
order by d.sort_order, d.code, m.sort_order, m.name;
```

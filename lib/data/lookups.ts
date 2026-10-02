import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { logServerError } from "@/lib/utils/errors";
import type { Department, Material, MaterialAlias } from "@/types/domain";

/** Departments + materials (including inactive, so old tickets still display names) + material aliases. */
export const getLookups = cache(
  async (): Promise<{ departments: Department[]; materials: Material[]; aliases: MaterialAlias[] }> => {
    await requireSession();
    const [d, m, a] = await Promise.all([
      db().from("departments").select("id, code, name, sort_order, is_active").order("sort_order"),
      db().from("materials").select("id, department_id, name, is_rigid, sort_order, is_active").order("sort_order"),
      db().from("material_aliases").select("id, material_id, alias"),
    ]);
    if (d.error) throw d.error;
    if (m.error) throw m.error;
    // Aliases only help Quick Import; if migration 0009 hasn't run yet, carry on without them.
    if (a.error) logServerError("material-aliases", a.error);
    return {
      departments: d.data as Department[],
      materials: m.data as Material[],
      aliases: a.error ? [] : (a.data as MaterialAlias[]),
    };
  },
);

import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import type { Department, Material } from "@/types/domain";

/** Departments + materials (including inactive, so old tickets still display names). */
export const getLookups = cache(async (): Promise<{ departments: Department[]; materials: Material[] }> => {
  await requireSession();
  const [d, m] = await Promise.all([
    db().from("departments").select("id, code, name, sort_order, is_active").order("sort_order"),
    db().from("materials").select("id, department_id, name, is_rigid, sort_order, is_active").order("sort_order"),
  ]);
  if (d.error) throw d.error;
  if (m.error) throw m.error;
  return { departments: d.data as Department[], materials: m.data as Material[] };
});

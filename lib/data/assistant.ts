import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { logServerError } from "@/lib/utils/errors";
import { isAssistantField } from "@/lib/assistant/fields";
import { DEFAULT_MISSING_RULES } from "@/lib/assistant/missing";
import type { MissingRule } from "@/lib/assistant/types";

/** Missing-information rules from Supabase (falls back to the built-in defaults if 0011 hasn't run). */
export const getMissingRules = cache(async (): Promise<MissingRule[]> => {
  await requireSession();
  const { data, error } = await db()
    .from("assistant_missing_rules")
    .select("trigger_type, trigger_value, field, label, condition, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    logServerError("missing-rules", error);
    return DEFAULT_MISSING_RULES;
  }
  return (data as MissingRule[]).filter((r) => isAssistantField(r.field));
});

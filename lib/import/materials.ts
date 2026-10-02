/**
 * Material + department matching against the database lookups.
 * No material names live in code: add materials or aliases in Supabase
 * (materials / material_aliases tables) and the parser picks them up.
 */
import { MATERIAL_TOKENS } from "./vocabulary";
import type { ImportLookups } from "./types";

/** Lower-case, unify quotes/dashes, single spaces. */
export function basicNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparison key: basic normalize + expand shorthand tokens + sort-insensitive token bag. */
export function materialKey(s: string): string {
  const tokens = basicNormalize(s)
    .replace(/[^a-z0-9."/ -]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => (MATERIAL_TOKENS[t] ?? t).split(" "));
  return tokens.join(" ");
}

function tokenBag(s: string): string {
  return materialKey(s).split(" ").sort().join(" ");
}

export interface MaterialMatch {
  materialId: string;
  departmentId: string;
  name: string;
  how: "name" | "alias" | "shorthand";
  matchedText: string;
}

/**
 * Find a material for a piece of pasted text.
 *  1. exact material name (case-insensitive)
 *  2. exact alias (case-insensitive, from material_aliases)
 *  3. same words after expanding shorthand (DS → double sided, 4m → 4mil),
 *     in any order — only if exactly ONE material matches.
 */
export function matchMaterial(text: string, lookups: ImportLookups): MaterialMatch | null {
  const raw = text.trim();
  if (!raw) return null;
  const n = basicNormalize(raw);
  const byId = new Map(lookups.materials.map((m) => [m.id, m]));

  const exact = lookups.materials.find((m) => basicNormalize(m.name) === n);
  if (exact) return { materialId: exact.id, departmentId: exact.department_id, name: exact.name, how: "name", matchedText: raw };

  const alias = lookups.aliases.find((a) => basicNormalize(a.alias) === n);
  if (alias && byId.has(alias.material_id)) {
    const m = byId.get(alias.material_id)!;
    return { materialId: m.id, departmentId: m.department_id, name: m.name, how: "alias", matchedText: raw };
  }

  const bag = tokenBag(raw);
  const candidates = new Map<string, (typeof lookups.materials)[number]>();
  for (const m of lookups.materials) if (tokenBag(m.name) === bag) candidates.set(m.id, m);
  for (const a of lookups.aliases) {
    if (tokenBag(a.alias) === bag && byId.has(a.material_id)) candidates.set(a.material_id, byId.get(a.material_id)!);
  }
  if (candidates.size === 1) {
    const m = [...candidates.values()][0];
    return { materialId: m.id, departmentId: m.department_id, name: m.name, how: "shorthand", matchedText: raw };
  }
  return null;
}

/** Department by code or name ("Rigid", "RIGID"). */
export function matchDepartment(text: string, lookups: ImportLookups) {
  const n = basicNormalize(text);
  if (!n) return null;
  return lookups.departments.find((d) => basicNormalize(d.code) === n || basicNormalize(d.name) === n) ?? null;
}

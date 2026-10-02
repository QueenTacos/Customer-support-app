/**
 * Fixed option lists. These mirror the CHECK constraints in
 * supabase/migrations/*_tickets.sql — change both together via a migration.
 */

export const STATUSES = [
  "open",
  "in_progress",
  "follow_up",
  "waiting_photos",
  "waiting_customer",
  "waiting_fedex",
  "rush_reprint",
  "closed",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_META: Record<Status, { label: string; badge: string; dot: string }> = {
  open:             { label: "Open",                badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30", dot: "bg-emerald-400" },
  in_progress:      { label: "In Progress",         badge: "bg-teal-500/15 text-teal-300 ring-teal-500/30",          dot: "bg-teal-400" },
  follow_up:        { label: "Follow Up",           badge: "bg-violet-500/15 text-violet-300 ring-violet-500/30",    dot: "bg-violet-400" },
  waiting_photos:   { label: "Waiting on Photos",   badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30",       dot: "bg-amber-400" },
  waiting_customer: { label: "Waiting on Customer", badge: "bg-sky-500/15 text-sky-300 ring-sky-500/30",             dot: "bg-sky-400" },
  waiting_fedex:    { label: "Waiting for FedEx",   badge: "bg-blue-500/15 text-blue-300 ring-blue-500/30",          dot: "bg-blue-400" },
  rush_reprint:     { label: "Rush Reprint",        badge: "bg-red-500/20 text-red-300 ring-red-500/40",             dot: "bg-red-400" },
  closed:           { label: "Closed",              badge: "bg-slate-500/15 text-slate-300 ring-slate-500/30",       dot: "bg-slate-400" },
};

/** Statuses selectable while editing. Closing uses the Close Ticket workflow (Phase 3). */
export const EDITABLE_STATUSES = STATUSES.filter((s) => s !== "closed");

export const ISSUES = ["damage", "missing", "late", "color", "cutting", "production", "file", "other"] as const;
export type Issue = (typeof ISSUES)[number];
export const ISSUE_LABELS: Record<Issue, string> = {
  damage: "Damage",
  missing: "Missing",
  late: "Late",
  color: "Color",
  cutting: "Cutting",
  production: "Production",
  file: "File",
  other: "Other",
};

export const FAULTS = ["production_error", "fedex_error", "customer_error", "other"] as const;
export type Fault = (typeof FAULTS)[number];
export const FAULT_LABELS: Record<Fault, string> = {
  production_error: "Production Error",
  fedex_error: "FedEx Error",
  customer_error: "Customer Error",
  other: "Other",
};

export const RESOLUTION_TYPES = ["reprint", "refund", "discount", "credit", "none", "other"] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];
export const RESOLUTION_LABELS: Record<ResolutionType, string> = {
  reprint: "Reprint",
  refund: "Refund",
  discount: "Discount",
  credit: "Credit",
  none: "None",
  other: "Other",
};

export const POINTS_OF_CONTACT = ["SW", "MC", "LPU"] as const;
export type PointOfContact = (typeof POINTS_OF_CONTACT)[number];
export const POC_LABELS: Record<PointOfContact, string> = {
  SW: "SW — Phone",
  MC: "MC — Message Center",
  LPU: "LPU — Local Pickup",
};

export function label<T extends string>(map: Record<T, string>, v: T | null | undefined, fallback = "—") {
  return v ? (map[v] ?? v) : fallback;
}

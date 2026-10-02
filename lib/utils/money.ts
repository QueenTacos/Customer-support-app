const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.50" for display; "—" when empty. */
export function formatMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? usd.format(n) : "—";
}

/** "17.50" — plain number with two decimals, no symbol (for copy text / inputs). */
export function plainMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

/** Parse "$1,234.5" → 1234.5. Returns null for empty, NaN for invalid. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Number(s);
}

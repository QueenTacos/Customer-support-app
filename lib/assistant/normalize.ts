/** Stage 1: make pasted text predictable without changing its meaning. */
import { DOMAIN_WORDS } from "./vocabulary";

/** Rejoin accidental splits ("r eprint" → "reprint") using known domain words only. */
export function rejoinSplitWords(s: string): string {
  return s.replace(/\b([A-Za-z]{1,2}) ([A-Za-z]{3,})\b/g, (whole, a: string, b: string) => {
    const joined = (a + b).toLowerCase();
    return DOMAIN_WORDS.has(joined) && !DOMAIN_WORDS.has(b.toLowerCase()) ? a + b : whole;
  });
}

const URL_RE = /\bhttps?:\/\/\S+/gi;

/** "[039015000767](https://…)" → "039015000767"; strips bare URLs; collapses spaces. */
export function cleanValue(v: string): string {
  return v
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1")
    .replace(/<https?:[^>]+>/gi, "")
    .replace(URL_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[“”″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .split("\n")
    .map((l) => rejoinSplitWords(cleanValue(l.replace(/\t/g, " "))))
    .filter((l) => l.length > 0);
}

export function toIsoDate(v: string, today: string): { iso: string; yearInferred: boolean } | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { iso: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, yearInferred: false };
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year: string;
    let yearInferred = false;
    if (m[3]) year = m[3].length === 2 ? `20${m[3]}` : m[3];
    else {
      // No year: assume the next occurrence of that date from today.
      yearInferred = true;
      const [ty, tm, td] = today.split("-").map(Number);
      year = String(month < tm || (month === tm && day < td) ? ty + 1 : ty);
    }
    return { iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, yearInferred };
  }
  return null;
}

export function moneyToPlain(v: string): string | null {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() !== "" && Number.isFinite(n) ? n.toFixed(2) : null;
}

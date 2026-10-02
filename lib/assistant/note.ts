/**
 * Ticket-note handling (deterministic fallback — always available).
 *  - find an "SW/ Name - …" style note anywhere a line starts with it
 *  - clean up the narrative (abbreviations, split words, sentence case, money)
 *  - build the final note in Jessica's format: "SW/ Greg - Order delayed. …"
 */
import {
  CARRIERS,
  NOTE_ABBREVIATIONS,
  NOTE_LABEL_WORDS,
  NOTE_PHRASES,
  NOTE_PREFIX_ALLOWED_RE,
  POC_RE,
  PROPER_WORDS,
} from "./vocabulary";
import type { PointOfContact } from "@/lib/domain/options";
import { rejoinSplitWords } from "./normalize";

export interface ParsedNote {
  poc: PointOfContact | null;
  /** Person or carrier after the prefix ("Greg", "FedEx"). */
  name: string | null;
  isCarrier: boolean;
  /** Product shorthand between name and narrative ("Coro 4m DS"). */
  product: string | null;
  narrative: string;
}

const NAME_RE = /^[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,2}$/;

export const isCarrierName = (name: string | null | undefined) =>
  !!name && CARRIERS.some((c) => c.toLowerCase() === name.trim().toLowerCase());

/** Where an SW/ / MC/ / LPU/ note starts in a line (allowing "Note:" or a timestamp before it), or -1. */
export function noteStartIndex(line: string): number {
  const m = POC_RE.exec(line);
  if (!m) return -1;
  const start = m.index + m[0].search(/(SW|MC|LPU)/i);
  return NOTE_PREFIX_ALLOWED_RE.test(line.slice(0, start)) ? start : -1;
}

export function parseNote(text: string): ParsedNote {
  const t = text.trim();
  const m = t.match(/^(SW|MC|LPU)\s*\/\s*/i);
  if (!m) return { poc: null, name: null, isCarrier: false, product: null, narrative: t };

  const poc = m[1].toUpperCase() as PointOfContact;
  let rest = t.slice(m[0].length).trim();
  let name: string | null = null;
  let product: string | null = null;

  // Name runs to the first "/" or " - " (or "-" right after a single word: "SW/Greg- …").
  const sep = rest.search(/\s*\/\s*|\s+-\s*|-\s+/);
  if (sep > 0) {
    const candidate = rest.slice(0, sep).trim();
    if (NAME_RE.test(candidate) && candidate.length <= 40) {
      name = candidate;
      const after = rest.slice(sep);
      if (/^\s*\//.test(after)) {
        const body = after.replace(/^\s*\/\s*/, "");
        const dash = body.search(/\s+-\s+/);
        if (dash > 0) {
          product = body.slice(0, dash).trim();
          rest = body.slice(dash).replace(/^\s+-\s+/, "");
        } else {
          rest = body;
        }
      } else {
        rest = after.replace(/^\s*-\s*/, "");
      }
    }
  }
  return { poc, name, isCarrier: isCarrierName(name), product, narrative: rest.trim() };
}

const MONEY_AFTER_LABEL_RE = new RegExp(
  String.raw`\b(${NOTE_LABEL_WORDS.join("|")})\s*:\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\b`,
  "gi",
);

/** Clean up narrative text without changing its meaning. */
export function normalizeNarrative(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  if (!s) return "";

  s = rejoinSplitWords(s);
  for (const { pattern, replace } of NOTE_PHRASES) s = s.replace(pattern, replace);

  // Whole-token abbreviations.
  s = s.replace(/\b[A-Za-z]{2,6}\b/g, (tok) => NOTE_ABBREVIATIONS[tok.toLowerCase()] ?? tok);
  for (const { pattern, replace } of NOTE_PHRASES) s = s.replace(pattern, replace);

  // "… 9/15 value: 17.50" → "… 9/15. Value: $17.50"
  s = s.replace(MONEY_AFTER_LABEL_RE, (_m, label: string, amount: string) => {
    const n = Number(amount.replace(/,/g, ""));
    return `${label}: $${n.toFixed(2)}`;
  });
  const labelStart = new RegExp(String.raw`([^.!?\s])\s+(${NOTE_LABEL_WORDS.join("|")}):`, "gi");
  s = s.replace(labelStart, "$1. $2:");

  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((sentence) => {
      const words = sentence.split(" ");
      const capitalised = words.filter((w) => /^[A-Z][a-z]+[.,!?]?$/.test(w)).length;
      if (words.length >= 2 && capitalised / words.length >= 0.6) {
        sentence = words
          .map((w, i) => {
            const bare = w.replace(/[.,!?]$/, "");
            if (i === 0 || PROPER_WORDS.has(bare) || !/^[A-Z][a-z]+$/.test(bare)) return w;
            return w.toLowerCase();
          })
          .join(" ");
      }
      sentence = sentence[0].toUpperCase() + sentence.slice(1);
      if (!/[.!?]$/.test(sentence)) sentence += ".";
      return sentence;
    });
  return sentences.join(" ");
}

export function formatPrefix(poc: string | null | undefined, name: string | null | undefined): string {
  if (!poc) return "";
  return name ? `${poc}/ ${name} - ` : `${poc}/ `;
}

/** Numbers/IDs a note must preserve: order/tracking/case numbers, money, dates. */
export function identifiersIn(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\bC-\d{6,}\b|\b\d{9,22}\b|\b1Z[0-9A-Z]{16}\b/gi)) ids.add(m[0].toUpperCase());
  for (const m of text.matchAll(/\$?\d+\.\d{2}\b/g)) ids.add(Number(m[0].replace("$", "")).toFixed(2));
  for (const m of text.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)) ids.add(m[0]);
  return [...ids];
}

/** Which identifiers from `source` are absent from `note`. */
export function droppedIdentifiers(source: string, note: string): string[] {
  const inNote = new Set(identifiersIn(note));
  return identifiersIn(source).filter((id) => !inNote.has(id));
}

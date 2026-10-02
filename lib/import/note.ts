/**
 * Ticket-note parsing and normalisation.
 *   "SW/ Greg / Coro 4m DS - Order Delayed. TKG shows delay. Looking into"
 *   → poc SW, contact Greg, product "Coro 4m DS",
 *     narrative "Order delayed. Tracking shows a delay. Looking into."
 */
import { NOTE_ABBREVIATIONS, NOTE_PHRASES, POC_PREFIX_RE, PROPER_WORDS } from "./vocabulary";
import type { PointOfContact } from "@/lib/domain/options";

export interface ParsedNote {
  poc: PointOfContact | null;
  name: string | null;
  product: string | null;
  narrative: string;
}

const NAME_RE = /^[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,2}$/;

export function isNoteLine(line: string) {
  return POC_PREFIX_RE.test(line.trim());
}

export function parseNote(text: string): ParsedNote {
  const t = text.trim();
  const m = t.match(POC_PREFIX_RE);
  if (!m) return { poc: null, name: null, product: null, narrative: t };

  const poc = m[1].toUpperCase() as PointOfContact;
  let rest = t.slice(m[0].length).trim();
  let name: string | null = null;
  let product: string | null = null;

  // name: up to the first "/" or " - "
  const sep = rest.search(/\s*\/\s*|\s+-\s+/);
  if (sep > 0) {
    const candidate = rest.slice(0, sep).trim();
    if (NAME_RE.test(candidate) && candidate.length <= 40) {
      name = candidate;
      const after = rest.slice(sep);
      if (/^\s*\//.test(after)) {
        // "/ product - narrative"
        const body = after.replace(/^\s*\/\s*/, "");
        const dash = body.search(/\s+-\s+/);
        if (dash > 0) {
          product = body.slice(0, dash).trim();
          rest = body.slice(dash).replace(/^\s+-\s+/, "");
        } else {
          rest = body;
        }
      } else {
        rest = after.replace(/^\s+-\s+/, "");
      }
    }
  }
  return { poc, name, product, narrative: rest.trim() };
}

/** Clean up the narrative: phrases, abbreviations (whole tokens), sentence case, punctuation. */
export function normalizeNarrative(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  if (!s) return "";

  for (const { pattern, replace } of NOTE_PHRASES) s = s.replace(pattern, replace);

  // Whole-token abbreviation expansion (never inside other words).
  s = s.replace(/\b[A-Za-z]{2,4}\b/g, (tok) => {
    const exp = NOTE_ABBREVIATIONS[tok.toUpperCase()];
    return exp ? exp : tok;
  });
  // Phrases may need a second pass after expansion ("TKG shows delay").
  for (const { pattern, replace } of NOTE_PHRASES) s = s.replace(pattern, replace);

  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((sentence) => {
      const words = sentence.split(" ");
      const capitalised = words.filter((w) => /^[A-Z][a-z]+[.,!?]?$/.test(w)).length;
      // "Order Delayed." → "Order delayed." (Title Case sentences only)
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

/** "SW/ Greg - Order delayed. …" in Jessica's preferred format. */
export function formatNote(p: ParsedNote): string {
  const body = normalizeNarrative(p.narrative);
  if (!p.poc) return body;
  return p.name ? `${p.poc}/ ${p.name} - ${body}` : `${p.poc}/ ${body}`;
}

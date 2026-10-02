/**
 * Quick Import parser — turns raw text pasted from internal systems into
 * suggested New Ticket values. It never touches the database or the form;
 * the review screen decides what is applied.
 *
 * Staged pipeline:
 *   1  normalise text (line endings, quotes, Markdown links → their label)
 *   2  labeled "Ticket information" (Label / value pairs)
 *   3  product "line information" blocks
 *   4  ticket-note lines (SW/ MC/ LPU/ …)
 *   5  explicit values from the labeled block
 *   6  department + material matching against the database lookups
 *   7  material aliases / shorthand (inside matchMaterial)
 *   8  issue keywords
 *   9  tracking numbers and FedEx case numbers
 *  10  inferences (contact name, fault) — always marked "inferred"
 *  11  normalised initial note
 *  12  structured result for the review screen
 */
import { FAULT_LABELS, ISSUE_LABELS, type Fault, type Issue } from "@/lib/domain/options";
import { basicNormalize, matchDepartment, matchMaterial } from "./materials";
import { formatNote, isNoteLine, parseNote } from "./note";
import type { ImportField, ImportLookups, ParseResult, UnusedValue } from "./types";
import {
  CARRIER_RE,
  FAULT_PHRASES,
  FEDEX_CASE_RE,
  FEDEX_INVESTIGATION_RE,
  ISSUE_KEYWORDS,
  ISSUE_WORDS,
  LINE_STATUS_RE,
  SECTION_HEADINGS,
  TICKET_INFO_LABELS,
  TRACKING_IN_TEXT_RE,
  type LabeledKey,
} from "./vocabulary";

/* ------------------------------------------------------------------------- *
 * Stage 1 — normalise
 * ------------------------------------------------------------------------- */

const URL_RE = /\bhttps?:\/\/\S+/gi;

export function cleanValue(v: string): string {
  return v
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1") // [label](url) → label
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
    .split("\n")
    .map((l) => cleanValue(l.replace(/\t/g, " ")))
    .filter((l) => l.length > 0);
}

/* ------------------------------------------------------------------------- *
 * Helpers
 * ------------------------------------------------------------------------- */

const labelOf = (line: string): LabeledKey | null => TICKET_INFO_LABELS[basicNormalize(line).replace(/:$/, "")] ?? null;

const isHeading = (line: string) => SECTION_HEADINGS.some((re) => re.test(line.trim()));
const isMoney = (l: string) => /^\$?\s*[\d,]+\.\d{2}$/.test(l);
const isWeight = (l: string) => /^\d+(\.\d+)?\s*(lbs?|pounds?)$/i.test(l);
const isInt = (l: string) => /^\d{1,6}$/.test(l);
const isSize = (l: string) => /\d+(\.\d+)?\s*(?:"|in\b|inch(?:es)?|')?\s*[x×]\s*\d/i.test(l);

function toIsoDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function money(v: string): string | null {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n.toFixed(2) : null;
}

/** An order number: the first token that looks like one (strips any leftover link text). */
function orderNumberFrom(v: string): string | null {
  const m = cleanValue(v).match(/[A-Za-z0-9][A-Za-z0-9-]{3,}/);
  return m ? m[0] : null;
}

/** Word that is an issue on its own ("Late", "Damaged"). */
function issueWord(v: string): Issue | null {
  return ISSUE_WORDS[basicNormalize(v).replace(/[.!]$/, "")] ?? null;
}

function issueFromText(text: string): { issue: Issue; word: string } | null {
  for (const { issue, pattern } of ISSUE_KEYWORDS) {
    const m = text.match(pattern);
    if (m) return { issue, word: m[0] };
  }
  return null;
}

const COMPANY_WORDS = /\b(inc|llc|ltd|co|corp|company|signs?|printing|group|church|school|realty|motors|dental|services?|solutions|studio|shop|store|&)\b/i;

/** "Greg Kiel" → "Greg" when it looks like a person's name. */
function firstNameOf(customer: string): string | null {
  const c = customer.trim();
  if (COMPANY_WORDS.test(c)) return null;
  if (!/^[A-Z][a-z'-]+(\s+[A-Z][a-z'.-]+){1,2}$/.test(c)) return null;
  return c.split(/\s+/)[0];
}

/* ------------------------------------------------------------------------- *
 * Main
 * ------------------------------------------------------------------------- */

export function parseQuickImport(raw: string, lookups: ImportLookups): ParseResult {
  const lines = normalizeLines(raw);
  const used = new Array(lines.length).fill(false);
  const fields: ImportField[] = [];
  const unused: UnusedValue[] = [];
  const warnings: string[] = [];
  const unmatchedMaterials: ParseResult["unmatchedMaterials"] = [];
  const sections = new Set<ParseResult["sections"][number]>();

  const add = (f: ImportField) => {
    // Keep the first extracted value per key; an extracted value beats an inferred one.
    const i = fields.findIndex((x) => x.key === f.key);
    if (i === -1) fields.push(f);
    else if (fields[i].confidence === "inferred" && f.confidence === "extracted") fields[i] = f;
  };

  lines.forEach((l, i) => {
    if (isHeading(l)) used[i] = true;
  });

  /* -- Stage 2: labeled ticket information -------------------------------- */
  const labeled: Partial<Record<LabeledKey, string>> = {};
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const line = lines[i];
    // "Label: value" on one line
    const inline = line.match(/^([A-Za-z #]+?)\s*:\s*(.+)$/);
    if (inline && labelOf(inline[1])) {
      const key = labelOf(inline[1])!;
      if (!(key in labeled)) labeled[key] = inline[2].trim();
      used[i] = true;
      continue;
    }
    // "Label" then value on the next line
    const key = labelOf(line);
    if (key && i + 1 < lines.length && !labelOf(lines[i + 1]) && !isHeading(lines[i + 1])) {
      if (!(key in labeled)) labeled[key] = lines[i + 1];
      used[i] = used[i + 1] = true;
      i++;
    }
  }
  if (Object.keys(labeled).length) sections.add("ticket_info");

  /* -- Stage 3: line information block ------------------------------------ */
  const line: { lineNo?: string; dept?: string; material?: string; size?: string; weight?: string; qty?: string; value?: string; status?: string } = {};
  let lineBlocks = 0;
  for (let j = 0; j < lines.length; j++) {
    if (used[j] || !matchDepartment(lines[j], lookups)) continue;
    // A department line followed (within 7 lines) by a weight or money line = product line.
    const window = lines.slice(j + 1, j + 8);
    if (!window.some((l) => isMoney(l) || isWeight(l))) continue;
    lineBlocks++;
    if (lineBlocks > 1) {
      warnings.push("More than one product line was found. Only the first one was used — check the rest manually.");
      break;
    }
    sections.add("line_info");
    if (j > 0 && !used[j - 1] && isInt(lines[j - 1])) {
      line.lineNo = lines[j - 1];
      used[j - 1] = true;
    }
    line.dept = lines[j];
    used[j] = true;
    let k = j + 1;
    if (k < lines.length && !used[k] && !isSize(lines[k]) && !isMoney(lines[k]) && !isWeight(lines[k]) && !isInt(lines[k]) && !isNoteLine(lines[k])) {
      line.material = lines[k];
      used[k] = true;
      k++;
    }
    for (; k < Math.min(lines.length, j + 9); k++) {
      const l = lines[k];
      if (used[k] || isNoteLine(l)) break;
      if (!line.size && isSize(l)) line.size = l;
      else if (!line.weight && isWeight(l)) line.weight = l;
      else if (!line.value && isMoney(l)) line.value = l;
      else if (!line.qty && isInt(l)) line.qty = l;
      else if (!line.status && LINE_STATUS_RE.test(l)) line.status = l;
      else break;
      used[k] = true;
    }
  }

  /* -- Stage 4: ticket note ----------------------------------------------- */
  let noteText: string | null = null;
  const noteStart = lines.findIndex((l, i) => !used[i] && isNoteLine(l));
  if (noteStart !== -1) {
    const parts: string[] = [];
    for (let i = noteStart; i < lines.length; i++) {
      if (used[i]) continue;
      if (i > noteStart && (labelOf(lines[i]) || isHeading(lines[i]))) break;
      parts.push(lines[i]);
      used[i] = true;
    }
    noteText = parts.join(" ");
  } else {
    // Free text that isn't part of any block and reads like a sentence.
    const free = lines.filter((l, i) => !used[i] && /[a-z]{3,}\s+[a-z]{2,}/i.test(l) && l.length >= 15);
    if (free.length) {
      noteText = free.join(" ");
      lines.forEach((l, i) => {
        if (free.includes(l)) used[i] = true;
      });
    }
  }
  const note = noteText ? parseNote(noteText) : null;
  if (note) sections.add("ticket_note");

  /* -- Stage 5: explicit values ------------------------------------------- */
  if (labeled.ticket_number) {
    const v = cleanValue(labeled.ticket_number);
    if (v) add({ key: "ticket_number", value: v, confidence: "extracted", source: "Ticket information · Ticket ID" });
  }
  if (labeled.opened) {
    const d = toIsoDate(labeled.opened);
    if (d) add({ key: "date_opened", value: d, confidence: "extracted", source: "Ticket information · Opened" });
  }
  if (labeled.customer) {
    add({ key: "customer_name", value: cleanValue(labeled.customer), confidence: "extracted", source: "Ticket information · Ordering User" });
  }
  if (labeled.contact) {
    add({ key: "contact_name", value: cleanValue(labeled.contact), confidence: "extracted", source: "Ticket information · Contact" });
  }
  if (labeled.order_number) {
    const v = orderNumberFrom(labeled.order_number);
    if (v) add({ key: "order_number", value: v, confidence: "extracted", source: "Ticket information · Order Number" });
  }
  if (labeled.tracking) {
    const v = cleanValue(labeled.tracking).replace(/\s+/g, "");
    if (v) add({ key: "tracking_number", value: v, confidence: "extracted", source: "Ticket information · Tracking" });
  }
  if (labeled.phone) unused.push({ label: "Phone Number", value: cleanValue(labeled.phone) });
  if (labeled.email) unused.push({ label: "Email", value: cleanValue(labeled.email) });
  if (labeled.status) unused.push({ label: "Status (internal)", value: cleanValue(labeled.status) });

  // Description: "Coro 4mil Double Sided - Late" → material text + issue word.
  let descMaterial: string | null = null;
  let descIssue: Issue | null = null;
  if (labeled.description) {
    const d = cleanValue(labeled.description);
    const dash = d.lastIndexOf(" - ");
    if (dash > 0 && issueWord(d.slice(dash + 3))) {
      descMaterial = d.slice(0, dash).trim();
      descIssue = issueWord(d.slice(dash + 3));
    } else if (issueWord(d)) {
      descIssue = issueWord(d);
    } else {
      descMaterial = d;
    }
  }

  /* -- Stage 6/7: department + material ----------------------------------- */
  const deptSources: [string | undefined, string][] = [
    [labeled.category, "Ticket information · Category"],
    [labeled.category_description, "Ticket information · Category Description"],
    [line.dept, "Line information"],
  ];
  for (const [text, source] of deptSources) {
    if (!text) continue;
    const d = matchDepartment(text, lookups);
    if (d) {
      add({ key: "department_id", value: d.id, confidence: "extracted", source });
      break;
    }
  }

  const materialSources: [string | null | undefined, string][] = [
    [descMaterial, "Ticket information · Description"],
    [line.material, "Line information"],
    [note?.product, "Ticket note"],
  ];
  let materialFound = false;
  const misses: { raw: string; source: string }[] = [];
  for (const [text, source] of materialSources) {
    if (!text) continue;
    const m = matchMaterial(text, lookups);
    if (m) {
      if (!materialFound) {
        add({
          key: "material_id",
          value: m.materialId,
          confidence: "extracted",
          source: m.how === "name" ? source : `${source} · "${m.matchedText}" matched ${m.how === "alias" ? "an alias" : "shorthand"}`,
        });
        materialFound = true;
        if (!fields.some((f) => f.key === "department_id")) {
          add({ key: "department_id", value: m.departmentId, confidence: "extracted", source: "Department of the matched material" });
        }
      }
    } else {
      misses.push({ raw: text, source });
    }
  }
  if (!materialFound && misses.length) {
    // Keep each distinct unmatched name; never discard what was pasted.
    const seen = new Set<string>();
    const deptId = fields.find((f) => f.key === "department_id")?.value ?? null;
    for (const miss of misses) {
      const k = basicNormalize(miss.raw);
      if (seen.has(k)) continue;
      seen.add(k);
      unmatchedMaterials.push({ ...miss, departmentId: deptId });
    }
  }

  /* -- Line-information values -------------------------------------------- */
  if (line.size) add({ key: "size", value: line.size, confidence: "extracted", source: "Line information" });
  if (line.qty) add({ key: "quantity", value: line.qty, confidence: "extracted", source: "Line information" });
  if (line.value) {
    const v = money(line.value);
    if (v) add({ key: "order_value", value: v, confidence: "extracted", source: "Line information" });
  }
  if (line.lineNo) unused.push({ label: "Line number", value: line.lineNo });
  if (line.weight) unused.push({ label: "Weight", value: line.weight });
  if (line.status) unused.push({ label: "Line status", value: line.status });

  /* -- Note values -------------------------------------------------------- */
  if (note?.poc) add({ key: "point_of_contact", value: note.poc, confidence: "extracted", source: "Ticket note prefix" });

  /* -- Stage 8: issue ------------------------------------------------------ */
  const allText = [labeled.description, note?.narrative].filter(Boolean).join(" ");
  if (descIssue) {
    add({ key: "issue", value: descIssue, confidence: "extracted", source: "Ticket information · Description" });
  } else if (note) {
    const hit = issueFromText(note.narrative);
    if (hit) add({ key: "issue", value: hit.issue, confidence: "extracted", source: `Ticket note · "${hit.word}"` });
  }

  /* -- Stage 9: identifiers ---------------------------------------------- */
  const caseMatch = allText.match(FEDEX_CASE_RE);
  if (caseMatch) add({ key: "fedex_case_number", value: caseMatch[0].toUpperCase(), confidence: "extracted", source: "Ticket note" });
  if (note) {
    const trk = note.narrative.match(TRACKING_IN_TEXT_RE);
    if (trk) add({ key: "tracking_number", value: trk[1], confidence: "extracted", source: "Ticket note" });
    if (FEDEX_INVESTIGATION_RE.test(note.narrative)) {
      add({ key: "fedex_investigation_opened", value: "yes", confidence: "extracted", source: "Ticket note · trace opened with FedEx" });
    }
  }

  /* -- Stage 10: inferences (must be confirmed) --------------------------- */
  if (!fields.some((f) => f.key === "contact_name")) {
    const customer = fields.find((f) => f.key === "customer_name")?.value;
    if (note?.name) {
      add({
        key: "contact_name",
        value: note.name,
        confidence: "inferred",
        source: "Ticket note",
        reason: `Name after "${note.poc}/" in the note${customer ? ` (Ordering User is ${customer})` : ""}.`,
      });
    } else if (customer && firstNameOf(customer)) {
      add({
        key: "contact_name",
        value: firstNameOf(customer)!,
        confidence: "inferred",
        source: "Ticket information · Ordering User",
        reason: "First name of the Ordering User — confirm this is who you're speaking with.",
      });
    }
  }

  const explicitFault = FAULT_PHRASES.find((f) => f.pattern.test(allText));
  if (explicitFault) {
    add({ key: "fault", value: explicitFault.fault, confidence: "extracted", source: `Text says "${FAULT_LABELS[explicitFault.fault]}"` });
  } else {
    const issue = fields.find((f) => f.key === "issue")?.value as Issue | undefined;
    const carrier = note && CARRIER_RE.test(note.narrative);
    if (carrier && (issue === "late" || issue === "damage" || issue === "missing")) {
      add({
        key: "fault",
        value: "fedex_error" satisfies Fault,
        confidence: "inferred",
        source: "Ticket note",
        reason: `The note mentions FedEx on a ${ISSUE_LABELS[issue].toLowerCase()} order. That doesn't prove FedEx is responsible — confirm before accepting.`,
      });
    }
  }

  /* -- Leftovers ---------------------------------------------------------- */
  lines.forEach((l, i) => {
    if (!used[i]) unused.push({ label: "Not recognised", value: l });
  });

  /* -- Stage 11: note ------------------------------------------------------ */
  const noteOut = note && noteText ? { raw: noteText, normalized: formatNote(note) } : null;

  return { fields, note: noteOut, unused, unmatchedMaterials, warnings, sections: [...sections] };
}

import { describe, expect, it } from "vitest";
import { buildPatch, defaultDecision, parseQuickImport, planMerge, type ImportLookups, type ParseResult } from "@/lib/import";
import { normalizeNarrative } from "@/lib/import/note";
import { emptyTicketForm } from "@/lib/validation/ticket";

const RIGID = "dept-rigid";
const BANNER = "dept-banner";
const CORO = "mat-coro-ds";
const lookups: ImportLookups = {
  departments: [
    { id: RIGID, code: "RIGID", name: "Rigid" },
    { id: BANNER, code: "BANNER", name: "Banner" },
  ],
  materials: [
    { id: CORO, department_id: RIGID, name: "Coro 4mil Double Sided" },
    { id: "mat-svg13", department_id: BANNER, name: "svg13OZ" },
  ],
  aliases: [
    { material_id: CORO, alias: "Coro 4m DS" },
    { material_id: CORO, alias: "Coro 4mil DS" },
    { material_id: CORO, alias: "4mil Coro DS" },
  ],
};

const TICKET_INFO = `Ticket information:
Ticket ID
376522
Ordering User
Greg Kiel
Category
Rigid
Category Description
Rigid
Opened
2026-10-01 12:23:39
Order Number
039015000767
Description
Coro 4mil Double Sided - Late
Phone Number
(301) 986-0310`;

const LINE_INFO = `1
Rigid
Coro 4mil Double Sided
24"x18", 24"x36"
0 lbs
2
$220.00
Shipped`;

const NOTE =
  "SW/ Greg / Coro 4m DS - Order Delayed. Customer paid for rush. TKG shows delay. Opened trace with FedEx C-259861376. Looking into";

const COMBINED = `${TICKET_INFO}\n${LINE_INFO}\n${NOTE}`;

const get = (r: ParseResult, key: string) => r.fields.find((f) => f.key === key);

describe("Quick Import — combined paste (the acceptance test case)", () => {
  const r = parseQuickImport(COMBINED, lookups);

  it("recognises all three sections", () => {
    expect(r.sections.sort()).toEqual(["line_info", "ticket_info", "ticket_note"]);
  });

  it.each([
    ["ticket_number", "376522", "extracted"],
    ["date_opened", "2026-10-01", "extracted"],
    ["customer_name", "Greg Kiel", "extracted"],
    ["contact_name", "Greg", "inferred"],
    ["order_number", "039015000767", "extracted"],
    ["point_of_contact", "SW", "extracted"],
    ["department_id", RIGID, "extracted"],
    ["material_id", CORO, "extracted"],
    ["size", '24"x18", 24"x36"', "extracted"],
    ["quantity", "2", "extracted"],
    ["order_value", "220.00", "extracted"],
    ["issue", "late", "extracted"],
    ["fault", "fedex_error", "inferred"],
    ["fedex_case_number", "C-259861376", "extracted"],
  ])("%s = %s (%s)", (key, value, confidence) => {
    const f = get(r, key);
    expect(f?.value).toBe(value);
    expect(f?.confidence).toBe(confidence);
  });

  it("produces the normalized note", () => {
    expect(r.note?.normalized).toBe(
      "SW/ Greg - Order delayed. Customer paid for rush. Tracking shows a delay. Opened FedEx trace C-259861376. Looking into.",
    );
    expect(r.note?.raw).toBe(NOTE);
  });

  it("does not put the FedEx case into tracking, or invent a resolution/status", () => {
    expect(get(r, "tracking_number")).toBeUndefined();
    expect(r.fields.map((f) => f.key)).not.toContain("resolution_type" as never);
    expect(r.fields.map((f) => f.key)).not.toContain("status" as never);
  });

  it("lists information with no matching field instead of stuffing it somewhere", () => {
    const labels = r.unused.map((u) => `${u.label}=${u.value}`);
    expect(labels).toEqual(
      expect.arrayContaining(["Phone Number=(301) 986-0310", "Line number=1", "Weight=0 lbs", "Line status=Shipped"]),
    );
    expect(r.unused.find((u) => u.label === "Not recognised")).toBeUndefined();
    expect(r.unmatchedMaterials).toEqual([]);
  });
});

describe("Quick Import — single sections", () => {
  it("ticket information alone; contact is only inferred", () => {
    const r = parseQuickImport(TICKET_INFO, lookups);
    expect(get(r, "customer_name")?.value).toBe("Greg Kiel");
    expect(get(r, "contact_name")).toMatchObject({ value: "Greg", confidence: "inferred" });
    expect(get(r, "issue")?.value).toBe("late");
    expect(get(r, "material_id")?.value).toBe(CORO);
    expect(get(r, "fault")).toBeUndefined(); // no FedEx mention → no fault guess
  });

  it("line information alone ignores line #, weight and status", () => {
    const r = parseQuickImport(LINE_INFO, lookups);
    expect(r.sections).toEqual(["line_info"]);
    expect(get(r, "department_id")?.value).toBe(RIGID);
    expect(get(r, "material_id")?.value).toBe(CORO);
    expect(get(r, "size")?.value).toBe('24"x18", 24"x36"');
    expect(get(r, "quantity")?.value).toBe("2");
    expect(get(r, "order_value")?.value).toBe("220.00");
    expect(r.fields.map((f) => f.key).sort()).toEqual(["department_id", "material_id", "order_value", "quantity", "size"]);
  });

  it("raw note alone: POC, contact, shorthand material, issue, FedEx case, investigation", () => {
    const r = parseQuickImport(NOTE, lookups);
    expect(get(r, "point_of_contact")?.value).toBe("SW");
    expect(get(r, "contact_name")?.value).toBe("Greg");
    expect(get(r, "material_id")?.value).toBe(CORO);
    expect(get(r, "material_id")?.source).toMatch(/alias/);
    expect(get(r, "issue")?.value).toBe("late");
    expect(get(r, "fedex_case_number")?.value).toBe("C-259861376");
    expect(get(r, "fedex_investigation_opened")?.value).toBe("yes");
    expect(get(r, "fault")).toMatchObject({ value: "fedex_error", confidence: "inferred" });
  });
});

describe("Quick Import — details", () => {
  it("keeps only the displayed order number from a Markdown link", () => {
    const r = parseQuickImport(
      "Order Number\n[039015000767](https://chatgpt.com/g/g-p-6a85dd2059f48191bc015a00cd2597ae-work/c/URL)",
      lookups,
    );
    expect(get(r, "order_number")?.value).toBe("039015000767");
  });

  it("matches shorthand in any word order and case", () => {
    for (const s of ["coro 4mil ds", "4mil Coro DS", "CORO 4M DS", "Coro 4m Double Sided"]) {
      const r = parseQuickImport(`SW/ Ann / ${s} - Damaged in transit`, lookups);
      expect(get(r, "material_id")?.value, s).toBe(CORO);
    }
  });

  it("flags a material that isn't in the list and keeps the pasted name", () => {
    const r = parseQuickImport("Category\nRigid\nDescription\nAluminum .040 Single Sided - Damaged", lookups);
    expect(get(r, "material_id")).toBeUndefined();
    expect(r.unmatchedMaterials).toEqual([
      { raw: "Aluminum .040 Single Sided", source: "Ticket information · Description", departmentId: RIGID },
    ]);
    expect(get(r, "issue")?.value).toBe("damage");
  });

  it("does not expand abbreviations inside other words", () => {
    expect(normalizeNarrative("PKGS left at DMGX dock. TKG updated")).toBe("PKGS left at DMGX dock. Tracking updated.");
    expect(normalizeNarrative("DMG to PKG reported")).toBe("Damaged to package reported.");
  });

  it("only treats tracking numbers as tracking when introduced as tracking", () => {
    const r = parseQuickImport("SW/ Bo - Late. TKG 877732421485 shows exception. Order 039015000767", lookups);
    expect(get(r, "tracking_number")?.value).toBe("877732421485");
    expect(get(r, "order_number")).toBeUndefined();
  });

  it("never guesses: empty or junk input yields nothing", () => {
    const r = parseQuickImport("hello", lookups);
    expect(r.fields).toEqual([]);
    expect(r.note).toBeNull();
  });
});

describe("Quick Import — merging with the form", () => {
  const defaults = emptyTicketForm("2026-10-02");
  const r = parseQuickImport(COMBINED, lookups);

  it("defaults are treated as empty; typed values become conflicts", () => {
    const current = { ...defaults, material_id: "mat-svg13", customer_name: "Greg Kiel" };
    const rows = planMerge(current, defaults, r.fields);
    const by = (k: string) => rows.find((x) => x.field.key === k)!;
    expect(by("date_opened").state).toBe("new"); // was only today's default
    expect(by("point_of_contact").state).toBe("new"); // was only the SW default
    expect(by("customer_name").state).toBe("same");
    expect(by("material_id")).toMatchObject({ state: "conflict", current: "mat-svg13" });
  });

  it("keeps existing values unless told otherwise; inferred values need acceptance", () => {
    const current = { ...defaults, material_id: "mat-svg13" };
    const rows = planMerge(current, defaults, r.fields);
    const decisions = Object.fromEntries(rows.map((row) => [row.field.key, defaultDecision(row)]));
    let patch = buildPatch(rows, decisions);
    expect(patch.material_id).toBeUndefined(); // conflict → keep existing by default
    expect(patch.contact_name).toBeUndefined(); // inferred → off by default
    expect(patch.fault).toBeUndefined();
    expect(patch.ticket_number).toBe("376522");

    decisions.material_id = { ...decisions.material_id, accept: true, choice: "imported" };
    decisions.contact_name = { ...decisions.contact_name, accept: true };
    decisions.order_number = { ...decisions.order_number, value: "039015000768" }; // edited
    patch = buildPatch(rows, decisions);
    expect(patch.material_id).toBe(CORO);
    expect(patch.contact_name).toBe("Greg");
    expect(patch.order_number).toBe("039015000768");
  });
});

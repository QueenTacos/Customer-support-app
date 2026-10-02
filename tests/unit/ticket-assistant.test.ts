import { describe, expect, it } from "vitest";
import {
  analyzeDeterministic,
  buildChanges,
  computeMissing,
  defaultDecision,
  planMerge,
  reconcileAi,
  type AssistantLookups,
  type Proposal,
  type TicketContext,
} from "@/lib/assistant";
import { normalizeNarrative } from "@/lib/assistant/note";
import { validateAiOutput } from "@/lib/ai/validation";

const RIGID = "dept-rigid-0001";
const BANNER = "dept-banner-0002";
const ADHESIVE = "dept-adhesive-0003";
const CORO = "mat-coro-0001";
// Mirrors migration 0012: CORO is canonical; order wording is an alias.
const lookups: AssistantLookups = {
  departments: [
    { id: RIGID, code: "RIGID", name: "Rigid" },
    { id: BANNER, code: "BANNER", name: "Banner" },
    { id: ADHESIVE, code: "ADHESIVE", name: "Adhesive" },
  ],
  materials: [
    { id: CORO, department_id: RIGID, name: "CORO" },
    { id: "mat-pvc-0002", department_id: RIGID, name: "PVC" },
    { id: "mat-svg13-0003", department_id: BANNER, name: "svg13OZ" },
    { id: "mat-svgmesh-0004", department_id: BANNER, name: "svgMESH" },
    { id: "mat-cling207-0005", department_id: ADHESIVE, name: "CLING-GF207" },
    { id: "mat-oneway50-0006", department_id: ADHESIVE, name: "ONE WAY-50/50" },
    { id: "mat-oneway70-0007", department_id: ADHESIVE, name: "ONE WAY-70/30" },
  ],
  aliases: [
    "Coro 4mil Double Sided", "Coro 4mil Single Sided", "Coro 4m DS", "Coro 4m SS", "Coro 4mil DS", "Coro 4mil SS",
    "4mil Coro DS", "4mil Coro SS", "4m Coro DS", "4m Coro SS", "Coro DS", "Coro SS",
  ].map((alias) => ({ material_id: CORO, alias })),
};
const TODAY = "2026-10-02";

const run = (text: string, mode: "new" | "update" = "new", context?: TicketContext) =>
  analyzeDeterministic({ text, mode, lookups, context, today: TODAY }).proposal;
const get = (p: Proposal, key: string) => p.fields.find((f) => f.key === key);
const val = (p: Proposal, key: string) => get(p, key)?.value;

const COMBINED = `Ticket information:
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
[039015000767](https://example.com/orders/039015000767)
Description
Coro 4mil Double Sided - Late
Phone Number
(301) 986-0310
1
Rigid
Coro 4mil Double Sided
24"x18", 24"x36"
0 lbs
2
$220.00
Shipped
SW/ Greg / Coro 4m DS - Order Delayed. Customer paid for rush. TKG shows delay. Opened trace with FedEx C-259861376. Looking into`;

describe("New Ticket — combined paste", () => {
  const p = run(COMBINED);

  it.each([
    ["ticket_number", "376522", "extracted"],
    ["date_opened", "2026-10-01", "extracted"],
    ["customer_name", "Greg Kiel", "extracted"],
    ["contact_name", "Greg", "inferred"],
    ["order_number", "039015000767", "extracted"],
    ["point_of_contact", "SW", "extracted"],
    ["department_id", RIGID, "extracted"],
    ["material_id", CORO, "extracted"],
    ["material_type", "Coro 4mil Double Sided", "extracted"],
    ["size", '24"x18", 24"x36"', "extracted"],
    ["quantity", "2", "extracted"],
    ["affected_item_value", "220.00", "extracted"],
    ["fedex_case_number", "C-259861376", "extracted"],
    ["issue", "late", "extracted"],
    ["fault", "fedex_error", "inferred"],
  ])("%s = %s (%s)", (key, value, confidence) => {
    expect(get(p, key)).toMatchObject({ value, confidence });
  });

  it("leaves Total Order Value, Shipping and Tracking blank", () => {
    expect(get(p, "order_value")).toBeUndefined();
    expect(get(p, "shipping_cost")).toBeUndefined();
    expect(get(p, "tracking_number")).toBeUndefined();
    expect(get(p, "resolution_type")).toBeUndefined();
  });

  it("generates the note", () => {
    expect(p.note?.text).toBe(
      "SW/ Greg - Order delayed. Customer paid for rush. Tracking shows a delay. Opened FedEx trace C-259861376. Looking into.",
    );
    expect(p.note?.prefixSource).toBe("pasted");
    expect(p.note?.droppedIdentifiers).toEqual([]);
  });

  it("lists missing information for Late / FedEx Error", () => {
    expect(p.missing.map((m) => m.label)).toEqual(["Tracking Number", "Shipping Cost", "In-Hands Date"]);
  });

  it("keeps the original and lists extras without a field", () => {
    expect(p.original).toBe(COMBINED);
    const u = p.unused.map((x) => `${x.label}=${x.value}`);
    expect(u).toEqual(expect.arrayContaining(["Phone Number=(301) 986-0310", "Line number=1", "Weight=0 lbs", "Line status=Shipped"]));
    expect(p.unused.find((x) => x.label === "Not recognised")).toBeUndefined();
    expect(p.unmatchedMaterials).toEqual([]);
  });
});

describe("Order totals", () => {
  it("tracking / shipping / grand total (two-line)", () => {
    const p = run("Tracking Number\n877732421485\nShipping Cost\n$15.48\nGrand Total\n$412.75");
    expect(val(p, "tracking_number")).toBe("877732421485");
    expect(val(p, "shipping_cost")).toBe("15.48");
    expect(val(p, "order_value")).toBe("412.75");
    expect(get(p, "affected_item_value")).toBeUndefined();
  });

  it("sub-total / shipping / grand total — sub-total is not a field", () => {
    const p = run("Sub-total: $397.27\nShipping: $15.48\nGrand Total: $412.75");
    expect(val(p, "shipping_cost")).toBe("15.48");
    expect(val(p, "order_value")).toBe("412.75");
    expect(p.unused).toEqual(expect.arrayContaining([{ label: "Sub-total", value: "$397.27" }]));
  });

  it.each(["Shipping 15.48", "Shipping Cost: $15.48", "Ship Cost 15.48", "Freight $15.48", "shipping 20"])("shipping label: %s", (t) => {
    const p = run(t);
    expect(get(p, "shipping_cost")).toBeDefined();
    expect(get(p, "tracking_number")).toBeUndefined();
  });

  it('"Shipped" is not a cost', () => {
    const p = run("Shipped 9/15\nShipped");
    expect(get(p, "shipping_cost")).toBeUndefined();
  });
});

describe("Tracking formats", () => {
  it.each([
    "TKG 877732421485",
    "TKG: 877732421485",
    "TKG# 877732421485",
    "Tracking 877732421485",
    "Tracking: 877732421485",
    "Tracking Number: 877732421485",
    "SW/ Greg - TKG 877732421485 shows delivered",
  ])("%s", (t) => {
    const p = run(t);
    expect(val(p, "tracking_number")).toBe("877732421485");
    expect(get(p, "shipping_cost")).toBeUndefined();
    expect(get(p, "fedex_case_number")).toBeUndefined();
  });

  it('"TKG shows delay" has no tracking number', () => {
    const p = run("SW/ Greg - TKG shows delay");
    expect(get(p, "tracking_number")).toBeUndefined();
  });

  it("FedEx case never becomes tracking", () => {
    const p = run("SW/ Greg - Opened FedEx case C-259861376");
    expect(val(p, "fedex_case_number")).toBe("C-259861376");
    expect(get(p, "tracking_number")).toBeUndefined();
  });
});

describe("Resolution", () => {
  const p = run("SW/ Ray - confirmed img 8 missing. processed r eprint 210738000044, delivery 9/15 value: 17.50");
  it("fields", () => {
    expect(get(p, "issue")).toMatchObject({ value: "missing", confidence: "extracted" });
    expect(get(p, "resolution_type")).toMatchObject({ value: "reprint", confidence: "extracted" });
    expect(val(p, "reprint_order_number")).toBe("210738000044");
    expect(val(p, "reprint_value")).toBe("17.50");
    expect(get(p, "order_number")).toBeUndefined();
    expect(get(p, "tracking_number")).toBeUndefined();
  });
  it("note", () => {
    expect(p.note?.text).toBe("SW/ Ray - Confirmed image 8 missing. Processed reprint 210738000044, delivery 9/15. Value: $17.50.");
  });
});

describe("Close suggestion", () => {
  const p = run("SW/ Greg - confirmed delivered. customer can use. close ticket");
  it("states + suggestion only", () => {
    expect(val(p, "delivered")).toBe("yes");
    expect(val(p, "still_usable")).toBe("yes");
    expect(p.actions.map((a) => a.type)).toEqual(["close_ticket"]);
    expect(get(p, "status")).toBeUndefined();
  });
});

describe("Carrier update", () => {
  const p = run("SW/ FedEx - will reattempt. likely delivering to wrong building. sending out later today.", "update", {
    values: { point_of_contact: "SW", contact_name: "Greg", issue: "late" },
  });
  it("keeps FedEx in the note and never as the contact", () => {
    expect(p.kind).toBe("carrier_update");
    expect(p.note?.text).toBe("SW/ FedEx - Will reattempt. Likely delivering to the wrong building. Sending out later today.");
    expect(get(p, "contact_name")).toBeUndefined();
    expect(get(p, "delivered")).toBeUndefined();
  });
});

describe("Quick Update with ticket context", () => {
  const context: TicketContext = {
    values: { point_of_contact: "SW", contact_name: "Greg", customer_name: "Greg Kiel", issue: "late", fault: "fedex_error", tracking_number: "", shipping_cost: "" },
  };
  const p = run("FedEx says delivery tomorrow\nTKG 877732421485\nshipping 15.48", "update", context);

  it("note uses the ticket's contact", () => {
    expect(p.note?.text).toBe("SW/ Greg - FedEx reports delivery tomorrow. Tracking 877732421485.");
    expect(p.note?.prefixSource).toBe("ticket");
  });
  it("proposes only the changes", () => {
    const rows = planMerge(context.values, null, p.fields).filter((r) => r.state !== "same");
    expect(rows.map((r) => [r.field.key, r.current, r.field.value])).toEqual([
      ["tracking_number", "", "877732421485"],
      ["shipping_cost", "", "15.48"],
    ]);
    const changes = buildChanges(rows, {}, "update");
    expect(changes).toEqual({ tracking_number: "877732421485", shipping_cost: "15.48" });
  });
  it("missing: In-Hands Date", () => {
    expect(p.missing.map((m) => m.label)).toEqual(["In-Hands Date"]);
  });
  it("does not invent a delivered state from 'delivery tomorrow'", () => {
    expect(get(p, "delivered")).toBeUndefined();
  });
});

describe("Notes without a prefix", () => {
  it("new ticket text without SW/ gets no invented prefix", () => {
    const p = run("customer says box was crushed");
    expect(p.note?.text).toBe("Customer says box was crushed.");
    expect(p.note?.prefixSource).toBe("none");
  });
  it("data-only update still produces a note", () => {
    const p = run("TKG 877732421485", "update", { values: { point_of_contact: "MC", contact_name: "Ana" } });
    expect(p.note?.text).toBe("MC/ Ana - Tracking 877732421485.");
  });
  it("nothing at all → no note, with a reason", () => {
    const p = run("shipping 15.48", "update", { values: { point_of_contact: "SW" } });
    expect(p.note).toBeNull();
    expect(p.noteSkippedReason).toBeTruthy();
  });
  it("narrative normaliser", () => {
    expect(normalizeNarrative("cust rcvd dmg pkg")).toBe("Customer received damaged package.");
  });
});

describe("Materials", () => {
  it("unknown material is reported, never created", () => {
    const p = run('1\nRigid\nMystery Board 9mm\n24"x18"\n2\n$40.00\nShipped');
    expect(get(p, "material_id")).toBeUndefined();
    expect(p.unmatchedMaterials).toEqual([{ raw: "Mystery Board 9mm", source: "Line item", departmentId: RIGID }]);
    expect(val(p, "department_id")).toBe(RIGID);
  });
  it("alias in a note sets the material and its department", () => {
    const p = run("SW/ Greg / Coro 4m DS - damaged corners");
    expect(val(p, "material_id")).toBe(CORO);
    expect(val(p, "department_id")).toBe(RIGID);
    expect(val(p, "material_type")).toBe("Coro 4m DS");
  });

  it.each([
    "Coro 4mil Double Sided",
    "Coro 4mil Single Sided",
    "Coro 4m DS",
    "Coro 4m SS",
    "4mil Coro DS",
    "4mil Coro SS",
    "coro 4MIL double sided",
    "4m Coro Double Sided",
  ])("%s → CORO (RIGID), wording kept in Material Type", (wording) => {
    const p = run(`Description\n${wording} - Damage`);
    expect(get(p, "material_id")).toMatchObject({ value: CORO, confidence: "extracted" });
    expect(val(p, "department_id")).toBe(RIGID);
    expect(val(p, "material_type")).toBe(wording);
    expect(p.unmatchedMaterials).toEqual([]);
  });

  it.each([
    ["CLING - GF207", "mat-cling207-0005"],
    ["cling-gf207", "mat-cling207-0005"],
    ["Cling GF207", "mat-cling207-0005"],
    ["ONE WAY - 50/50", "mat-oneway50-0006"],
    ["One Way 50/50", "mat-oneway50-0006"],
    ["SVG13OZ", "mat-svg13-0003"],
    ["svg13oz", "mat-svg13-0003"],
    ["SVGMESH", "mat-svgmesh-0004"],
  ])("formatting differences resolve to the same material: %s", (wording, id) => {
    const p = run(`Description\n${wording} - Damage`);
    expect(val(p, "material_id")).toBe(id);
  });

  it("exact name (any case/spacing) doesn't add a Material Type", () => {
    const p = run("Description\nCLING - GF207 - Damage");
    expect(get(p, "material_type")).toBeUndefined();
  });
});

describe("Missing-information rules", () => {
  it("damage — shipped adds Sorted Through / All Boxes Received", () => {
    const base = computeMissing({ issue: "damage" }).map((m) => m.label);
    expect(base).toEqual(["Usable As-Is", "Package Damaged", "How Many Damaged", "Photos"]);
    const shipped = computeMissing({ issue: "damage", tracking_number: "877732421485", photos_received: "no" }).map((m) => m.label);
    expect(shipped).toEqual(["Usable As-Is", "Package Damaged", "How Many Damaged", "Photos", "Sorted Through", "All Boxes Received"]);
  });
  it("missing / reprint / refund / discount", () => {
    expect(computeMissing({ issue: "missing" }).map((m) => m.label)).toEqual(["Sorted Through", "All Boxes Received", "In-Hands Date"]);
    expect(computeMissing({ resolution_type: "reprint" }).map((m) => m.label)).toEqual(["Reprint Value", "Shipping Cost"]);
    expect(computeMissing({ resolution_type: "refund", shipping_cost: "5.00" }).map((m) => m.label)).toEqual(["Refund Value"]);
    expect(computeMissing({ resolution_type: "discount" }).map((m) => m.label)).toEqual(["Discount Value", "Total Affected Order Value"]);
  });
});

describe("New Ticket merge defaults", () => {
  it("never overwrites typed values; inferred starts unticked", () => {
    const p = run(COMBINED);
    const rows = planMerge({ customer_name: "Someone Else", date_opened: TODAY }, { date_opened: TODAY }, p.fields);
    const cust = rows.find((r) => r.field.key === "customer_name")!;
    expect(cust.state).toBe("conflict");
    expect(defaultDecision(cust, "new").accept).toBe(false);
    const contact = rows.find((r) => r.field.key === "contact_name")!;
    expect(defaultDecision(contact, "new").accept).toBe(false);
    const date = rows.find((r) => r.field.key === "date_opened")!;
    expect(date.state).toBe("new");
  });
});

describe("AI output is untrusted", () => {
  const base = run("SW/ Greg - FedEx says delivery tomorrow. TKG 877732421485");

  it("validation rejects unknown fields, closed status, unknown materials and actions", () => {
    const v = validateAiOutput(
      {
        fields: [
          { field: "status", value: "closed" },
          { field: "drop_table", value: "x" },
          { field: "material_id", value: "Unobtainium" },
          { field: "issue", value: "late", evidence: "delivery tomorrow" },
        ],
        actions: [{ type: "delete_ticket", reason: "" }],
        note: null,
      },
      lookups,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.fields.map((f) => f.key)).toEqual(["issue"]);
    expect(v.value.actions).toEqual([]);
    expect(v.value.rejected).toHaveLength(4);
  });

  it("strict schema rejects extra top-level keys", () => {
    expect(validateAiOutput({ fields: [], sql: "update tickets" }, lookups).ok).toBe(false);
    expect(validateAiOutput("not json", lookups).ok).toBe(false);
  });

  it("cannot override deterministic values or invent numbers; unevidenced values are inferred", () => {
    const v = validateAiOutput(
      {
        fields: [
          { field: "tracking_number", value: "999999999999", evidence: "TKG 999999999999" },
          { field: "shipping_cost", value: "42.00" },
          { field: "issue", value: "late", evidence: "delivery tomorrow" },
          { field: "fault", value: "fedex_error", evidence: "the carrier lost it" },
        ],
        note: "SW/ Greg - FedEx reports delivery tomorrow.",
      },
      lookups,
    );
    if (!v.ok) throw new Error(v.error);
    const r = reconcileAi(base, v.value, "mock", { mode: "new" });
    expect(val(r, "tracking_number")).toBe("877732421485");
    expect(get(r, "shipping_cost")).toBeUndefined();
    expect(get(r, "issue")?.confidence).toBe("extracted");
    expect(get(r, "fault")).toMatchObject({ confidence: "inferred", deterministic: false });
    // AI note dropped the tracking number → rules note kept
    expect(r.note?.generator).toBe("rules");
    expect(r.ai.used).toBe(true);
  });
});

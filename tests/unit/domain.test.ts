import { describe, expect, it } from "vitest";
import { suggestFault } from "@/lib/domain/fault-suggestion";
import { prioritize } from "@/lib/domain/priorities";
import { addDaysISO, followUpLabel, followUpState, todayISO } from "@/lib/utils/dates";
import { emptyTicketForm, validateTicket } from "@/lib/validation/ticket";
import { parseMoney } from "@/lib/utils/money";
import { irrelevantConditionalFields } from "@/lib/domain/conditional-questions";

describe("fault suggestions (D6)", () => {
  it("never assumes FedEx for a late ticket", () => {
    expect(suggestFault({ issue: "late", carrier_responsible: null })).toBeNull();
    expect(suggestFault({ issue: "late", carrier_responsible: false })).toBeNull();
  });
  it("suggests FedEx Error only when the carrier is established as responsible", () => {
    expect(suggestFault({ issue: "late", carrier_responsible: true })?.fault).toBe("fedex_error");
    expect(suggestFault({ issue: "damage", carrier_responsible: true })?.fault).toBe("fedex_error");
  });
  it("does not assign fault to damage without enough information", () => {
    expect(suggestFault({ issue: "damage", carrier_responsible: null })).toBeNull();
  });
  it("file → customer error, production → production error", () => {
    expect(suggestFault({ issue: "file", carrier_responsible: null })?.fault).toBe("customer_error");
    expect(suggestFault({ issue: "production", carrier_responsible: null })?.fault).toBe("production_error");
    expect(suggestFault({ issue: "color", carrier_responsible: null })).toBeNull();
  });
});

describe("Today's Priorities order", () => {
  const today = "2026-09-29";
  const now = Date.parse("2026-09-29T15:00:00Z");
  const base = { date_opened: "2026-09-01", created_at: "2026-09-01T00:00:00Z", follow_up_date: null, rush_started_at: null };
  const rows = [
    { ...base, id: "other", status: "open" as const },
    { ...base, id: "today", status: "open" as const, follow_up_date: today },
    { ...base, id: "rush-new", status: "rush_reprint" as const, rush_started_at: new Date(now - 5 * 60_000).toISOString() },
    { ...base, id: "fu-overdue", status: "waiting_customer" as const, follow_up_date: "2026-09-27" },
    { ...base, id: "rush-old", status: "rush_reprint" as const, rush_started_at: new Date(now - 45 * 60_000).toISOString() },
    { ...base, id: "closed", status: "closed" as const, follow_up_date: "2026-09-01" },
  ];
  it("orders overdue rush, overdue follow-ups, rush, today, others; drops closed", () => {
    expect(prioritize(rows, today, now, 30).map((r) => r.id)).toEqual(["rush-old", "fu-overdue", "rush-new", "today", "other"]);
  });
});

describe("dates", () => {
  it("follow-up states", () => {
    expect(followUpState("2026-09-28", "2026-09-29")).toBe("overdue");
    expect(followUpState("2026-09-29", "2026-09-29")).toBe("today");
    expect(followUpState("2026-09-30", "2026-09-29")).toBe("upcoming");
    expect(followUpLabel("2026-09-27", "2026-09-29")).toBe("2 days overdue");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("uses New York time for today", () => {
    // 2026-09-30 02:00 UTC is still Sep 29 in New York.
    expect(todayISO(new Date("2026-09-30T02:00:00Z"))).toBe("2026-09-29");
  });
});

describe("ticket validation", () => {
  const valid = { ...emptyTicketForm("2026-09-29"), ticket_number: " T-1 ", customer_name: "Acme", issue: "damage" };
  it("accepts a minimal ticket and trims/normalises values", () => {
    const r = validateTicket({ ...valid, shipping_cost: "$1,017.4", usable_as_is: "no" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ticket_number).toBe("T-1");
      expect(r.data.shipping_cost).toBe(1017.4);
      expect(r.data.usable_as_is).toBe(false);
      expect(r.data.contact_name).toBeNull();
    }
  });
  it("gives friendly errors", () => {
    const r = validateTicket({ ...valid, ticket_number: "", shipping_cost: "abc", quantity: "1.5" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors.ticket_number).toBe("Ticket number is required.");
      expect(r.errors.shipping_cost).toMatch(/amount/);
      expect(r.errors.quantity).toMatch(/whole number/);
    }
  });
  it("parses money", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("17.5")).toBe(17.5);
    expect(Number.isNaN(parseMoney("1.234"))).toBe(true);
  });
  it("knows which conditional answers don't apply", () => {
    expect(irrelevantConditionalFields("late")).toContain("usable_as_is");
    expect(irrelevantConditionalFields("late")).not.toContain("delivered");
  });
});

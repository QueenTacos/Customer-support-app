import { expect, test, type Page } from "@playwright/test";

/**
 * Ticket Assistant end to end:
 *  New Ticket: paste → Analyze → review → Use Note → Apply to New Ticket → Save
 *  Ticket Details: Quick Update → Analyze Update → from→to → Apply Update
 *  Close Ticket stays a suggestion only.
 */
const PIN = process.env.E2E_PIN ?? "";
const SHOTS = process.env.E2E_SHOTS_DIR;
const stamp = Date.now().toString().slice(-6);
const TICKET = `9${stamp}`;

test.describe.configure({ mode: "serial" });
test.skip(!/^\d{6}$/.test(PIN), "Set E2E_PIN to the test database PIN");

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#pin").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
async function shot(page: Page, name: string, locator?: ReturnType<Page["locator"]>) {
  if (!SHOTS) return;
  if (locator) await locator.screenshot({ path: `${SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const COMBINED = `Ticket information:
Ticket ID
${TICKET}
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

const NOTE = "SW/ Greg - Order delayed. Customer paid for rush. Tracking shows a delay. Opened FedEx trace C-259861376. Looking into.";

test.beforeEach(async ({ page }) => login(page));

test("New Ticket · Ticket Assistant fills the wizard (nothing saved until Save Ticket)", async ({ page }) => {
  await page.goto("/tickets/new");
  const panel = page.getByRole("region", { name: "Ticket Assistant" });
  await expect(panel.getByText("⚡ Ticket Assistant")).toBeVisible();
  await panel.getByLabel("Text for the Ticket Assistant").fill(COMBINED);
  await panel.getByRole("button", { name: /analyze/i }).click();

  const results = panel.getByTestId("assistant-results");
  await expect(results.getByTestId("generated-note")).toHaveText(NOTE);
  for (const t of ["Ticket Information", "Affected Product", "Issue", "Resolution", "Shipping / FedEx", "Missing Information"]) {
    await expect(results.getByRole("heading", { name: t, exact: true })).toBeVisible();
  }
  await expect(results.locator('[data-field="affected_item_value"]')).toContainText("Affected Item Value");
  await expect(results.locator('[data-field="affected_item_value"] input:not([type=checkbox])')).toHaveValue("220.00");
  await expect(results.locator('[data-field="order_value"]')).toHaveCount(0);
  await expect(results.locator('[data-field="tracking_number"]')).toHaveCount(0);
  await expect(results.locator('[data-field="fedex_case_number"] input:not([type=checkbox])')).toHaveValue("C-259861376");
  await expect(results.locator('[data-field="contact_name"] [data-confidence="inferred"]')).toBeVisible();
  await expect(results.locator('[data-field="fault"] [data-confidence="inferred"]')).toBeVisible();
  await expect(results.getByTestId("missing-list")).toHaveText(/Tracking Number.*Shipping Cost.*In-Hands Date/);
  await results.getByRole("button", { name: "View Original" }).click();
  await expect(results.getByTestId("original-text")).toContainText("Opened trace with FedEx C-259861376");
  await shot(page, "01-new-ticket-assistant", panel);

  // Inferred values start unticked; confirm them.
  await results.getByLabel("Use Contact").check();
  await results.getByLabel("Use Fault").check();
  await results.getByRole("button", { name: "Use Note" }).click();
  await results.getByRole("button", { name: "Apply to New Ticket" }).click();

  // Form is filled, not saved.
  await expect(page.locator("#f-ticket_number")).toHaveValue(TICKET);
  await expect(page.locator("#f-customer_name")).toHaveValue("Greg Kiel");
  await expect(page.locator("#f-contact_name")).toHaveValue("Greg");
  await expect(page.locator("#f-order_number")).toHaveValue("039015000767");
  await expect(page.locator("#f-affected_item_value")).toHaveValue("220.00");
  await expect(page.locator("#f-order_value")).toHaveValue("");
  await expect(page.locator("#f-shipping_cost")).toHaveValue("");
  await expect(page.locator("#f-tracking_number")).toHaveValue("");
  await expect(page.locator("#f-fedex_case_number")).toHaveValue("C-259861376");
  await expect(page.locator("#f-quantity")).toHaveValue("2");
  await expect(page.locator("#f-material")).toHaveValue("Coro 4mil Double Sided");
  await shot(page, "02-new-ticket-form-filled");

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.getByRole("radio", { name: "Late" })).toBeChecked();
  await expect(page.locator("#f-fault")).toHaveValue("fedex_error");
  await page.locator("#f-issue_summary").fill("Order delayed in transit.");
  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#f-note")).toHaveValue(NOTE);
  await page.getByRole("button", { name: /next/i }).click();
  await page.getByRole("button", { name: /save ticket/i }).click();
  await expect(page.getByRole("heading", { name: `Ticket #${TICKET}` })).toBeVisible();
  await expect(page.getByText("$220.00")).toBeVisible();
});

test("Ticket Details · Quick Update proposes only changes and applies them with the note", async ({ page }) => {
  await page.goto(`/tickets?q=${TICKET}&view=all`);
  await page.getByRole("link", { name: TICKET }).click();
  const panel = page.getByRole("region", { name: "Quick Update" });
  await panel.getByLabel("Update text").fill("FedEx says delivery tomorrow\nTKG 877732421485\nshipping 15.48");
  await panel.getByRole("button", { name: /analyze update/i }).click();

  const results = panel.getByTestId("assistant-results");
  await expect(results.getByTestId("generated-note")).toHaveText("SW/ Greg - FedEx reports delivery tomorrow. Tracking 877732421485.");
  await expect(results.getByRole("heading", { name: "Proposed Field Changes" })).toBeVisible();
  await expect(results.locator('[data-field="tracking_number"] [data-testid="from-to"]')).toHaveText(/blank\s*→\s*877732421485/);
  await expect(results.locator('[data-field="shipping_cost"] [data-testid="from-to"]')).toHaveText(/blank\s*→\s*\$15\.48/);
  await expect(results.locator("[data-field]")).toHaveCount(2);
  await expect(results.getByTestId("missing-list")).toHaveText(/^\s*Missing\s*In-Hands Date/);
  await expect(results.getByRole("button", { name: "Edit Note" })).toBeVisible();
  await expect(results.getByRole("button", { name: "Copy Note" })).toBeVisible();
  await shot(page, "03-quick-update", panel);

  await results.getByRole("button", { name: "Apply Update" }).click();
  await expect(page.getByText(/Update applied: 2 fields \+ note/)).toBeVisible();
  await expect(page.getByText("877732421485").first()).toBeVisible();
  await expect(page.getByText("$15.48").first()).toBeVisible();
  await page.getByRole("link", { name: /^notes/i }).click();
  await expect(page.getByText("SW/ Greg - FedEx reports delivery tomorrow. Tracking 877732421485.")).toBeVisible();
  await page.getByRole("link", { name: /^history/i }).click();
  await expect(page.getByText("Tracking Number").first()).toBeVisible();
  await expect(page.getByText("Shipping Cost").first()).toBeVisible();
  await shot(page, "04-history-after-update");
});

test("Close Ticket is a suggestion only", async ({ page }) => {
  await page.goto(`/tickets?q=${TICKET}&view=all`);
  await page.getByRole("link", { name: TICKET }).click();
  const panel = page.getByRole("region", { name: "Quick Update" });
  await panel.getByLabel("Update text").fill("SW/ Greg - confirmed delivered. customer can use. close ticket");
  await panel.getByRole("button", { name: /analyze update/i }).click();
  const results = panel.getByTestId("assistant-results");
  await expect(results.getByTestId("generated-note")).toHaveText("SW/ Greg - Confirmed delivered. Customer can use. Close ticket.");
  await expect(results.locator('[data-field="delivered"]')).toContainText("Yes");
  await expect(results.locator('[data-field="still_usable"]')).toContainText("Yes");
  const close = results.getByRole("button", { name: "Close Ticket" });
  await expect(close).toBeDisabled();
  await expect(results.getByText(/Suggestion only — nothing is closed/)).toBeVisible();
  await shot(page, "05-close-suggestion", panel);
  await results.getByRole("button", { name: "Apply Update" }).click();
  await expect(page.getByText(/Update applied/)).toBeVisible();
  await expect(page.locator("header, main").getByText("Closed", { exact: true })).toHaveCount(0);
});

test("Material box searches every active material and picking one sets its department", async ({ page }) => {
  await page.goto("/tickets/new");
  await page.locator("#f-department").selectOption({ label: "RIGID" });
  await page.locator("#f-material").fill("svgmesh");
  await page.getByRole("option", { name: "svgMESH" }).click();
  await expect(page.locator("#f-department")).toHaveValue(/.+/);
  await expect(page.locator("#f-department option:checked")).toHaveText("BANNER");
  // Aliases are searchable too
  await page.locator("#f-material").fill("");
  await page.locator("#f-material").fill("4m DS");
  await expect(page.getByRole("option", { name: "Coro 4mil Double Sided" })).toBeVisible();
});

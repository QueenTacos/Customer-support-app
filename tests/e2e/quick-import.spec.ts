import { expect, test } from "@playwright/test";

const PIN = process.env.E2E_PIN ?? "";
test.skip(!/^\d{6}$/.test(PIN), "Set E2E_PIN to the test database PIN");

const stamp = Date.now().toString().slice(-6);
const COMBINED = `Ticket information:
Ticket ID
QI-${stamp}
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

test("Quick Import fills every step, keeps typed values, and saves only on Save Ticket", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#pin").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/tickets/new");
  // Something typed by hand first — Quick Import must not overwrite it silently.
  await page.locator("#f-customer_name").fill("Kiel Signs LLC");

  await page.locator("#quick-import-text").fill(COMBINED);
  await page.getByRole("button", { name: /parse & fill/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Quick Import results")).toBeVisible();
  await expect(dialog.getByText("Keep existing")).toBeVisible(); // customer conflict
  await expect(dialog.getByText("Inferred / confirm").first()).toBeVisible();

  // Accept the inferred contact name; leave the inferred fault unaccepted.
  await dialog.getByRole("checkbox", { name: /accept contact/i }).check();
  await dialog.getByRole("button", { name: "Accept Note" }).click();
  await dialog.getByRole("button", { name: /apply to ticket/i }).click();
  await expect(dialog).toBeHidden();

  // Step 1 values
  await expect(page.locator("#f-ticket_number")).toHaveValue(`QI-${stamp}`);
  await expect(page.locator("#f-customer_name")).toHaveValue("Kiel Signs LLC"); // kept
  await expect(page.locator("#f-contact_name")).toHaveValue("Greg");
  await expect(page.locator("#f-order_number")).toHaveValue("039015000767");
  await expect(page.locator("#f-date_opened")).toHaveValue("2026-10-01");
  await expect(page.locator("#f-material")).toHaveValue("Coro 4mil Double Sided");
  await expect(page.locator("#f-size")).toHaveValue('24"x18", 24"x36"');
  await expect(page.locator("#f-quantity")).toHaveValue("2");
  await expect(page.locator("#f-order_value")).toHaveValue("220.00");
  await expect(page.locator("#f-fedex_case_number")).toHaveValue("C-259861376");
  await expect(page.locator("#f-tracking_number")).toHaveValue("");

  // Nothing saved yet (checked in a second tab so this form stays untouched)
  const other = await page.context().newPage();
  await other.goto(`/tickets?q=QI-${stamp}&view=all`);
  await expect(other.getByText("No tickets match")).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.getByRole("radio", { name: "Late", checked: true })).toBeVisible();
  await expect(page.locator("#f-fault")).toHaveValue(""); // inferred fault was not accepted
  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#f-note")).toHaveValue(
    "SW/ Greg - Order delayed. Customer paid for rush. Tracking shows a delay. Opened FedEx trace C-259861376. Looking into.",
  );
  await page.getByRole("button", { name: /next/i }).click();
  await page.getByRole("button", { name: /save ticket/i }).click();
  await expect(page.getByRole("heading", { name: `Ticket #QI-${stamp}` })).toBeVisible();
  await expect(page.getByText("C-259861376").first()).toBeVisible();

  // FedEx case number is searchable
  await page.goto("/tickets?q=C-2598613&view=all");
  await expect(page.getByRole("link", { name: `QI-${stamp}` })).toBeVisible();
});

test("unknown material is flagged and never discarded", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#pin").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/tickets/new");
  await page.locator("#quick-import-text").fill("Category\nRigid\nDescription\nAluminum .040 Single Sided - Damaged");
  await page.getByRole("button", { name: /parse & fill/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Material not found:")).toBeVisible();
  await expect(dialog.getByText("Aluminum .040 Single Sided")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Leave Blank" })).toBeVisible();
  await dialog.getByRole("button", { name: "Select Existing Material" }).click();
  await expect(dialog.getByPlaceholder("Search materials…")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

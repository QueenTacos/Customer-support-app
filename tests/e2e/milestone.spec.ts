import { expect, test, type Page } from "@playwright/test";

/**
 * First Milestone, end to end:
 * login → dashboard → new ticket → details → notes (add/edit/history) →
 * edit ticket + change history → active tickets search → rush timer →
 * change PIN → sign out.
 */

const PIN = process.env.E2E_PIN ?? "";
const TEMP_PIN = process.env.E2E_TEMP_PIN ?? "";
const stamp = Date.now().toString().slice(-7);
const TICKET = `E2E-${stamp}`;
const ORDER = `2107380${stamp}`;

test.describe.configure({ mode: "serial" });
test.skip(!/^\d{6}$/.test(PIN), "Set E2E_PIN to the test database PIN");

async function login(page: Page, pin = PIN) {
  await page.goto("/login");
  await page.locator("#pin").fill(pin);
  await page.getByRole("button", { name: /unlock/i }).click();
}

test("1–3 · dark login, Welcome Jessica, wrong and right PIN", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome Jessica" })).toBeVisible();
  await expect(page.getByText("Please enter your PIN")).toBeVisible();

  await page.locator("#pin").fill(PIN === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.locator("#pin-error")).toContainText("PIN is incorrect");

  await page.locator("#pin").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("4 · dashboard cards, priorities and quick actions", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Here's what's happening today.")).toBeVisible();
    for (const label of ["Active Tickets", "Follow-Ups", "Waiting on Photos", "Waiting on Customer", "FedEx Investigations", "Rush Reprints"]) {
      await expect(page.getByRole("main").getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Today's Priorities")).toBeVisible();
    await expect(page.getByText("Quick Actions")).toBeVisible();
  });

  test("5–8 · new ticket wizard saves to Supabase and opens details", async ({ page }) => {
    await page.goto("/tickets/new");

    // Step 1 — required fields are enforced
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByText("Ticket number is required.")).toBeVisible();

    await page.locator("#f-ticket_number").fill(TICKET);
    await page.locator("#f-customer_name").fill("Acme Signs");
    await page.locator("#f-contact_name").fill("Ray");
    await page.locator("#f-order_number").fill(ORDER);
    await page.locator("#f-material").fill("svg13");
    await page.getByRole("option", { name: "svg13OZ" }).click();
    await page.locator("#f-size").fill('24" x 36"');
    await page.locator("#f-quantity").fill("10");
    await page.locator("#f-shipping_cost").fill("17.43");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2 — conditional questions + fault suggestion
    await page.getByRole("radio", { name: "Late" }).click();
    await expect(page.getByText("Has the order been delivered?")).toBeVisible();
    await expect(page.locator("#f-fault")).toHaveValue(""); // late alone never implies FedEx
    await page
      .getByRole("radiogroup", { name: /carrier responsible for the delay/i })
      .getByRole("radio", { name: "Yes" })
      .click();
    await expect(page.locator("#f-fault")).toHaveValue("fedex_error");
    await expect(page.getByText(/may need a Claim/i)).toBeVisible();
    await page.locator("#f-issue_summary").fill("Delivered 3 days late.");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3
    await page.locator("#f-status").selectOption("follow_up");
    await page.locator("#f-note").fill("SW/ Ray - Customer called about late delivery.");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 4 — review, then save
    await expect(page.getByText("Acme Signs")).toBeVisible();
    await page.getByRole("button", { name: /save ticket/i }).click();
    await expect(page.getByRole("heading", { name: `Ticket #${TICKET}` })).toBeVisible();
    await expect(page.getByText("FedEx Error — this ticket may need to be added to Claims.")).toBeVisible();
    await expect(page.getByText("svg13OZ")).toBeVisible();
  });

  test("duplicate ticket numbers are rejected", async ({ page }) => {
    await page.goto("/tickets/new");
    await page.locator("#f-ticket_number").fill(TICKET.toLowerCase());
    await page.locator("#f-customer_name").fill("Someone");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByText("This ticket number already exists.").first()).toBeVisible();
    // Leave without saving; the unsaved-changes guard asks first.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("7 · active tickets search (partial order #) and filters", async ({ page }) => {
    await page.goto("/tickets");
    await page.getByRole("main").getByRole("searchbox", { name: "Search tickets" }).fill(ORDER.slice(-6));
    await expect(page.getByRole("link", { name: TICKET })).toBeVisible();
    await page.goto(`/tickets?tab=followups`);
    await expect(page.getByRole("heading", { name: "Active Tickets" })).toBeVisible();
    // Global search from the top bar
    await page.getByRole("banner").getByRole("searchbox").fill("acme sig");
    await page.getByRole("banner").getByRole("searchbox").press("Enter");
    await expect(page.getByRole("link", { name: TICKET })).toBeVisible();
  });

  test("9–11 · add note, edit note with reason, view version history", async ({ page }) => {
    await page.goto(`/tickets?q=${TICKET}&view=all`);
    await page.getByRole("link", { name: TICKET }).click();
    await page.getByRole("link", { name: /^notes/i }).click();

    await page.locator("#new-note").fill("SW/ Ray - Confirmed image 8 missing.");
    await page.getByRole("button", { name: "Add Note" }).click();
    await expect(page.getByText("SW/ Ray - Confirmed image 8 missing.")).toBeVisible();

    const item = page.locator("li").filter({ hasText: "Confirmed image 8 missing." }).first();
    await item.getByRole("button", { name: "Edit" }).click();
    const editing = page.locator("li", { has: page.getByLabel("Edit note") });
    await editing.getByLabel("Edit note").fill("SW/ Ray - Confirmed image 9 missing.");
    await editing.getByLabel("Reason for edit (optional)").fill("Wrong image number");
    await editing.getByRole("button", { name: "Save Note" }).click();
    await expect(page.getByText("SW/ Ray - Confirmed image 9 missing.")).toBeVisible();
    await expect(page.getByText(/^Edited /).first()).toBeVisible();

    await page.getByRole("button", { name: "View Edit History" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Original")).toBeVisible();
    await expect(dialog.getByText("SW/ Ray - Confirmed image 8 missing.")).toBeVisible();
    await expect(dialog.getByText(/Wrong image number/)).toBeVisible();
    await expect(dialog.getByText(/Current \(version 2\)/)).toBeVisible();
  });

  test("12–13 · edit ticket and see changed fields in history", async ({ page }) => {
    await page.goto(`/tickets?q=${TICKET}&view=all`);
    await page.getByRole("link", { name: TICKET }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.locator("#f-shipping_cost").fill("20.00");
    await page.locator("#f-resolution_type").selectOption("reprint");
    await page.locator("#f-reprint_value").fill("17.50");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByRole("heading", { name: `Ticket #${TICKET}` })).toBeVisible();

    await page.getByRole("link", { name: /^history/i }).click();
    const edited = page.locator("li").filter({ hasText: "Ticket edited" }).first();
    await expect(edited.getByText("Shipping Cost")).toBeVisible();
    await expect(edited.getByText("17.43")).toBeVisible();
    await expect(edited.getByText("20.00")).toBeVisible();
    await expect(page.getByText("Resolution changed").first()).toBeVisible();
    await expect(page.getByText("Ticket created")).toBeVisible();
  });

  test("rush reprint shows a live timer and tops the dashboard", async ({ page }) => {
    await page.goto(`/tickets?q=${TICKET}&view=all`);
    await page.getByRole("link", { name: TICKET }).click();
    await page.locator("#qu-status").selectOption("rush_reprint");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("main").getByText(/^\d+:\d{2}$/).first()).toBeVisible();
    await page.goto("/dashboard");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText(TICKET);
  });
});

test("14–16 · My Account, Change PIN (invalidates other sessions), Sign Out", async ({ page, browser }) => {
  test.skip(!/^\d{6}$/.test(TEMP_PIN) || TEMP_PIN === PIN, "Set E2E_TEMP_PIN to a different six-digit PIN");

  // A second browser session that should be signed out by the PIN change.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  await expect(otherPage).toHaveURL(/\/dashboard/);

  await login(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Change PIN" }).click();
  await expect(page).toHaveURL(/\/account/);

  await page.locator("#current").fill("999999" === PIN ? "888888" : "999999");
  await page.locator("#next").fill(TEMP_PIN);
  await page.locator("#confirm").fill(TEMP_PIN);
  await page.getByRole("button", { name: /change pin/i }).click();
  await expect(page.getByText("Current PIN is incorrect.").first()).toBeVisible();

  await page.locator("#current").fill(PIN);
  await page.locator("#next").fill(TEMP_PIN);
  await page.locator("#confirm").fill("123");
  await page.getByRole("button", { name: /change pin/i }).click();
  await expect(page.getByText("New PIN and confirmation don't match.")).toBeVisible();

  await page.locator("#current").fill(PIN);
  await page.locator("#next").fill(TEMP_PIN);
  await page.locator("#confirm").fill(TEMP_PIN);
  await page.getByRole("button", { name: /change pin/i }).click();
  await expect(page.locator("form p[role=status]")).toContainText("PIN changed successfully.");

  // Other session is now invalid.
  await otherPage.goto("/dashboard");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  // Sign out, sign back in with the new PIN, then restore the original.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/login/);

  await login(page, TEMP_PIN);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/account");
  await page.locator("#current").fill(TEMP_PIN);
  await page.locator("#next").fill(PIN);
  await page.locator("#confirm").fill(PIN);
  await page.getByRole("button", { name: /change pin/i }).click();
  await expect(page.locator("form p[role=status]")).toContainText("PIN changed successfully.");
});

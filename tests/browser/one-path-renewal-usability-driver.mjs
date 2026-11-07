// Focused, mailbox-disabled November 7 rehearsal. This is a subset of S259.
// It records expectations before each case and retains the raw results outside Git.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { readRehearsal } from "../../scripts/lib/one-path-rehearsal/control.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch", "The rehearsal preload is required.");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through the one-path rehearsal.");
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
assert.match(run.args, /--hold-automatic-comparison\b/);
assert.match(run.args, /--no-mail-adapter\b/);
const report = join(runDir, "november-7-focused.jsonl");
const log = (entry) => {
  appendFileSync(
    report,
    JSON.stringify({ commit: rehearsal.servedVersion, ...entry }) + "\n",
  );
  process.stdout.write(JSON.stringify(entry) + "\n");
};
const desk = "/lease-renewal/live/desk";
const prepared = String(rehearsal.roles.prepared);
const separate = String(rehearsal.roles.missingRecipient);
const path = (lease, query = "") => `${desk}/lease/${lease}${query}`;
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const cases = [];
async function session(role, viewport, colorScheme) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    serviceWorkers: "block",
    timezoneId: "America/Chicago",
    locale: "en-US",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(origin + "/sign-in", { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(`fetch("/api/auth/demo",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({role:${JSON.stringify(role)}})
  }).then(r=>r.ok)`);
  assert.ok(signedIn, `The synthetic ${role} session could not open.`);
  return { context, page };
}
async function check(id, role, viewport, theme, input, expected, work) {
  log({ id, state: "expectation", role, viewport, theme, input, expected });
  let context, page;
  try {
    ({ context, page } = await session(role, viewport, theme));
    const observed = await work(page);
    cases.push(true);
    log({ id, state: "passed_checkpoints", observed });
  } catch (error) {
    cases.push(false);
    log({ id, state: "failed", reason: String(error).slice(0, 500) });
    await page
      ?.screenshot({ path: join(runDir, `${id}-failure.png`) })
      .catch(() => undefined);
  } finally {
    await context?.close();
  }
}
const wide = { width: 1280, height: 800 };
const narrow = { width: 390, height: 800 };
const open = (page, href) => page.goto(origin + href, { waitUntil: "domcontentloaded" });
const leaseViews = (page) => page.getByRole("group", { name: "Lease view", exact: true });
const stage = (page) => page.getByRole("region", { name: "Current renewal stage" });

try {
  await check(
    "L01-desk",
    "Editor",
    wide,
    "light",
    "pointer",
    "The bare desk opens the current working month as a table, each loaded record is counted once, and the month survives switching to the full table and back.",
    async (page) => {
      await open(page, desk);
      const batch = page.getByRole("region", { name: "Working batch", exact: true });
      await batch.getByRole("columnheader", { name: "Next action" }).first().waitFor();
      const month = await batch.getAttribute("data-batch-month");
      const total = Number(await batch.getAttribute("data-batch-total"));
      const counted = await batch
        .locator("[data-batch-list], button[data-batch-group]")
        .evaluateAll((nodes) =>
          nodes.reduce(
            (sum, node) => sum + Number(node.getAttribute("data-batch-count")),
            0,
          ),
        );
      assert.equal(total, 38);
      assert.equal(counted, total);
      await batch.getByRole("link", { name: "Next month", exact: true }).click();
      const shifted = await batch.getAttribute("data-batch-month");
      assert.notEqual(shifted, month);
      await batch
        .getByRole("link", { name: "All leases and filters", exact: true })
        .click();
      await page.locator("table.renewal-table").waitFor();
      assert.equal(
        await page.locator("table.renewal-table tr[data-lease-id]").count(),
        total,
      );
      await page
        .getByRole("navigation", { name: "Renewal desk view" })
        .getByRole("link", { name: "Working batch", exact: true })
        .click();
      await batch.waitFor();
      assert.equal(await batch.getAttribute("data-batch-month"), shifted);
      return { total, counted, shiftedMonthRestored: true };
    },
  );
  await check(
    "L05-L06-header-continuation",
    "Editor",
    narrow,
    "dark",
    "keyboard",
    "An old Focus URL opens Guided with the shared stage. Record work opens the exact staff form, Cancel returns focus, and Full reaches the requested section.",
    async (page) => {
      await open(page, path(prepared, "?view=focus"));
      await stage(page).waitFor();
      assert.deepEqual(await leaseViews(page).getByRole("button").allTextContents(), [
        "Guided view",
        "Full view",
      ]);
      const record = stage(page).getByRole("button", {
        name: "Record work",
        exact: true,
      });
      await record.focus();
      await page.keyboard.press("Enter");
      await stage(page).getByRole("button", { name: "Cancel", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.ok(await record.evaluate((button) => document.activeElement === button));
      await page.keyboard.press("Enter");
      await stage(page)
        .getByRole("button", { name: "Owner outreach", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Owner outreach outcome", { exact: true }).waitFor();
      assert.ok(
        await page
          .getByLabel("Owner outreach outcome", { exact: true })
          .evaluate((field) => document.activeElement === field),
      );
      await open(page, path(prepared, "?view=focus#renewal-section-documents"));
      await leaseViews(page)
        .getByRole("button", { name: "Full view", pressed: true })
        .waitFor();
      await page
        .getByRole("region", { name: "Documents and completion", exact: true })
        .waitFor();
      return {
        cancelFocus: true,
        workFormFocus: true,
        legacyAnchor: "Documents and completion",
      };
    },
  );
  await check(
    "L09-disposition",
    "Editor",
    wide,
    "light",
    "pointer",
    "The exact synthetic cycle moves from active work to Retired only after confirmation, reads back after reload, then restores through a second deliberate record.",
    async (page) => {
      await open(page, path(separate));
      const header = stage(page);
      const record = header.getByRole("button", { name: "Record work", exact: true });
      await record.click();
      await header
        .getByRole("button", { name: "Retire from renewals", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Retire from renewals",
        exact: true,
      });
      await dialog.getByLabel("Reason", { exact: true }).fill("Synthetic inactive cycle");
      await dialog
        .getByRole("button", { name: "Retire from renewals", exact: true })
        .click();
      await header.getByText("Retired from renewals", { exact: true }).waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await header.getByText("Retired from renewals", { exact: true }).waitFor();
      await open(page, desk + "?group=retired");
      const retired = page.getByRole("region", { name: "Retired", exact: true });
      const row = retired.locator(`tr[data-batch-lease="${separate}"]`);
      await row.waitFor();
      assert.match(await row.innerText(), /Synthetic inactive cycle/);
      await row.getByRole("link", { name: "Open the lease", exact: true }).click();
      await record.click();
      await header
        .getByRole("button", { name: "Restore to renewals", exact: true })
        .click();
      dialog = page.getByRole("dialog", { name: "Restore to renewals", exact: true });
      await dialog
        .getByLabel("Reason", { exact: true })
        .fill("Synthetic retirement corrected");
      await dialog
        .getByRole("button", { name: "Restore to renewals", exact: true })
        .click();
      await header
        .locator('[data-renewal-field="stage-line"]:not([data-renewal-stage="retired"])')
        .waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await header
        .locator('[data-renewal-field="stage-line"]:not([data-renewal-stage="retired"])')
        .waitFor();
      return { retiredCountedAndOpened: true, bothDecisionsSurvivedReload: true };
    },
  );
  await check(
    "L07-blank-signature",
    "Editor",
    narrow,
    "light",
    "pointer",
    "The signed-in sender can deliberately save blank from their profile, which reads back as a versioned blank choice on reload.",
    async (page) => {
      await open(page, "/profile");
      const form = page.getByRole("form", { name: "Your signature", exact: true });
      await form
        .getByRole("button", { name: "Save blank signature", exact: true })
        .click();
      await form
        .getByRole("status")
        .filter({ hasText: "Blank signature saved." })
        .waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await form.getByText(/Saved choice v\d+ · Blank/).waitFor();
      assert.equal(
        await form.getByLabel("Sender name", { exact: true }).inputValue(),
        "",
      );
      return { versionedBlankReadback: true };
    },
  );
  await check(
    "L12-admin-legacy-anchor",
    "Admin",
    narrow,
    "dark",
    "keyboard",
    "A legacy Admin anchor opens its focused task and the return leads to the index. No configuration save is triggered.",
    async (page) => {
      await open(page, "/admin#admin-runtime-suspensions");
      await page.waitForURL(/\/admin\?task=safety#admin-runtime-suspensions$/);
      await page.locator("#admin-runtime-suspensions").waitFor();
      const back = page.getByRole("link", { name: "Back to Admin tasks", exact: true });
      await back.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("heading", { name: "Find an Admin task", exact: true })
        .waitFor();
      assert.equal(await page.locator("#admin-runtime-suspensions").count(), 0);
      return { legacyAnchorResolved: true, returnedToIndex: true };
    },
  );
} finally {
  await browser.close();
}
process.exitCode = cases.every(Boolean) ? 0 : 1;

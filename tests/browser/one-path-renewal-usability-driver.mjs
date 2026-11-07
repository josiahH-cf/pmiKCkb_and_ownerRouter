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
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit);
assert.equal(rehearsal.servedCommit, rehearsal.harnessCommit);
assert.equal(rehearsal.overlay, false);
assert.equal(rehearsal.automaticComparisonHeld, true);
assert.equal(rehearsal.mailAdapter, false);
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
const expectedGroups = {
  this_batch: rehearsal.groups.working_month,
  carried_over: rehearsal.groups.carried_over,
  renewed_in_rentvine: rehearsal.groups.renewed_in_rentvine,
  month_to_month_reviews: rehearsal.groups.month_to_month,
  non_renewals: rehearsal.groups.move_out_notice,
  coming_up_later: rehearsal.groups.later,
  not_targets: rehearsal.groups.closed,
  completed: [],
  retired: [],
};
log({
  state: "frozen",
  clean: !rehearsal.overlay,
  businessDate: rehearsal.businessDate,
  fixture: "November 5 mix",
  groupCounts: Object.fromEntries(
    Object.entries(expectedGroups).map(([group, members]) => [group, members.length]),
  ),
});
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
    hasTouch: viewport.width === 390,
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
  if (role === "Signed out") return { context, page };
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
    "The bare desk opens the current working month as a table and counts each loaded record once. The month survives switching tables. A personal filter opens only from its saved link, and an empty filter keeps a way back to all leases.",
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
      const groupCounts = {};
      for (const [group, expected] of Object.entries(expectedGroups)) {
        const countedGroup = batch.locator(`button[data-batch-group="${group}"]`);
        const listed = batch.locator(`[data-batch-list="${group}"]`);
        const section = batch.locator(`[data-batch-open-group="${group}"]`);
        const collapsed = (await countedGroup.count()) === 1;
        if (collapsed) {
          assert.equal(
            Number(await countedGroup.getAttribute("data-batch-count")),
            expected.length,
          );
          await countedGroup.click();
          await section.waitFor();
        }
        const actual = await (collapsed ? section : listed)
          .locator("[data-batch-lease]")
          .evaluateAll((rows) =>
            rows.map((row) => Number(row.getAttribute("data-batch-lease"))),
          );
        assert.deepEqual(
          actual.sort((a, b) => a - b),
          [...expected].sort((a, b) => a - b),
          group,
        );
        groupCounts[group] = actual.length;
      }
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
      const rows = page.locator("table.renewal-table tr[data-lease-id]");
      await open(page, desk + "?v=2&scope=all&lease=" + prepared);
      await rows.first().waitFor();
      assert.equal(await rows.count(), 1);
      assert.equal(await rows.first().getAttribute("data-lease-id"), prepared);
      const [write] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/personal-view" &&
            response.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Remember this view", exact: true }).click(),
      ]);
      assert.ok(write.ok());
      await open(page, desk);
      await batch.waitFor();
      await batch.getByRole("link", { name: "Open my saved view", exact: true }).click();
      await rows.first().waitFor();
      assert.equal(await rows.count(), 1);
      assert.equal(await rows.first().getAttribute("data-lease-id"), prepared);

      await open(page, desk + "?v=2&scope=all&lease=synthetic-no-such-lease");
      await page.getByText("No renewals match these filters.", { exact: true }).waitFor();
      assert.equal(await rows.count(), 0);
      await page.getByRole("link", { name: "Remove these filters", exact: true }).click();
      await rows.first().waitFor();
      assert.equal(await rows.count(), total);
      return {
        total,
        counted,
        groupCounts,
        shiftedMonthRestored: true,
        savedViewReopened: true,
        emptyFilterRecovered: true,
      };
    },
  );
  await check(
    "L02-linked-entries",
    "Editor",
    wide,
    "light",
    "keyboard",
    "The desk, a Dashboard month answer and an explicit My Work task open the same lease and its current renewal step. The task remains private to its owner.",
    async (page) => {
      await open(page, desk);
      const row = page.locator(`tr[data-batch-lease="${prepared}"]`);
      const link = row.getByRole("rowheader").getByRole("link");
      await link.focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((url) => url.pathname === path(prepared));
      const original = await stage(page)
        .locator('[data-renewal-field="stage-line"]')
        .innerText();
      await page.goBack({ waitUntil: "domcontentloaded" });
      await row.waitFor();

      await open(page, "/");
      await page
        .getByLabel("Question", { exact: true })
        .fill("Which lease renewals are due next month?");
      await page.getByRole("button", { name: "Get answer", exact: true }).click();
      const answer = page.getByRole("region", { name: "Assistant answer", exact: true });
      await answer.waitFor();
      const leaseLinks = answer.locator(`a[href^="${desk}/lease/"]`);
      await leaseLinks.first().waitFor();
      const ids = await leaseLinks.evaluateAll((links) => [
        ...new Set(
          links.map((link) => Number(new URL(link.href).pathname.split("/").at(-1))),
        ),
      ]);
      assert.deepEqual(
        ids.sort((a, b) => a - b),
        [...expectedGroups.this_batch].sort((a, b) => a - b),
      );
      await answer
        .locator(`a[href^="${path(prepared)}"]`)
        .first()
        .click();
      await stage(page).waitFor();
      assert.equal(
        await stage(page).locator('[data-renewal-field="stage-line"]').innerText(),
        original,
      );

      await open(page, "/work");
      await page.getByText("Create my task", { exact: true }).click();
      const taskTitle = "Example renewal readback task";
      await page.getByLabel("Space", { exact: true }).selectOption("lease-renewals");
      await page.getByLabel("Task type", { exact: true }).fill("Renewal");
      await page.getByLabel("Title", { exact: true }).fill(taskTitle);
      await page
        .getByLabel("Next action", { exact: true })
        .fill("Review the stored comparison");
      await page.getByLabel("Source", { exact: true }).selectOption("renewal_lease");
      await page.getByLabel("Source id", { exact: true }).fill(prepared);
      await page.getByRole("button", { name: "Create task", exact: true }).click();
      await page.getByText(taskTitle, { exact: true }).waitFor();
      await page
        .getByRole("link", { name: "Open linked renewal lease", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === path(prepared));
      assert.equal(
        await stage(page).locator('[data-renewal-field="stage-line"]').innerText(),
        original,
      );
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.getByText(taskTitle, { exact: true }).waitFor();

      const other = await session("Approver", narrow, "light");
      try {
        await open(other.page, "/work");
        await other.page
          .getByRole("region", { name: "Assigned tasks", exact: true })
          .waitFor();
        assert.equal(await other.page.getByText(taskTitle, { exact: true }).count(), 0);
      } finally {
        await other.context.close();
      }
      return { dashboardTargets: ids.length, sameLeaseAndStage: true, privateTask: true };
    },
  );
  await check(
    "L03-collection",
    "Editor",
    wide,
    "dark",
    "pointer",
    "A clean collection can choose an in-period and out-of-period lease. The exact reviewed membership is saved, recovered after a lost response, reopened and shown on the desk. Refresh and cancel retain the saved version.",
    async (page) => {
      const route = "/lease-renewal/collections";
      const name = "Example December working group";
      await open(page, route);
      await page.getByRole("button", { name: "New collection", exact: true }).click();
      const editor = page.getByRole("region", { name: "Collection membership editor" });
      assert.equal(await editor.getByLabel("Collection name").inputValue(), "");
      const period = rehearsal.workingMonth;
      const [year, month] = period.split("-").map(Number);
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      await editor.getByLabel("Collection name").fill(name);
      await editor.getByLabel("Period from").fill(`${period}-01`);
      await editor.getByLabel("Period through").fill(`${period}-${last}`);
      const outside = expectedGroups.coming_up_later[0];
      for (const lease of [prepared, outside]) {
        await editor
          .getByLabel("Find leases by address, name or lease ID")
          .fill(String(lease));
        await editor.getByRole("button", { name: "Search leases" }).click();
        await editor
          .getByRole("listitem")
          .filter({ hasText: new RegExp(`· Lease ${lease} ·`) })
          .getByRole("button", { name: /^Add / })
          .click();
      }
      await editor.getByRole("button", { name: "Review membership" }).click();
      const review = editor.getByRole("region", { name: "Reviewed membership" });
      await review.getByRole("heading", { name: "Additions (2)", exact: true }).waitFor();
      assert.match(await review.innerText(), /Chosen outside the period/);
      const apiPath = origin + "/api/lease-renewal/collections";
      let dropped = false;
      const loseSave = async (request) => {
        if (
          !dropped &&
          request.request().method() === "POST" &&
          request.request().postDataJSON()?.action === "save"
        ) {
          dropped = true;
          const result = await request.fetch({ maxRedirects: 0 });
          assert.ok(result.ok());
          await request.abort("failed");
        } else await request.continue();
      };
      await page.route(apiPath, loseSave);
      await review.getByRole("button", { name: "Save reviewed collection" }).click();
      const recover = page.getByRole("button", { name: "Check recorded change" });
      await recover.waitFor();
      await page
        .getByRole("alert")
        .filter({ hasText: /Check the recorded change/ })
        .waitFor();
      await page.unroute(apiPath, loseSave);
      await page.reload({ waitUntil: "domcontentloaded" });
      const detail = page.getByRole("region", { name: "Current collection status" });
      await detail.getByRole("heading", { name, exact: true }).waitFor();
      assert.match(await detail.innerText(), /2 saved members/);
      assert.match(await detail.innerText(), /membership version 1/);
      await detail.getByRole("button", { name: "Refresh statuses" }).click();
      await page
        .getByText("Current statuses read. Saved membership is kept.", { exact: true })
        .waitFor();
      await detail.getByRole("button", { name: "Edit membership" }).click();
      await editor.getByRole("button", { name: "Discard changes" }).click();
      await editor.waitFor({ state: "hidden" });
      assert.match(await detail.innerText(), /membership version 1/);
      const reopened = new URL(page.url());
      const other = await session("Approver", narrow, "light");
      try {
        await open(other.page, reopened.pathname + reopened.search);
        await other.page.getByRole("heading", { name, exact: true }).waitFor();
        await other.page
          .getByRole("table", { name: "Saved members", exact: true })
          .waitFor();
      } finally {
        await other.context.close();
      }
      await detail
        .getByRole("link", { name: "Open this collection on the Renewals desk" })
        .click();
      await page.waitForURL(
        (url) => url.pathname === desk && url.searchParams.has("collection"),
      );
      const table = page.locator("table.renewal-table");
      await table.waitFor();
      const members = await table
        .locator("tr[data-lease-id]")
        .evaluateAll((rows) =>
          rows.map((row) => Number(row.getAttribute("data-lease-id"))),
        );
      assert.deepEqual(
        members.sort((a, b) => a - b),
        [Number(prepared), outside].sort((a, b) => a - b),
      );
      await page.goBack({ waitUntil: "domcontentloaded" });
      await detail.getByRole("heading", { name, exact: true }).waitFor();
      return {
        exactMembership: 2,
        version: 1,
        lostSaveRecovered: dropped,
        approverReadback: true,
        returnedToCollection: true,
      };
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
    "L05-L06-note-recovery",
    "Editor",
    wide,
    "dark",
    "keyboard",
    "A refused note save keeps the exact long entry. The same tab restores its text and focus on reload, another tab cannot see the unsaved entry, and saving adds one Status log note without changing the stage.",
    async (page) => {
      await open(page, path(separate));
      const stageLine = stage(page).locator('[data-renewal-field="stage-line"]');
      const start = await stageLine.innerText();
      const note = page.getByRole("textbox", { name: "Add a note", exact: true });
      const noteText =
        "Synthetic continuation note. " +
        "Review the example source before outreach. ".repeat(31);
      const notesRoute = origin + "/api/lease-renewal/work-status";
      let refused = 0;
      const refuse = (request) => {
        if (request.request().method() !== "POST") return request.continue();
        refused += 1;
        return request.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic note save unavailable." }),
        });
      };
      await page.route(notesRoute, refuse);
      await note.focus();
      await note.fill(noteText);
      await page
        .getByTestId("renewal-status-note-autosave")
        .getByRole("status")
        .filter({ hasText: /Synthetic note save unavailable.*Your entry is kept/ })
        .waitFor();
      assert.equal(await note.inputValue(), noteText);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (text) =>
          document.activeElement instanceof HTMLTextAreaElement &&
          document.activeElement.value === text,
        noteText,
      );
      const other = await page.context().newPage();
      try {
        await open(other, path(separate));
        const otherNote = other.getByRole("textbox", { name: "Add a note", exact: true });
        assert.equal(await otherNote.inputValue(), "");
      } finally {
        await other.close();
      }
      await page.unroute(notesRoute, refuse);
      await note.focus();
      await page.keyboard.press("Tab");
      const statusLog = page.getByTestId("renewal-status-log");
      await statusLog.getByText(noteText.trim(), { exact: true }).waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await statusLog.getByText(noteText.trim(), { exact: true }).waitFor();
      assert.equal(
        await statusLog.getByText(noteText.trim(), { exact: true }).count(),
        1,
      );
      assert.equal(await stageLine.innerText(), start);
      return {
        refused,
        preservedCharacters: noteText.length,
        isolatedTab: true,
        recordedNotes: 1,
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
    "L11-operations-procedure",
    "Editor",
    narrow,
    "light",
    "touch",
    "Communications is reachable under Operations. Internal Processes distinguishes working leases from the renewal procedure and can return to a linked lease.",
    async (page) => {
      await open(page, "/");
      await page.getByRole("button", { name: "Operations", exact: true }).tap();
      await page.getByRole("link", { name: "Communications", exact: true }).tap();
      await page
        .getByRole("heading", { name: "Workflow Communications", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Operations", exact: true }).tap();
      await page.getByRole("link", { name: "Internal Processes", exact: true }).tap();
      const directory = page.getByRole("heading", {
        name: "Internal Processes",
        exact: true,
      });
      await directory.waitFor();
      const procedure = page.getByRole("link", {
        name: /Open the owner outreach checklist/,
      });
      await procedure.tap();
      await page.waitForURL((url) => url.searchParams.get("tab") === "process");
      const workLink = page.getByRole("link", { name: "Open renewal work", exact: true });
      await workLink.waitFor();
      assert.equal(await workLink.getAttribute("href"), desk);
      const procedurePath = new URL(page.url()).pathname;
      await open(page, `${procedurePath}?tab=process&lease=${prepared}`);
      await workLink.tap();
      await page.waitForURL((url) => url.pathname === path(prepared));
      await stage(page).waitFor();
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page
        .getByRole("link", { name: "Back to Internal Processes", exact: true })
        .tap();
      await directory.waitFor();
      return { namedOperationsAndProcedure: true, exactLeaseReturn: true };
    },
  );
  await check(
    "L12-connection-retry",
    "Admin",
    narrow,
    "dark",
    "keyboard",
    "The old RentVine anchor opens its focused service. A refused synthetic check keeps the service state and the same control can read it successfully on retry.",
    async (page) => {
      await open(page, "/connections#connector-rentvine");
      const verify = page.getByRole("button", {
        name: "Check RentVine connection",
        exact: true,
      });
      await verify.waitFor();
      const route = origin + "/api/connections/verify";
      let failureServed = false;
      const refuseOnce = (request) => {
        if (failureServed) return request.continue();
        failureServed = true;
        return request.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        });
      };
      await page.route(route, refuseOnce);
      await verify.focus();
      await page.keyboard.press("Enter");
      await page.getByText("The check could not run", { exact: true }).waitFor();
      await page.unroute(route, refuseOnce);
      await verify.focus();
      await page.keyboard.press("Enter");
      await page
        .getByText("Verified: RentVine answered the live check.", { exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "Open Admin task index", exact: true })
        .click();
      await page.getByRole("region", { name: "Find an Admin task" }).waitFor();
      const editor = await session("Editor", narrow, "light");
      try {
        await open(editor.page, "/connections#connector-rentvine");
        await editor.page
          .getByText("An Admin connects and verifies this.")
          .first()
          .waitFor();
        assert.equal(
          await editor.page
            .getByRole("button", { name: "Check RentVine connection", exact: true })
            .count(),
          0,
        );
        const protectedRoute = await open(
          editor.page,
          "/admin?task=renewal#admin-renewal-packet-policy",
        );
        assert.ok(
          protectedRoute?.status() === 403 ||
            new URL(editor.page.url()).pathname !== "/admin" ||
            (await editor.page
              .getByText(/Admin access|permission/i)
              .first()
              .isVisible()),
        );
        assert.equal(
          await editor.page
            .getByRole("button", { name: "Publish a new policy version", exact: true })
            .count(),
          0,
        );
      } finally {
        await editor.context.close();
      }
      return {
        failedReadRetried: failureServed,
        returnedToAdmin: true,
        editorRefused: true,
      };
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
  await check(
    "L13-help-print-return",
    "Editor",
    narrow,
    "dark",
    "keyboard",
    "An existing Help step link opens the current guide. The actual Print this guide control requests browser printing, all printed headings stay with their content, and Back returns to the same lease section.",
    async (page) => {
      const destination = path(prepared, "?view=focus#renewal-section-documents");
      await open(page, destination);
      const documents = page.getByRole("region", {
        name: "Documents and completion",
        exact: true,
      });
      await documents.waitFor();
      const address = page.url();
      await page.addInitScript(() => {
        window.print = () => {
          document.documentElement.dataset.rehearsalPrintRequested = "true";
        };
      });
      await open(page, "/help/lease-renewals/work-a-renewal#record-renewal-work");
      const heading = page.getByRole("heading", {
        name: "Work a renewal from the desk to a recorded outcome",
        exact: true,
      });
      await heading.waitFor();
      await page.locator("#record-renewal-work .help-step-title").waitFor();
      const print = page.getByRole("button", { name: "Print this guide", exact: true });
      await print.focus();
      await page.keyboard.press("Enter");
      await page.locator('html[data-rehearsal-print-requested="true"]').waitFor();
      await page.emulateMedia({ media: "print" });
      assert.equal(await print.isVisible(), false);
      const printed = await page
        .locator(".help-guide h1, .help-guide h2, .help-guide h3")
        .evaluateAll((headings) =>
          headings.map((node) => getComputedStyle(node).breakAfter),
        );
      assert.ok(printed.length > 0 && printed.every((rule) => rule === "avoid"));
      await page.emulateMedia({ media: "screen" });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await documents.waitFor();
      assert.equal(page.url(), address);
      return {
        headingsKeptWithContent: printed.length,
        nativePrintRequested: true,
        returnedToLease: true,
      };
    },
  );
} finally {
  await browser.close();
}
process.exitCode = cases.every(Boolean) ? 0 : 1;

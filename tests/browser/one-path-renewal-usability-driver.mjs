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
        .getByRole("textbox", { name: "Question", exact: true })
        .fill("Which lease renewals are due next month?");
      await page.getByRole("button", { name: "Get answer", exact: true }).click();
      const answer = page.getByRole("region", { name: "Assistant answer", exact: true });
      await answer.waitFor();
      const leaseLinks = answer.locator(
        `a[href^="${desk}/lease/"]:not([href$="/rentvine"])`,
      );
      await leaseLinks.first().waitFor();
      const ids = await leaseLinks.evaluateAll(
        (links, prefix) => [
          ...new Set(
            links.map((link) => {
              const leaseId = new URL(link.href).pathname.slice(prefix.length);
              if (!/^\d+$/.test(leaseId))
                throw new Error("Unexpected renewal workspace link");
              return Number(leaseId);
            }),
          ),
        ],
        desk + "/lease/",
      );
      assert.deepEqual(
        ids.sort((a, b) => a - b),
        [...expectedGroups.this_batch].sort((a, b) => a - b),
      );
      await leaseLinks
        .and(
          answer.locator(`a[href^="${path(prepared)}?"] , a[href="${path(prepared)}"]`),
        )
        .first()
        .click();
      await page.waitForURL((url) => url.pathname === path(prepared));
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
    "A clean collection can choose an in-period and out-of-period lease. The exact reviewed membership is saved, recovered after a lost response, reopened and shown on the desk. A concurrent rename makes an older removal review stale. Refresh and cancel retain the two saved members.",
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
      const renamed = "Example renamed December working group";
      const stale = await page.context().newPage();
      try {
        await open(stale, reopened.pathname + reopened.search);
        const staleDetail = stale.getByRole("region", {
          name: "Current collection status",
        });
        await staleDetail.getByRole("heading", { name, exact: true }).waitFor();
        await staleDetail.getByRole("button", { name: "Edit membership" }).click();
        const staleEditor = stale.getByRole("region", {
          name: "Collection membership editor",
        });
        await staleEditor.waitFor();
        const staleIds = staleEditor.getByRole("textbox", {
          name: /^Selected lease IDs/,
        });
        await staleIds.fill(prepared);
        await staleEditor.getByRole("button", { name: "Review membership" }).click();
        const staleReview = staleEditor.getByRole("region", {
          name: "Reviewed membership",
        });
        await staleReview
          .getByRole("heading", { name: "Removals (1)", exact: true })
          .waitFor();

        await detail
          .getByRole("button", { name: "Rename collection", exact: true })
          .click();
        await detail.getByLabel("New collection name", { exact: true }).fill(renamed);
        await detail
          .getByRole("button", { name: "Save collection name", exact: true })
          .click();
        await detail.getByRole("heading", { name: renamed, exact: true }).waitFor();
        await staleReview
          .getByRole("button", { name: "Save reviewed collection" })
          .click();
        await stale
          .getByRole("alert")
          .filter({ hasText: /collection changed/i })
          .waitFor();
        assert.equal(await staleIds.inputValue(), prepared);
        assert.match(await staleDetail.innerText(), /membership version 2/);
        assert.match(await staleDetail.innerText(), /2 saved members/);
        await staleEditor.getByRole("button", { name: "Discard changes" }).click();
        await staleEditor.waitFor({ state: "hidden" });
      } catch (error) {
        await stale
          .screenshot({ path: join(runDir, "L03-stale-review-failure.png") })
          .catch(() => undefined);
        throw error;
      } finally {
        await stale.close();
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
      await detail.getByRole("heading", { name: renamed, exact: true }).waitFor();
      assert.match(await detail.innerText(), /membership version 2/);
      return {
        exactMembership: 2,
        version: 2,
        lostSaveRecovered: dropped,
        approverReadback: true,
        staleRemovalRefused: true,
        returnedToCollection: true,
      };
    },
  );
  await check(
    "L03-collection-from-filter",
    "Editor",
    wide,
    "light",
    "pointer",
    "The exact authorized filter offers a lease for a new collection. Match a period applies that same filter. Review and confirm the one member, then reopen the same version.",
    async (page) => {
      await open(page, desk + "?v=2&scope=all&lease=" + prepared);
      await page
        .getByRole("link", {
          name: "Save reviewed leases as a shared collection",
          exact: true,
        })
        .click();
      const editor = page.getByRole("region", { name: "Collection membership editor" });
      const name = "Example collection from one filtered lease";
      await editor.getByText("1 leases were offered by the source selection.").waitFor();
      assert.equal(await editor.getByLabel("Selected lease IDs").inputValue(), prepared);
      assert.equal(
        await editor.getByLabel("Membership selection").inputValue(),
        "explicit",
      );
      await editor.getByLabel("Membership selection").selectOption("period");
      const period = rehearsal.workingMonth;
      const [year, month] = period.split("-").map(Number);
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      await editor.getByLabel("Collection name").fill(name);
      await editor.getByLabel("Period from").fill(period + "-01");
      await editor.getByLabel("Period through").fill(period + "-" + last);
      await editor.getByRole("button", { name: "Review membership" }).click();
      const review = editor.getByRole("region", { name: "Reviewed membership" });
      await review.getByRole("heading", { name: "Additions (1)", exact: true }).waitFor();
      assert.match(await review.innerText(), new RegExp("· " + prepared + " · cycle"));
      await review.getByRole("button", { name: "Save reviewed collection" }).click();
      const detail = page.getByRole("region", { name: "Current collection status" });
      await detail.getByRole("heading", { name, exact: true }).waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await detail.getByRole("heading", { name, exact: true }).waitFor();
      assert.match(await detail.innerText(), /membership version 1/);
      const saved = detail.getByRole("table", { name: "Saved members" });
      await saved.locator('a[href^="' + path(prepared) + '"]').waitFor();
      assert.equal(await saved.getByRole("row").count(), 2);
      return { imported: 1, matchedByPeriod: 1, version: 1 };
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
    "L06-full-destinations",
    "Editor",
    wide,
    "dark",
    "keyboard",
    "Each Guided detail link and exact legacy Focus URL visibly lands in its Full section. Guided returns to the same step, a recognized step link opens its step, and a malformed target leaves the normal lease usable.",
    async (page) => {
      const destinations = [
        ["lease-details", "Lease details"],
        ["comps", "Market rent comparison"],
        ["owner", "Owner approval"],
        ["tenant", "Tenant offer and response"],
        ["documents", "Documents and completion"],
      ];
      const pathNav = page.getByRole("navigation", { name: "Renewal path", exact: true });
      const nowHeading = page.locator("#renewal-now-heading");
      const guided = leaseViews(page).getByRole("button", {
        name: "Guided view",
        exact: true,
      });
      const full = leaseViews(page).getByRole("button", {
        name: "Full view",
        pressed: true,
      });
      const detailNav = page.getByRole("navigation", {
        name: "Every section in Full view",
      });
      const landed = async (id) => {
        await full.waitFor();
        await page.locator("#" + id).waitFor();
        await page.waitForFunction((targetId) => {
          const section = document.getElementById(targetId);
          const active = document.activeElement;
          if (!section || !active || !section.contains(active)) return false;
          const bounds = active.getBoundingClientRect();
          return bounds.height > 0 && bounds.top >= 0 && bounds.top < window.innerHeight;
        }, id);
      };
      await open(page, path(prepared));
      await nowHeading.waitFor();
      const current = await nowHeading.innerText();
      for (const [key, label] of destinations) {
        const id = "renewal-section-" + key;
        await detailNav.getByRole("link", { name: label, exact: true }).press("Enter");
        await landed(id);
        await guided.press("Enter");
        await nowHeading.waitFor();
        assert.equal(await nowHeading.innerText(), current);
        await open(page, path(prepared, "?view=focus#" + id));
        await landed(id);
        await guided.press("Enter");
        await nowHeading.waitFor();
        assert.equal(await nowHeading.innerText(), current);
      }
      await open(page, path(prepared, "?view=focus&step=offer-tenant"));
      await pathNav
        .getByRole("button", { name: "Offer the tenant", pressed: true })
        .waitFor();
      assert.equal(await nowHeading.innerText(), "Offer the tenant");
      await open(page, path(prepared, "?view=focus#%E0%A4%A"));
      await pathNav.waitFor();
      assert.equal(await guided.getAttribute("aria-pressed"), "true");
      assert.equal(await nowHeading.innerText(), current);
      return {
        fullDestinations: destinations.length,
        oldFocusDestinations: destinations.length,
        recognizedStep: true,
        malformedTargetSafe: true,
      };
    },
  );
  await check(
    "L08-month-and-move-out",
    "Editor",
    wide,
    "light",
    "pointer",
    "The counted month-to-month and move-out rows open the correct lease. Recording the annual term context and the staff non-renewal handoff keeps each record on its own lease after reload and leads back to the same desk group.",
    async (page) => {
      const fromGroup = async (group, lease) => {
        await open(page, desk + "?group=" + group);
        const panel = page.locator('[data-batch-open-group="' + group + '"]');
        const row = panel.locator('tr[data-batch-lease="' + lease + '"]');
        await row.waitFor();
        const deskLine = await row.innerText();
        await row.getByRole("rowheader").getByRole("link").click();
        await page.waitForURL((url) => url.pathname === path(lease));
        await stage(page).waitFor();
        return { row, deskLine };
      };
      const annual = String(expectedGroups.month_to_month_reviews[0]);
      const monthly = await fromGroup("month_to_month_reviews", annual);
      assert.match(monthly.deskLine, /Review due|Review date/i);
      await open(page, path(annual, "?view=full#renewal-section-lease-details"));
      const term = page.locator("#renewal-card-lease-term");
      await term.locator('[data-lease-term="month_to_month"]').waitFor();
      const anchor = term.getByLabel(
        "Month-to-month since (the annual review is 12 months later)",
        { exact: true },
      );
      const sourceDate = await anchor.inputValue();
      assert.match(sourceDate, /^\d{4}-\d{2}-\d{2}$/);
      const termContext = term.getByRole("textbox", {
        name: "Context (optional)",
        exact: true,
      });
      const [termSaved] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/lease-renewal/term-review" &&
            response.request().method() === "POST",
        ),
        termContext.fill("Synthetic annual term review").then(() => termContext.blur()),
      ]);
      assert.ok(termSaved.ok());
      await page.reload({ waitUntil: "domcontentloaded" });
      await term.getByText(/Recorded term: Month.to.month/i).waitFor();
      assert.equal(await anchor.inputValue(), sourceDate);
      const recorded = await page.evaluate(
        async (lease) =>
          (await fetch("/api/lease-renewal/term-review?lease_id=" + lease)).json(),
        annual,
      );
      assert.equal(recorded.review?.reason, "Synthetic annual term review");
      await open(page, desk + "?group=month_to_month_reviews");
      await monthly.row.waitFor();
      assert.match(await monthly.row.innerText(), /Review due|Review date/i);

      const moveOut = String(expectedGroups.non_renewals[0]);
      const notice = await fromGroup("non_renewals", moveOut);
      assert.match(notice.deskLine, /non.renewal|move.out/i);
      await stage(page)
        .locator('[data-renewal-current-step="non-renewal-handoff"]')
        .waitFor();
      const handoff = page.locator("#renewal-manual-non_renewal_handoff");
      const outcome = handoff.getByLabel("Non-renewal handoff recorded outcome", {
        exact: true,
      });
      if (!(await outcome.isVisible())) await handoff.locator("summary").click();
      const [handoffSaved] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/lease-renewal/workspace" &&
            response.request().method() === "POST",
        ),
        outcome.selectOption("done"),
      ]);
      assert.ok(handoffSaved.ok());
      await open(page, path(moveOut, "?view=focus#renewal-manual-non_renewal_handoff"));
      await handoff
        .locator("summary")
        .filter({ hasText: /Non-renewal handoff recorded.*done/i })
        .waitFor();
      await open(page, desk + "?group=non_renewals");
      await page.locator('[data-batch-open-group="non_renewals"]').waitFor();
      return {
        annualTermReadback: true,
        noticeHandoffReadback: true,
        returnedToDeskGroups: true,
      };
    },
  );
  await check(
    "L09-disposition",
    "Editor",
    wide,
    "light",
    "pointer",
    "The exact cycle moves to Retired after confirmation. A stale review in another tab keeps its reason and creates no second record. Restoration persists, and the Status log lists both recorded decisions.",
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
      const staleTab = await page.context().newPage();
      try {
        await open(staleTab, path(separate));
        const staleStage = stage(staleTab);
        await staleStage
          .getByRole("button", { name: "Record work", exact: true })
          .click();
        await staleStage
          .getByRole("button", { name: "Retire from renewals", exact: true })
          .click();
        const staleDialog = staleTab.getByRole("dialog", {
          name: "Retire from renewals",
          exact: true,
        });
        const staleReason = staleDialog.getByLabel("Reason", { exact: true });
        await staleReason.fill("Example stale retirement review");
        await dialog
          .getByRole("button", { name: "Retire from renewals", exact: true })
          .click();
        await header.getByText("Retired from renewals", { exact: true }).waitFor();
        await staleDialog
          .getByRole("button", { name: "Retire from renewals", exact: true })
          .click();
        await staleDialog.getByText(/The current cycle or retirement changed/).waitFor();
        assert.equal(await staleReason.inputValue(), "Example stale retirement review");
        await staleDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      } finally {
        await staleTab.close();
      }
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
      const statusLog = page.getByRole("region", {
        name: "Staff status and Status log",
        exact: true,
      });
      const history = statusLog.locator("details").filter({
        has: page.getByText("Retirement and restoration history", { exact: true }),
      });
      await history.locator("summary").click();
      await history.getByText(/Synthetic retirement corrected/).waitFor();
      await history.getByText(/Synthetic inactive cycle/).waitFor();
      assert.equal(await history.getByRole("listitem").count(), 2);
      return {
        retiredCountedAndOpened: true,
        bothDecisionsSurvivedReload: true,
        staleReasonKept: true,
        recordedEvents: 2,
      };
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
    "L10-synthetic-forms",
    "Editor",
    wide,
    "light",
    "pointer",
    "A synthetic Admin's published fee and the Editor's recorded deposit add exactly. A missing deposit leaves the total blank. The owner explanation keeps its paragraphs and neither value appears on a second lease.",
    async (page) => {
      log({
        id: "L10-synthetic-forms-admin",
        state: "expectation",
        role: "Admin",
        viewport: wide,
        theme: "light",
        input: "pointer",
        expected:
          "The scoped Admin page reads back the chosen brokerage family and the published synthetic fee.",
      });
      const admin = await session("Admin", wide, "light");
      const postResponse = (actorPage, pathname) =>
        actorPage.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === pathname &&
            response.request().method() === "POST",
        );
      try {
        await open(admin.page, "/admin?task=renewal#admin-renewal-packet-policy");
        await admin.page.waitForLoadState("networkidle", { timeout: 15_000 });
        const familyUse = admin.page.locator("#family-use-brokerage_disclosure");
        assert.notEqual(await familyUse.inputValue(), "mandatory");
        const [family] = await Promise.all([
          postResponse(admin.page, "/api/admin/lease-artifact-family-use"),
          familyUse.selectOption("mandatory"),
        ]);
        assert.ok(family.ok());
        await admin.page.locator("#policy-pet-fee").fill("50");
        await admin.page
          .locator("#policy-pet-fee-source")
          .fill("Synthetic rehearsal fee source");
        await admin.page.locator("#policy-effective").fill(rehearsal.businessDate);
        const [published] = await Promise.all([
          postResponse(admin.page, "/api/admin/lease-charge-policy"),
          admin.page
            .getByRole("button", { name: "Publish a new policy version", exact: true })
            .click(),
        ]);
        assert.ok(published.ok());
        await admin.page.getByText(/Published charge policy version \d+/).waitFor();
        await admin.page.reload({ waitUntil: "domcontentloaded" });
        assert.equal(
          await admin.page.locator("#family-use-brokerage_disclosure").inputValue(),
          "mandatory",
        );
        assert.equal(
          Number(await admin.page.locator("#policy-pet-fee").inputValue()),
          50,
        );
      } catch (error) {
        await admin.page
          .screenshot({ path: join(runDir, "L10-admin-failure.png") })
          .catch(() => undefined);
        throw error;
      } finally {
        await admin.context.close();
      }
      const documentPath = (id) => path(id, "?view=full#renewal-section-documents");
      const packet = page.getByRole("region", {
        name: "Document packet truth",
        exact: true,
      });
      const inputs = packet.getByRole("region", { name: "Packet inputs", exact: true });
      const openInputs = async (id) => {
        await open(page, documentPath(id));
        await packet
          .getByRole("button", { name: "Open packet inputs", exact: true })
          .click();
        await inputs.waitFor();
      };
      await openInputs(prepared);
      const amount = (kind) => inputs.locator('[data-pet-agreement="' + kind + '"]');
      assert.match(await amount("fee").innerText(), /\$50\.00/);
      assert.match(await amount("total").innerText(), /left blank/);
      await inputs
        .getByRole("textbox", { name: "Refundable deposit", exact: true })
        .fill("250");
      await inputs
        .getByRole("textbox", { name: "Where the deposit comes from", exact: true })
        .fill("Synthetic screening result for this lease");
      await inputs.getByRole("button", { name: "Save animals", exact: true }).click();
      await amount("total")
        .filter({ hasText: /\$300\.00/ })
        .waitFor();
      assert.match(await amount("deposit").innerText(), /\$250\.00/);

      const explanation =
        "The example home stays on its current renewal path.\n\nThe synthetic owner may review the separate terms.";
      await inputs
        .getByRole("textbox", { name: "Explanation for the owner", exact: true })
        .fill(explanation);
      await inputs.getByRole("button", { name: "Save explanation", exact: true }).click();
      const printed = inputs.locator('[data-renewal-field="owner-explanation-preview"]');
      await printed.waitFor();
      assert.equal((await printed.textContent())?.trim(), explanation);
      await openInputs(prepared);
      assert.match(await amount("total").innerText(), /\$300\.00/);
      assert.equal((await printed.textContent())?.trim(), explanation);

      const [evaluation] = await Promise.all([
        postResponse(page, "/api/lease-renewal/packet-truth"),
        packet
          .getByRole("button", { name: /^Evaluate (?:packet|current truth)$/ })
          .click(),
      ]);
      const snapshot = (await evaluation.json()).snapshot;
      assert.ok(evaluation.ok() && snapshot?.leaseId === prepared && snapshot.snapshotId);
      await packet
        .getByRole("button", { name: "Evaluate current truth", exact: true })
        .waitFor();
      const visibleState = await packet
        .locator('[data-renewal-field="packet-shown-state"]')
        .innerText();
      await openInputs(String(rehearsal.roles.covered));
      assert.match(await amount("total").innerText(), /left blank/);
      assert.equal(
        await inputs
          .getByRole("textbox", { name: "Explanation for the owner", exact: true })
          .inputValue(),
        "",
      );
      assert.equal(
        await inputs.getByRole("textbox", { name: /Registration/i }).count(),
        0,
      );
      return {
        feePublishedAndReread: 50,
        exactDepositAndTotal: [250, 300],
        twoParagraphsReread: true,
        packetEvaluationState: visibleState,
        otherLeaseStayedBlank: true,
      };
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
      const operations = async () => {
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.tap();
        await page
          .getByRole("button", { name: "Menu", exact: true, expanded: true })
          .waitFor();
        const group = page.getByRole("button", {
          name: /^Operations(?: Contains current page)?$/,
        });
        if ((await group.getAttribute("aria-expanded")) !== "true") await group.tap();
      };
      await open(page, "/");
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await operations();
      await page.getByRole("link", { name: "Communications", exact: true }).tap();
      await page
        .getByRole("heading", { name: "Workflow Communications", exact: true })
        .waitFor();
      await operations();
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
      const checkConnection = () =>
        Promise.all([
          page.waitForResponse(
            (response) =>
              response.url() === route && response.request().method() === "POST",
          ),
          verify.press("Enter"),
        ]).then(([response]) => response);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.route(route, refuseOnce);
      assert.equal((await checkConnection()).status(), 503);
      await page.getByText("The check could not run", { exact: true }).waitFor();
      await page.unroute(route, refuseOnce);
      const retry = await checkConnection();
      assert.ok(retry.ok());
      const result = await retry.json();
      assert.equal(result.connector_id, "rentvine");
      assert.equal(result.verified, true);
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
        verifiedBySyntheticProbe: result.verified,
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
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await print.press("Enter");
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

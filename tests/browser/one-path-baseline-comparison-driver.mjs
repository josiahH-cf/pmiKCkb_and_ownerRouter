// Read-only paired observations for S259 and the preserved S254 default-list comparison.
// Serve the current candidate, ef81b891, or 6491c06f with the same held, mailbox-disabled harness.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch", "The rehearsal preload is required.");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir);
const run = readRehearsal(runDir);
assert.equal(run.automaticComparisonHeld, true);
assert.equal(run.mailAdapter, false);
assert.equal(run.overlay, false);
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const historicalSha = "6491c06f3773e92c0bd811d4360371523e24d643";
const novemberSha = "ef81b8917209f4eec3f22097142b559f3cce875b";
const historical = run.servedCommit === historicalSha;
const november = run.servedCommit === novemberSha;
assert.ok(historical || november || run.servedCommit === run.harnessCommit);
const desk = "/lease-renewal/live/desk";
const viewport = { width: 1280, height: 800 };
const expected = historical
  ? "The original default table includes closed synthetic leases."
  : november
    ? "The November 7 baseline shows a working-month list and three selectable lease views."
    : "The same default month shows a table and the same lease, with two selectable views and the shared stage in Guided and Full.";
const fileSha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const evidence = {
  servedCommit: run.servedCommit,
  harnessCommit: run.harnessCommit,
  fixtureSha: fileSha("tests/fixtures/lease-renewal/november-5-mix.json"),
  guardSha: fileSha("tests/browser/renewal-novdec-journey-network.mjs"),
  businessDate: run.businessDate,
  workingMonth: run.workingMonth,
  role: "Editor",
  entry: desk,
  viewport,
  theme: "light",
  input: "pointer",
  expected,
};
const record = () =>
  writeFileSync(join(runDir, "desk-comparison.json"), JSON.stringify(evidence, null, 2));
record();
process.stdout.write(JSON.stringify(evidence) + "\n");
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport,
    colorScheme: "light",
    serviceWorkers: "block",
    timezoneId: "America/Chicago",
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
  assert.ok(
    await page.evaluate(
      async () =>
        (
          await fetch("/api/auth/demo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role: "Editor" }),
          })
        ).ok,
    ),
  );
  const comparisonRequests = async () =>
    (await standInState(run)).comparison.comparisonsByLease ?? {};
  const before = await comparisonRequests();
  await page.goto(origin + desk, { waitUntil: "domcontentloaded" });
  if (historical) {
    const rows = page.locator("table.renewal-table tr[data-lease-id]");
    await rows.first().waitFor({ timeout: 90_000 });
    const ids = await rows.evaluateAll((items) =>
      items.map((row) => Number(row.getAttribute("data-lease-id"))),
    );
    const closed = ids.filter((id) => run.groups.closed.includes(id));
    evidence.observed = { defaultRows: ids.length, closedRows: closed.length };
    assert.equal(ids.length, 37);
    assert.equal(closed.length, 10);
  } else {
    const batch = page.getByRole("region", { name: "Working batch", exact: true });
    await batch.waitFor({ timeout: 90_000 });
    const membership = await batch
      .locator("[data-batch-list] [data-batch-lease]")
      .evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute("data-batch-lease"))),
      );
    const workTable =
      (await batch.getByRole("columnheader", { name: "Next action" }).count()) > 0;
    assert.equal(workTable, !november);
    assert.equal(await batch.getAttribute("data-batch-month"), run.workingMonth);
    const displayed = new Set(membership);
    assert.equal(membership.length, displayed.size);
    assert.deepEqual(
      [...displayed].sort((a, b) => a - b),
      [...run.groups.working_month, ...run.groups.carried_over].sort((a, b) => a - b),
    );
    const row = batch.locator('[data-batch-lease="' + run.roles.prepared + '"]');
    const leaseLink = row.locator("a.renewal-batch-lease");
    const href = await leaseLink.getAttribute("href");
    assert.ok(href);
    await leaseLink.click();
    const leasePath = new URL(href, origin).pathname;
    await page.waitForURL((url) => url.pathname === leasePath);
    assert.equal(context.pages().length, 1);
    const views = page.getByRole("group", { name: "Lease view", exact: true });
    await views.waitFor();
    const labels = await views.getByRole("button").allTextContents();
    assert.deepEqual(
      labels,
      november
        ? ["Guided view", "Focus view", "Full view"]
        : ["Guided view", "Full view"],
    );
    const stage = page.getByRole("region", {
      name: "Current renewal stage",
      exact: true,
    });
    assert.equal(await stage.count(), november ? 0 : 1);
    const guided = page.locator("#renewal-now-heading");
    await guided.waitFor();
    const currentAction = await guided.innerText();
    const headerStage = november
      ? null
      : await stage.locator('[data-renewal-field="stage-line"]').innerText();
    await views.getByRole("button", { name: "Full view", exact: true }).click();
    await views.getByRole("button", { name: "Full view", pressed: true }).waitFor();
    if (!november)
      assert.equal(
        await stage.locator('[data-renewal-field="stage-line"]').innerText(),
        headerStage,
      );
    await page.goBack({ waitUntil: "domcontentloaded" });
    await batch.waitFor();
    assert.equal(await batch.getAttribute("data-batch-month"), run.workingMonth);
    evidence.observed = {
      defaultRows: displayed.size,
      closedRows: membership.filter((id) => run.groups.closed.includes(id)).length,
      groupCounts: await batch
        .locator("button[data-batch-group], [data-batch-list]")
        .evaluateAll((groups) =>
          Object.fromEntries(
            groups.map((group) => [
              group.getAttribute("data-batch-group") ??
                group.getAttribute("data-batch-list"),
              Number(group.getAttribute("data-batch-count")),
            ]),
          ),
        ),
      display: workTable ? "table" : "list",
      views: labels,
      currentAction,
      sharedStage: headerStage,
      returnedToMonth: true,
      tabs: context.pages().length,
    };
  }
  assert.deepEqual(await comparisonRequests(), before);
  evidence.verdict = "PASS";
} catch (error) {
  evidence.verdict = "FAIL";
  evidence.error = String(error);
  throw error;
} finally {
  record();
  process.stdout.write(JSON.stringify(evidence) + "\n");
  await browser.close();
}

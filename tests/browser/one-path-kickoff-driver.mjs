// S249: the prepared kickoff and the one message route, through the one-path rehearsal. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --overlay --driver tests/browser/one-path-kickoff-driver.mjs
//
// (drop --overlay to run a committed tree). As the local demo roles it works the November 5 mix
// in a browser and checks, each by name: the allowance stop (L34) and a lease asked for its rent
// to recommend before Send (L29); the reviewed setting turned off by an Admin in the app, nothing
// starting by itself while it is off, and "Prepare this batch" still running when chosen (L35);
// the automatic start on opening the batch, once per lease per cycle (L33); the batch order (L31)
// and the missing recipient on the desk and the Now card (L30); the prepared lease's numbers
// check (L21), what it shows with no action (L22) and its stored comparison reused (L32); one
// message across the preview, Schedule, Create Gmail draft instead, Copy and the composer (L27);
// the send in three deliberate actions on one page (L23) with no internal working sentence in
// any owner message (L29); a Gmail draft that reads older after an edit (L28, with the L40 line
// where the served commit has it); the rewording accepted only on "Use this revision" and an
// echoed rewording refused (L44); a signature set up on the Now card (L45); the tenant offer
// prepared on its step (L42, the tenant half); and no refused connection (L58).
//
// The comparison and mail stand-ins answer every provider call; the control hooks
// (scripts/lib/one-path-rehearsal/control.mjs) set the allowance and the rewording. The result
// goes to kickoff.json in the run directory. Synthetic data only; nothing leaves this machine.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  refusedConnections,
  resetComparisonLog,
  setComparisonAllowance,
  setRewording,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";

// The rehearsal's network boundary must be active in THIS process before anything runs.
const fetchGuarded = globalThis.fetch?.name === "guardedFetch";
const socketGuarded = net.Socket.prototype.connect.name === "guardedConnect";
if (!fetchGuarded || !socketGuarded) {
  process.stderr.write(
    "The rehearsal network boundary is not loaded in the driver process; nothing was run.\n",
  );
  process.exit(2);
}

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
assert.notEqual(
  rehearsal.mailAdapter,
  false,
  "This driver needs the mail adapter; run it without --no-mail-adapter.",
);
const { prepared, covered, assisted, missingRecipient } = rehearsal.roles;
const INTERNAL_SENTENCE = "The working offer remains a staff decision";

const checks = [];
const steps = [];
const pageErrors = [];
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${name}\n`);
};
/** A check that depends on a suite not built yet: recorded with what was seen, never a pass. */
const pending = (name, suite, observed) => {
  checks.push({ name, passed: null, pending: suite, observed });
  process.stdout.write(`PEND ${name} (waits on ${suite})\n`);
};
/** The driver's current phase, so each write the page makes names when it happened. */
let phase = "start";
const keysOf = (text) => {
  try {
    const body = JSON.parse(text ?? "{}");
    return [
      ...Object.keys(body),
      ...(body.kind ? [`kind=${body.kind}`] : []),
      ...(body.field ? [`field=${body.field}`] : []),
    ];
  } catch {
    return [];
  }
};
/** A deliberate staff action, for the action counts (L23). */
const act = (label) => steps.push({ at: new Date().toISOString(), action: label });
const comparisons = async () =>
  (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};
const total = (byLease) => Object.values(byLease).reduce((sum, n) => sum + n, 0);

/**
 * Where one lease's notice-safety marker stands, read from the rehearsal's Firestore emulator as
 * its owner (a read; the app is not involved), for the diagnostics of a refused send. Hash
 * prefixes only; the marker holds no customer value.
 */
async function noticeMarker(leaseId, label) {
  const key = createHash("sha256").update(String(leaseId)).digest("hex");
  const base = `http://${rehearsal.firestoreEmulatorHost}/v1/projects/${rehearsal.projectId}/databases/(default)/documents/lease_renewal_workspaces/${key}`;
  const read = async (path) => {
    try {
      const response = await fetch(`${base}${path}`, {
        // The emulator's owner token is a fixed word, not a credential.
        headers: { authorization: "Bearer owner" },
      });
      return response.ok ? ((await response.json()).fields ?? {}) : null;
    } catch {
      return null;
    }
  };
  const [marker, head] = await Promise.all([read("/approval_safety/notice"), read("")]);
  const number = (value) => Number(value?.integerValue ?? value?.doubleValue ?? NaN);
  const at = marker?.sourceReadAt?.mapValue?.fields;
  return {
    label,
    at: new Date().toISOString(),
    version: marker ? number(marker.version) : null,
    lease: at ? new Date(number(at.lease)).toISOString() : null,
    status: at ? new Date(number(at.status)).toISOString() : null,
    semantic: marker?.semanticHash?.stringValue?.slice(0, 8) ?? null,
    scope: marker?.scopeHash?.stringValue?.slice(0, 8) ?? null,
    observedAt: marker?.observedAt?.stringValue ?? null,
    headCycle: head?.cycleId?.stringValue?.slice(0, 8) ?? null,
  };
}

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
let exitCode = 1;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: "America/Chicago",
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  page.setDefaultNavigationTimeout(240_000);
  const writes = [];
  // Errors the page throws, so a section that never shows names why.
  page.on("pageerror", (error) =>
    pageErrors.push(`${phase}: ${String(error?.message ?? error).slice(0, 400)}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      pageErrors.push(`${phase} console: ${message.text().slice(0, 400)}`);
  });
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      request.method() !== "GET" &&
      url.pathname.startsWith("/api/")
    )
      writes.push({
        phase,
        method: request.method(),
        path: url.pathname,
        // The request's keys only, so a write reads as what it was without its values.
        keys: keysOf(request.postData()),
        body: url.pathname.includes("kickoff-preparation")
          ? JSON.parse(request.postData() ?? "{}")
          : null,
      });
  });
  const kickoffPosts = () =>
    writes.filter((entry) => entry.path.endsWith("/kickoff-preparation"));
  const signIn = async (role) => {
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    assert.ok(
      await page.evaluate(
        (name) =>
          fetch("/api/auth/demo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role: name }),
          }).then((response) => response.ok),
        role,
      ),
      `Local demo ${role} sign-in failed.`,
    );
  };
  const desk = async () => {
    await page.goto(`${origin}/lease-renewal/live/desk`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("region", { name: "This batch", exact: true }).waitFor();
  };
  const preparation = () =>
    page.getByRole("region", { name: "Batch preparation", exact: true });
  const guided = () => page.getByRole("region", { name: "Guided view", exact: true });
  const now = () => guided().getByRole("region", { name: "Now", exact: true });
  const strip = () =>
    guided().getByRole("navigation", { name: "Renewal path", exact: true });
  const openLease = async (leaseId) => {
    await page.goto(`${origin}/lease-renewal/live/desk/lease/${leaseId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("group", { name: "Lease view", exact: true }).waitFor();
    await page.waitForTimeout(1500);
  };
  /** Choose a step in the path strip and wait until the Now card shows it (one retry). */
  const chooseStep = async (name) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await strip().getByRole("button", { name, exact: true }).click();
      const shown = await page
        .waitForFunction(
          (step) =>
            (
              document.querySelector('[aria-label="Guided view"] [aria-label="Now"] h2')
                ?.textContent ?? ""
            ).endsWith(step),
          name,
          { timeout: 15_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (shown) break;
    }
    await page.waitForTimeout(600);
  };
  const toggleSetting = async (to) => {
    await signIn("Admin");
    await desk();
    const control = preparation().getByRole("button", {
      name: to ? "Turn automatic preparation on" : "Turn automatic preparation off",
      exact: true,
    });
    await control.click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Why this changes")
      .fill(`Rehearsal check L35 (${to ? "on" : "off"}).`);
    await dialog
      .getByRole("button", {
        name: to ? "Turn automatic preparation on" : "Turn automatic preparation off",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (want) =>
        document
          .querySelector('[aria-label="Batch preparation"]')
          ?.getAttribute("data-kickoff-automatic") === want,
      to ? "on" : "off",
    );
    await signIn("Editor");
  };
  /** Wait until the batch preparation has nothing running and has stayed so for a moment. */
  const preparationSettled = async (maxMs = 180_000) => {
    // The automatic start waits for the page to be visible and idle; let it begin first.
    await page
      .locator("[data-kickoff-progress], [data-kickoff-outcome]")
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
    const started = Date.now();
    let quietSince = Date.now();
    while (Date.now() - started < maxMs) {
      const running = await page
        .locator("[data-kickoff-progress]")
        .filter({ hasText: "Preparing " })
        .count();
      if (running > 0) quietSince = Date.now();
      else if (Date.now() - quietSince > 4000) return;
      await page.waitForTimeout(500);
    }
  };

  await signIn("Editor");
  await setComparisonAllowance(rehearsal, false);
  await resetComparisonLog(rehearsal);

  // L34: at the allowance, the remaining leases read the stop and offer the own-figures entry,
  // and no comparison is requested.
  await setComparisonAllowance(rehearsal, true);
  await desk();
  await page.waitForTimeout(5000);
  const stopped = await page
    .locator('[data-batch-kickoff="missing"]')
    .filter({ hasText: "Comparison not run: monthly allowance reached" })
    .allTextContents();
  const allowanceComparisons = await comparisons();
  check(
    'L34: at the allowance the remaining leases read "Comparison not run: monthly allowance reached" with the own-figures entry, and none is requested',
    stopped.length > 0 &&
      stopped.every((text) => text.includes("Enter your own comparison figures")) &&
      total(allowanceComparisons) === 0 &&
      kickoffPosts().length === 0,
    { stopped, allowanceComparisons, kickoffPosts: kickoffPosts().length },
  );

  // L29 (second half): a lease with no rent to recommend is asked for one on the Now card.
  await openLease(covered);
  await chooseStep("Ask the owner");
  const nowHtml = () =>
    now()
      .evaluate((element) => element.innerHTML.replace(/\s+/g, " ").slice(0, 6000))
      .catch(() => null);
  const shownWithin = (locator, ms = 60_000) =>
    locator
      .first()
      .waitFor({ timeout: ms })
      .then(() => true)
      .catch(() => false);
  const askedShown = await shownWithin(
    now().locator('[data-renewal-field="send-needs"]'),
  );
  const asked = {
    needs: askedShown
      ? ((
          await now().locator('[data-renewal-field="send-needs"]').textContent()
        )?.trim() ?? "")
      : "",
    rent: await now()
      .getByLabel("Rent to recommend")
      .inputValue({ timeout: 5000 })
      .catch(() => null),
    pageErrors: pageErrors.slice(-5),
  };
  check(
    "L29: a lease with no rent to recommend is asked for one on the Now card before Send",
    asked.needs.includes("the rent to recommend") && asked.rent === "",
    askedShown ? asked : { ...asked, nowHtml: await nowHtml() },
  );

  // L35 (first half): an Admin turns the reviewed setting off in the app (no release), and then
  // opening the batch starts nothing.
  await toggleSetting(false);
  await setComparisonAllowance(rehearsal, false);
  writes.length = 0;
  await desk();
  await page.waitForTimeout(6000);
  const offComparisons = await comparisons();
  const offState = await preparation().getAttribute("data-kickoff-automatic");
  const prepareButton = preparation().getByRole("button", {
    name: "Prepare this batch",
    exact: true,
  });
  check(
    "L35: with the setting off, opening the batch makes no comparison request and Prepare this batch remains",
    offState === "off" &&
      total(offComparisons) === 0 &&
      kickoffPosts().length === 0 &&
      (await prepareButton.isEnabled()),
    { offState, offComparisons, kickoffPosts: kickoffPosts().length },
  );

  // L35 (second half) and resumption: choosing Prepare this batch runs the same preparation; the
  // run is left after its first result and resumes when the batch is opened again.
  // The run is left after its first lookup: the browser lets the first request through and
  // holds back the rest, so the remaining leases stay unprepared for the automatic start below.
  let allowed = 1;
  const holdBack = (route) => (allowed-- > 0 ? route.continue() : route.abort("aborted"));
  await page.route("**/api/lease-renewal/kickoff-preparation", holdBack);
  act("choose Prepare this batch");
  await prepareButton.click();
  await page.locator("[data-kickoff-outcome]").first().waitFor({ timeout: 120_000 });
  const staffPosts = kickoffPosts().map((entry) => entry.body?.trigger);
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.unroute("**/api/lease-renewal/kickoff-preparation", holdBack);
  await page.waitForTimeout(3000);
  const staffComparisons = await comparisons();
  check(
    "L35: Prepare this batch, chosen, runs the preparation one lease at a time under the staff trigger",
    staffPosts.length >= 1 &&
      staffPosts.every((trigger) => trigger === "staff") &&
      total(staffComparisons) >= 1 &&
      Object.values(staffComparisons).every((n) => n <= 1),
    { staffPosts, staffComparisons },
  );

  // L33: with the setting on, opening the batch starts the preparation by itself, at most one
  // comparison per lease per cycle, and opening it again requests none.
  await setComparisonAllowance(rehearsal, true);
  await toggleSetting(true);
  await setComparisonAllowance(rehearsal, false);
  writes.length = 0;
  await desk();
  await preparationSettled();
  const automaticPosts = kickoffPosts().map((entry) => entry.body?.trigger);
  const afterAutomatic = await comparisons();
  writes.length = 0;
  await desk();
  await page.waitForTimeout(6000);
  const afterReopen = await comparisons();
  const leasesInBatch = await page
    .getByRole("region", { name: "This batch", exact: true })
    .locator("[data-batch-lease]")
    .evaluateAll((rows) => [
      ...new Set(rows.map((row) => row.getAttribute("data-batch-lease"))),
    ]);
  check(
    "L33: opening the batch starts preparation by itself, at most one comparison per lease per cycle, and none again on reopening",
    automaticPosts.length >= 1 &&
      automaticPosts.every((trigger) => trigger === "automatic") &&
      Object.values(afterAutomatic).every((n) => n <= 1) &&
      JSON.stringify(afterReopen) === JSON.stringify(afterAutomatic) &&
      kickoffPosts().length === 0,
    { automaticPosts, afterAutomatic, afterReopen, leasesInBatch },
  );
  pending(`L33 (assisted lease ${assisted}): no comparison is requested for it`, "S251", {
    requested: afterAutomatic[String(assisted)] ?? 0,
    note: "The housing assistance hold reads S251's marker; until S251 seeds it, the hold predicate answers not held back and this check reports what the stand-in saw.",
  });
  check(
    `L32: the prepared lease ${prepared} reuses its stored comparison (no request for it)`,
    !(String(prepared) in afterAutomatic),
    { afterAutomatic },
  );

  // L31 and L30: the batch order and the missing recipient on the desk.
  const parts = await page
    .getByRole("region", { name: "This batch", exact: true })
    .locator("[data-batch-part]")
    .evaluateAll((sections) =>
      sections.map((section) => ({
        part: section.getAttribute("data-batch-part"),
        count: Number(section.getAttribute("data-batch-part-count")),
        heading: section.querySelector("h3")?.textContent?.trim(),
        leases: [...section.querySelectorAll("[data-batch-lease]")].map((row) =>
          row.getAttribute("data-batch-lease"),
        ),
      })),
    );
  const ready = parts.find((part) => part.part === "ready");
  const missing = parts.find((part) => part.part === "missing");
  check(
    'L31: under "This batch" the prepared lease lists first under "Ready for your review" with a count, then leases missing an input, then waiting and finished leases',
    parts[0]?.part === "ready" &&
      ready?.heading === `Ready for your review (${ready.count})` &&
      ready.leases.includes(String(prepared)) &&
      parts.map((part) => part.part).join() ===
        ["ready", "missing", "other"]
          .filter((part) => parts.some((p) => p.part === part))
          .join(),
    parts,
  );
  const missingRow = page.locator(
    `[data-batch-part="missing"] [data-batch-lease="${missingRecipient}"]`,
  );
  const missingLine = (
    await missingRow.locator('[data-batch-kickoff="missing"]').textContent()
  )?.trim();
  await openLease(missingRecipient);
  await chooseStep("Ask the owner");
  const missingNow = await now()
    .locator('[data-renewal-ready="missing"]')
    .filter({ hasText: "Verified owner recipient" })
    .first();
  // The item is filled once the lease's message has loaded.
  await missingNow.waitFor({ timeout: 60_000 }).catch(() => undefined);
  const l30 = {
    missingLine,
    missingLeases: missing?.leases ?? null,
    readyLeases: ready?.leases ?? null,
    nowItems: await missingNow.count(),
    fixButtons: await missingNow.locator("button").count(),
    nowItem: await missingNow.textContent().catch(() => null),
  };
  check(
    "L30: the missing-recipient lease names the missing verified owner recipient on its desk row and its Now card with the fix in place, and is not ready for review",
    (l30.missingLeases ?? []).includes(String(missingRecipient)) &&
      !(l30.readyLeases ?? []).includes(String(missingRecipient)) &&
      /verified owner recipient/.test(missingLine ?? "") &&
      l30.nowItems === 1 &&
      l30.fixButtons === 1,
    l30,
  );

  // L21: the prepared lease's numbers check on RentVine; its blank Sheet row is no difference.
  phase = "L21";
  writes.length = 0;
  await openLease(prepared);
  await chooseStep("Check the numbers");
  const numbers = {
    line: (
      await now().locator('[data-renewal-field="numbers-line"]').textContent()
    )?.trim(),
    sheetNotes: await now().locator('[data-renewal-field="sheet-note"]').count(),
  };
  check(
    'L21: Check the numbers states "Numbers agree" on RentVine, and the blank Sheet row is not a difference',
    numbers.line === "Numbers agree" && numbers.sheetNotes === 0,
    numbers,
  );

  // L22: opening the prepared lease shows, with no action, the stored comparison, Rent to
  // recommend prefilled with its basis, and the owner message preview.
  phase = "L22";
  const l21Writes = writes.splice(0);
  await openLease(prepared);
  await page.waitForTimeout(3000);
  const opened = {
    heading: (await now().getByRole("heading", { level: 2 }).textContent())?.trim(),
    comparison: await now().locator('[data-renewal-comparison="stored"]').count(),
    comparisonAge: await now().locator('[data-renewal-field="comparison-age"]').count(),
    comps: await now().locator('[aria-label="Comparables"] li').count(),
    needs:
      (await now()
        .locator('[data-renewal-field="send-needs"]')
        .textContent()
        .catch(() => null)) ?? null,
    readiness: await now()
      .locator("[data-renewal-ready]")
      .evaluateAll((items) =>
        items.map(
          (item) => `${item.getAttribute("data-renewal-ready")}: ${item.textContent}`,
        ),
      ),
    rent: await now().getByLabel("Rent to recommend").inputValue(),
    basis: (
      await now().locator('[data-renewal-field="rent-basis"]').textContent()
    )?.trim(),
    preview: await now().getByRole("document", { name: "Message preview" }).count(),
    primary: (await now().locator("[data-renewal-now-primary]").textContent())?.trim(),
  };
  check(
    'L22: the prepared lease opens with the stored comparison, "Rent to recommend" prefilled with its basis in words and the owner message preview, with no action',
    (opened.heading ?? "").endsWith("Ask the owner") &&
      opened.comparison === 1 &&
      opened.comparisonAge === 1 &&
      opened.comps > 0 &&
      Number(opened.rent) > 0 &&
      /Suggested from the stored comparison/.test(opened.basis ?? "") &&
      opened.preview === 1 &&
      opened.primary === "Review and send",
    {
      ...opened,
      nowHtml: await now()
        .evaluate((element) => element.innerHTML.replace(/\s+/g, " ").slice(0, 6000))
        .catch(() => null),
    },
  );
  check("L22: opening the prepared lease made no write", writes.length === 0, {
    writes,
    l21Writes,
  });
  phase = "L27";
  const markers = [await noticeMarker(prepared, "before L27")];

  // L27: changing the rent and the reason updates the one preview, and every delivery form shows
  // that same message.
  const reason = "Current market conditions in the area support this figure.";
  act("type the rent to recommend");
  await now().getByLabel("Rent to recommend").fill("1410");
  await now().getByLabel("Rent to recommend").press("Enter");
  await page.waitForTimeout(2500);
  act("type the reason to include");
  await now().getByLabel("Reason to include").fill(reason);
  await now().getByLabel("Reason to include").blur();
  await page.waitForTimeout(3500);
  const previewText = async () =>
    (await now().getByRole("document", { name: "Message preview" }).textContent()) ?? "";
  const revisionLabel = async () =>
    /revision ([0-9A-F]{6})/.exec(
      (await now().locator('[data-renewal-field="message-revision"]').textContent()) ??
        "",
    )?.[1] ?? null;
  const edited = { preview: await previewText(), revision: await revisionLabel() };
  await now().getByRole("button", { name: "Copy", exact: true }).click();
  await page.waitForTimeout(800);
  const copied = await page
    .evaluate(() => navigator.clipboard.readText())
    .catch(() => "");
  // A disabled delivery action is recorded with what the card says it needs; it is never waited on.
  // Read at once: a card with nothing missing has no such line, and that is never waited on.
  const needsNow = async () => {
    const line = now().locator('[data-renewal-field="send-needs"]');
    return (await line.count())
      ? ((await line
          .first()
          .textContent({ timeout: 5000 })
          .catch(() => null)) ?? null)
      : null;
  };
  const scheduleButton = now().getByRole("button", { name: "Schedule", exact: true });
  let scheduled = "";
  const scheduleEnabled = await scheduleButton.isEnabled();
  if (scheduleEnabled) {
    await scheduleButton.click();
    const scheduleDialog = page.getByRole("dialog", { name: "Review and schedule" });
    await scheduleDialog
      .locator('[data-renewal-field="exact-review"]')
      .waitFor({ timeout: 120_000 });
    scheduled =
      (await scheduleDialog
        .locator('[data-renewal-field="exact-review"]')
        .textContent()) ?? "";
    await scheduleDialog.getByRole("button", { name: "Cancel" }).click();
  }
  const draftButton = now().getByRole("button", {
    name: "Create Gmail draft instead",
    exact: true,
  });
  let drafted = "";
  const draftEnabled = await draftButton.isEnabled();
  if (draftEnabled) {
    await draftButton.click();
    const draftDialog = page.getByRole("dialog", { name: "Create Gmail draft instead" });
    await draftDialog
      .locator('[data-renewal-field="draft-review"]')
      .waitFor({ timeout: 120_000 });
    drafted =
      (await draftDialog.locator('[data-renewal-field="draft-review"]').textContent()) ??
      "";
    await draftDialog.getByRole("button", { name: "Cancel" }).click();
  }
  const composer = await context.newPage();
  await composer.goto(`${origin}/gmail-hub?compose=renewal_owner&lease=${prepared}`, {
    waitUntil: "domcontentloaded",
  });
  await composer
    .locator("[data-communication-message-revision]")
    .waitFor({ timeout: 120_000 });
  const composerRevision = /revision ([0-9A-F]{6})/.exec(
    (await composer.locator("[data-communication-message-revision]").textContent()) ?? "",
  )?.[1];
  // The composer's editable body is a field; its value is the message text.
  const composerBody = await composer.evaluate(() =>
    [
      document.body.innerText,
      ...[...document.querySelectorAll("textarea, input, [contenteditable]")].map(
        (field) => ("value" in field ? field.value : field.textContent) ?? "",
      ),
    ].join("\n"),
  );
  await composer.close();
  markers.push(await noticeMarker(prepared, "after L27"));
  check(
    'L27: changing "Rent to recommend" and "Reason to include" updates the one preview, and Review and send, Schedule, Create Gmail draft instead, Copy and the composer show that same message',
    edited.preview.includes("$1,410.00") &&
      edited.preview.includes(reason) &&
      copied.includes(reason) &&
      copied.includes("$1,410.00") &&
      scheduled.includes(reason) &&
      drafted.includes(reason) &&
      composerRevision === edited.revision &&
      (composerBody ?? "").includes(reason),
    {
      revision: edited.revision,
      composerRevision,
      preview: edited.preview.slice(0, 1500),
      copied: copied.includes(reason),
      scheduleEnabled,
      scheduled: scheduled.includes(reason),
      draftEnabled,
      drafted: drafted.includes(reason),
      needs: await needsNow(),
    },
  );
  phase = "L23";

  // L23: the owner message is sent in three deliberate actions on one page: open the lease,
  // "Review and send", confirm. The exact review and the confirmation are both shown.
  const before = steps.length;
  act("open the lease");
  await openLease(prepared);
  // The Now card takes its prepared message once the lease message has loaded.
  await shownWithin(now().locator("[data-renewal-message-revision]"));
  markers.push(await noticeMarker(prepared, "lease open"));
  const needsBeforeSend = await needsNow();
  // The staff member reads the prepared message before choosing Review and send, here for longer
  // than the lease read's one minute, so the review starts on an aging read as it does day to day
  // and the review's own read of the replaced generation is part of what this check proves.
  await page.waitForTimeout(65_000);
  act("choose Review and send");
  await now().locator("[data-renewal-now-primary]").click();
  const review = page.getByRole("dialog", { name: "Review and send" });
  let exact = "";
  const reviewShown = await review
    .locator('[data-renewal-field="exact-review"]')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  markers.push(await noticeMarker(prepared, "after Review and send"));
  if (reviewShown) {
    exact =
      (await review.locator('[data-renewal-field="exact-review"]').textContent()) ?? "";
    act("confirm Send this message");
    await review.getByRole("button", { name: "Send this message", exact: true }).click();
    await review.waitFor({ state: "hidden", timeout: 120_000 });
  }
  const sendSteps = steps.slice(before).map((entry) => entry.action);
  const mail = (await standInState(rehearsal)).mail;
  const sent = mail.mailboxes.flatMap((box) => box.messages ?? []);
  const ownerMessages = sent.filter((message) =>
    /Our reviewed rental analysis suggests/.test(message.text ?? message.body ?? ""),
  );
  check(
    "L23: the owner message is sent in three deliberate actions on one page, with the exact review and the confirmation shown",
    sendSteps.length === 3 &&
      context.pages().length === 1 &&
      exact.includes(reason) &&
      exact.includes("$1,410.00") &&
      ownerMessages.some((message) => (message.text ?? "").includes("$1,410.00")),
    {
      sendSteps,
      reviewShown,
      needsBeforeSend,
      markers,
      pages: context.pages().length,
      sent: sent.length,
      statuses: reviewShown
        ? null
        : await now()
            .locator("[role=status], [role=alert]")
            .allTextContents()
            .catch(() => null),
      nowHtml: reviewShown ? null : await nowHtml(),
    },
  );
  phase = "L28";
  check(
    'L29: no owner message produced in the run contains "The working offer remains a staff decision"',
    sent.every((message) => !JSON.stringify(message).includes(INTERNAL_SENTENCE)) &&
      !edited.preview.includes(INTERNAL_SENTENCE),
    { messages: sent.length },
  );

  // L28 (and the L40 line where the served commit shows it): a Gmail draft, then an edit.
  await openLease(covered);
  await chooseStep("Ask the owner");
  const draftsBefore = mail.mailboxes.reduce(
    (n, box) => n + (box.drafts ?? []).length,
    0,
  );
  const coveredDraft = now().getByRole("button", {
    name: "Create Gmail draft instead",
    exact: true,
  });
  const coveredDraftEnabled = await coveredDraft.isEnabled();
  let draftNotice = null;
  if (coveredDraftEnabled) {
    await coveredDraft.click();
    const create = page.getByRole("dialog", { name: "Create Gmail draft instead" });
    const previewed = await create
      .locator('[data-renewal-field="draft-review"]')
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    if (previewed) {
      await create
        .getByRole("button", { name: "Create this unsent draft", exact: true })
        .click();
      await create.waitFor({ state: "hidden", timeout: 120_000 });
    } else {
      draftNotice = (await create.textContent().catch(() => null))?.slice(0, 600) ?? null;
      await create.getByRole("button", { name: "Cancel" }).click();
    }
    await page.waitForTimeout(1500);
  }
  const draftsAfter = (await standInState(rehearsal)).mail.mailboxes.reduce(
    (n, box) => n + (box.drafts ?? []).length,
    0,
  );
  await now().getByLabel("Reason to include").fill("Recent leases nearby support it.");
  await now().getByLabel("Reason to include").blur();
  await page.waitForTimeout(3000);
  const older = await now()
    .locator('[data-renewal-field="draft-older"]')
    .textContent()
    .catch(() => null);
  check(
    'L28: after a Gmail draft is created and the message changes, the card reads "The Gmail draft is older than this message" and offers "Replace the Gmail draft"',
    draftsAfter === draftsBefore + 1 &&
      (older ?? "").includes("The Gmail draft is older than this message") &&
      (await now()
        .getByRole("button", { name: "Replace the Gmail draft", exact: true })
        .count()) === 1,
    { coveredDraftEnabled, draftNotice, draftsBefore, draftsAfter, older },
  );
  phase = "L44";
  await openLease(covered);
  const waitingLine = await page.getByText(/Draft waiting in Gmail since/).count();
  check(
    'L40 (rehearsal means): the unsent Gmail draft reached the mail stand-in, and the lease reads "Draft waiting in Gmail since" with "I sent it from Gmail" where the served commit shows it',
    draftsAfter === draftsBefore + 1 &&
      (waitingLine === 0 ||
        (await page.getByRole("button", { name: "I sent it from Gmail" }).count()) > 0),
    { waitingLine },
  );

  // Each later section records its own failure and the run carries on to the next.
  const attempt = async (name, run) => {
    try {
      await run();
    } catch (error) {
      check(
        `${name} ran to its end`,
        false,
        String(error?.message ?? error).slice(0, 1500),
      );
    }
  };
  await attempt("L44", async () => {
    // L44: a rewording replaces the body only on "Use this revision"; an echoed one is refused.
    await page
      .getByRole("group", { name: "Lease view", exact: true })
      .getByRole("button", { name: "Full view", exact: true })
      .click();
    await page.waitForTimeout(1000);
    const card = page.locator("#renewal-card-message-owner");
    const body = card.locator("#renewal-message-owner-body");
    const refine = card.getByRole("region", { name: "AI wording refinement" });
    const bodyBefore = await body.inputValue();
    await setRewording(rehearsal, "accept", true);
    await refine.getByLabel("Refine with AI").fill("Make it a little warmer.");
    await refine.getByRole("button", { name: "Refine wording", exact: true }).click();
    await refine
      .getByRole("group", { name: "Proposed revision" })
      .waitFor({ timeout: 120_000 });
    const unchangedWhileProposed = (await body.inputValue()) === bodyBefore;
    await refine.getByRole("button", { name: "Use this revision", exact: true }).click();
    await page.waitForTimeout(800);
    const bodyAccepted = await body.inputValue();
    await setRewording(rehearsal, "echo", true);
    const instruction = "Mention the parking change.";
    await refine.getByLabel("Refine with AI").fill(instruction);
    await refine.getByRole("button", { name: "Refine wording", exact: true }).click();
    await refine.getByRole("status").waitFor({ timeout: 120_000 });
    await page.waitForTimeout(800);
    const rejected = {
      notice: (await refine.getByRole("status").textContent())?.trim(),
      instructionKept:
        (await refine.getByLabel("Refine with AI").inputValue()) === instruction,
      bodyKept: (await body.inputValue()) === bodyAccepted,
      proposed: await refine.getByRole("group", { name: "Proposed revision" }).count(),
    };
    check(
      'L44: a rewording replaces the body only when "Use this revision" is chosen, and a rejected result keeps the instruction, says what to change and leaves the message as it was',
      unchangedWhileProposed &&
        bodyAccepted !== bodyBefore &&
        rejected.instructionKept &&
        rejected.bodyKept &&
        rejected.proposed === 0 &&
        (rejected.notice ?? "").length > 0,
      { unchangedWhileProposed, accepted: bodyAccepted !== bodyBefore, rejected },
    );
  });
  await attempt("L45", async () => {
    // L45: a staff member with no signature sets one up on the Now card without leaving the lease.
    await signIn("Approver");
    await openLease(assisted);
    await chooseStep("Ask the owner");
    await shownWithin(now().locator("[data-renewal-message-revision]"));
    const leaseUrl = page.url();
    const signatureItem = now()
      .locator('[data-renewal-ready="missing"]')
      .filter({ hasText: "Your signature" });
    const hadNoSignature = (await signatureItem.count()) === 1;
    await now()
      .getByRole("button", { name: "Set up your signature", exact: true })
      .click();
    const form = now().getByRole("form", { name: "Your signature" });
    await form.getByRole("button", { name: "Save my signature", exact: true }).click();
    const refused = (
      await now().locator('[data-renewal-field="signature-notice"]').textContent()
    )?.trim();
    await form.getByLabel("Sender name").fill("Example Approver");
    await form.getByRole("button", { name: "Save my signature", exact: true }).click();
    await page.waitForTimeout(3000);
    const signatureReady = await now()
      .locator('[data-renewal-ready="ready"]')
      .filter({ hasText: "Your signature" })
      .count();
    check(
      "L45: a staff member with no signature sets one up on the Now card without leaving the lease, and a refused save names the missing fields",
      hadNoSignature &&
        (refused ?? "").includes("Sender name") &&
        signatureReady === 1 &&
        page.url() === leaseUrl,
      { hadNoSignature, refused, signatureReady },
    );
    await signIn("Editor");
  });
  await attempt("L42", async () => {
    await signIn("Editor");
    // L42 (the tenant half): the Offer the tenant step shows the tenant offer prepared from the
    // working terms, read only; its send keeps its own exact review.
    writes.length = 0;
    await openLease(prepared);
    await chooseStep("Offer the tenant");
    await shownWithin(now().locator("[data-renewal-message-revision]"));
    const tenant = {
      heading: (await now().getByRole("heading", { level: 2 }).textContent())?.trim(),
      preview: await now().locator('section[aria-label="Tenant offer"]').count(),
      document: await now().getByRole("document", { name: "Message preview" }).count(),
    };
    check(
      "L42 (tenant offer): Offer the tenant shows the tenant offer prepared, and showing it makes no write",
      tenant.heading === "Offer the tenant" &&
        tenant.preview === 1 &&
        tenant.document === 1 &&
        writes.length === 0,
      { ...tenant, writes, nowHtml: tenant.preview === 1 ? null : await nowHtml() },
    );
  });

  // L58: nothing in the run reached a real host.
  // Every refused request was stopped at the boundary; L58 asks that none of them was aimed at
  // production, a provider or a mailbox. Other refused hosts (a dev tool's update check) are listed.
  const refusedHosts = refusedConnections(rehearsal);
  const PROVIDER_OR_PRODUCTION =
    /googleapis|google\.com|gmail|rentvine|rentcast|dotloop|run\.app|pmikc|firebase(io)?\.com|anthropic|openai/i;
  const aimed = refusedHosts.filter((entry) =>
    PROVIDER_OR_PRODUCTION.test(String(entry.host ?? entry.refused ?? "")),
  );
  check(
    "L58: the rehearsal's refused-connection log shows no call to production, a provider or a mailbox",
    aimed.length === 0,
    {
      aimed: aimed.slice(0, 10),
      otherRefusedHosts: [...new Set(refusedHosts.map((entry) => entry.host))],
    },
  );
  exitCode = checks.every((entry) => entry.passed !== false) ? 0 : 1;
} catch (error) {
  checks.push({
    name: "driver ran to the end",
    passed: false,
    observed: String(error?.stack ?? error).slice(0, 2000),
  });
  process.stdout.write(
    `FAIL driver ran to the end: ${String(error?.message ?? error)}\n`,
  );
  exitCode = 1;
} finally {
  writeFileSync(
    join(runDir, "kickoff.json"),
    `${JSON.stringify({ checks, steps, pageErrors }, null, 2)}\n`,
  );
  await browser.close().catch(() => undefined);
}
process.exit(exitCode);

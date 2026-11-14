// S260. Runs on one guarded, compiled rehearsal build and records exact scoped results.
// S271 R-S271-6 replays all ten journeys (N09-01 to N09-10) on the cumulative candidate.
//
//   exact qualification, from a clean committed head (the only run that can record Yes):
//     bash scripts/run-renewal-one-path-rehearsal.sh --compiled --compiled-synthetic-mail \
//       --driver tests/browser/one-path-november-9-qualification-driver.mjs -- \
//       --rendered-help <canonical Help run dir> --rendered-help-drift <drift Help run dir>
//   development iteration on uncommitted work (no synthetic mail, so the cross-case and mail
//   rows stay UNVERIFIED and N09-07 meets N09-10's seeded unconfirmed offer):
//     bash scripts/run-renewal-one-path-rehearsal.sh --overlay --compiled --driver <this file>
//   development tenant send proof, N09-07 only, on the development server:
//     bash scripts/run-renewal-one-path-rehearsal.sh --driver <this file> -- --tenant-send-proof
//   compiled mail fence proof, N09-07's refusal only:
//     bash scripts/run-renewal-one-path-rehearsal.sh --compiled --driver <this file> -- \
//       --compiled-mail-fence-proof
//
// Both Help directories are private runs under ~/.local/state/pmi-kc-help-rehearsal of the same
// served commit: the canonical one from `npm run verify:help-rendered`, and the drift one from
// `bash scripts/run-help-rehearsal.sh --allow-overlay --controls <probe>` with the Work status
// summary deliberately removed in the uncommitted overlay and a probe listing only that control
// (the gate must report it missing). The Help version, scene count and control count are read
// from the served commit's own Help source (one-path-november-9-help-proof.mjs).
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  holdComparison,
  releaseComparison,
  refusedConnections,
  resetComparisonLog,
  setComparisonAllowance,
  setSourceCycleDate,
  setUnavailableSourceLease,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { openOwnerRecommendationEditor } from "../../scripts/lib/one-path-rehearsal/journey-kit.mjs";
import { forceSourceRefresh } from "../../scripts/lib/one-path-rehearsal/seeds.mjs";
import { inspectOutcome, outcomeFaults } from "./one-path-november-9-outcome-check.mjs";
import {
  readExactHelpProof,
  servedHelpInventory,
} from "./one-path-november-9-help-proof.mjs";
import { qualifyCompiledTenantOffer } from "./one-path-november-9-mail-checks.mjs";
import { novemberNineMatrixVerdict } from "./one-path-november-9-qualification-verdict.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
const tenantSendProof = process.argv.includes("--tenant-send-proof");
const fenceProof = process.argv.includes("--compiled-mail-fence-proof");
const onlyTenant = tenantSendProof || fenceProof;
assert.ok(!(tenantSendProof && fenceProof));
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit);
const compiledMail = rehearsal.compiledMail != null;
assert.equal(rehearsal.compiled, compiledMail || fenceProof || !tenantSendProof);
if (fenceProof) assert.equal(compiledMail, false);
assert.equal(rehearsal.mailAdapter, true);
const report = join(
  runDir,
  fenceProof
    ? "compiled-mail-fence-proof.jsonl"
    : tenantSendProof
      ? "tenant-send-proof.jsonl"
      : "s260-journeys.jsonl",
);
const results = [];
// November 10: the served commit's own Help inventory, read from its worktree, independent of
// the rendered Help run evidence that the proof compares against it.
const servedHelp = process.argv.includes("--rendered-help")
  ? servedHelpInventory()
  : null;
const renderedHelp = readExactHelpProof(
  process.argv,
  rehearsal.servedVersion,
  servedHelp,
);
let monthPreparation = null;
const record = (entry) => {
  appendFileSync(report, JSON.stringify(entry) + "\n");
  process.stdout.write(JSON.stringify(entry) + "\n");
};
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const desk = "/lease-renewal/live/desk";
const prepared = String(rehearsal.roles.prepared);
const covered = String(rehearsal.roles.covered);
const href = (lease = prepared, search = "") => desk + "/lease/" + lease + search;
async function open(page, path) {
  const navigation = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  return navigation;
}
async function toggleDisclosure(page, details, expanded) {
  const summary = details.locator(":scope > summary");
  await summary.waitFor();
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  assert.equal((await details.getAttribute("open")) !== null, !expanded);
  await summary.scrollIntoViewIfNeeded();
  await summary.press("Space");
  await details
    .and(page.locator(expanded ? "details[open]" : "details:not([open])"))
    .waitFor();
}
/**
 * November 10 (S270): supporting work sits in named groups that are closed on entry. Open the
 * named group by its own summary and return it; a group already open stays open.
 */
async function openNamedGroup(page, label) {
  const group = page.locator(`details[data-renewal-group="${label}"]`).first();
  await group.waitFor({ state: "attached" });
  if ((await group.getAttribute("open")) === null) {
    const summary = group.locator(":scope > summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    await group.and(page.locator("details[open]")).waitFor();
  }
  return group;
}
const read = (page, path) =>
  page.evaluate(async (path) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("read returned " + response.status);
    return response.json();
  }, path);
const post = (page, path, body) =>
  page.evaluate(
    async ([url, input]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    },
    [path, body],
  );
function fixtureDocument(path) {
  assert.match(rehearsal.firestoreEmulatorHost, /^127\.0\.0\.1:\d+$/);
  assert.equal(rehearsal.projectId, "pmi-kc-kb-one-path-rehearsal-test");
  assert.match(path, /^[a-z_]+\/[A-Za-z0-9_-]+$/);
  const base = "http://" + rehearsal.firestoreEmulatorHost + "/v1/projects/";
  const root = rehearsal.projectId + "/databases/(default)/documents/";
  return base + root + path;
}

async function seedFixture(path, fields) {
  const response = await fetch(fixtureDocument(path), {
    method: "PATCH",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields }),
    redirect: "error",
  });
  assert.ok(response.ok, "Seed the fixture in the disposable Firestore emulator");
}
async function seedUnconfirmedTenantOffer(page) {
  const workspace = await read(page, "/api/lease-renewal/workspace?leaseId=" + prepared);
  assert.match(workspace.state.cycleId, /^[0-9a-f-]{36}$/);
  const value = (stringValue) => ({ stringValue });
  const id = "s260-unconfirmed-tenant-offer";
  await seedFixture("gmail_communication_sequences/" + id, {
    context: {
      mapValue: {
        fields: {
          lane: value("renewals"),
          entityType: value("renewal_lease"),
          entityId: value(prepared),
          purpose: value("renewal_tenant"),
        },
      },
    },
    state: value("needs_reconciliation"),
    unresolvedOccurrenceId: value("s260-synthetic-occurrence"),
    noticeCycleId: value(workspace.state.cycleId),
    createdAtMs: { integerValue: String(Date.now()) },
    confirmedCount: { integerValue: "0" },
    threads: { arrayValue: { values: [] } },
  });
  return id;
}

async function signInReadOnly(page) {
  assert.equal(rehearsal.projectId, "pmi-kc-kb-one-path-rehearsal-test");
  assert.match(rehearsal.authEmulatorHost, /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const email = "canary-editor@pmikcmetro.com";
  const emulator =
    "http://" + rehearsal.authEmulatorHost + "/identitytoolkit.googleapis.com/v1/";
  const call = async (path, body) => {
    const response = await fetch(emulator + path, {
      method: "POST",
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      redirect: "error",
      body: JSON.stringify(body),
    });
    assert.ok(response.ok, "The local Auth emulator must admit this synthetic fixture");
    return response.json();
  };
  const identity = {
    requestUri: origin + "/sign-in",
    returnSecureToken: true,
    postBody: new URLSearchParams({
      providerId: "google.com",
      id_token: JSON.stringify({
        sub: "s260-read-only-synthetic",
        email,
        email_verified: true,
      }),
    }).toString(),
  };
  const first = await call("accounts:signInWithIdp?key=synthetic", identity);
  await call("projects/" + rehearsal.projectId + "/accounts:update", {
    localId: first.localId,
    customAttributes: JSON.stringify({ role: "Editor" }),
  });
  const signed = await call("accounts:signInWithIdp?key=synthetic", identity);
  const session = await page.request.post(origin + "/api/auth/session", {
    maxRedirects: 0,
    headers: { authorization: "Bearer " + signed.idToken },
  });
  assert.equal(
    session.status(),
    200,
    "Read-only fixture must use the real session route",
  );
  const { user } = await session.json();
  assert.equal(user.email, email);
  assert.equal(user.role, "Editor");
}

const full = (page) => page.getByRole("button", { name: "Full view", exact: true });
const batch = (page) => page.getByRole("region", { name: "Working batch", exact: true });
const now = (page) => page.getByRole("region", { name: "Now", exact: true });
const status = (page) => page.locator("#renewal-staff-status-log > summary");
/**
 * November 10: the rows the one batch table renders, counted once the chosen group's list is open
 * and has rendered at least `expected` rows. A table whose list is still arriving after a filter
 * or a return renders no rows yet (the November 9 replay `20261109T225341Z-b4fb6aa0` counted zero
 * there); a list with any other number of rows still fails the exact count.
 */
async function renderedBatchRows(page, group, expected) {
  await batch(page).locator(`[data-batch-open-group="${group}"]`).waitFor();
  const rows = batch(page).locator("tr[data-batch-lease]");
  if (expected > 0) await rows.nth(expected - 1).waitFor();
  return rows.count();
}
const comparisons = async () =>
  (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};

async function journey(id, role, viewport, allow, check) {
  const context = await browser.newContext({
    viewport,
    colorScheme: viewport.width === 390 ? "dark" : "light",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(60_000);
  const mutations = [];
  const refusals = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
    if (url.pathname === "/api/auth/demo") return route.continue();
    mutations.push(url.pathname);
    if (
      allow.some((path) =>
        typeof path === "string" ? path === url.pathname : path.test(url.pathname),
      )
    )
      return route.continue();
    refusals.push(url.pathname);
    return route.abort("blockedbyclient");
  });
  try {
    await open(page, "/sign-in");
    const login = await post(page, "/api/auth/demo", { role });
    assert.ok(login.status >= 200 && login.status < 300, "Synthetic sign-in failed");
    const observed = await check(page, mutations);
    assert.deepEqual(refusals, [], "Unexpected mutation attempts");
    const result = {
      id,
      verdict: observed.missing ? "UNVERIFIED" : "Yes",
      role,
      observed,
      mutations,
    };
    results.push(result);
    record(result);
  } catch (error) {
    const result = {
      id,
      verdict: "No",
      role,
      reason: String(error).slice(0, 700),
      checkpoint:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .find((line) =>
                /qualification-driver\.mjs|november-9-mail-checks\.mjs/.test(line),
              )
              ?.trim()
          : undefined,
      refusals,
    };
    results.push(result);
    record(result);
    await page
      .screenshot({ path: join(runDir, id + "-failure.png") })
      .catch(() => undefined);
  } finally {
    await context.close();
  }
}

const wide = { width: 1280, height: 800 };
const narrow = { width: 390, height: 800 };
try {
  if (!onlyTenant) {
    await journey(
      "N09-01",
      "Editor",
      wide,
      [
        "/api/lease-renewal/desk-preferences",
        "/api/lease-renewal/refresh",
        "/api/lease-renewal/collections",
        "/api/personal-view",
        "/api/assistant/query",
        "/api/assistant/history/turns",
        /^\/api\/assistant\/history\/turns\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
        "/api/work",
      ],
      async (page) => {
        await open(page, desk);
        const root = batch(page);
        await root.getByRole("table").waitFor();
        assert.equal(await root.getByRole("table").count(), 1);
        const groups = await root
          .locator("tbody[data-batch-list]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.batchList));
        assert.deepEqual(groups, ["this_batch", "carried_over"]);
        assert.equal(await root.getAttribute("data-batch-month"), rehearsal.workingMonth);
        const monthRows = root.locator(
          'tbody[data-batch-list="this_batch"] tr[data-batch-lease]',
        );
        const monthIds = await monthRows.evaluateAll((rows) =>
          rows.map((row) => row.dataset.batchLease),
        );
        const preparedRow = monthRows.and(
          root.locator(`tr[data-batch-lease="${prepared}"]`),
        );
        const deskStage = (
          await preparedRow.locator(".renewal-batch-stage").innerText()
        ).trim();
        const next = preparedRow.locator("a[data-batch-next-step]");
        const nextHref = await next.getAttribute("href");
        assert.ok(nextHref?.startsWith(href()));
        await next.press("Enter");
        await page.waitForURL((url) => url.pathname === href());
        const leaseStage = page.locator('[data-renewal-field="stage-line"]');
        await leaseStage.waitFor();
        assert.equal((await leaseStage.innerText()).trim(), deskStage);
        const currentStep = await leaseStage.getAttribute("data-renewal-current-step");
        assert.ok(currentStep);
        await page
          .getByRole("link", { name: /Back to renewals/ })
          .first()
          .click();
        await root.getByRole("table").waitFor();
        assert.equal(await root.getAttribute("data-batch-month"), rehearsal.workingMonth);

        const filtered = root.locator('button[data-batch-group="not_targets"]');
        const expected = rehearsal.groups.closed.length;
        const countNotTargets = async () =>
          Number(await filtered.getAttribute("data-batch-count"));
        const firstCount = await countNotTargets();
        if (firstCount !== expected) {
          record({
            id: "N09-01",
            check: "target-projection-refresh",
            firstCount,
            expected,
          });
          const refreshed = await forceSourceRefresh(page);
          assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
          assert.equal(refreshed.body.refreshed, true);
          await open(page, desk);
        }
        const count = await countNotTargets();
        assert.equal(count, expected, "Read the full closed cohort from the fixture");

        const sort = root.getByRole("button", { name: "Current base rent" });
        await sort.press("Enter");
        await root.locator('th[aria-sort="ascending"]').waitFor();
        await filtered.click();
        assert.equal(await root.getByRole("table").count(), 1);
        assert.equal(await renderedBatchRows(page, "not_targets", count), count);
        const exact = new URL(page.url()).search;
        await root.locator("tr[data-batch-lease] th a").first().click();
        await page
          .getByRole("link", { name: "Back to renewals", exact: false })
          .first()
          .click();
        assert.equal(new URL(page.url()).search, exact);
        await page.setViewportSize(narrow);
        await batch(page).getByRole("table").waitFor();
        assert.equal(await batch(page).getByRole("table").count(), 1);
        assert.equal(await renderedBatchRows(page, "not_targets", count), count);
        await page.setViewportSize(wide);

        const linked = desk + "?v=2&sort=end_date&direction=desc&scope=all";
        await open(page, linked);
        const remember = page.getByRole("button", { name: "Remember this view" });
        const preferenceSaved = page.waitForResponse(
          (response) =>
            ["/api/personal-view", "/api/lease-renewal/desk-preferences"].includes(
              new URL(response.url()).pathname,
            ) &&
            response.request().method() === "POST" &&
            response.ok(),
        );
        await remember.click();
        await preferenceSaved;
        await open(page, desk + "?v=2&scope=all&lease=" + prepared);
        const savedView = page.getByRole("link", { name: "Open your saved view" });
        assert.equal(await savedView.getAttribute("href"), linked);
        await page
          .getByRole("link", { name: "Save reviewed leases as a shared collection" })
          .click();
        const membership = page.getByRole("region", {
          name: "Collection membership editor",
        });
        assert.equal(
          await membership.getByLabel("Selected lease IDs").inputValue(),
          prepared,
        );
        const [year, month] = rehearsal.workingMonth.split("-").map(Number);
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const collectionName = "Synthetic November 9 scoped return";
        await membership.getByLabel("Collection name").fill(collectionName);
        await membership.getByLabel("Period from").fill(rehearsal.workingMonth + "-01");
        await membership
          .getByLabel("Period through")
          .fill(rehearsal.workingMonth + "-" + last);
        await membership.getByRole("button", { name: "Review membership" }).click();
        const review = membership.getByRole("region", { name: "Reviewed membership" });
        await review
          .getByRole("heading", { name: "Additions (1)", exact: true })
          .waitFor();
        await review.getByRole("button", { name: "Save reviewed collection" }).click();
        const collection = page.getByRole("region", {
          name: "Current collection status",
        });
        await collection.getByRole("heading", { name: collectionName }).waitFor();
        assert.match(await collection.innerText(), /membership version 1/);
        await collection
          .getByRole("link", { name: "Open this collection on the Renewals desk" })
          .click();
        await page.waitForURL(
          (url) => url.pathname === desk && url.searchParams.has("collection"),
        );
        const sharedScope = new URL(page.url()).search;
        const members = page.locator("table.renewal-table tr[data-lease-id]");
        await members.first().waitFor();
        assert.deepEqual(
          await members.evaluateAll((rows) => rows.map((row) => row.dataset.leaseId)),
          [prepared],
        );
        await members.first().locator("a").first().click();
        await page
          .getByRole("link", { name: "Back to renewals", exact: false })
          .first()
          .click();
        assert.equal(new URL(page.url()).search, sharedScope);
        assert.equal(
          await page
            .getByRole("link", { name: "Open your saved view" })
            .getAttribute("href"),
          linked,
        );
        await open(page, "/");
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
        await page
          .getByRole("textbox", { name: "Question", exact: true })
          .fill("Which lease renewals are due next month?");
        await page.getByRole("button", { name: "Get answer", exact: true }).click();
        const answer = page.getByRole("region", {
          name: "Assistant answer",
          exact: true,
        });
        const answerLinks = answer.locator(
          `a[href^="${desk}/lease/"]:not([href$="/rentvine"])`,
        );
        await answerLinks.first().waitFor();
        const answerIds = await answerLinks.evaluateAll((links) => [
          ...new Set(links.map((link) => new URL(link.href).pathname.split("/").at(-1))),
        ]);
        assert.deepEqual(answerIds.sort(), [...monthIds].sort());
        await answerLinks
          .and(answer.locator(`a[href="${href()}"], a[href^="${href()}?"]`))
          .first()
          .click();
        await page.waitForURL((url) => url.pathname === href());
        await leaseStage.waitFor();
        assert.equal((await leaseStage.innerText()).trim(), deskStage);
        assert.equal(
          await leaseStage.getAttribute("data-renewal-current-step"),
          currentStep,
        );

        await open(page, "/work");
        await page.getByText("Create my task", { exact: true }).click();
        const taskTitle = "Synthetic November 9 renewal stage readback";
        const createTask = page.locator(".work-create-panel form");
        await createTask
          .locator('select[name="space_id"]')
          .selectOption("lease-renewals");
        await createTask.getByLabel("Task type", { exact: true }).fill("Renewal");
        await createTask.getByLabel("Title", { exact: true }).fill(taskTitle);
        await createTask
          .getByLabel("Next action", { exact: true })
          .fill("Review the stored comparison");
        await createTask
          .getByRole("combobox", { name: /^Source\b/ })
          .selectOption("renewal_lease");
        await createTask.getByLabel("Source id", { exact: true }).fill(prepared);
        await createTask
          .getByRole("button", { name: "Create task", exact: true })
          .click();
        await page.getByText(taskTitle, { exact: true }).waitFor();
        await page
          .getByRole("link", { name: "Open linked renewal lease", exact: true })
          .click();
        await page.waitForURL((url) => url.pathname === href());
        await leaseStage.waitFor();
        assert.equal((await leaseStage.innerText()).trim(), deskStage);
        assert.equal(
          await leaseStage.getAttribute("data-renewal-current-step"),
          currentStep,
        );
        return {
          oneTable: true,
          groups,
          filtered: count,
          exactReturn: exact,
          narrowTable: true,
          savedViewRetained: true,
          sharedMembershipVersion: 1,
          sharedExactReturn: true,
          dashboardTargets: answerIds.length,
          linkedWorkStage: deskStage,
          currentStep,
          missing: "Distinct scheduled, waiting and unconfirmed rows require replay.",
        };
      },
    );

    await journey(
      "N09-02",
      "Editor",
      wide,
      ["/api/lease-renewal/kickoff-preparation", "/api/lease-renewal/refresh"],
      async (page, mutations) => {
        await seedFixture("app_settings/renewal_kickoff_automatic_start", {
          enabled: { booleanValue: true },
          version: { integerValue: "8" },
        });
        await resetComparisonLog(rehearsal);
        await open(page, desk);
        const settings = await read(page, "/api/lease-renewal/kickoff-settings");
        assert.equal(settings.historicalEnabled, true);
        assert.equal(settings.version, 8);
        assert.equal(settings.enabled, false);
        assert.equal(settings.retired, true);
        // The earlier fixture month is all carryover or closed. Use the next month's
        // current, unprepared leases for both the allowance and interruption checks.
        const nextMonth = page.getByRole("link", { name: "Next month", exact: true });
        const month = await nextMonth.getAttribute("data-batch-month-target");
        assert.match(month ?? "", /^\d{4}-\d{2}$/);
        assert.notEqual(month, rehearsal.workingMonth);
        await nextMonth.click();
        await batch(page)
          .and(page.locator(`[data-batch-month="${month}"]`))
          .waitFor();
        await page.reload({ waitUntil: "domcontentloaded" });
        await batch(page)
          .and(page.locator(`[data-batch-month="${month}"]`))
          .getByRole("table")
          .waitFor();
        assert.deepEqual(await comparisons(), {});
        assert.deepEqual(mutations, []);
        const refused = await post(page, "/api/lease-renewal/kickoff-preparation", {
          leaseId: prepared,
          trigger: "automatic",
          operationId: "d4c109a0-6dce-4c4d-8928-ec77e9a58c73",
        });
        assert.equal(refused.status, 409);
        assert.equal(refused.body.code, "automatic_start_off");
        assert.deepEqual(await comparisons(), {});
        const eligible = await batch(page)
          .locator('tbody[data-batch-list="this_batch"] tr[data-batch-lease]')
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.batchLease));
        const prepare = page.locator("[data-kickoff-prepare]");
        assert.ok(
          eligible.length && (await prepare.isEnabled()),
          "The alternate month needs an eligible, current fixture.",
        );
        const requests = [];
        page.on("request", (request) => {
          if (
            request.method() === "POST" &&
            new URL(request.url()).pathname.endsWith("/kickoff-preparation")
          )
            requests.push(request.postDataJSON());
        });
        await setComparisonAllowance(rehearsal, true);
        let capStops;
        try {
          await prepare.click();
          await page.getByText(/Preparation finished for/).waitFor({ timeout: 60_000 });
          capStops = await page
            .locator('[data-kickoff-outcome="allowance_reached"]')
            .count();
          assert.ok(capStops > 0, "A fresh eligible lease stops at the real stored cap");
          assert.deepEqual(await comparisons(), {});
        } finally {
          await setComparisonAllowance(rehearsal, false);
        }
        const monthUrl = page.url();
        await page.reload({ waitUntil: "domcontentloaded" });
        await batch(page).getByRole("table").waitFor();
        assert.equal(page.url(), monthUrl);
        assert.deepEqual(await comparisons(), {}, "Returning to the month is passive");
        const continuation = page.getByRole("button", {
          name: /^Continue .* preparation$/,
        });
        await continuation.waitFor();
        const interruption = Promise.withResolvers();
        const depart = Promise.withResolvers();
        await page.route(
          "**/api/lease-renewal/kickoff-preparation",
          async (route) => {
            try {
              const response = await route.fetch({ maxRedirects: 0 });
              assert.equal(response.status(), 200);
              const request = route.request().postDataJSON();
              const result = await response.json();
              interruption.resolve({ request, result });
              await depart.promise;
              await route.abort("failed").catch(() => undefined);
            } catch (error) {
              interruption.reject(error);
              await route.abort("failed").catch(() => undefined);
            }
          },
          { times: 1 },
        );
        let interrupted;
        try {
          await continuation.click();
          interrupted = await Promise.race([
            interruption.promise,
            page.waitForTimeout(30_000).then(() => {
              throw new Error("The first exact preparation did not reach the server");
            }),
          ]);
          assert.ok(["prepared", "reused"].includes(interrupted.result.status));
          await open(page, desk);
        } finally {
          depart.resolve();
        }
        const hitsBeforeReturn = await comparisons();
        const interruptedDraft = await read(
          page,
          "/api/lease-renewal/message-preparation?channel=owner&leaseId=" +
            interrupted.request.leaseId,
        );
        assert.ok(interruptedDraft.saved?.revision > 0);
        await open(page, monthUrl.replace(origin, ""));
        await continuation.waitFor();
        assert.deepEqual(await comparisons(), hitsBeforeReturn);
        requests.length = 0;
        await continuation.click();
        await page.getByText(/Preparation finished for/).waitFor({ timeout: 60_000 });
        assert.ok(
          requests.length > 0 &&
            requests.every((r) => r.month === month && eligible.includes(r.leaseId)),
        );
        const hits = await comparisons();
        assert.ok(Object.keys(hits).every((id) => eligible.includes(id)));
        const draftReadbacks = [];
        for (const { leaseId } of requests) {
          const draft = await read(
            page,
            "/api/lease-renewal/message-preparation?channel=owner&leaseId=" + leaseId,
          );
          if (draft.saved)
            draftReadbacks.push({ leaseId, revision: draft.saved.revision });
        }
        assert.ok(
          draftReadbacks.length > 0,
          "Read back at least one app-owned owner draft",
        );
        await setComparisonAllowance(rehearsal, true);
        await prepare.click();
        await page.getByText(/Preparation finished for/).waitFor({ timeout: 60_000 });
        assert.deepEqual(
          await comparisons(),
          hits,
          "Continuing reuses evidence at the allowance",
        );
        await setComparisonAllowance(rehearsal, false);
        const exact = interrupted.request;
        const sameLease = draftReadbacks.find(({ leaseId }) => leaseId === exact.leaseId);
        assert.equal(sameLease.revision, interruptedDraft.saved.revision);
        assert.equal(hits[exact.leaseId], hitsBeforeReturn[exact.leaseId]);
        // Keep the changed end date at month end to exercise the older cycle fence.
        // W12-11 separately verifies the S282 off-cycle hold and review.
        const previousCycle = new Date(`${exact.cycleDateIso}T12:00:00Z`);
        const nextDate = new Date(
          Date.UTC(
            previousCycle.getUTCFullYear(),
            previousCycle.getUTCMonth() + 2,
            0,
            12,
          ),
        )
          .toISOString()
          .slice(0, 10);
        try {
          setSourceCycleDate(rehearsal, exact.leaseId, nextDate);
          assert.ok(
            (await forceSourceRefresh(page)).body?.refreshed,
            "Read the changed source cycle",
          );
          const stale = await post(page, "/api/lease-renewal/kickoff-preparation", {
            ...exact,
            operationId: randomUUID(),
          });
          assert.equal(stale.status, 409);
          assert.equal(stale.body.code, "outside_working_batch");
          assert.equal(stale.body.cycleDateIso, nextDate);
          assert.equal(stale.body.billed, false);
          assert.match(stale.body.message, /cycle changed/i);
          assert.deepEqual(await comparisons(), hits);
        } finally {
          setSourceCycleDate(rehearsal, exact.leaseId, null);
          assert.ok(
            (await forceSourceRefresh(page)).body?.refreshed,
            "Restore the fixture's current source",
          );
        }
        monthPreparation = exact;
        return {
          month,
          requested: requests.length,
          eligible: eligible.length,
          legacyRefused: true,
          capStops,
          interruptedResponseRecovered: true,
          deliberateContinuation: true,
          changedCycleRefused: true,
          draftReadbacks,
          reuseAtAllowance: true,
        };
      },
    );

    await journey(
      "N09-03",
      "Editor",
      wide,
      ["/api/lease-renewal/working-record", "/api/lease-renewal/kickoff-preparation"],
      async (page, mutations) => {
        const fields = "/api/lease-renewal/working-record";
        const recommendation = () =>
          page.getByLabel("Rent to recommend", { exact: true });
        await open(page, href(prepared, "?step=compare-market"));
        const editor = recommendation();
        await editor.waitFor();
        const data = await read(page, fields + "?leaseId=" + prepared);
        const saved = data.record?.fields?.terms_rent;
        assert.ok(
          saved?.value > 0 && saved.sourceLabel,
          "Read the prepared recommendation and its basis",
        );
        assert.equal(Number(await editor.inputValue()), saved.value);
        const verification = now(page).locator("details[data-renewal-verification]");
        await toggleDisclosure(page, verification, true);
        assert.match(await verification.innerText(), /rent|comparison/i);
        assert.deepEqual(mutations, []);
        await page.getByRole("button", { name: "Ask the owner", exact: true }).click();
        const ownerSummary = page.locator(
          '[data-renewal-field="owner-recommended-rent"]',
        );
        assert.ok(
          (await ownerSummary.innerText())
            .replace(/[,\s]/g, "")
            .includes(String(saved.value)),
        );
        const ownerDraft = await read(
          page,
          "/api/lease-renewal/message-preparation?channel=owner&leaseId=" + prepared,
        );
        assert.ok(ownerDraft.saved?.revision > 0);
        assert.ok(
          ownerDraft.content.plainText
            .replace(/[,\s]/g, "")
            .includes(String(saved.value)),
        );
        const ownerEditor = await openOwnerRecommendationEditor(page, now(page));
        assert.equal(Number(await ownerEditor.inputValue()), saved.value);
        assert.deepEqual(mutations, [], "Opening the editor saves nothing");

        assert.ok(monthPreparation, "Use the fresh alternate-month result on this build");
        const alternate = monthPreparation.leaseId;
        const alternatePath = fields + "?leaseId=" + alternate;
        await open(page, href(alternate, "?step=compare-market"));
        const before = (await read(page, alternatePath)).record.fields.terms_rent;
        assert.ok(before.value > 0 && before.sourceLabel);
        const setRent = async (value) => {
          const accepted = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === fields &&
              response.request().method() === "POST" &&
              response.request().postDataJSON()?.field === "terms_rent",
          );
          await editor.fill(value === null ? "" : String(value));
          await editor.press("Enter");
          assert.equal((await accepted).status(), 200);
          return (await read(page, alternatePath)).record.fields.terms_rent;
        };
        const newer = await setRent(before.value + 11);
        const prepareAgain = async () => {
          const response = await post(page, "/api/lease-renewal/kickoff-preparation", {
            ...monthPreparation,
            operationId: randomUUID(),
          });
          assert.equal(response.status, 200);
          assert.equal(response.body.status, "reused");
        };
        await prepareAgain();
        assert.deepEqual(
          (await read(page, alternatePath)).record.fields.terms_rent,
          newer,
        );
        const cleared = await setRent(null);
        assert.equal(cleared.value, null);
        await prepareAgain();
        const fresh = (await read(page, alternatePath)).record.fields.terms_rent;
        assert.equal(fresh.revision, cleared.revision + 1);
        assert.equal(fresh.value, before.value);
        const stale = await post(page, fields, {
          leaseId: alternate,
          field: "terms_rent",
          value: before.value,
          expectedRevision: newer.revision,
          operationId: randomUUID(),
        });
        assert.equal(stale.status, 409);

        const noEvidence = String(rehearsal.groups.later.at(-1));
        const hits = await comparisons();
        await open(page, href(noEvidence, "?step=compare-market"));
        await editor.waitFor();
        assert.equal(await editor.inputValue(), "");
        assert.deepEqual(await comparisons(), hits);

        const discrepancyLease = String(rehearsal.roles.replied);
        const racePath = fields + "?leaseId=" + discrepancyLease;
        let raceStart = await read(page, racePath);
        // November 10: without the compiled synthetic mail, the replied-owner seed enters this
        // lease's current base rent before its refused send (scripts/lib/one-path-rehearsal/
        // seeds.mjs). A development run clears that one seed entry so the race still starts from
        // an empty field. The exact compiled run filters that seed: its field must be absent.
        const seededRent = raceStart.record?.fields?.terms_rent;
        if (
          !compiledMail &&
          seededRent?.origin === "staff_entry" &&
          seededRent.revision === 1
        ) {
          const cleared = await post(page, fields, {
            leaseId: discrepancyLease,
            field: "terms_rent",
            value: null,
            expectedRevision: seededRent.revision,
            operationId: randomUUID(),
          });
          assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
          raceStart = await read(page, racePath);
          assert.equal(raceStart.record.fields.terms_rent.value, null);
        } else assert.equal(raceStart.record?.fields?.terms_rent, undefined);
        const raceRevision = raceStart.record?.fields?.terms_rent?.revision ?? 0;
        const raceSource = await read(
          page,
          "/api/lease-renewal/message-preparation?channel=owner&leaseId=" +
            discrepancyLease,
        );
        const raceInput = {
          leaseId: discrepancyLease,
          trigger: "staff",
          month: rehearsal.workingMonth,
          cycleDateIso: raceSource.facts.leaseEndDate,
          operationId: randomUUID(),
        };
        await holdComparison(rehearsal, Number(discrepancyLease));
        const inFlight = post(page, "/api/lease-renewal/kickoff-preparation", raceInput);
        let concurrentClear;
        try {
          const deadline = Date.now() + 6000;
          while (
            (await standInState(rehearsal)).comparison.heldLeaseId !==
            Number(discrepancyLease)
          ) {
            assert.ok(
              Date.now() < deadline,
              "Wait for the guarded provider to hold the comparison",
            );
            await page.waitForTimeout(75);
          }
          for (const [expectedRevision, value] of [
            [raceRevision, 1701],
            [raceRevision + 1, null],
          ]) {
            const changed = await post(page, fields, {
              leaseId: discrepancyLease,
              field: "terms_rent",
              value,
              expectedRevision,
              operationId: randomUUID(),
            });
            assert.equal(changed.status, 200, JSON.stringify(changed.body));
          }
          concurrentClear = (await read(page, racePath)).record.fields.terms_rent;
          assert.equal(concurrentClear.value, null);
        } finally {
          assert.equal(
            (await releaseComparison(rehearsal, Number(discrepancyLease))).entered,
            true,
          );
        }
        const compared = await inFlight;
        assert.equal(compared.status, 200);
        assert.equal(compared.body.status, "prepared");
        assert.deepEqual(
          (await read(page, racePath)).record.fields.terms_rent,
          concurrentClear,
        );
        const beforeReuse = await comparisons();
        assert.equal(beforeReuse[discrepancyLease], 1);
        const reused = await post(page, "/api/lease-renewal/kickoff-preparation", {
          ...raceInput,
          operationId: randomUUID(),
        });
        assert.equal(reused.status, 200);
        assert.equal(reused.body.status, "reused");
        const replacement = (await read(page, racePath)).record.fields.terms_rent;
        assert.equal(replacement.revision, concurrentClear.revision + 1);
        assert.ok(replacement.value > 0);
        assert.deepEqual(await comparisons(), beforeReuse);
        await open(
          page,
          href(discrepancyLease, "?view=full#renewal-outcome-check-numbers"),
        );
        const numbers = page.locator('section[data-renewal-outcome="check-numbers"]');
        const evidence = numbers.locator("details[data-renewal-verification]");
        await toggleDisclosure(page, evidence, true);
        const difference = evidence.locator("#renewal-field-current_rent");
        await difference.waitFor();
        const values = await difference.innerText();
        assert.match(values, /RentVine/i);
        assert.match(values, /Sheet/i);
        const amounts = (await difference.locator("div.ui-row strong").allTextContents())
          .map((value) => Number(value.replace(/[^0-9.]/g, "")))
          .filter((value) => value > 0);
        assert.ok(
          amounts.includes(1800) && amounts.includes(1750),
          "Both different source amounts are visible: " + JSON.stringify(amounts),
        );
        assert.equal(await difference.getByRole("button").count(), 0);
        await toggleDisclosure(page, evidence, false);
        // November 10 (S270): the correction lives in the named group, closed on entry.
        const factsGroup = await openNamedGroup(page, "Correct other lease facts");
        const corrections = factsGroup.getByRole("region", {
          name: "Correct a lease fact",
          exact: true,
        });
        await corrections.getByLabel("Fact to correct").selectOption("current_rent");
        const useRentVine = corrections.getByRole("button", {
          name: /^Use the RentVine.* value$/i,
        });
        const chosen = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === fields &&
            response.request().method() === "POST" &&
            response.request().postDataJSON()?.field === "current_rent",
        );
        await useRentVine.click();
        assert.equal((await chosen).status(), 200);
        const corrected = (await read(page, fields + "?leaseId=" + discrepancyLease))
          .record.fields.current_rent;
        assert.ok(corrected.value > 0 && /RentVine/i.test(corrected.sourceLabel));
        assert.ok(
          mutations.every((path) =>
            [fields, "/api/lease-renewal/kickoff-preparation"].includes(path),
          ),
        );
        return {
          savedRevision: saved.revision,
          exactEditorReturn: true,
          newerRentPreserved: true,
          concurrentClearPreserved: true,
          explicitRefillUsedSavedEvidence: true,
          staleSaveRefused: true,
          noEvidenceStayedEmpty: true,
          sourceDiscrepancyWorkingFix: true,
        };
      },
    );

    await journey(
      "N09-04",
      "Editor",
      narrow,
      ["/api/lease-renewal/work-status"],
      async (page) => {
        const revealFullView = async () => {
          const details = page.locator("details[data-renewal-lease-details]");
          if ((await details.getAttribute("open")) === null)
            await toggleDisclosure(page, details, true);
          const toggle = full(page);
          await toggle.waitFor();
          return toggle;
        };
        await open(page, href());
        await status(page).waitFor();
        assert.equal(await status(page).count(), 1);
        const guidedFullToggle = await revealFullView();
        assert.equal(await guidedFullToggle.getAttribute("aria-pressed"), "false");
        const stage = page.locator('[data-renewal-field="stage-line"]');
        const beforeNoteStage = await stage.innerText();
        const historicalId = randomUUID();
        const past = new Date(Date.now() - 31 * 86_400_000).toISOString();
        const oldNote = {
          schemaVersion: "renewal-status-note/v1",
          leaseId: prepared,
          cycleId: randomUUID(),
          noteId: historicalId,
          text: "Synthetic annotation from an earlier cycle",
          recordedAt: past,
          recordedByUid: "local-demo-editor",
          recordedByLabel: "Fixture editor",
          updatedAt: past,
          eventId: randomUUID(),
        };
        await seedFixture("lease_renewal_status_notes/" + historicalId, {
          ...Object.fromEntries(
            Object.entries(oldNote).map(([key, stringValue]) => [key, { stringValue }]),
          ),
          revision: { integerValue: "1" },
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        const statusPanel = page.locator("#renewal-staff-status-log");
        await toggleDisclosure(page, statusPanel, true);
        const note = page.getByLabel("Add a note", { exact: true });
        await note.fill("Synthetic November 9 renewal note");
        await note.press("Tab");
        await page
          .locator('[data-testid="renewal-status-note-autosave"] [data-autosave="saved"]')
          .waitFor();
        const history = page.locator('details[data-testid="renewal-status-log"]');
        await toggleDisclosure(page, history, true);
        assert.match(await history.innerText(), /Synthetic November 9 renewal note/);
        const historical = history.locator('[data-status-log-id="' + historicalId + '"]');
        assert.match(await historical.innerText(), /Earlier cycle/);
        assert.equal(await historical.getAttribute("data-status-log-kind"), "note");
        assert.equal(await stage.innerText(), beforeNoteStage);
        const stored = await read(
          page,
          "/api/lease-renewal/work-status?leaseId=" + prepared,
        );
        assert.equal(
          stored.notes.filter((note) => note.text === "Synthetic November 9 renewal note")
            .length,
          1,
        );
        await page.keyboard.press("Escape");
        await statusPanel.and(page.locator("details:not([open])")).waitFor();
        assert.equal(
          await status(page).evaluate((summary) => summary === document.activeElement),
          true,
        );
        const fullToggle = await revealFullView();
        await fullToggle.click();
        assert.equal(await fullToggle.getAttribute("aria-pressed"), "true");
        assert.equal(await status(page).count(), 1);
        const provider = page
          .getByRole("link", { name: "Open in RentVine", exact: true })
          .first();
        const destination = new URL(await provider.getAttribute("href"), origin);
        assert.equal(destination.protocol, "https:");
        assert.equal(destination.hostname, "pmikcmetro.rentvine.com");
        assert.match(destination.pathname, new RegExp("/" + prepared + "$"));
        const shortcut = await page.request.get(origin + href(prepared) + "/rentvine", {
          maxRedirects: 0,
        });
        assert.equal(shortcut.status(), 302);
        assert.equal(shortcut.headers().location, destination.href);
        const leaseBeforeReturn = page.url();
        await page.context().route(
          destination.href,
          (route) =>
            route.fulfill({
              status: 200,
              contentType: "text/plain",
              body: "Synthetic RentVine boundary",
            }),
          { times: 1 },
        );
        const popup = page.waitForEvent("popup");
        await provider.click();
        const providerTab = await popup;
        await providerTab.getByText("Synthetic RentVine boundary").waitFor();
        await providerTab.close();
        assert.equal(page.url(), leaseBeforeReturn);
        assert.equal(await status(page).count(), 1);
        await open(page, href(prepared, "?view=focus#renewal-section-documents"));
        await page.waitForFunction(() =>
          Boolean(document.activeElement?.closest("#renewal-section-documents")),
        );
        const legacyFullToggle = await revealFullView();
        assert.equal(await legacyFullToggle.getAttribute("aria-pressed"), "true");
        await legacyFullToggle.click();
        for (const step of [
          "check-numbers",
          "compare-market",
          "ask-owner",
          "offer-tenant",
          "documents",
          "finish-up",
          "complete",
        ]) {
          await open(page, href(prepared, "?step=" + step));
          await page
            .locator(`[data-renewal-work][data-renewal-outcome="${step}"]`)
            .waitFor();
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          assert.equal(await status(page).count(), 1);
          assert.ok(
            await status(page).evaluate((node) => {
              const bounds = node.getBoundingClientRect();
              return bounds.top < innerHeight && bounds.bottom > 0;
            }),
          );
        }
        await open(
          page,
          href(String(rehearsal.roles.assisted), "?step=assisted-program-contact"),
        );
        await now(page)
          .getByText(/Example Housing Assistance Office/)
          .first()
          .waitFor();
        const periodic = String(rehearsal.groups.month_to_month[0]);
        await open(page, href(periodic, "?step=month-to-month-review"));
        await now(page)
          .getByText(/month-to-month/i)
          .first()
          .waitFor();
        return {
          savedNote: true,
          collapsedHistory: true,
          earlierCycleAnnotation: true,
          derivedStagePreserved: true,
          fullToggle: true,
          legacyTarget: true,
          stickyOutcomes: 7,
          verifiedProviderHandoffAndReturn: true,
          conditionalPaths: ["housing assistance", "month-to-month"],
        };
      },
    );

    await journey(
      "N09-05",
      "Editor",
      wide,
      ["/api/lease-renewal/pricing-policy", "/api/lease-renewal/working-record"],
      async (page) => {
        const route = "/api/lease-renewal/pricing-policy";
        const leaseRead = route + "?leaseId=" + covered;
        // A covered owner step is omitted from Guided. Its pricing controls remain in Full.
        const ownerPath = href(covered, "?view=full#renewal-section-owner");
        await open(page, ownerPath);
        const owner = page.locator("#renewal-owner-pricing-basis");
        const basis = owner.getByRole("group", { name: "Pricing basis", exact: true });
        await basis.waitFor();
        assert.match(await owner.innerText(), /standing agreement/i);
        const original = await read(page, leaseRead);
        const uncovered = await read(page, route + "?leaseId=" + prepared);
        assert.equal(original.authority.kind, "standing");
        assert.equal(original.authority.covered, true);
        assert.notEqual(uncovered.authority.covered, true);
        assert.ok(original.authority.amount > 0 && original.authority.agreementId);
        const portfolioId = original.source.portfolioId;
        assert.match(portfolioId, /^\d+$/);
        const portfolioRead = route + "?portfolioId=" + portfolioId;
        const originalPortfolio = await read(page, portfolioRead);
        const version = originalPortfolio.assignment.version;

        const save = async (choice, scope) => {
          await basis.getByRole("radio", { name: choice }).check();
          await owner.getByRole("radio", { name: scope, exact: true }).check();
          const result = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === route &&
              response.request().method() === "POST",
          );
          await owner
            .getByRole("button", { name: "Save pricing basis", exact: true })
            .click();
          assert.equal((await result).status(), 200);
          await owner.getByText(/^Pricing basis saved[.]/).waitFor();
        };

        await save("Owner decides each renewal", "This lease only");
        const override = await read(page, leaseRead);
        assert.notEqual(override.authority.covered, true);
        assert.equal(override.leaseAssignment.standing.kind, "owner_decides");
        assert.equal((await read(page, portfolioRead)).assignment.version, version);

        const clear = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === route &&
            response.request().method() === "POST",
        );
        await owner
          .getByRole("button", { name: "Use the portfolio's pricing basis", exact: true })
          .click();
        assert.equal((await clear).status(), 200);
        await owner.getByText(/^This lease's own pricing basis was removed[.]/).waitFor();
        assert.equal(
          (await read(page, leaseRead)).authority.amount,
          original.authority.amount,
        );

        const portfolioChoice = "Every lease in this owner's portfolio";
        await save("Owner decides each renewal", portfolioChoice);
        const changed = await read(page, portfolioRead);
        assert.equal(changed.assignment.version, version + 1);
        assert.equal(changed.assignment.standing.kind, "owner_decides");
        assert.notEqual((await read(page, leaseRead)).authority.covered, true);
        const stale = await post(page, route, {
          action: "pricing_basis",
          scope: "portfolio",
          sourceId: portfolioId,
          choice: { kind: "agreement", agreementId: original.authority.agreementId },
          expectedVersion: version,
          operationId: randomUUID(),
        });
        assert.equal(stale.status, 409);
        assert.equal((await read(page, portfolioRead)).assignment.version, version + 1);
        const agreement = original.standingAgreements.find(
          ({ agreement: entry, id }) =>
            (entry?.id ?? id) === original.authority.agreementId,
        );
        assert.ok(
          agreement,
          "Read the previously verified agreement from the exact lease",
        );
        await save(
          new RegExp(agreement.agreement?.name ?? agreement.name),
          portfolioChoice,
        );
        const restored = await read(page, leaseRead);
        assert.equal(restored.authority.covered, true);
        assert.equal(restored.authority.amount, original.authority.amount);
        assert.equal(restored.authority.agreementId, original.authority.agreementId);
        assert.equal((await read(page, portfolioRead)).assignment.version, version + 2);
        assert.deepEqual(
          (await read(page, route + "?leaseId=" + prepared)).authority,
          uncovered.authority,
        );
        const source = agreement.agreement ?? agreement;
        const agreementKeys = [
          "id",
          "name",
          "policyId",
          "portfolioId",
          "preApprovalStatement",
          "effectiveFrom",
          "endsOn",
          "agreedBy",
          "agreedHow",
          "agreedWhen",
          "revoked",
        ];
        const exactAgreement = Object.fromEntries(
          agreementKeys.map((key) => [key, source[key]]),
        );
        const workspacePath = "/api/lease-renewal/workspace?leaseId=" + covered;
        const priorApproval =
          (await read(page, workspacePath)).state?.ownerResponse ?? null;
        const setAgreement = async (entry, expectedVersion) => {
          assert.equal(
            (await post(page, "/api/auth/demo", { role: "Admin" })).status,
            200,
          );
          try {
            const response = await post(page, route, {
              action: "standing_agreement",
              agreement: entry,
              expectedVersion,
              operationId: randomUUID(),
            });
            assert.equal(response.status, 200, JSON.stringify(response.body));
            return response.body.standingAgreement;
          } finally {
            assert.equal(
              (await post(page, "/api/auth/demo", { role: "Editor" })).status,
              200,
            );
          }
        };
        const expired = await setAgreement(
          { ...exactAgreement, endsOn: exactAgreement.effectiveFrom },
          source.version,
        );
        try {
          const unverified = await read(page, leaseRead);
          assert.equal(unverified.authority.covered, false);
          assert.match(unverified.authority.reason, /ended on/i);
          await open(page, ownerPath);
          await owner
            .getByText(/ended on/i)
            .first()
            .waitFor();
        } finally {
          await setAgreement(exactAgreement, expired.version);
        }
        assert.equal(
          (await read(page, leaseRead)).authority.amount,
          original.authority.amount,
        );

        const workingRoute = "/api/lease-renewal/working-record";
        const workingPath = workingRoute + "?leaseId=" + covered;
        const previousRent = (await read(page, workingPath)).record?.fields?.terms_rent;
        const setRent = async (value, expectedRevision) => {
          const response = await post(page, workingRoute, {
            leaseId: covered,
            field: "terms_rent",
            value,
            expectedRevision,
            operationId: randomUUID(),
          });
          assert.equal(response.status, 200, JSON.stringify(response.body));
          return (await read(page, workingPath)).record.fields.terms_rent;
        };
        const conflict = await setRent(
          original.authority.amount + 25,
          previousRent?.revision ?? 0,
        );
        try {
          const conflicting = await read(page, leaseRead);
          assert.equal(conflicting.authority.covered, false);
          assert.match(conflicting.authority.reason, /rent|amount/i);
          await open(page, ownerPath);
          await owner
            .getByText(/rent.*rule|rule.*rent/i)
            .first()
            .waitFor();
          assert.deepEqual(
            (await read(page, workspacePath)).state?.ownerResponse ?? null,
            priorApproval,
          );
        } finally {
          await setRent(previousRent?.value ?? null, conflict.revision);
        }
        const finalCoverage = await read(page, leaseRead);
        assert.equal(finalCoverage.authority.covered, true);
        assert.equal(finalCoverage.authority.amount, original.authority.amount);
        await open(page, href(covered, "?step=compare-market"));
        await now(page).locator("[data-renewal-work]").waitFor();
        assert.equal(await owner.isVisible(), false);
        await full(page).click();
        await basis.waitFor();
        assert.equal(await owner.count(), 1);
        return {
          covered: true,
          singleOwner: true,
          leaseOverridePreservedPortfolio: true,
          portfolioRevisions: [version, version + 1, version + 2],
          staleStatus: stale.status,
          restoredAgreementAmount: restored.authority.amount,
          unrelatedLeasePreserved: true,
          expiredCoverageHeld: true,
          conflictingRentHeld: true,
          approvalPreserved: true,
        };
      },
    );

    await journey(
      "N09-06",
      "Approver",
      wide,
      ["/api/lease-renewal/sender-signature", "/api/lease-renewal/message-preparation"],
      async (page) => {
        await open(page, href(prepared, "?step=ask-owner"));
        const before = await read(
          page,
          "/api/lease-renewal/message-preparation?leaseId=" + prepared + "&channel=owner",
        );
        assert.equal(before.signatureSetup, null);
        assert.equal(before.inputs.signature, null);
        await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname ===
                "/api/lease-renewal/sender-signature" &&
              response.request().method() === "POST" &&
              response.ok(),
          ),
          page.getByRole("button", { name: "Save blank signature", exact: true }).click(),
        ]);
        const after = await read(page, "/api/lease-renewal/sender-signature");
        assert.ok(after.choice?.revision > 0 && after.choice.signature === null);
        await open(page, href(prepared, "?step=ask-owner"));
        const blank = await read(
          page,
          "/api/lease-renewal/message-preparation?leaseId=" + prepared + "&channel=owner",
        );
        assert.equal(blank.signatureSetup.choice, "blank");
        assert.equal(blank.facts.signature, null);
        // S281 R-S281-12: a saved choice clears the signature hold, so Message can close on entry.
        const message = now(page).locator(
          'details[data-renewal-group="Message"][data-renewal-group-step="ask-owner"]',
        );
        await message.waitFor();
        if ((await message.getAttribute("open")) === null)
          await toggleDisclosure(page, message, true);
        await message
          .getByRole("button", { name: "Edit signature", exact: true })
          .click();
        const choice = message.getByRole("form", { name: "Your signature" });
        await choice
          .getByLabel("Sender name", { exact: true })
          .fill("November Fixture Approver");
        const filledSave = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/lease-renewal/sender-signature" &&
            response.request().method() === "POST" &&
            response.ok(),
        );
        await choice.getByRole("button", { name: "Save my signature" }).click();
        await filledSave;
        await open(page, href(prepared, "?step=ask-owner"));
        const filled = await read(
          page,
          "/api/lease-renewal/message-preparation?leaseId=" + prepared + "&channel=owner",
        );
        assert.equal(filled.signatureSetup.choice, "filled");
        assert.equal(filled.facts.signature.email, before.senderEmail);
        assert.match(filled.content.plainText, /November Fixture Approver/);
        assert.equal(filled.saved?.revision, before.saved?.revision);
        const switched = await post(page, "/api/auth/demo", { role: "Editor" });
        assert.equal(switched.status, 200);
        await open(page, href(prepared, "?step=ask-owner"));
        const editor = await read(
          page,
          "/api/lease-renewal/message-preparation?leaseId=" + prepared + "&channel=owner",
        );
        assert.notEqual(editor.senderEmail, before.senderEmail);
        assert.doesNotMatch(editor.content.plainText, /November Fixture Approver/);
        assert.equal(editor.saved?.revision, before.saved?.revision);

        const messageRoute = "/api/lease-renewal/message-preparation";
        const ownerMessage = messageRoute + "?leaseId=" + prepared + "&channel=owner";
        const authored = "Synthetic prior owner message.\n\nPrior Editor footer";
        const seeded = await post(page, messageRoute, {
          kind: "save",
          leaseId: prepared,
          channel: "owner",
          cycleId: editor.cycleId,
          expectedRevision: editor.saved?.revision ?? 0,
          operationId: randomUUID(),
          inputs: editor.inputs,
          bodyOverride: { text: authored, baseHash: editor.bodyBaseHash },
        });
        assert.equal(seeded.status, 200);
        assert.equal(seeded.body.content.plainText, authored);
        assert.equal(
          (await post(page, "/api/auth/demo", { role: "Approver" })).status,
          200,
        );
        await open(page, href(prepared, "?step=ask-owner"));
        const foreign = await read(page, ownerMessage);
        assert.equal(foreign.priorSenderWording, authored);
        assert.doesNotMatch(foreign.content.plainText, /Prior Editor footer/);
        assert.ok(
          foreign.outgoingReasons.some((reason) =>
            /Review prior sender wording/.test(reason),
          ),
        );
        await page.getByText("Prior sender wording", { exact: true }).click();
        await page.getByText("Prior Editor footer", { exact: false }).waitFor();
        const rebuild = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === messageRoute &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Rebuild for the current sender", exact: true })
          .click();
        assert.equal((await rebuild).status(), 200);
        const rebuilt = await read(page, ownerMessage);
        assert.equal(rebuilt.priorSenderWording, null);
        assert.equal(rebuilt.saved.revision, seeded.body.saved.revision + 1);
        assert.equal(rebuilt.senderEmail, filled.senderEmail);
        assert.match(rebuilt.content.plainText, /November Fixture Approver/);
        assert.doesNotMatch(rebuilt.content.plainText, /Prior Editor footer/);
        return {
          firstUse: true,
          savedBlank: true,
          filledReadback: true,
          isolatedSenders: true,
          priorWordingHeld: true,
          explicitTakeoverRevision: rebuilt.saved.revision,
          missing: "Exact authorized follow-up bytes require compiled dispatch proof.",
        };
      },
    );
  }

  const checkTenantOffer = () =>
    journey(
      "N09-07",
      "Editor",
      wide,
      [
        "/api/gmail-hub/sequences",
        "/api/lease-renewal/message-preparation",
        "/api/lease-renewal/working-record",
        "/api/lease-renewal/workspace",
      ],
      async (page) => {
        await open(page, href(prepared, "?step=offer-tenant"));
        const owner = await read(
          page,
          "/api/lease-renewal/message-preparation?leaseId=" + prepared + "&channel=owner",
        );
        const working = await read(
          page,
          "/api/lease-renewal/working-record?leaseId=" + prepared,
        );
        const leaseEnd = new Date(owner.facts.leaseEndDate + "T12:00:00Z");
        const effective = new Date(leaseEnd.getTime() + 86_400_000)
          .toISOString()
          .slice(0, 10);
        const ending = new Date(
          Date.UTC(
            leaseEnd.getUTCFullYear() + 1,
            leaseEnd.getUTCMonth(),
            leaseEnd.getUTCDate(),
            12,
          ),
        )
          .toISOString()
          .slice(0, 10);
        for (const [field, value] of [
          ["terms_effective_date", effective],
          ["terms_end_date", ending],
        ]) {
          const saved = await post(page, "/api/lease-renewal/working-record", {
            leaseId: prepared,
            field,
            value,
            expectedRevision: working.record?.fields?.[field]?.revision ?? 0,
            operationId: randomUUID(),
          });
          assert.equal(saved.status, 200);
        }
        let scheduledDesk = null;
        if (compiledMail) {
          const path = "/api/gmail-hub/sequences";
          const ownerComposition = await read(
            page,
            "/api/gmail-hub/composition?purpose=renewal_owner&lease=" + prepared,
          );
          const staged = await post(page, path, {
            action: "save",
            expectedVersion: 0,
            operationId: randomUUID(),
            draft: {
              id: randomUUID(),
              context: ownerComposition.context,
              initial: ownerComposition.initial,
              followUp: null,
            },
          });
          assert.equal(staged.status, 200, JSON.stringify(staged.body));
          const candidate = staged.body.sequence;
          const date = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "America/Chicago",
          }).format(Date.now() + 2 * 86_400_000);
          const authorized = await post(page, path, {
            action: "schedule",
            id: candidate.id,
            expectedVersion: candidate.version,
            operationId: randomUUID(),
            reviewedDraftHash: staged.body.reviewedDraftHash,
            reviewedTargetHash: ownerComposition.reviewedTargetHash,
            schedule: {
              firstDate: date,
              time: "09:15",
              timeZone: "America/Chicago",
              everyDays: null,
              endDate: null,
              sendLimit: 1,
            },
          });
          assert.equal(authorized.status, 200, JSON.stringify(authorized.body));
          assert.equal(authorized.body.sequence.confirmedCount, 0);
          await open(page, desk);
          const row = page.locator('tr[data-batch-lease="' + prepared + '"]');
          scheduledDesk = {
            stage: await row.locator(".renewal-batch-stage").innerText(),
            next: await row.locator("[data-batch-next-step]").innerText(),
          };
          assert.match(scheduledDesk.next, /review the scheduled owner message/i);
          const cancelled = await post(page, path, {
            action: "cancel",
            id: candidate.id,
            expectedVersion: authorized.body.sequence.version,
            operationId: randomUUID(),
          });
          assert.equal(cancelled.status, 200);
          assert.equal(cancelled.body.sequence.state, "cancelled");
          await open(page, href(prepared, "?step=offer-tenant"));
        }
        if (compiledMail) {
          const workspaceRoute = "/api/lease-renewal/workspace";
          const initial = await read(page, workspaceRoute + "?leaseId=" + prepared);
          const contacted = await post(page, workspaceRoute, {
            operation: "record",
            leaseId: prepared,
            cycleId: initial.state.cycleId,
            expectedRevision: initial.state.revision,
            operationId: randomUUID(),
            action: {
              kind: "activity",
              activity: "owner_outreach",
              outcome: "done",
              source: "Synthetic approval conversation",
            },
          });
          assert.equal(contacted.status, 200, JSON.stringify(contacted.body));
          const latest = contacted.body;
          const approval = await post(page, workspaceRoute, {
            operation: "record",
            leaseId: prepared,
            cycleId: latest.state.cycleId,
            expectedRevision: latest.state.revision,
            operationId: randomUUID(),
            action: {
              kind: "owner_response",
              outcome: "approved_terms",
              approval: {
                party: {
                  kind: "representative",
                  name: "Synthetic owner representative",
                  capacity: "Fixture approval",
                },
                channel: {
                  kind: "conversation",
                  participants: "Fixture owner and renewal staff",
                },
                occurredAt: new Date().toISOString(),
              },
            },
          });
          assert.equal(approval.status, 200, JSON.stringify(approval.body));
          assert.equal(approval.body.state.ownerResponse.outcome, "approved_terms");
        }
        await open(page, href(prepared, "?step=offer-tenant"));
        const composition = await read(
          page,
          "/api/gmail-hub/composition?purpose=renewal_tenant&lease=" + prepared,
        );
        if (composition.target.blockers?.length) {
          return {
            missing:
              "Fixture has tenant offer readiness blockers. The exact combined review could not open.",
            blockers: composition.target.blockers,
          };
        }
        // November 10 (S269): the Guided Now card names the tenant review for its outcome,
        // "Review tenant offer"; it opens the same Review and send dialog.
        record({
          id: "N09-07",
          check: "offer-now-card",
          primary: await now(page)
            .locator("[data-renewal-now-primary]")
            .allInnerTexts()
            .catch(() => null),
        });
        await now(page)
          .getByRole("button", { name: "Review tenant offer", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: "Review and send", exact: true });
        await dialog.getByRole("checkbox", { name: /Authorize follow-ups/ }).check();
        const combined = dialog.getByRole("button", {
          name: "Send offer now and authorize follow-ups",
          exact: true,
        });
        // S276 R-S276-7 (pin changed by S276): the form opens with starting values, and the
        // message is filled once the follow-up copy is published. Without a message the combined
        // send stays unavailable, as before.
        await dialog.getByLabel("Follow-up message").fill("");
        assert.equal(await combined.isEnabled(), false);
        await dialog.getByLabel("Follow-up subject").fill("Synthetic follow-up");
        await dialog
          .getByLabel("Follow-up message")
          .fill("Please reply with your decision on the synthetic offer.");
        await dialog.getByLabel("Every how many days").fill("3");
        await dialog.getByLabel("Local send time").fill("09:15");
        await dialog
          .getByLabel("Total send limit, including the offer")
          .fill(compiledMail ? "3" : "2");
        if (compiledMail) {
          const last = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
          await dialog.getByLabel("Inclusive end date").fill(last);
        }
        await dialog.getByText(/Expected first follow-up/).waitFor();
        assert.equal(await combined.isEnabled(), true);
        if (compiledMail)
          return {
            scheduledDesk,
            scheduledCancellationWithoutSend: true,
            ...(await qualifyCompiledTenantOffer({
              page,
              rehearsal,
              combined,
              leaseId: prepared,
              href,
              open,
              read,
              post,
              record,
            })),
          };
        const mailSent = async () =>
          (await standInState(rehearsal)).mail.mailboxes.flatMap((box) =>
            box.messages.filter((message) => message.labelIds.includes("SENT")),
          );
        const before = await mailSent();
        const sent = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/gmail-hub/sequences" &&
            response.request().method() === "POST" &&
            response.request().postDataJSON()?.action === "send",
        );
        await combined.click();
        const response = await sent;
        const result = await response.json();
        if (tenantSendProof) {
          assert.ok(response.ok(), result.error);
          const sequence = result.sequence;
          assert.equal(sequence.context.entityId, prepared);
          assert.equal(sequence.authorization.immediateTenantOffer, true);
          assert.equal(sequence.confirmedCount, 1);
          assert.equal(sequence.authorization.schedule.sendLimit, 2);
          assert.ok(sequence.nextDueAtMs > sequence.lastSentAtMs);
          assert.match(
            sequence.authorization.followUp.plainText,
            /Please reply with your decision/,
          );
          const replay = await post(
            page,
            "/api/gmail-hub/sequences",
            response.request().postDataJSON(),
          );
          assert.ok(replay.status === 200 || replay.status === 409);
          const after = await mailSent();
          const fresh = after.filter(
            (message) =>
              !before.some((previous) => previous.rfcMessageId === message.rfcMessageId),
          );
          assert.equal(fresh.length, 1);
          assert.equal(fresh[0].subject, sequence.authorization.initial.subject);
          assert.equal(fresh[0].from.toLowerCase(), sequence.authorization.senderEmail);
          const stored = await read(page, "/api/gmail-hub/sequences?id=" + sequence.id);
          assert.equal(stored.sequence.confirmedCount, 1);
          assert.equal(stored.sequence.nextDueAtMs, sequence.nextDueAtMs);
          return {
            initialSends: fresh.length,
            oneReviewedPlan: true,
            sameOperationReplay: replay.status,
          };
        }
        assert.equal(response.status(), 409);
        assert.equal(result.code, "environment_context_not_allowed");
        assert.deepEqual(await mailSent(), before);
        const refusedId = response.request().postDataJSON().id;
        const refused = await read(page, "/api/gmail-hub/sequences?id=" + refusedId);
        assert.equal(refused.sequence.state, "draft");
        assert.equal(refused.sequence.confirmedCount, 0);
        assert.equal(refused.sequence.authorization, null);
        assert.equal(refused.sequence.unresolvedOccurrenceId, null);
        if (fenceProof) {
          const worker = await page.request.post(
            origin + "/api/rehearsal/s260-mail-worker",
            { maxRedirects: 0 },
          );
          assert.equal(worker.status(), 404);
          return {
            compiledEffectRefused: result.code,
            syntheticSendCount: 0,
            syntheticWorkerAbsent: true,
          };
        }

        return {
          emptyPlanRefused: true,
          boundedPlanReviewed: true,
          compiledEffectRefused: result.code,
          syntheticSendCount: 0,
          missing:
            "Positive dispatch in a compiled browser requires a sanctioned synthetic mail seam. Emulator and development dispatch proof are separate.",
        };
      },
    );

  if (!onlyTenant) {
    await journey(
      "N09-08",
      "Editor",
      wide,
      [
        "/api/lease-renewal/workspace",
        "/api/lease-renewal/packet-truth",
        "/api/lease-renewal/rentvine-writeback",
        "/api/lease-renewal/refresh",
      ],
      async (page) => {
        const workRequests = [];
        page.on("request", (request) => {
          if (
            new URL(request.url()).pathname !== "/api/lease-renewal/workspace" ||
            request.method() !== "POST"
          )
            return;
          const action = request.postDataJSON()?.action;
          workRequests.push(
            [action?.kind, action?.activity, action?.outcome].filter(Boolean).join(":"),
          );
        });
        const savedWork = (predicate, { requireAccepted = false } = {}) =>
          page
            .waitForResponse(
              (response) =>
                new URL(response.url()).pathname === "/api/lease-renewal/workspace" &&
                response.request().method() === "POST" &&
                (!requireAccepted || response.ok()) &&
                predicate(response.request().postDataJSON()?.action),
            )
            .catch((error) => {
              throw new Error(
                "Workspace save wait failed after " + JSON.stringify(workRequests),
                { cause: error },
              );
            });
        await open(page, href(covered, "?view=full#renewal-manual-tenant_response"));
        const responseControl = page
          .locator("#renewal-manual-tenant_response")
          .getByLabel("Tenant response", { exact: true });
        await responseControl.waitFor();
        await page.waitForFunction(() =>
          Boolean(document.activeElement?.closest("#renewal-manual-tenant_response")),
        );
        // S276 R-S276-1 (pin changed by S276): choosing the response saves nothing; its one
        // visible Save records it.
        const selection = await responseControl.selectOption("accepted");
        const [response] = await Promise.all([
          savedWork(
            (action) =>
              action?.kind === "tenant_response" && action.outcome === "accepted",
          ),
          page
            .locator("#renewal-manual-tenant_response")
            .getByRole("button", { name: "Save", exact: true })
            .click(),
        ]);
        assert.deepEqual(selection, ["accepted"]);
        assert.ok(response.ok());
        assert.equal((await response.json()).state.tenantResponse.outcome, "accepted");

        await open(page, href(covered, "?view=full#renewal-section-documents"));
        const documents = page.locator("#renewal-section-documents");
        await documents
          .getByRole("heading", { name: "Documents and completion", exact: true })
          .waitFor();
        await documents.locator('[data-renewal-outcome="complete"]').waitFor();
        const outcomes = await documents
          .locator("[data-renewal-outcome]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.renewalOutcome));
        assert.deepEqual(outcomes, ["documents", "finish-up", "complete"]);
        // November 10 (S270): document work sits in "Other packet and handoff work", closed on
        // entry, inside the Documents and completion section.
        const documentWork = await openNamedGroup(page, "Other packet and handoff work");
        const evaluate = documents
          .getByRole("button", {
            name: /^(Evaluate packet|Evaluate current truth)$/,
          })
          .first();
        const packetPath = "/api/lease-renewal/packet-truth";
        const evaluation = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === packetPath &&
            response.request().method() === "POST" &&
            response.request().postDataJSON()?.action === "evaluate",
        );
        await evaluate.click();
        const evaluated = await evaluation;
        assert.equal(evaluated.status(), 200);
        const packetRequest = evaluated.request().postDataJSON();
        const savedPacket = (await evaluated.json()).snapshot;
        assert.ok(
          savedPacket.snapshotId ?? savedPacket.id,
          "Read an attributable document evaluation",
        );
        const persisted = await read(
          page,
          packetPath +
            "?" +
            new URLSearchParams({
              leaseId: packetRequest.leaseId,
              transactionId: packetRequest.transactionId,
            }),
        );
        assert.deepEqual(persisted.snapshot, savedPacket);
        const dotloop = documents.getByRole("button", {
          name: "Preview exact Dotloop packet creation",
          exact: true,
        });
        if (await dotloop.count()) assert.equal(await dotloop.first().isEnabled(), false);
        const manual = documents.locator("#renewal-manual-documents");
        const outcome = manual.getByLabel("Required documents prepared outcome", {
          exact: true,
        });
        if (!(await outcome.isVisible())) {
          if (!(await manual.isVisible()))
            await openNamedGroup(page, "Other packet and handoff work");
          if (!(await outcome.isVisible()))
            await manual.locator("summary").first().click();
        }
        assert.ok(await documentWork.count());
        const [documentResponse] = await Promise.all([
          savedWork(
            (action) => action?.kind === "activity" && action.activity === "documents",
          ),
          outcome.selectOption("waiting"),
        ]);
        assert.ok(documentResponse.ok());
        assert.equal(
          (await documentResponse.json()).state.activities.documents.outcome,
          "waiting",
        );

        const detailsPath = "?view=full#renewal-outcome-check-numbers";
        await open(page, href(covered, detailsPath));
        await page.locator('section[data-renewal-outcome="check-numbers"]').waitFor();
        const details = await openNamedGroup(page, "Correct other lease facts");
        const corrections = details.getByRole("region", {
          name: "Correct a lease fact",
          exact: true,
        });
        await corrections.getByLabel("Fact to correct").selectOption("renewal_date");
        await corrections.getByLabel("Destinations").selectOption("rentvine");
        const displayDate = new Date(Date.now() + 70 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        await corrections.getByLabel("Reviewed renewal date").fill(displayDate);
        const previewPath = "/api/lease-renewal/rentvine-writeback";
        const previewStatus = previewPath + "?leaseId=" + covered;
        const unbound = await page.request.get(origin + previewStatus);
        assert.equal(unbound.status(), 409);
        assert.equal(
          (await unbound.json()).error_type,
          "environment_context_not_allowed",
        );
        let previewHash = null;
        const previewHeaders = compiledMail
          ? {
              "x-s260-source-preview":
                "Bearer " + process.env.S260_SYNTHETIC_WORKER_TOKEN,
            }
          : {};
        if (compiledMail) {
          assert.match(previewHeaders["x-s260-source-preview"], /^Bearer [a-f0-9]{64}$/);
          await page.route(origin + previewPath, (route) => {
            const request = route.request();
            if (request.method() !== "POST") return route.fallback();
            const command = request.postDataJSON();
            if (command?.leaseId !== covered || command.operation !== "propose")
              return route.fallback();
            return route.fallback({
              headers: { ...request.headers(), ...previewHeaders },
            });
          });
        }
        const previewReply = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === previewPath &&
            response.request().method() === "POST",
        );
        await corrections
          .getByRole("button", {
            name: "Prepare selected destination previews",
            exact: true,
          })
          .click();
        const preview = await previewReply;
        const previewBody = await preview.json();
        assert.equal(preview.request().postDataJSON().operation, "propose");
        if (compiledMail) {
          assert.equal(preview.status(), 200, JSON.stringify(previewBody));
          previewHash = previewBody.proposal.preview_hash;
          assert.match(previewHash, /^[a-f0-9]{64}$/);
          // Status also checks the Live execution ledger. Read the proposal itself
          // from the disposable emulator while leaving that separate gate closed.
          const saved = await fetch(
            fixtureDocument("renewal_writeback_proposals/" + covered),
            { headers: { authorization: "Bearer owner" }, redirect: "error" },
          );
          assert.equal(saved.status, 200, "Read the exact saved synthetic proposal");
          const { fields } = await saved.json();
          assert.equal(fields.leaseId.stringValue, covered);
          assert.equal(fields.previewHash.stringValue, previewHash);
          const [effect] = fields.effects.arrayValue.values;
          assert.equal(
            effect.mapValue.fields.effectHash.stringValue,
            previewBody.proposal.effects[0].effect_hash,
          );
          record({ id: "N09-08", check: "bound-preview-readback", previewHash });
          await corrections
            .getByRole("list", { name: "Destination preparation results" })
            .getByText("Saved: apply its reviewed change below", { exact: false })
            .waitFor();
          await page.unroute(origin + previewPath);
        } else {
          assert.equal(preview.status(), 409);
          assert.equal(previewBody.error_type, "environment_context_not_allowed");
        }
        await open(page, href(covered, "?view=full#renewal-section-documents"));
        const completion = documents.getByRole("button", {
          name: "Record staff completion",
          exact: true,
        });
        assert.equal(await completion.count(), 1);
        const workspacePath = "/api/lease-renewal/workspace?leaseId=" + covered;
        const beforeCompletion = (await read(page, workspacePath)).state;
        assert.equal(beforeCompletion.completion, null);
        assert.equal(beforeCompletion.activities.documents.outcome, "waiting");
        const completionAttempts = [];
        const readAttempt = (response) => {
          if (
            new URL(response.url()).pathname !== "/api/lease-renewal/workspace" ||
            response.request().method() !== "POST"
          )
            return;
          const request = response.request().postDataJSON();
          if (request?.leaseId === covered && request.action?.kind === "complete")
            completionAttempts.push({
              status: response.status(),
              revision: request.expectedRevision,
            });
        };
        page.on("response", readAttempt);
        let completionResponse;
        try {
          [completionResponse] = await Promise.all([
            savedWork((action) => action?.kind === "complete", { requireAccepted: true }),
            completion.click(),
          ]);
        } finally {
          page.off("response", readAttempt);
          record({
            id: "N09-08",
            check: "staff-completion-attempts",
            completionAttempts,
          });
        }
        const completionInput = completionResponse.request().postDataJSON();
        assert.equal(completionInput.leaseId, covered);
        assert.equal(completionInput.cycleId, beforeCompletion.cycleId);
        const completionReceipt = (await completionResponse.json()).state.completion;
        assert.equal(completionReceipt.eventId, completionInput.operationId);
        const completed = await read(page, workspacePath);
        assert.deepEqual(completed.state.completion, completionReceipt);
        await open(page, desk + "?group=completed");
        await batch(page).locator(`tr[data-batch-lease="${covered}"]`).waitFor();

        record({
          id: "N09-08",
          check: "completed-desk",
          recordedTenantDecision: true,
          documentOutcome: "waiting",
          staffCompletion: true,
        });
        const moveOut = String(rehearsal.groups.move_out_notice[0]);
        await open(page, href(moveOut, "?view=full#renewal-manual-non_renewal_handoff"));
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
        const handoff = page.locator("#renewal-manual-non_renewal_handoff");
        const nonRenewal = handoff.getByLabel("Non-renewal handoff recorded outcome", {
          exact: true,
        });
        await handoff.waitFor();
        if ((await handoff.getAttribute("open")) === null)
          await toggleDisclosure(page, handoff, true);
        await nonRenewal.waitFor();
        const [handoffResponse] = await Promise.all([
          savedWork(
            (action) =>
              action?.kind === "activity" && action.activity === "non_renewal_handoff",
          ),
          nonRenewal.selectOption("done"),
        ]);
        assert.ok(handoffResponse.ok());
        assert.equal(
          (await handoffResponse.json()).state.activities.non_renewal_handoff.outcome,
          "done",
        );
        const unavailable = String(rehearsal.roles.replied);
        try {
          setUnavailableSourceLease(rehearsal, Number(unavailable));
          assert.ok((await forceSourceRefresh(page)).body?.refreshed);
          await open(page, href(unavailable));
          await page
            .getByText("This live renewal is unavailable.", { exact: true })
            .waitFor();
          await page
            .getByRole("link", { name: /Back to renewals/ })
            .first()
            .click();
          await batch(page).getByRole("table").waitFor();
          await open(page, desk + "?group=completed");
          await batch(page).locator(`tr[data-batch-lease="${covered}"]`).waitFor();
        } finally {
          setUnavailableSourceLease(rehearsal, null);
          assert.ok((await forceSourceRefresh(page)).body?.refreshed);
        }
        return {
          outcomes,
          recordedTenantDecision: true,
          independentDocumentsAndCompletion: true,
          completedDeskDisposition: true,
          nonRenewalHandoff: true,
          governedRentVinePreview: previewHash,
          unboundPreviewRefused: true,
          ...(previewHash ? {} : { missing: "Run the bound compiled source preview." }),
          exactDocumentEvaluationReadback: true,
          unavailableSourceRetainedIndependentWork: true,
        };
      },
    );

    for (const role of ["Editor", "Approver", "Admin"]) {
      await journey("N09-09-" + role, role, wide, [], async (page) => {
        await open(page, "/");
        await page.getByRole("button", { name: "Admin", exact: true }).click();
        const help = page.getByRole("link", { name: /^Help$/ }).first();
        await Promise.all([page.waitForURL(origin + "/help"), help.click()]);
        assert.equal(new URL(page.url()).pathname, "/help");
        await open(page, "/help/lease-renewals/work-a-renewal#record-renewal-work");
        assert.equal(await page.locator("#record-renewal-work").count(), 1);
        await page
          .getByRole("link", { name: "Screen reference: Lease workspace", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Lease workspace", exact: true })
          .waitFor();
        await page
          .getByRole("row")
          .filter({ hasText: /Work status/ })
          .first()
          .waitFor();
        await page
          .getByRole("link", {
            name: "Work a renewal from the desk to a recorded outcome",
            exact: true,
          })
          .click();
        await page
          .getByRole("heading", {
            name: "Work a renewal from the desk to a recorded outcome",
            exact: true,
          })
          .waitFor();
        await open(page, href(prepared, "?step=check-numbers"));
        await status(page).waitFor();

        await page.setViewportSize(narrow);
        await open(page, "/");
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        await menu.click();
        await page.getByRole("button", { name: "Admin", exact: true }).click();
        const mobileHelp = page.getByRole("link", { name: /^Help$/ }).first();
        await Promise.all([page.waitForURL(origin + "/help"), mobileHelp.click()]);
        await open(page, "/help/lease-renewals/work-a-renewal#record-renewal-work");
        await page.emulateMedia({ media: "print" });
        assert.equal(
          await page
            .getByRole("button", { name: "Print this guide", exact: true })
            .count(),
          0,
        );
        await page.emulateMedia({ media: "screen" });
        const protectedPage = await open(page, "/admin/spaces/request");
        if (role === "Admin") {
          await page
            .getByRole("heading", { name: "Request a new Space", exact: true })
            .waitFor();
        } else {
          const redirects = [];
          for (
            let request = protectedPage?.request();
            request;
            request = request.redirectedFrom()
          ) {
            redirects.push(new URL(request.url()));
          }
          assert.ok(
            redirects.some(
              (url) =>
                url.pathname === "/sign-in" &&
                url.searchParams.get("error") === "forbidden",
            ),
          );
          assert.equal(
            await page.getByRole("heading", { name: "Request a new Space" }).count(),
            0,
          );
        }
        return {
          adminHelp: true,
          stableGuide: true,
          printControlsHidden: true,
          narrowAdminHelp: true,
          protectedSpaceRequest: role === "Admin" ? "read" : "denied",
          linkedScreenAndControl: true,
          ...(renderedHelp ?? {
            missing: "Bind the exact canonical rendered and deliberate drift gates.",
          }),
        };
      });
    }

    await journey(
      "N09-10",
      "Editor",
      wide,
      ["/api/lease-renewal/working-record", "/api/lease-renewal/work-status"],
      async (page, mutations) => {
        const checks = [];
        const steps = [
          "check-numbers",
          "compare-market",
          "ask-owner",
          "offer-tenant",
          "documents",
          "finish-up",
          "complete",
        ];
        for (const step of steps) {
          await open(page, href(prepared, "?step=" + step));
          const active = now(page).locator("[data-renewal-work]");
          await active.waitFor();
          await now(page).locator("details[data-renewal-verification]").waitFor();
          const snapshot = await now(page).evaluate(inspectOutcome);
          checks.push({ view: "guided", step, faults: outcomeFaults(snapshot) });
        }
        await open(page, href(prepared, "?view=full"));
        for (const step of steps) {
          const outcome = page.locator(`section[data-renewal-outcome="${step}"]`);
          await outcome.waitFor();
          const snapshot = await outcome.evaluate(inspectOutcome);
          checks.push({ view: "full", step, faults: outcomeFaults(snapshot) });
          await toggleDisclosure(
            page,
            outcome.locator("details[data-renewal-verification]"),
            true,
          );
        }
        assert.deepEqual(mutations, [], "Verification caused a mutation attempt");
        await page.setViewportSize(narrow);
        await page.emulateMedia({ colorScheme: "dark" });
        for (const step of steps) {
          await open(page, href(prepared, "?step=" + step));
          await now(page).locator("details[data-renewal-verification]").waitFor();
          checks.push({
            view: "guided-narrow",
            step,
            faults: outcomeFaults(await now(page).evaluate(inspectOutcome)),
          });
        }
        await open(page, href(prepared, "?view=full"));
        const toolbar = page.locator(
          ".renewal-workspace-toolbar[data-renewal-toolbar-compact]",
        );
        await toolbar.locator('summary[aria-label="Work status"]').waitFor();
        await toolbar.locator("#renewal-record-work").waitFor();
        const compactFull = await toolbar.evaluate((node) => {
          const status = node.querySelector('summary[aria-label="Work status"]');
          const record = node.querySelector("#renewal-record-work");
          return {
            toolbar: node.getBoundingClientRect().height,
            status: status?.getBoundingClientRect().toJSON(),
            record: record?.getBoundingClientRect().toJSON(),
            viewport: window.innerWidth,
          };
        });
        record({ id: "N09-10", compactFull });
        assert.ok(compactFull.toolbar <= 112, "Full view keeps its compact toolbar");
        for (const control of [compactFull.status, compactFull.record]) {
          assert.ok(
            control &&
              control.width >= 44 &&
              control.height >= 44 &&
              control.left >= 0 &&
              control.right <= compactFull.viewport + 1,
            "Both compact Full view controls fit without scrolling sideways",
          );
        }
        for (const step of steps) {
          const outcome = page.locator(`section[data-renewal-outcome="${step}"]`);
          await outcome.waitFor();
          checks.push({
            view: "full-narrow",
            step,
            faults: outcomeFaults(await outcome.evaluate(inspectOutcome)),
          });
        }
        record({ id: "N09-10", checkpoints: checks });
        assert.deepEqual(
          checks.filter((check) => check.faults.length > 0),
          [],
        );

        const negative = page.locator('section[data-renewal-outcome="compare-market"]');
        const cases = [
          ["unconsolidated", "loose"],
          ["duplicate working rent editor", "duplicate"],
          ["effectful evidence", "effect"],
          ["next action or fix is hidden", "hidden"],
          ["send competes with reconciliation", "send"],
        ];
        for (const [expected, defect] of cases) {
          await negative.evaluate((section, defect) => {
            const work = section.querySelector("[data-renewal-work]");
            const evidence = section.querySelector("[data-renewal-verification]");
            const primary = work.querySelector("[data-renewal-work-primary]");
            const node = document.createElement(
              defect === "duplicate" ? "input" : "button",
            );
            node.dataset.s260Injected = "true";
            node.textContent = defect === "send" ? "Review and send" : "Old action";
            if (defect === "loose") section.append(node);
            if (defect === "duplicate") {
              node.dataset.renewalField = "terms_rent";
              work.append(node);
            }
            if (defect === "effect") evidence.append(node);
            if (defect === "hidden" && primary) {
              section.dataset.s260RestoreState = section.dataset.renewalWorkState;
              section.dataset.renewalWorkState = "current";
              primary.dataset.s260Restore = primary.style.marginTop;
              primary.style.marginTop = "1500px";
            }
            if (defect === "send") {
              section.dataset.s260RestoreState = section.dataset.renewalWorkState;
              section.dataset.renewalWorkState = "reconcile";
              node.disabled = true;
              work.append(node);
            }
          }, defect);
          const found = outcomeFaults(await negative.evaluate(inspectOutcome));
          assert.ok(
            found.includes(expected),
            "The rendered negative control should fail: " + expected,
          );
          await negative.evaluate((section) => {
            section.querySelector("[data-s260-injected]")?.remove();
            const primary = section.querySelector("[data-s260-restore]");
            if (primary) {
              primary.style.marginTop = primary.dataset.s260Restore;
              delete primary.dataset.s260Restore;
            }
            if (section.dataset.s260RestoreState) {
              section.dataset.renewalWorkState = section.dataset.s260RestoreState;
              delete section.dataset.s260RestoreState;
            }
          });
        }

        await page.setViewportSize(wide);
        await open(page, href(prepared, "?step=compare-market"));
        const editor = page.getByLabel("Rent to recommend", { exact: true });
        const workingRoute = "**/api/lease-renewal/working-record";
        let permitRequest;
        let sawRequest;
        const canProceed = new Promise((resolve) => {
          permitRequest = resolve;
        });
        const requested = new Promise((resolve) => {
          sawRequest = resolve;
        });
        await page.route(workingRoute, async (route) => {
          if (route.request().method() === "POST") {
            sawRequest();
            await canProceed;
          }
          return route.fallback();
        });
        const accepted = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/lease-renewal/working-record") &&
            response.request().method() === "POST" &&
            response.ok(),
        );
        await editor.fill("1784");
        await editor.press("Tab");
        try {
          await Promise.race([
            requested,
            page.waitForTimeout(5000).then(() => {
              throw new Error("The edited recommendation did not start its normal save.");
            }),
          ]);
          await full(page).click();
          assert.equal(await editor.inputValue(), "1784");
        } finally {
          permitRequest();
        }
        await accepted;
        await page.unroute(workingRoute);
        const saved = await read(
          page,
          "/api/lease-renewal/working-record?leaseId=" + prepared,
        );
        assert.equal(saved.record.fields.terms_rent.value, 1784);
        assert.deepEqual(mutations, ["/api/lease-renewal/working-record"]);

        await editor.fill("1785");
        const changed = await post(page, "/api/lease-renewal/working-record", {
          leaseId: prepared,
          field: "terms_rent",
          value: 1786,
          expectedRevision: saved.record.fields.terms_rent.revision,
          operationId: randomUUID(),
        });
        assert.equal(changed.status, 200);
        const stale = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/lease-renewal/working-record") &&
            response.request().method() === "POST" &&
            response.status() === 409,
        );
        const reload = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/lease-renewal/working-record" &&
            response.request().method() === "GET" &&
            response.ok(),
        );
        await editor.press("Enter");
        await stale;
        await reload;
        const failed = page.locator(".renewal-now-rent [data-autosave=failed]");
        await failed.waitFor();
        assert.match(await failed.innerText(), /Changed elsewhere/);
        await full(page).click();
        await failed.waitFor();
        assert.equal(await editor.inputValue(), "1785");
        const preserved = await read(
          page,
          "/api/lease-renewal/working-record?leaseId=" + prepared,
        );
        assert.equal(preserved.record.fields.terms_rent.value, 1786);
        assert.equal(mutations.length, 3, "View changes must not retry a refused save");
        await failed.getByRole("button", { name: "Save my entry", exact: true }).click();
        await page.locator(".renewal-now-rent [data-autosave=saved]").waitFor();
        const retried = await read(
          page,
          "/api/lease-renewal/working-record?leaseId=" + prepared,
        );
        assert.equal(retried.record.fields.terms_rent.value, 1785);
        assert.equal(mutations.length, 4);

        if (!compiledMail) {
          await seedUnconfirmedTenantOffer(page);
          for (const query of [
            "?step=offer-tenant",
            "?view=full#renewal-outcome-offer-tenant",
          ]) {
            await open(page, href(prepared, query));
            const scope = query.includes("full")
              ? page.locator('section[data-renewal-outcome="offer-tenant"]')
              : now(page);
            const reconcile = scope.getByRole("button", {
              name: "Check whether the message went out",
              exact: true,
            });
            await reconcile.waitFor();
            await scope.locator("details[data-renewal-verification]").waitFor();
            // S269: Guided names its send entries for the outcome.
            const competing = scope.getByRole("button", {
              name: /^(Review and send|Review owner message|Review tenant offer|Send this message|Schedule)$/,
            });
            await competing.first().waitFor({ state: "hidden", timeout: 2000 });
            const snapshot = await scope.evaluate(inspectOutcome);
            const faults = outcomeFaults(snapshot);
            record({ id: "N09-10", check: "unconfirmed", query, snapshot, faults });
            assert.deepEqual(faults, [], query + " unconfirmed offer");
          }
        }
        await signInReadOnly(page);
        const fieldPath = "/api/lease-renewal/working-record";
        const statusPath = "/api/lease-renewal/work-status";
        const readOnlyValue = (await read(page, fieldPath + "?leaseId=" + prepared))
          .record.fields.terms_rent;
        const readOnlyNotes = await read(page, statusPath + "?leaseId=" + prepared);
        const mutationCount = mutations.length;
        for (const [path, scope] of [
          ["?step=compare-market", now(page)],
          [
            "?view=full#renewal-outcome-compare-market",
            page.locator('section[data-renewal-outcome="compare-market"]'),
          ],
        ]) {
          await open(page, href(prepared, path));
          const evidence = scope.locator("details[data-renewal-verification]");
          await toggleDisclosure(page, evidence, true);
          await toggleDisclosure(page, evidence, false);
        }
        assert.equal(mutations.length, mutationCount);
        const refusedEdit = await post(page, fieldPath, {
          leaseId: prepared,
          field: "terms_rent",
          value: readOnlyValue.value + 1,
          expectedRevision: readOnlyValue.revision,
          operationId: randomUUID(),
        });
        assert.equal(refusedEdit.status, 403);
        const refusedNote = await post(page, statusPath, {
          kind: "note",
          leaseId: prepared,
          noteId: randomUUID(),
          text: "Synthetic verification must stay read-only",
          expectedRevision: 0,
          operationId: randomUUID(),
        });
        assert.equal(refusedNote.status, 403);
        assert.deepEqual(
          (await read(page, fieldPath + "?leaseId=" + prepared)).record.fields.terms_rent,
          readOnlyValue,
        );
        assert.deepEqual(
          await read(page, statusPath + "?leaseId=" + prepared),
          readOnlyNotes,
        );
        return {
          checkedOutcomes: checks.length + (compiledMail ? 0 : 2),
          delayedSaveReadback: true,
          refusedSavePreservedAndRetried: true,
          reconciliationTakesPriority: !compiledMail,
          renderedNegativeControlsRejected: cases.length,
          readOnlyEvidenceAndExactRefusals: true,
          missing: "Provider-backed reconciliation return requires the N09-07 replay.",
        };
      },
    );
  }
  await checkTenantOffer();
  const mailProof = results.find(({ id }) => id === "N09-07");
  if (compiledMail && mailProof?.verdict === "Yes" && !onlyTenant) {
    const mail = mailProof.observed;
    const links = [
      [
        "N09-01",
        mail.scheduledDesk &&
          mail.waitingDesk &&
          mail.unconfirmedDesk && {
            scheduled: mail.scheduledDesk,
            waiting: mail.waitingDesk,
            unconfirmed: mail.unconfirmedDesk,
          },
      ],
      [
        "N09-06",
        mail.exactResponsibleSenderBytes && { exactResponsibleSenderBytes: true },
      ],
      [
        "N09-10",
        mail.twoViewReconciliation &&
          mail.twoViewWaiting &&
          mail.twoViewReplyDecision &&
          mail.verifiedHumanReplyPaused && {
            reconciliationTakesPriority: true,
            actualReplyDecisionSeparation: true,
            waitingAndDecisionInBothViews: true,
          },
      ],
    ];
    for (const [id, evidence] of links) {
      const row = results.find((entry) => entry.id === id);
      if (row?.verdict !== "UNVERIFIED" || !evidence) continue;
      const observed = { ...row.observed };
      delete observed.missing;
      row.observed = { ...observed, ...evidence, crossCase: "N09-07" };
      row.verdict = "Yes";
      record({ ...row, phase: "cross-case-final" });
    }
  }
} finally {
  await browser.close();
  const compiled = readFileSync(join(runDir, "rehearsal-log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "compiled");
  const result = novemberNineMatrixVerdict({
    run,
    rehearsal,
    compiled,
    results,
    networkRefusals: refusedConnections(rehearsal),
    tenantSendProof: onlyTenant,
    servedHelp,
  });
  writeFileSync(
    join(
      runDir,
      fenceProof
        ? "compiled-mail-fence-verdict.json"
        : tenantSendProof
          ? "tenant-send-proof-verdict.json"
          : "s260-verdict.json",
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  record({
    outcome: result.verdict,
    source: result.source,
    exact: result.exact,
    human: result.human,
  });
  process.exitCode = result.verdict === "Yes" ? 0 : 1;
}

// S260. Runs on one guarded, compiled rehearsal build and records exact scoped results.
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
  refusedConnections,
  resetComparisonLog,
  setComparisonAllowance,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { inspectOutcome, outcomeFaults } from "./one-path-november-9-outcome-check.mjs";
import { novemberNineMatrixVerdict } from "./one-path-november-9-qualification-verdict.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
const tenantSendProof = process.argv.includes("--tenant-send-proof");
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit);
assert.equal(rehearsal.compiled, !tenantSendProof);
assert.equal(rehearsal.mailAdapter, true);
const report = join(
  runDir,
  tenantSendProof ? "tenant-send-proof.jsonl" : "s260-journeys.jsonl",
);
const results = [];
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
const open = (page, path) => page.goto(origin + path, { waitUntil: "domcontentloaded" });
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
async function seedFixture(path, fields) {
  assert.match(rehearsal.firestoreEmulatorHost, /^127\.0\.0\.1:\d+$/);
  assert.match(rehearsal.projectId, /^pmi-kc-kb-[a-z0-9-]+-test$/);
  const base = "http://" + rehearsal.firestoreEmulatorHost + "/v1/projects/";
  const root = rehearsal.projectId + "/databases/(default)/documents/";
  const response = await fetch(base + root + path, {
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

const full = (page) => page.getByRole("button", { name: "Full view", exact: true });
const batch = (page) => page.getByRole("region", { name: "Working batch", exact: true });
const now = (page) => page.getByRole("region", { name: "Now", exact: true });
const status = (page) => page.locator("#renewal-staff-status-log > summary");
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
              .find((line) => line.includes("qualification-driver.mjs"))
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
  if (!tenantSendProof) {
    await journey(
      "N09-01",
      "Editor",
      wide,
      [
        "/api/lease-renewal/desk-preferences",
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

        const sort = root.getByRole("button", { name: "Current base rent" });
        await sort.press("Enter");
        await root.locator('th[aria-sort="ascending"]').waitFor();
        const filtered = root.locator('button[data-batch-group="not_targets"]');
        const count = Number(await filtered.getAttribute("data-batch-count"));
        await filtered.click();
        assert.equal(await root.getByRole("table").count(), 1);
        assert.equal(await root.locator("tr[data-batch-lease]").count(), count);
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
        assert.equal(await batch(page).locator("tr[data-batch-lease]").count(), count);
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
      ["/api/lease-renewal/kickoff-preparation"],
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
        await page.getByRole("link", { name: "Previous month", exact: true }).click();
        const month = await batch(page).getAttribute("data-batch-month");
        await page.reload({ waitUntil: "domcontentloaded" });
        await batch(page).getByRole("table").waitFor();
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
        return {
          month,
          requested: requests.length,
          eligible: eligible.length,
          legacyRefused: true,
          capStops,
          deliberateContinuation: true,
          draftReadbacks,
          reuseAtAllowance: true,
          missing:
            "Interrupted in-flight continuation and changed-cycle ambiguity require replay.",
        };
      },
    );

    await journey("N09-03", "Editor", wide, [], async (page) => {
      await open(page, href(prepared, "?step=compare-market"));
      const editor = page.getByLabel("Rent to recommend", { exact: true });
      await editor.waitFor();
      const data = await read(
        page,
        "/api/lease-renewal/working-record?leaseId=" + prepared,
      );
      const saved = data.record?.fields?.terms_rent;
      assert.ok(
        saved?.value > 0 && saved.sourceLabel,
        "Read back the app-saved recommendation and basis",
      );
      assert.equal(Number(await editor.inputValue()), saved.value);
      await page.getByRole("button", { name: "Ask the owner", exact: true }).click();
      await page
        .getByRole("button", { name: "Change recommended rent", exact: true })
        .click();
      assert.equal(
        await editor.evaluate((node) => node === document.activeElement),
        true,
      );
      return {
        savedRevision: saved.revision,
        exactEditorReturn: true,
        missing:
          "The source discrepancy and interrupted-save browser branches require replay.",
      };
    });

    await journey(
      "N09-04",
      "Editor",
      narrow,
      ["/api/lease-renewal/work-status"],
      async (page) => {
        await open(page, href());
        await status(page).waitFor();
        assert.equal(await status(page).count(), 1);
        assert.equal(await full(page).getAttribute("aria-pressed"), "false");
        await status(page).press("Enter");
        const note = page.getByLabel("Add a note", { exact: true });
        await note.fill("Synthetic November 9 renewal note");
        await note.press("Tab");
        await page
          .locator('[data-testid="renewal-status-note-autosave"] [data-autosave="saved"]')
          .waitFor();
        const history = page.locator('details[data-testid="renewal-status-log"]');
        assert.equal(await history.getAttribute("open"), null);
        await history.locator("summary").click();
        assert.match(await history.innerText(), /Synthetic November 9 renewal note/);
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
        await full(page).click();
        assert.equal(await full(page).getAttribute("aria-pressed"), "true");
        assert.equal(await status(page).count(), 1);
        const provider = page
          .getByRole("link", { name: "Open in RentVine", exact: true })
          .first();
        const destination = new URL(await provider.getAttribute("href"), origin);
        assert.match(destination.pathname, new RegExp(prepared));
        await open(page, href(prepared, "?view=focus#renewal-section-documents"));
        await page
          .getByRole("button", { name: "Full view", pressed: true, exact: true })
          .waitFor();
        await page.waitForFunction(
          () => document.activeElement?.closest("#renewal-section-documents") !== null,
        );
        await full(page).click();
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
        return {
          savedNote: true,
          collapsedHistory: true,
          fullToggle: true,
          legacyTarget: true,
          stickyOutcomes: 7,
          missing:
            "Earlier-cycle history, role cases and actual provider return require replay.",
        };
      },
    );

    await journey(
      "N09-05",
      "Editor",
      wide,
      ["/api/lease-renewal/pricing-policy"],
      async (page) => {
        const route = "/api/lease-renewal/pricing-policy";
        const leaseRead = route + "?leaseId=" + covered;
        await open(page, href(covered, "?step=ask-owner"));
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
        await page
          .getByRole("button", { name: "Compare market rent", exact: true })
          .click();
        assert.equal(await owner.isVisible(), false);
        await full(page).click();
        await owner.waitFor();
        assert.equal(await owner.count(), 1);
        return {
          covered: true,
          singleOwner: true,
          leaseOverridePreservedPortfolio: true,
          portfolioRevisions: [version, version + 1, version + 2],
          staleStatus: stale.status,
          restoredAgreementAmount: restored.authority.amount,
          unrelatedLeasePreserved: true,
          missing: "Expired coverage and a conflicting working amount require replay.",
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
        await page.getByRole("button", { name: "Edit signature", exact: true }).click();
        const choice = page.getByRole("form", { name: "Your signature" });
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

  await journey(
    "N09-07",
    "Editor",
    wide,
    [
      "/api/gmail-hub/sequences",
      "/api/lease-renewal/message-preparation",
      "/api/lease-renewal/working-record",
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
      await now(page)
        .getByRole("button", { name: "Review and send", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Review and send", exact: true });
      await dialog.getByRole("checkbox", { name: /Authorize follow-ups/ }).check();
      const combined = dialog.getByRole("button", {
        name: "Send offer now and authorize follow-ups",
        exact: true,
      });
      assert.equal(await combined.isEnabled(), false);
      await dialog.getByLabel("Follow-up subject").fill("Synthetic follow-up");
      await dialog
        .getByLabel("Follow-up message")
        .fill("Please reply with your decision on the synthetic offer.");
      await dialog.getByLabel("Every how many days").fill("3");
      await dialog.getByLabel("Local send time").fill("09:15");
      await dialog.getByLabel("Total send limit, including the offer").fill("2");
      await dialog.getByText(/Expected first follow-up/).waitFor();
      assert.equal(await combined.isEnabled(), true);
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

  if (!tenantSendProof) {
    await journey(
      "N09-08",
      "Editor",
      wide,
      ["/api/lease-renewal/workspace"],
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
        const savedWork = (predicate) =>
          page
            .waitForResponse(
              (response) =>
                new URL(response.url()).pathname === "/api/lease-renewal/workspace" &&
                response.request().method() === "POST" &&
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
        const [response, selection] = await Promise.all([
          savedWork(
            (action) =>
              action?.kind === "tenant_response" && action.outcome === "accepted",
          ),
          responseControl.selectOption("accepted"),
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
        const documentWork = documents.locator('[data-renewal-outcome="documents"]');
        const manual = documentWork.locator("#renewal-manual-documents");
        const outcome = manual.getByLabel("Required documents prepared outcome", {
          exact: true,
        });
        if (!(await outcome.isVisible())) {
          const secondary = documentWork
            .locator("summary")
            .filter({ hasText: /^Prepare or record document work$/ });
          if (!(await manual.isVisible())) await secondary.click();
          if (!(await outcome.isVisible())) await manual.locator("summary").click();
        }
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

        const completion = documents.getByRole("button", {
          name: "Record staff completion",
          exact: true,
        });
        assert.equal(await completion.count(), 1);
        const [completionResponse] = await Promise.all([
          savedWork((action) => action?.kind === "complete"),
          completion.click(),
        ]);
        assert.ok(completionResponse.ok());
        const completed = await read(
          page,
          "/api/lease-renewal/workspace?leaseId=" + covered,
        );
        assert.ok(completed.state.completion?.eventId);
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
          await handoff.locator(":scope > summary").press("Enter");
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
        return {
          outcomes,
          recordedTenantDecision: true,
          independentDocumentsAndCompletion: true,
          completedDeskDisposition: true,
          nonRenewalHandoff: true,
          missing:
            "Governed source previews, document receipt and unavailable-source recovery require replay.",
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
          missing:
            "Exact screenshot parity and deliberate rendered drift require the separate gate.",
        };
      });
    }

    await journey(
      "N09-10",
      "Editor",
      wide,
      ["/api/lease-renewal/working-record"],
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
          await outcome.locator("details[data-renewal-verification] > summary").click();
          assert.equal(
            await outcome
              .locator("details[data-renewal-verification]")
              .getAttribute("open"),
            "",
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
          const competing = scope.getByRole("button", {
            name: /^(Review and send|Send this message|Schedule)$/,
          });
          await competing.first().waitFor({ state: "hidden", timeout: 2000 });
          const snapshot = await scope.evaluate(inspectOutcome);
          const faults = outcomeFaults(snapshot);
          record({ id: "N09-10", check: "unconfirmed", query, snapshot, faults });
          assert.deepEqual(faults, [], query + " unconfirmed offer");
        }
        return {
          checkedOutcomes: checks.length + 2,
          delayedSaveReadback: true,
          refusedSavePreservedAndRetried: true,
          reconciliationTakesPriority: true,
          renderedNegativeControlsRejected: cases.length,
          missing:
            "Alternate read-only roles and provider-backed reconciliation return require replay.",
        };
      },
    );
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
    tenantSendProof,
  });
  writeFileSync(
    join(
      runDir,
      tenantSendProof ? "tenant-send-proof-verdict.json" : "s260-verdict.json",
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

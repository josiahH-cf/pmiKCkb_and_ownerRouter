// S82 real-browser smoke for the table-first renewal desk and guided workspace.
//
// Runs read-only against the local rehearsal server (live-read-only sources; no mutation route is
// ever called). It proves table semantics, header sort/filter behavior, exact-value shortcuts,
// chips/clear recovery, workspace phase navigation, desk-view return continuity, browser Back,
// narrow contained scroll, and a Chromium 200%-zoom layout equivalent without page-level overflow.

import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
// This smoke creates a Demo-auth session. Refuse every non-loopback destination before creating
// artifacts, connecting to a browser, or issuing the sign-in POST.
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const DESK_ROUTE_DOM_BUDGET_MS = 60_000;
const DESK_INTERACTION_BUDGET_MS = 20_000;

const artifactDir = join(process.cwd(), "temp", "renewal-desk-browser-s82");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyDeskAndWorkspace();
  await verifyNarrowAndZoom();
} finally {
  await browser.close();
}

process.stdout.write(
  `S82 renewal desk browser smoke passed: full-cohort cardinality, unique rows/destinations, bounded load, keyboard sort/filter/navigation, 44px targets, table semantics, shortcuts, chips/clear, workspace phases, desk/workspace term parity, deskView return, Back, narrow contained scroll, zoom overflow. Artifacts: ${artifactDir}\n`,
);

async function verifyDeskAndWorkspace() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DESK_ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(DESK_INTERACTION_BUDGET_MS);
  const loadStartedAt = performance.now();
  await signInAndOpen(page, "/lease-renewal/live/desk?v=2&scope=all");

  const table = page.locator("table.renewal-table");
  await table.waitFor();
  assertWithinBudget(
    loadStartedAt,
    DESK_ROUTE_DOM_BUDGET_MS,
    "Full Renewal Desk route and DOM",
  );
  await assertFullCohortIntegrity(page);
  assert(
    (await page.locator("table.renewal-table caption").count()) === 1,
    "The table lost its caption.",
  );
  assert(
    (await page
      .getByText(/Matching: \d+ · Selected scope: \d+ · Total loaded: \d+/)
      .count()) === 1,
    "The truthful loaded/scope/matching count is missing.",
  );
  assert(
    (await page.getByText(/Worklist scope:/).count()) === 1,
    "The persistent worklist scope is missing.",
  );
  assert(
    (await page.locator(".ui-metric-grid, .renewal-worklist-card").count()) === 0,
    "A retired desk surface rendered.",
  );
  await assertMinimumTargetSize(page, ".renewal-th-sort-button", "sort control");
  await assertMinimumTargetSize(page, ".renewal-th-filter summary", "filter disclosure");
  await assertMinimumTargetSize(
    page,
    "tbody a.renewal-lease-link, tbody a.text-link, tbody a.renewal-status-link, tbody a.renewal-source-link",
    "renewal row link",
  );
  const firstRowLink = page
    .locator(
      "tbody a.renewal-lease-link, tbody a.text-link, tbody a.renewal-status-link, tbody a.renewal-source-link",
    )
    .first();
  await firstRowLink.focus();
  const outlineWidth = await firstRowLink.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).outlineWidth),
  );
  assert(outlineWidth >= 3, "A renewal row link lost its visible keyboard focus ring.");

  // Header sort: keyboard activation sorts and marks aria-sort; activating again reverses.
  const rentSort = page.getByRole("button", { name: /Current base rent/ });
  await rentSort.focus();
  assert(await isFocused(rentSort), "The base-rent sort control did not receive focus.");
  let interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.waitForURL(/sort=base_rent/);
  await table.waitFor();
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard base-rent sort",
  );
  assert(
    (await page.locator('th[aria-sort="ascending"]').count()) === 1,
    "Sorting did not mark exactly one ascending header.",
  );
  await rentSort.focus();
  interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.waitForURL(/direction=desc/);
  await page.locator('th[aria-sort="descending"]').waitFor();
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard descending base-rent sort",
  );

  // Header filter disclosure and its Apply control both work from the keyboard.
  const statusDisclosure = page.getByText("Filter status", { exact: true });
  await statusDisclosure.focus();
  assert(
    await isFocused(statusDisclosure),
    "The status filter disclosure did not receive focus.",
  );
  await page.keyboard.press("Enter");
  const statusSelect = page.locator("#renewal-filter-overallStatus");
  await statusSelect.waitFor();
  await assertMinimumTargetSize(
    page,
    '.renewal-th-filter[open] .renewal-th-filter-form button[type="submit"]',
    "open-filter Apply control",
  );
  await statusSelect.selectOption("needs_verification");
  const statusApply = statusSelect
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Apply" });
  await statusApply.focus();
  assert(await isFocused(statusApply), "The status Apply control did not receive focus.");
  interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.waitForURL(/overallStatus=needs_verification/);
  await table.waitFor();
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard status filter",
  );
  assert(
    (await page.getByText("Status: needs verification").count()) === 1,
    "The active-filter chip is missing.",
  );
  await assertMinimumTargetSize(
    page,
    ".renewal-filter-chip-remove",
    "active-filter removal",
  );
  await assertMinimumTargetSize(
    page,
    'section[aria-label="Renewal worklist"] a.secondary-button',
    "Clear filters",
  );

  // Clear filters retains the sort and direction.
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.waitForURL(
    (url) =>
      url.toString().includes("sort=base_rent") &&
      !url.toString().includes("overallStatus="),
  );
  await table.waitFor();

  // S103: the lease term header filter narrows the table to exactly that term.
  await page
    .locator(".renewal-th-filter summary")
    .filter({ hasText: "Filter renewal date" })
    .first()
    .click();
  const termSelect = page.locator("#renewal-filter-term");
  await termSelect.waitFor();
  await termSelect.selectOption("fixed_term");
  await termSelect
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Apply" })
    .click();
  await page.waitForURL(/term=fixed_term/);
  await table.waitFor();
  const filteredTerms = await page
    .locator('table.renewal-table tbody [data-renewal-field="lease-term"]')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-lease-term")));
  assert(
    filteredTerms.every((term) => term === "fixed_term"),
    "The lease term filter left a row with a different term.",
  );
  assert(
    (await page.getByText("Lease term: fixed term").count()) === 1,
    "The active lease-term filter chip is missing.",
  );
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.waitForURL((url) => !url.toString().includes("term="));
  await table.waitFor();

  // Owner/tenant filters are discoverable header controls. Choices submit only opaque p1_ tokens.
  for (const kind of ["owner", "tenant"]) {
    await page.getByText(`Filter ${kind}`, { exact: true }).click();
    const select = page.locator(`#renewal-filter-${kind}Key`);
    await select.waitFor();
    const choices = await select.locator('option:not([value=""])').all();
    if (choices.length > 0) {
      const optionValue = await choices[0].getAttribute("value");
      const optionLabel = (await choices[0].textContent())?.trim() ?? "";
      assert(
        /^p1_[A-Za-z0-9_-]{43}$/.test(optionValue ?? ""),
        `${kind} option was not opaque.`,
      );
      await select.selectOption(optionValue);
      await select
        .locator("xpath=ancestor::form")
        .getByRole("button", { name: "Apply" })
        .click();
      await page.waitForURL((url) => url.searchParams.get(`${kind}Key`) === optionValue);
      assert(
        !decodeURIComponent(page.url()).includes(optionLabel),
        `${kind} display label leaked into the desk URL.`,
      );
      await page.getByRole("link", { name: "Clear filters" }).click();
      await page.waitForURL((url) => !url.searchParams.has(`${kind}Key`));
      await table.waitFor();
    } else {
      await page.getByText(`Filter ${kind}`, { exact: true }).click();
    }
  }

  // Native date/month inputs carry format semantics without asking operators to type a pattern.
  await page.getByText("Filter renewal date", { exact: true }).click();
  assert(
    (await page.locator('#renewal-filter-endDate[type="date"]').count()) === 1,
    "Exact renewal date is not a native date control.",
  );
  assert(
    (await page.locator('#renewal-filter-month[type="month"]').count()) === 1,
    "Renewal month is not a native month control.",
  );
  await page.getByText("Filter renewal date", { exact: true }).click();

  // Invalid URL state is explained, and the next valid interaction drops only the invalid range.
  await page.goto(
    `${baseUrl}/lease-renewal/live/desk?v=2&sort=base_rent&from=2026-12-30&through=2026-09-01`,
    { waitUntil: "domcontentloaded" },
  );
  // Scope the wait to the desk's own validation alert: a served Next build also renders the
  // framework route announcer with role="alert", which an unscoped locator matches too.
  await page.getByRole("alert", { name: "Renewal date filter problems" }).waitFor();
  assert(
    (await page
      .getByText("The range end must be on or after the range start.")
      .count()) === 1,
    "Reversed range feedback is not visible.",
  );
  await page.getByRole("button", { name: /Current base rent/ }).click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("sort") === "base_rent" &&
      !url.searchParams.has("from") &&
      !url.searchParams.has("through"),
  );
  await table.waitFor();

  // Renewal-date shortcut applies the exact date filter.
  const dateLink = page
    .locator("tbody a")
    .filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ })
    .first();
  if ((await dateLink.count()) > 0) {
    const exactDate = (await dateLink.textContent())?.trim() ?? "";
    await dateLink.click();
    await page.waitForURL((url) => url.toString().includes(`endDate=${exactDate}`));
    await page.getByRole("link", { name: "Clear filters" }).click();
    await page.waitForURL((url) => !url.toString().includes("endDate="));
    await table.waitFor();
  }

  // Open a lease from the full-row primary label, walk one phase, and return to the exact view.
  const deskUrlBefore = page.url();
  const leaseLink = page
    .locator('tbody tr[data-workspace-available="true"] a.renewal-lease-link')
    .first();
  assert((await leaseLink.count()) > 0, "No lease link rendered.");
  // S104: capture the row's own term so the workspace can be compared against it, then compared
  // again after the return trip.
  const parityRow = page.locator('tbody tr[data-workspace-available="true"]').first();
  const rowTermBefore = await parityRow
    .locator('[data-renewal-field="lease-term"]')
    .getAttribute("data-lease-term");
  const parityLeaseId = await parityRow.getAttribute("data-lease-id");
  assert(
    Boolean(rowTermBefore) && Boolean(parityLeaseId),
    "The desk row exposed no lease term to compare.",
  );
  await leaseLink.focus();
  assert(await isFocused(leaseLink), "The lease workspace link did not receive focus.");
  interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "Renewal phases" }).waitFor();
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard workspace navigation",
  );
  assert(
    page.url().includes("deskView="),
    "The workspace link dropped the desk continuation.",
  );
  const phases = page
    .getByRole("navigation", { name: "Renewal phases" })
    .getByRole("link");
  assert((await phases.count()) === 6, "The six-phase rail is incomplete.");
  await assertMinimumTargetSize(page, ".renewal-phase-link", "renewal phase");
  await phases.nth(0).focus();
  assert(
    await isFocused(phases.nth(0)),
    "The first renewal phase did not receive focus.",
  );
  interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.waitForURL(/step=verify-renewal/);
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard phase navigation",
  );
  assert(
    (await page.getByText("Data check").count()) >= 1,
    "The verify phase lost its data check.",
  );
  // S104 parity: the workspace states the same term the row it was opened from stated.
  const workspaceTerm = await page
    .locator('[data-renewal-field="lease-term"]')
    .first()
    .getAttribute("data-lease-term");
  assert(
    workspaceTerm === rowTermBefore,
    `The workspace term (${workspaceTerm}) disagrees with its desk row (${rowTermBefore}).`,
  );
  await page.getByRole("link", { name: "← Back to renewals" }).click();
  await page.waitForURL((url) => url.toString() === deskUrlBefore);
  await table.waitFor();
  // S104 continuity: the same row is back in the same view, still stating the same term.
  const rowTermAfter = await page
    .locator(`tbody tr[data-lease-id="${parityLeaseId}"]`)
    .locator('[data-renewal-field="lease-term"]')
    .getAttribute("data-lease-term");
  assert(
    rowTermAfter === rowTermBefore,
    "The returned desk row lost or changed its lease term.",
  );

  // Browser Back restores the workspace, then the desk again, without state invention.
  await page.goBack();
  await page.getByRole("navigation", { name: "Renewal phases" }).waitFor();
  await page.goBack();
  await page.goBack();
  await table.waitFor();

  await page.screenshot({ path: join(artifactDir, "desk-desktop.png"), fullPage: true });
  await context.close();
}

async function verifyNarrowAndZoom() {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DESK_ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(DESK_INTERACTION_BUDGET_MS);
  let loadStartedAt = performance.now();
  await signInAndOpen(page, "/lease-renewal/live/desk?v=2&scope=all");
  await page.locator(".renewal-table-scroll").waitFor();
  assertWithinBudget(
    loadStartedAt,
    DESK_ROUTE_DOM_BUDGET_MS,
    "Narrow Renewal Desk route and DOM",
  );
  // S84's responsive navigation resolves on the client, so a heavy server-rendered page briefly
  // paints the desktop group before the compact trigger replaces it. Measure the settled layout:
  // this assertion is about the responsive desk, not the pre-hydration frame.
  await page.locator(".primary-nav-menu-trigger").waitFor();
  assert(
    (await pageOverflow(page)) <= 1,
    "320px desk produced page-level horizontal overflow.",
  );
  const scrollRegion = page.getByRole("region", { name: "Renewal table" });
  assert(
    (await scrollRegion.getAttribute("tabindex")) === "0",
    "The contained scroll region is not keyboard reachable.",
  );
  await scrollRegion.focus();
  assert(
    await isFocused(scrollRegion),
    "The contained scroll region did not receive focus.",
  );
  const scrollBefore = await scrollRegion.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const scrollAfter = await scrollRegion.evaluate((element) => element.scrollLeft);
  assert(
    scrollAfter > scrollBefore,
    "Keyboard input did not move the contained table scroll.",
  );
  await page.screenshot({ path: join(artifactDir, "desk-320.png"), fullPage: true });
  await context.close();

  const zoomContext = await browser.newContext({ viewport: { width: 680, height: 450 } });
  const zoomPage = await zoomContext.newPage();
  zoomPage.setDefaultNavigationTimeout(DESK_ROUTE_DOM_BUDGET_MS);
  zoomPage.setDefaultTimeout(DESK_INTERACTION_BUDGET_MS);
  const cdp = await zoomContext.newCDPSession(zoomPage);
  // Desktop 200% browser zoom exposes half of the physical viewport in CSS pixels. CDP device
  // metrics reproduce that layout/reflow contract (unlike pageScaleFactor, which is only pinch zoom).
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 340,
    height: 225,
    deviceScaleFactor: 2,
    mobile: false,
  });
  loadStartedAt = performance.now();
  await signInAndOpen(zoomPage, "/lease-renewal/live/desk?v=2&scope=all");
  await zoomPage.locator(".renewal-table-scroll").waitFor();
  assertWithinBudget(
    loadStartedAt,
    DESK_ROUTE_DOM_BUDGET_MS,
    "Zoomed Renewal Desk route and DOM",
  );
  const zoomMetrics = await zoomPage.evaluate(() => ({
    cssWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
  }));
  assert(
    zoomMetrics.cssWidth <= 340 && zoomMetrics.devicePixelRatio >= 1.99,
    `Chromium did not apply the 200% layout equivalent (${JSON.stringify(zoomMetrics)}).`,
  );
  assert(
    (await pageOverflow(zoomPage)) <= 1,
    "Desk produced page-level overflow at the 200% Chromium layout equivalent.",
  );
  await zoomPage.screenshot({
    path: join(artifactDir, "desk-zoom-200.png"),
    fullPage: true,
  });
  await zoomContext.close();
}

async function signInAndOpen(page, path) {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Admin" }),
    });
    return response.ok;
  });
  assert(signedIn, "Local rehearsal Admin sign-in did not complete.");
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
  });
  assert(response && response.status() < 500, `${path} returned an error response.`);
}

async function assertFullCohortIntegrity(page) {
  const countText = await page.locator(".renewal-table-count").innerText();
  const match = countText.match(
    /Matching:\s*(\d+)\s*·\s*Selected scope:\s*(\d+)\s*·\s*Total loaded:\s*(\d+)/,
  );
  assert(Boolean(match), "The full-cohort count could not be parsed.");
  const matching = Number(match[1]);
  const selectedScope = Number(match[2]);
  const totalLoaded = Number(match[3]);
  assert(totalLoaded > 0, "The full-cohort smoke loaded no lease rows.");
  assert(
    matching === selectedScope && selectedScope === totalLoaded,
    `scope=all did not expose the full cohort (${matching}/${selectedScope}/${totalLoaded}).`,
  );

  const rowFacts = await page
    .locator("table.renewal-table tbody tr[data-lease-id]")
    .evaluateAll((rows) =>
      rows.map((row) => {
        const actionCell = row.querySelector('[data-renewal-field="action"]');
        return {
          id: row.getAttribute("data-lease-id") ?? "",
          workspaceAvailable: row.getAttribute("data-workspace-available") === "true",
          workspaceHrefs: [...row.querySelectorAll("a.renewal-lease-link")].map(
            (link) => link.href,
          ),
          sourceLinks: [...row.querySelectorAll("a.renewal-source-link")].map((link) => ({
            href: link.href,
            target: link.getAttribute("target") ?? "",
            rel: link.getAttribute("rel") ?? "",
          })),
          blockerCount: Number(row.getAttribute("data-blocker-count") ?? "-1"),
          blockers: [
            ...row.querySelectorAll('[data-renewal-field="action"] li[data-blocker-id]'),
          ].map((blocker) => ({
            destinationKind: blocker.getAttribute("data-blocker-destination-kind") ?? "",
            stepId: blocker.getAttribute("data-blocker-step-id") ?? "",
            hrefs: [...blocker.querySelectorAll("a")].map((link) => link.href),
          })),
          actionDestinationKind:
            actionCell?.getAttribute("data-action-destination-kind") ?? "",
          actionStepId: actionCell?.getAttribute("data-action-step-id") ?? "",
          actionHrefs: [...(actionCell?.querySelectorAll("a") ?? [])].map(
            (link) => link.href,
          ),
        };
      }),
    );

  assert(
    rowFacts.length === totalLoaded,
    `The table rendered ${rowFacts.length} rows for ${totalLoaded} loaded leases.`,
  );
  // S103: every rendered row states its lease term in the documented vocabulary.
  const terms = await page
    .locator('table.renewal-table tbody [data-renewal-field="lease-term"]')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-lease-term")));
  assert(
    terms.length === rowFacts.length,
    `The table rendered ${terms.length} lease terms for ${rowFacts.length} rows.`,
  );
  assert(
    terms.every((term) =>
      ["fixed_term", "month_to_month", "needs_review"].includes(term ?? ""),
    ),
    "A row rendered a lease term outside the documented vocabulary.",
  );

  const stableIds = rowFacts.map((row) => row.id).filter(Boolean);
  assert(
    new Set(stableIds).size === stableIds.length,
    "The full cohort rendered a duplicate nonblank lease id.",
  );
  const workspaceHrefs = rowFacts.flatMap((row) => row.workspaceHrefs);
  assert(
    new Set(workspaceHrefs).size === workspaceHrefs.length,
    "The full cohort rendered a duplicate workspace destination.",
  );

  for (const row of rowFacts) {
    const expectedWorkspaceLinks = row.workspaceAvailable ? 1 : 0;
    assert(
      row.workspaceHrefs.length === expectedWorkspaceLinks,
      `Lease ${row.id || "without a stable id"} rendered ${row.workspaceHrefs.length} workspace links; expected ${expectedWorkspaceLinks}.`,
    );
    if (row.workspaceAvailable) {
      assert(row.id !== "", "A workspace-available row has no stable lease id.");
      assertWorkspaceDestination(row.workspaceHrefs[0], row.id);
    }

    assert(
      row.sourceLinks.length <= 1,
      `Lease ${row.id || "without a stable id"} rendered duplicate RentVine destinations.`,
    );
    if (row.sourceLinks.length === 1) {
      const source = row.sourceLinks[0];
      const sourceUrl = new URL(source.href);
      assert(
        sourceUrl.protocol === "https:" &&
          sourceUrl.hostname === "pmikcmetro.rentvine.com",
        `Lease ${row.id} rendered an invalid RentVine destination.`,
      );
      assert(
        rentvineLeaseId(sourceUrl) === row.id,
        `Lease ${row.id} rendered a RentVine destination for another lease.`,
      );
      assert(
        source.target === "_blank",
        `Lease ${row.id} source link lost new-tab behavior.`,
      );
      const rel = new Set(source.rel.split(/\s+/).filter(Boolean));
      assert(
        rel.has("noopener") && rel.has("noreferrer"),
        `Lease ${row.id} source link lost protected rel tokens.`,
      );
    }

    assert(
      Number.isInteger(row.blockerCount) && row.blockerCount === row.blockers.length,
      `Lease ${row.id || "without a stable id"} blocker count disagrees with its rendered blockers.`,
    );
    for (const blocker of row.blockers) {
      const expectedLinks =
        blocker.destinationKind === "workspace_phase" && row.workspaceAvailable ? 1 : 0;
      assert(
        blocker.hrefs.length === expectedLinks,
        `Lease ${row.id} rendered the wrong blocker-destination cardinality.`,
      );
      if (expectedLinks === 1) {
        assertWorkspaceDestination(blocker.hrefs[0], row.id, blocker.stepId);
      }
    }

    const expectedActionLinks =
      row.blockers.length > 0
        ? row.blockers.filter(
            (blocker) =>
              blocker.destinationKind === "workspace_phase" && row.workspaceAvailable,
          ).length
        : row.actionDestinationKind === "workspace_phase" && row.workspaceAvailable
          ? 1
          : 0;
    assert(
      row.actionHrefs.length === expectedActionLinks,
      `Lease ${row.id || "without a stable id"} rendered the wrong action-destination cardinality.`,
    );
    if (row.blockers.length === 0 && expectedActionLinks === 1) {
      assertWorkspaceDestination(row.actionHrefs[0], row.id, row.actionStepId);
    }
  }
}

function assertWorkspaceDestination(href, leaseId, stepId) {
  const destination = new URL(href);
  assert(
    destination.origin === baseUrl,
    `Lease ${leaseId} workspace destination left the local rehearsal origin.`,
  );
  const destinationLeaseId = decodeURIComponent(
    destination.pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
  assert(
    destinationLeaseId === leaseId,
    `Lease ${leaseId} workspace destination targets another lease.`,
  );
  if (stepId && stepId !== "none") {
    assert(
      destination.searchParams.get("step") === stepId,
      `Lease ${leaseId} destination dropped phase ${stepId}.`,
    );
  }
}

function rentvineLeaseId(url) {
  return (
    url.pathname.match(/\/leases?\/(\d+)/i)?.[1] ??
    url.hash.match(/\/leases?\/(\d+)/i)?.[1] ??
    [...url.searchParams.entries()].find(([key]) => /^lease(?:id)?$/i.test(key))?.[1] ??
    null
  );
}

async function isFocused(locator) {
  return locator.evaluate((element) => document.activeElement === element);
}

function assertWithinBudget(startedAt, budgetMs, label) {
  const elapsedMs = performance.now() - startedAt;
  assert(elapsedMs <= budgetMs, `${label} exceeded ${budgetMs} ms (${elapsedMs} ms).`);
}

async function pageOverflow(page) {
  return page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
  );
}

async function assertMinimumTargetSize(page, selector, label) {
  const sizes = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  assert(sizes.length > 0, `No ${label} target rendered.`);
  const undersized = sizes.find((size) => size.width < 43.5 || size.height < 43.5);
  assert(
    !undersized,
    `${label} target was smaller than 44 CSS px (${undersized?.width}x${undersized?.height}).`,
  );
}

function findBrowserExecutable() {
  const configured = process.env.DESK_BROWSER_EXECUTABLE?.trim();
  const candidates = configured
    ? [configured]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
      ];
  const executable = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!executable) {
    throw new Error("Chrome or Edge was not found for the S82 browser smoke.");
  }
  return executable;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readArgument(name) {
  const joined = process.argv
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
  if (joined) return joined;
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || undefined;
}

function requireLocalRehearsalOrigin(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    candidate.protocol !== "http:" ||
    !loopbackHosts.has(candidate.hostname.toLowerCase()) ||
    candidate.username !== "" ||
    candidate.password !== "" ||
    candidate.pathname !== "/" ||
    candidate.search !== "" ||
    candidate.hash !== ""
  ) {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  return candidate.origin;
}

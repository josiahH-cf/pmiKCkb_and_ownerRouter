import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S82 real-browser smoke for the table-first renewal desk and guided workspace.
//
// Runs read-only against the local rehearsal server (live-read-only sources; no mutation route is
// ever called). It proves table semantics, header sort/filter behavior, exact-value shortcuts,
// chips/clear recovery, workspace section navigation, desk-view return continuity, browser Back,
// narrow contained scroll, and a Chromium 200%-zoom layout equivalent without page-level overflow.
//
// S246: the bare desk route opens the working batch, so the smoke first proves that default view
// (month and count in words, every loaded lease counted once, month and count controls, same-tab
// lease navigation and return, no write) and then runs every table check, unchanged, on the
// explicit table view over every loaded lease.
//
// S252: against the one-path rehearsal, serve it outside the rehearsal exemption, as a verification
// session's server is: `bash scripts/run-renewal-one-path-rehearsal.sh --serve --no-mail-adapter`.
// With the Demo-owned mail adapter the server says it is the isolated rehearsal, and opening the
// working batch then starts the S249 preparation by itself in an automated browser, which is a
// write this read-only smoke refuses to accept.

import { mkdirSync } from "node:fs";
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
const WORKFLOW_ROW_SELECTOR =
  'tbody tr[data-workspace-available="true"]:is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"])';
const WORKING_BATCH_SELECTOR = 'section[aria-label="Working batch"]';
// lib/lease-renewal/renewal-issues.ts NON_RENEWAL_HANDOFF_TARGET_ID: where the S124 handoff opens.
const NON_RENEWAL_HANDOFF_TARGET_ID = "renewal-manual-non_renewal_handoff";
const WORKING_BATCH_COUNT_GROUPS = [
  "renewed_in_rentvine",
  "month_to_month_reviews",
  "non_renewals",
  "coming_up_later",
  "not_targets",
  "completed",
];

const artifactDir = join(process.cwd(), "temp", "renewal-desk-browser-s82");
mkdirSync(artifactDir, { recursive: true });

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

try {
  await verifyWorkingBatch();
  await verifyDeskAndWorkspace();
  await verifyNarrowAndZoom();
} finally {
  await browser.close();
}

process.stdout.write(
  `S82 renewal desk browser smoke passed: working batch default (month and count in words, groups sum to the loaded leases, month and count controls, same-tab lease and return, no write), full-cohort cardinality, unique rows/destinations, bounded load, keyboard sort/filter/navigation, 44px targets, table semantics, shortcuts, chips/clear, workspace sections, desk/workspace term parity, deskView return, Back, narrow contained scroll, zoom overflow. Artifacts: ${artifactDir}\n`,
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

  // Owner/tenant filters are discoverable header controls. Choices submit only opaque tokens: p1_
  // over the normalized label, or p2_ over the verified RentVine contact id (lib/lease-renewal/
  // party-filter-key.ts), each the whole HMAC-SHA-256 digest; the app's own pattern is
  // PARTY_FILTER_TOKEN_PATTERN in lib/lease-renewal/desk-query-v2.ts.
  for (const kind of ["owner", "tenant"]) {
    await page.getByText(`Filter ${kind}`, { exact: true }).click();
    const select = page.locator(`#renewal-filter-${kind}Key`);
    await select.waitFor();
    const choices = await select.locator('option:not([value=""])').all();
    if (choices.length > 0) {
      const optionValue = await choices[0].getAttribute("value");
      const optionLabel = (await choices[0].textContent())?.trim() ?? "";
      assert(
        /^p[12]_[A-Za-z0-9_-]{43}$/.test(optionValue ?? ""),
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

  // Open a lease from the full-row primary label, walk one section, and return to the exact view.
  const deskUrlBefore = page.url();
  // S154: a lease outside the worklist (out of window, under review, or outside by its source
  // marker) is a real lease that opens the same working surface as any other. Verify that branch
  // separately: no inspection-only card, the same section navigation, its data check in place.
  const outsideWorklistLink = page
    .locator(
      'tbody tr[data-workspace-available="true"]:not([data-disposition="actionable"]):not([data-retention-state="tracked_incomplete"]) a.renewal-lease-link',
    )
    .first();
  if (await outsideWorklistLink.count()) {
    interactionStartedAt = performance.now();
    await outsideWorklistLink.click();
    await page.getByRole("navigation", { name: "Renewal dashboard sections" }).waitFor();
    assertWithinBudget(
      interactionStartedAt,
      DESK_INTERACTION_BUDGET_MS,
      "Outside-worklist workspace navigation",
    );
    assert(
      (await page
        .getByRole("heading", { name: "Inspection only", exact: true })
        .count()) === 0 &&
        (await page
          .getByRole("navigation", { name: "Renewal dashboard sections" })
          .getByRole("link")
          .count()) === 5 &&
        (await page.getByText("Data check").count()) >= 1,
      "A lease outside the worklist did not open the full working surface.",
    );
    await page.getByRole("link", { name: "← Back to renewals" }).click();
    await page.waitForURL((url) => url.toString() === deskUrlBefore);
    await table.waitFor();
    process.stdout.write("Outside-worklist lease opened the full working surface.\n");
  } else {
    process.stdout.write(
      "Outside-worklist branch not present in the current source cohort.\n",
    );
  }
  const leaseLink = page.locator(`${WORKFLOW_ROW_SELECTOR} a.renewal-lease-link`).first();
  assert((await leaseLink.count()) > 0, "No lease link rendered.");
  // S104: capture the row's own term so the workspace can be compared against it, then compared
  // again after the return trip.
  const parityRow = page.locator(WORKFLOW_ROW_SELECTOR).first();
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
  await page.getByRole("navigation", { name: "Renewal dashboard sections" }).waitFor();
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard workspace navigation",
  );
  assert(
    page.url().includes("deskView="),
    "The workspace link dropped the desk continuation.",
  );
  const sections = page
    .getByRole("navigation", { name: "Renewal dashboard sections" })
    .getByRole("link");
  assert((await sections.count()) === 5, "The five-section dashboard is incomplete.");
  await assertMinimumTargetSize(
    page,
    '[aria-label="Renewal dashboard sections"] .renewal-workspace-link',
    "renewal section",
  );
  await sections.nth(0).focus();
  assert(
    await isFocused(sections.nth(0)),
    "The first renewal section did not receive focus.",
  );
  interactionStartedAt = performance.now();
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.hash === "#renewal-section-lease-details");
  assertWithinBudget(
    interactionStartedAt,
    DESK_INTERACTION_BUDGET_MS,
    "Keyboard section navigation",
  );
  assert(
    (await page.getByText("Data check").count()) >= 1,
    "Lease details lost its data check.",
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
  await page.getByRole("navigation", { name: "Renewal dashboard sections" }).waitFor();
  await page.goBack();
  await page.goBack();
  await table.waitFor();

  await page.screenshot({ path: join(artifactDir, "desk-desktop.png"), fullPage: true });
  await context.close();
}

// S246: the bare desk route is the ordinary entry and opens the working batch, a presentation
// over the same loaded leases. Read-only: this changes the month, opens a count and a lease and
// returns. The two recording actions under "Renewed in RentVine" are never chosen, and any write
// after the local sign-in fails the smoke.
async function verifyWorkingBatch() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DESK_ROUTE_DOM_BUDGET_MS);
  page.setDefaultTimeout(DESK_INTERACTION_BUDGET_MS);
  const writes = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === baseUrl &&
      url.pathname !== "/api/auth/demo" &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    )
      writes.push(`${request.method()} ${url.pathname}`);
  });
  const loadStartedAt = performance.now();
  await signInAndOpen(page, "/lease-renewal/live/desk");

  const batch = page.locator(WORKING_BATCH_SELECTOR);
  await batch.waitFor();
  assertWithinBudget(
    loadStartedAt,
    DESK_ROUTE_DOM_BUDGET_MS,
    "Working batch route and DOM",
  );
  assert(
    (await page.locator('[data-desk-surface="batch"]').count()) === 1,
    "The bare desk route did not open the working batch.",
  );
  assert(
    (await page.locator("table.renewal-table").count()) === 0,
    "The bare desk route rendered the table beside the working batch.",
  );
  assert(
    (await page.getByRole("heading", { name: "Renewals", exact: true }).count()) === 1,
    "The working batch lost the Renewals heading.",
  );

  // The working month is the next calendar month on the Central business date, in words.
  const defaultMonth = nextCentralMonth();
  assert(
    (await batch.getAttribute("data-batch-month")) === defaultMonth,
    `The working month is not the next calendar month (${defaultMonth}).`,
  );
  const summary = (await page.locator(".renewal-batch-summary").innerText()).trim();
  assert(
    /^(?:No leases|One lease|[A-Z][a-z]+ leases|\d+ leases) ending in [A-Z][a-z]+ \d{4} needs? renewal work\.$/.test(
      summary,
    ),
    `The working month and count are not stated in words (${summary}).`,
  );
  const facts = await readWorkingBatch(page);
  assert(facts.total > 0, "The working batch loaded no lease.");
  assert(
    facts.statedCount === facts.current.length,
    `The stated count (${facts.statedCount}) disagrees with This batch (${facts.current.length}).`,
  );
  assert(
    facts.counts.map((entry) => entry.group).join(",") ===
      WORKING_BATCH_COUNT_GROUPS.join(","),
    "The counted groups changed.",
  );
  // Every loaded lease is in exactly one group: the two lists and the counts sum to the total.
  const counted = facts.counts.reduce((sum, entry) => sum + entry.count, 0);
  assert(
    facts.carried.length + facts.current.length + counted === facts.total,
    `The groups do not sum to the loaded leases (${facts.carried.length} + ${facts.current.length} + ${counted} of ${facts.total}).`,
  );
  const listedIds = [...facts.carried, ...facts.current].filter(Boolean);
  assert(
    new Set(listedIds).size === listedIds.length,
    "A lease is listed twice in the working batch.",
  );
  for (const row of facts.workRows) {
    assert(
      row.stageLines === 1 && row.nextSteps <= 1 && row.tags <= 3,
      `Batch row ${row.id || "without a stable id"} is not one stage line, one next step and at most three tags.`,
    );
    assert(
      row.newTabLinks === 0 && row.nameLinks === 0,
      `Batch row ${row.id || "without a stable id"} opens a new tab or links a tenant name.`,
    );
  }
  await assertMinimumTargetSize(
    page,
    ".renewal-batch-month-link",
    "working month control",
  );
  await assertMinimumTargetSize(page, "button.renewal-batch-count", "group count");
  await assertMinimumTargetSize(page, ".renewal-batch-views a", "other view link");
  if ((await page.locator("[data-batch-next-step]").count()) > 0)
    await assertMinimumTargetSize(page, "[data-batch-next-step]", "batch next-step link");
  assert((await pageOverflow(page)) <= 1, "The working batch overflowed the page.");

  // Next month and Previous month change the month and keep every lease counted.
  const laterMonth = shiftMonth(defaultMonth, 1);
  let interactionStartedAt = performance.now();
  await page.getByRole("link", { name: "Next month", exact: true }).click();
  await page
    .locator(`${WORKING_BATCH_SELECTOR}[data-batch-month="${laterMonth}"]`)
    .waitFor();
  assertWithinBudget(interactionStartedAt, DESK_INTERACTION_BUDGET_MS, "Next month");
  assert(
    new URL(page.url()).searchParams.get("batch") === laterMonth,
    "Next month did not put the month in the address.",
  );
  const later = await readWorkingBatch(page);
  assert(
    later.total === facts.total &&
      later.carried.length +
        later.current.length +
        later.counts.reduce((sum, entry) => sum + entry.count, 0) ===
        later.total,
    "Changing the month lost or duplicated a lease.",
  );
  await page.getByRole("link", { name: "Previous month", exact: true }).click();
  await page
    .locator(`${WORKING_BATCH_SELECTOR}[data-batch-month="${defaultMonth}"]`)
    .waitFor();
  assert(
    new URL(page.url()).search === "",
    "The default working month did not return to the bare desk route.",
  );

  // A count opens its rows and closes again.
  const openable = facts.counts.find((entry) => entry.count > 0);
  if (openable) {
    const control = page.locator(`button[data-batch-group="${openable.group}"]`);
    await control.focus();
    assert(await isFocused(control), "The group count did not receive focus.");
    await page.keyboard.press("Enter");
    const panel = page.locator(`[data-batch-open-group="${openable.group}"]`);
    await panel.waitFor();
    assert(
      (await control.getAttribute("aria-expanded")) === "true",
      "The opened count is not marked expanded.",
    );
    assert(
      (await panel.locator("li[data-batch-lease]").count()) === openable.count,
      `The ${openable.group} count does not match the rows it opens.`,
    );
    if (openable.group === "not_targets") {
      const reasons = await panel
        .locator("[data-batch-reason-count]")
        .evaluateAll((items) =>
          items.reduce(
            (sum, item) => sum + Number(item.getAttribute("data-batch-reason-count")),
            0,
          ),
        );
      assert(
        reasons === openable.count,
        "The not-a-target reasons do not sum to their count.",
      );
    }
    await control.click();
    await panel.waitFor({ state: "detached" });
  }

  // All leases and filters opens the table over the same loaded leases, in this tab.
  await page.getByRole("link", { name: "All leases and filters", exact: true }).click();
  await page.waitForURL(
    (url) => url.toString() === `${baseUrl}/lease-renewal/live/desk?v=2&scope=all`,
  );
  await page.locator("table.renewal-table").waitFor();
  const tableCount = await page.locator(".renewal-table-count").innerText();
  const totalLoaded = Number(tableCount.match(/Total loaded:\s*(\d+)/)?.[1] ?? "-1");
  assert(
    totalLoaded === facts.total,
    `The working batch counted ${facts.total} leases; the table loaded ${totalLoaded}.`,
  );
  await page.goBack();
  await batch.waitFor();

  // A lease opens in this tab, and Back to renewals returns to the same batch.
  const leaseLink = page
    .locator(`${WORKING_BATCH_SELECTOR} a.renewal-batch-lease`)
    .first();
  if ((await leaseLink.count()) > 0) {
    const batchUrl = page.url();
    interactionStartedAt = performance.now();
    await leaseLink.click();
    await page.waitForURL((url) =>
      url.pathname.startsWith("/lease-renewal/live/desk/lease/"),
    );
    await page.getByRole("link", { name: "← Back to renewals" }).waitFor();
    assertWithinBudget(
      interactionStartedAt,
      DESK_INTERACTION_BUDGET_MS,
      "Working batch lease navigation",
    );
    assert(context.pages().length === 1, "A batch lease opened a second tab.");
    assert(
      (await page.locator("[data-renewal-target]").count()) >= 1,
      "The lease page does not state its renewal target verdict.",
    );
    await page.getByRole("link", { name: "← Back to renewals" }).click();
    await page.waitForURL((url) => url.toString() === batchUrl);
    await batch.waitFor();
  } else {
    process.stdout.write("No openable lease is listed in the working batch right now.\n");
  }

  assert(writes.length === 0, `The working batch issued a write (${writes.join(", ")}).`);
  await page.screenshot({
    path: join(artifactDir, "desk-working-batch.png"),
    fullPage: true,
  });
  await context.close();
  process.stdout.write(
    `Working batch default verified: ${facts.total} loaded leases counted once across its groups.\n`,
  );
}

async function readWorkingBatch(page) {
  return page.locator(WORKING_BATCH_SELECTOR).evaluate((root) => {
    const leases = (selector) =>
      [...root.querySelectorAll(selector)].map(
        (row) => row.getAttribute("data-batch-lease") ?? "",
      );
    return {
      total: Number(root.getAttribute("data-batch-total") ?? "-1"),
      statedCount: Number(
        root.querySelector(".renewal-batch-summary")?.getAttribute("data-batch-count") ??
          "-1",
      ),
      carried: leases('[data-batch-list="carried_over"] li[data-batch-lease]'),
      current: leases('[data-batch-list="this_batch"] li[data-batch-lease]'),
      counts: [...root.querySelectorAll("button[data-batch-group]")].map((button) => ({
        group: button.getAttribute("data-batch-group") ?? "",
        count: Number(button.getAttribute("data-batch-count") ?? "-1"),
      })),
      workRows: [
        ...root.querySelectorAll('li[data-batch-lease][data-batch-row-kind="work"]'),
      ].map((row) => ({
        id: row.getAttribute("data-batch-lease") ?? "",
        stageLines: row.querySelectorAll(".renewal-batch-stage").length,
        nextSteps: row.querySelectorAll("[data-batch-next-step]").length,
        tags: row.querySelectorAll("[data-batch-tag]").length,
        newTabLinks: row.querySelectorAll("a[target]").length,
        nameLinks: row.querySelectorAll(".renewal-batch-tenants a").length,
      })),
    };
  });
}

/** `YYYY-MM` of the month after today's America/Chicago business date. */
function nextCentralMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return shiftMonth(`${year}-${String(month).padStart(2, "0")}`, 1);
}

function shiftMonth(month, delta) {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
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
          // S252: the action cell also holds the S127 issue summary, whose only link is the S124
          // non-renewal handoff for a confirmed move-out. That link is its own destination and is
          // checked exactly below; it is never an action destination.
          actionHrefs: [...(actionCell?.querySelectorAll("a") ?? [])]
            .filter((link) => !link.closest(".renewal-issue-summary"))
            .map((link) => link.href),
          issueSummaries: [
            ...(actionCell?.querySelectorAll(".renewal-issue-summary") ?? []),
          ].map((summary) => ({
            redirect: summary.getAttribute("data-renewal-primary-redirect") ?? "",
            hrefs: [...summary.querySelectorAll("a")].map((link) => link.href),
          })),
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

    // At most one issue summary per row. A confirmed move-out redirects to the non-renewal handoff
    // with exactly one link: this lease's workspace at the handoff's own place, in this tab. Any
    // other summary is text only.
    assert(
      row.issueSummaries.length <= 1,
      `Lease ${row.id} rendered more than one issue summary.`,
    );
    for (const summary of row.issueSummaries) {
      const expectedHandoffLinks =
        summary.redirect === "non_renewal_handoff" && row.workspaceAvailable ? 1 : 0;
      assert(
        summary.hrefs.length === expectedHandoffLinks,
        `Lease ${row.id} rendered the wrong non-renewal handoff link cardinality.`,
      );
      if (expectedHandoffLinks === 1) {
        assertWorkspaceDestination(summary.hrefs[0], row.id, "none");
        assert(
          new URL(summary.hrefs[0]).hash === `#${NON_RENEWAL_HANDOFF_TARGET_ID}`,
          `Lease ${row.id} non-renewal handoff link does not open the handoff.`,
        );
      }
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

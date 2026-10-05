// Local compiled application checks. This harness cannot target production or write business data.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { createRequire } from "node:module";
import setup from "../e2e/global-setup.mjs";
import { createLocalZoomContext } from "./local-zoom.mjs";

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ""))
  throw new Error("An isolated local Firestore emulator is required");
if (process.env.FIREBASE_PROJECT_ID !== "pmi-kc-kb-batch005-browser-test")
  throw new Error("The program browser checks require their isolated test project");
assert.match(process.cwd(), /^\/tmp\/pmi-kc-vitest-run-[^/]+\/worktree$/);
const vendorFixtureDirectory = join(process.cwd(), "app/vendor/batch005-fixture");
assert.equal(
  existsSync(vendorFixtureDirectory),
  false,
  "A fresh private fixture mount is required",
);
mkdirSync(vendorFixtureDirectory, { recursive: true });
writeFileSync(
  join(vendorFixtureDirectory, "page.tsx"),
  'export { VendorFixturePage as default } from "@/tests/browser/owner-fixtures";\n',
  { flag: "wx" },
);
let origin;
const setupStarted = performance.now();
const teardown = await setup({
  provide(key, value) {
    if (key === "e2eBaseUrl") origin = value;
  },
});
const setupAndWarmupMs = Math.round(performance.now() - setupStarted);
assert.equal(new URL(origin).hostname, "localhost");
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const observations = [];
const journeys = [];
const errors = [];
const refused = [];
const accessibility = [];
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
let lastPage;
const stamp = new Date().toISOString().replaceAll(":", "-");
const output = join(
  process.env.BATCH005_PRIVATE_OUTPUT ?? "/tmp",
  `batch005-browser-${stamp}`,
);
mkdirSync(output, { recursive: true, mode: 0o700 });
async function session(role = "Admin", width = 1440, deviceScaleFactor = 1) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  return initializeSession(context, role);
}
async function initializeSession(context, role = "Admin") {
  const login = await context.request.post(`${origin}/api/auth/demo`, { data: { role } });
  assert.equal(login.status(), 200);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const harmless =
      (request.method() === "GET" &&
        !/\/chat\/sync|\/oauth\/connect|\/watch\/start/.test(path)) ||
      (request.method() === "POST" &&
        [
          "/api/personal-view",
          "/api/auth/demo",
          "/api/ask",
          "/api/assistant/query",
          "/api/admin/access/review",
        ].includes(path));
    if (harmless) return route.continue();
    refused.push({
      method: request.method(),
      path: path.replace(/\/\d+(?=\/|$)/g, "/[id]"),
    });
    return route.abort("blockedbyclient");
  });
  return context;
}
async function open(page, path, label = path) {
  lastPage = page;
  const start = performance.now();
  const response = await page.goto(`${origin}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page
    .locator("section.content, main, .vendor-shell, .auth-card")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(async () => {
      assert.ok(
        await page.locator("h1").count(),
        "route must have a visible destination or guard",
      );
    });
  const status = response?.status();
  assert.ok(status < 500, `${label}: server failure`);
  observations.push({
    route: label,
    width: await page.evaluate(() => innerWidth),
    deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
    theme: await page.evaluate(() => document.documentElement.dataset.theme),
    readyMs: Math.round(performance.now() - start),
    status,
    guarded: new URL(page.url()).pathname === "/sign-in",
    navigation: await page.evaluate(() => {
      const timing = performance.getEntriesByType("navigation")[0];
      return timing
        ? {
            requestToResponseMs: Math.round(timing.responseStart - timing.requestStart),
            responseTransferMs: Math.round(timing.responseEnd - timing.responseStart),
            responseToDomMs: Math.round(
              timing.domContentLoadedEventEnd - timing.responseEnd,
            ),
          }
        : null;
    }),
  });
  if (observations.length % 10 === 0)
    console.log(
      JSON.stringify({
        phase: "route_matrix",
        observed: observations.length,
        lastRoute: label,
      }),
    );
}
async function viewportCheck(page, label) {
  const result = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    headings: [...document.querySelectorAll("h1")].filter(
      (node) => node.getClientRects().length,
    ).length,
    unnamed: [
      ...document.querySelectorAll("button, input:not([type=hidden]),select,textarea"),
    ]
      .filter(
        (node) =>
          node.getClientRects().length &&
          !node.getAttribute("aria-label") &&
          !node.getAttribute("aria-labelledby") &&
          !node.labels?.length &&
          !(
            node.tagName === "BUTTON" &&
            (node.textContent?.trim() || node.querySelector(".sr-only"))
          ),
      )
      .map((node) => node.tagName),
  }));
  assert.ok(
    result.documentWidth <= result.width + 2,
    `${label}: document overflows ${JSON.stringify(result)}`,
  );
  assert.ok(result.headings > 0, `${label}: missing primary task or guard`);
  assert.deepEqual(result.unnamed, [], `${label}: unnamed reachable control`);
  return result;
}
async function confirmedPreference(context, predicate, label = "requested view") {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const response = await context.request.get(
      `${origin}/api/personal-view?surface=renewals`,
    );
    assert.equal(response.status(), 200);
    const preference = (await response.json()).preference;
    last = preference;
    if (predicate(preference)) return preference;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `The actual saved preference did not acknowledge ${label}: ${JSON.stringify(last)}`,
  );
}
async function withinViewport(locator) {
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  const viewport = await locator
    .page()
    .evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(
    rect &&
      rect.x >= -2 &&
      rect.y >= -2 &&
      rect.x + rect.width <= viewport.width + 2 &&
      rect.y + rect.height <= viewport.height + 2,
    "The active control must remain in the viewport",
  );
  assert.ok(
    await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const top = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + Math.min(rect.height / 2, 20),
      );
      return top === node || node.contains(top);
    }),
    "Fixed utilities must not cover the current control",
  );
}
async function accessibilityCheck(page, label) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const audit = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return {
      violations: audit.violations.map((issue) => ({
        id: issue.id,
        targets: issue.nodes.map((node) => node.target),
      })),
      passedRules: audit.passes.map((issue) => issue.id),
    };
  });
  accessibility.push({ route: label, ...result });
  assert.deepEqual(result.violations, [], `${label}: compiled accessibility violations`);
}
try {
  const admin = await session();
  const page = await admin.newPage();
  page.on("pageerror", (error) =>
    errors.push(error.message.replace(/https?:\/\/\S+/g, "[url]")),
  );
  await open(page, "/lease-renewal/live/desk?v=2&scope=all", "renewal_desk:first");
  const leaseId = await page
    .locator("[data-lease-id]")
    .first()
    .getAttribute("data-lease-id");
  assert.ok(
    /^\d+$/.test(leaseId ?? ""),
    "The configured source must expose a real resolved lease for this program check",
  );
  const count = await page.locator("[data-lease-id]").count();
  const fixtures = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("./batch005-fixtures.ts", import.meta.url)),
      ],
      { encoding: "utf8" },
    ),
  );
  await open(page, "/lease-renewal/live/desk?v=2&scope=all", "renewal_desk:repeat");
  assert.equal(await page.locator("[data-lease-id]").count(), count);

  const routes = [
    "/",
    "/ask",
    "/work",
    "/admin/team-work",
    "/approval-queue",
    "/connections",
    "/gmail-hub",
    "/admin/gmail-inbox-zero",
    "/admin",
    "/admin/access",
    "/admin/users",
    "/admin/migration",
    "/admin/vendors",
    "/admin/spaces/request",
    "/notifications",
    "/spaces",
    "/spaces/lease-renewals",
    "/spaces/owner-email",
    "/spaces/lease-renewals/pages/fixture-unpublished",
    fixtures.pagePath,
    "/processes",
    "/processes/lease-renewal",
    "/workflow-runs/demo-lease-renewal-run",
    "/maintenance",
    "/maintenance/report",
    "/lease-renewal",
    "/lease-renewal/live",
    "/lease-renewal/live/desk?v=2&scope=all",
    "/lease-renewal/live/notices",
    "/lease-renewal/runs",
    "/lease-renewal/runs/fixture-unavailable",
    "/lease-renewal/runs/fixture-unavailable/reconciliation/fixture-unavailable",
    "/vendor",
    "/vendor/setup",
    "/vendor/sign-in",
    "/vendor/tickets/fixture-unauthorized",
    "/vendor/batch005-fixture",
    "/vendor/batch005-fixture?state=empty",
    "/sign-in",
  ];
  const leasePath = `/lease-renewal/live/desk/lease/${leaseId}`;
  // This legacy route's local empty-state fixture asserts that unavailable history stays honest.
  routes.push(
    leasePath,
    `/lease-renewal/lease/${leaseId}`,
    "/lease-renewal/property/fixture-local-unavailable",
  );
  async function runRouteMatrix() {
    for (const theme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const width of [320, 390, 1100, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of routes) {
          const label = path.replace(leaseId, "[leaseId]");
          await open(page, path, label);
          await viewportCheck(page, label);
          await page.waitForLoadState("networkidle");
          await viewportCheck(page, `${label}:settled`);
          if (width === 320 || width === 1440)
            await accessibilityCheck(page, `${theme}:${width}:${label}`);
        }
      }
    }
    const nativeZoom = await createLocalZoomContext(origin);
    const zoom = await initializeSession(nativeZoom.context);
    const zoomPage = await zoom.newPage();
    await zoomPage.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await nativeZoom.setZoom(zoomPage, 2);
    for (const theme of ["dark", "light"]) {
      await zoomPage.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const path of routes) {
        await open(
          zoomPage,
          path,
          `${path.replace(leaseId, "[leaseId]")}:200_percent_browser_zoom`,
        );
        await nativeZoom.setZoom(zoomPage, 2);
        assert.equal(await zoomPage.evaluate(() => devicePixelRatio), 2);
        assert.equal(await zoomPage.evaluate(() => innerWidth), 720);
        await viewportCheck(zoomPage, "200 percent browser zoom");
      }
    }
    await zoom.close();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "/lease-renewal/live/desk?v=2", "delayed_filter_admission");
  const previousRows = await page.locator("[data-lease-id]").count();
  const previousView = await page
    .locator("[data-admitted-view]")
    .getAttribute("data-admitted-view");
  let releaseAdmission;
  let admissionStarted;
  const admitted = new Promise((resolve) => {
    admissionStarted = resolve;
  });
  const released = new Promise((resolve) => {
    releaseAdmission = resolve;
  });
  await page.route("**/api/lease-renewal/desk-admission", async (route) => {
    const response = await route.fetch();
    admissionStarted();
    await released;
    await route.fulfill({ response });
  });
  const clickedAt = performance.now();
  await page.getByRole("link", { name: /^All leases/ }).click();
  await page.getByText(/table still shows the previous completed selection/).waitFor();
  const acknowledgementMs = Math.round(performance.now() - clickedAt);
  await admitted;
  assert.equal(await page.locator("[data-lease-id]").count(), previousRows);
  assert.equal(
    await page.locator("[data-admitted-view]").getAttribute("data-admitted-view"),
    previousView,
  );
  releaseAdmission();
  await page.waitForFunction(
    () =>
      new URLSearchParams(
        document.querySelector("[data-admitted-view]").getAttribute("data-admitted-view"),
      ).get("scope") === "all",
  );
  assert.equal(await page.locator("[data-lease-id]").count(), count);
  await page.unroute("**/api/lease-renewal/desk-admission");
  journeys.push({
    name: "delayed_inventory_admission_preserves_previous_selection_and_complete_rows",
    outcome: "passed",
    acknowledgementMs,
  });
  await open(page, leasePath, "docking");
  const toggle = page.getByRole("button", { name: "Lease information", exact: true });
  await toggle.click();
  const separator = page.getByRole("separator", { name: "Resize lease information" });
  await separator.focus();
  await page.keyboard.press("End");
  await page.getByText("View saved", { exact: true }).first().waitFor();
  assert.equal(await separator.getAttribute("aria-valuenow"), "640");
  await page.setViewportSize({ width: 320, height: 1000 });
  await viewportCheck(page, "mobile lease information");
  await page.getByRole("button", { name: "Close lease information" }).tap();
  assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await toggle.click();
  assert.equal(await separator.getAttribute("aria-valuenow"), "640");
  await page.keyboard.press("Escape");
  journeys.push({ name: "desktop_resize_mobile_clamp_focus_return", outcome: "passed" });

  const viewResponse = await admin.request.get(
    `${origin}/api/personal-view?surface=renewals`,
  );
  assert.equal(viewResponse.status(), 200);
  let preference = (await viewResponse.json()).preference;
  let fixture = {
    query: "v=2&q=Fixture+Private+Search&scope=all&sort=end_date&direction=desc",
    layout: { columns: { c0: 480 }, panelWidth: 640 },
  };
  let saved = await admin.request.post(`${origin}/api/personal-view`, {
    data: { surface: "renewals", expectedRevision: preference.revision, value: fixture },
  });
  assert.equal(saved.status(), 200);
  preference = (await saved.json()).preference;
  assert.deepEqual(
    [...new URLSearchParams(preference.value.query)].sort(),
    [...new URLSearchParams(fixture.query)].sort(),
  );
  assert.deepEqual(preference.value.layout, fixture.layout);
  fixture = preference.value;
  const second = await session();
  assert.deepEqual(
    (
      await (
        await second.request.get(`${origin}/api/personal-view?surface=renewals`)
      ).json()
    ).preference.value,
    fixture,
  );
  const fresh = await second.newPage();
  await open(fresh, "/lease-renewal/live/desk", "restored_private_view");
  assert.equal(
    new URLSearchParams(
      await fresh.locator("[data-admitted-view]").getAttribute("data-admitted-view"),
    ).get("q"),
    "Fixture Private Search",
  );
  assert.ok(
    (await fresh.getByRole("list", { name: "Active filters" }).textContent()).includes(
      "Fixture Private Search",
    ),
  );
  const beforeClear = (
    await (
      await second.request.get(`${origin}/api/personal-view?surface=renewals`)
    ).json()
  ).preference.value;
  assert.deepEqual(beforeClear, fixture);
  await fresh.getByRole("link", { name: "Clear filters", exact: true }).click();
  await fresh
    .locator("[data-admitted-view]")
    .filter({ has: fresh.getByRole("columnheader", { name: /Renewal date/ }) })
    .waitFor();
  await fresh.waitForFunction(() => !new URLSearchParams(location.search).has("q"));
  assert.equal(new URL(fresh.url()).searchParams.get("sort"), "end_date");
  assert.equal(new URL(fresh.url()).searchParams.get("direction"), "desc");
  await fresh.getByText("View saved", { exact: true }).first().waitFor();
  const cleared = await confirmedPreference(
    second,
    (value) =>
      value.revision > preference.revision &&
      !new URLSearchParams(value.value.query).has("q"),
    "Clear filters",
  );
  assert.equal(new URLSearchParams(cleared.value.query).get("q"), null);
  assert.equal(new URLSearchParams(cleared.value.query).get("sort"), "end_date");
  assert.deepEqual(cleared.value.layout, fixture.layout);
  await fresh.getByRole("link", { name: "Reset view", exact: true }).click();
  await fresh.waitForFunction(() => location.search === "?v=2");
  await fresh.getByText("View saved", { exact: true }).first().waitFor();
  const reset = await confirmedPreference(
    second,
    (value) =>
      value.revision > cleared.revision &&
      value.value.query === "" &&
      Object.keys(value.value.layout.columns).length === 0,
    "Reset view (canonical default)",
  );
  assert.equal(reset.value.query, "");
  assert.deepEqual(reset.value.layout, { columns: {} });
  await open(fresh, "/lease-renewal/live/desk?v=2&scope=all", "explicit_view");
  assert.deepEqual(
    (
      await (
        await second.request.get(`${origin}/api/personal-view?surface=renewals`)
      ).json()
    ).preference,
    reset,
  );
  const other = await session("Editor");
  assert.equal(
    (
      await (
        await other.request.get(`${origin}/api/personal-view?surface=renewals`)
      ).json()
    ).preference.value.query,
    "",
  );
  assert.equal(
    (await other.request.get(`${origin}/api/personal-view?surface=admin-users`)).status(),
    403,
  );
  assert.equal(
    (
      await admin.request.post(`${origin}/api/personal-view`, {
        data: {
          surface: "renewals",
          expectedRevision: reset.revision,
          value: { ...fixture, customer: { synthetic: true } },
        },
      })
    ).status(),
    400,
  );
  await open(page, "/connections#connector-gmail_sender", "retired_gmail_anchor");
  await page.getByRole("region", { name: "Retired Gmail setup" }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Open Workflow Communications", exact: true })
      .count(),
    1,
  );
  assert.equal(await page.locator("#connector-gmail_sender button").count(), 0);
  await open(page, "/connections?connector=gmail_sender", "retired_gmail_query");
  await page.getByRole("region", { name: "Retired Gmail setup" }).waitFor();
  await open(page, "/connections", "ordinary_supported_connections");
  assert.equal(
    await page.getByRole("region", { name: "Retired Gmail setup" }).count(),
    0,
  );
  journeys.push({
    name: "real_route_emulator_two_sessions_account_isolation_explicit_link_no_write",
    outcome: "passed",
  });
  await open(
    page,
    "/lease-renewal/live/desk?v=2&scope=all",
    "table_scroll_resize_filter",
  );
  await page.waitForLoadState("networkidle");
  const tableRegion = page.getByRole("region", { name: "Renewal table", exact: true });
  assert.equal(await page.locator("[data-lease-id]").count(), count);
  const sizes = await tableRegion.evaluate((node) => ({
    height: node.clientHeight,
    scrollHeight: node.scrollHeight,
    width: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  assert.ok(
    sizes.scrollHeight > sizes.height,
    "The complete portfolio needs a bounded vertical table viewport",
  );
  await tableRegion.focus();
  await page.keyboard.press("PageDown");
  assert.ok(
    await tableRegion.evaluate((node) => node.scrollTop > 0),
    "Keyboard scrolling must reach later complete rows",
  );
  const column = page.getByRole("separator", {
    name: /Resize Lease \/ location.*column/,
  });
  await column.focus();
  await page.keyboard.press("End");
  assert.equal(await column.getAttribute("aria-valuenow"), "640");
  const tableSaved = await confirmedPreference(
    admin,
    (value) => value.value.layout.columns.c0 === 640,
  );
  await page.setViewportSize({ width: 320, height: 1000 });
  await viewportCheck(page, "complete_mobile_table");
  await tableRegion.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    node.scrollTop = 0;
  });
  const edgeFilter = page.locator(".renewal-th-filter-row summary").last();
  await edgeFilter.tap();
  const edgePanel = page
    .locator(".renewal-th-filter[open] .renewal-th-filter-panel")
    .last();
  await withinViewport(edgePanel);
  await withinViewport(edgePanel.getByRole("button", { name: "Apply", exact: true }));
  await edgeFilter.focus();
  await page.keyboard.press("Escape");
  assert.equal(await edgePanel.count(), 0);
  assert.equal(
    await edgeFilter.evaluate((node) => node === document.activeElement),
    true,
  );
  assert.deepEqual(
    (
      await (
        await admin.request.get(`${origin}/api/personal-view?surface=renewals`)
      ).json()
    ).preference,
    tableSaved,
    "A mobile clamp/open/close does not save over desktop intent",
  );
  journeys.push({
    name: "complete_table_keyboard_resize_scroll_touch_edge_filter_escape_no_clamp_write",
    outcome: "passed",
  });

  await page.route("**/api/gmail-hub/threads?*", (route) =>
    route.fulfill({
      json: {
        communications: [
          {
            id: "local-fixture-link",
            gmail_thread_id: "local-fixture-thread",
            purpose: "maintenance_owner",
            status: "linked",
          },
        ],
      },
    }),
  );
  const messageBody =
    "Current linked workflow message. " +
    "LongUnbrokenMessage".repeat(100) +
    "\n" +
    "Readable fixture paragraph. ".repeat(80);
  await page.route("**/api/gmail-hub/threads/local-fixture-thread?*", (route) =>
    route.fulfill({
      json: {
        id: "local-fixture-thread",
        messages: [
          {
            id: "local-fixture-message",
            from: "owner@fixture.invalid",
            subject: "Current fixture conversation",
            bodyText: messageBody,
          },
        ],
        truncated: false,
      },
    }),
  );
  await open(page, `/maintenance?ticket_id=${fixtures.ticketId}`, "linked_long_message");
  await page.waitForLoadState("networkidle");
  const linked = page.locator("details.workflow-communication-panel");
  await linked.locator(":scope > summary").click();
  assert.equal(
    await linked.getAttribute("open"),
    "",
    "The selected linked-message disclosure must open",
  );
  await linked.getByRole("button", { name: "Load linked communication" }).click();
  await linked.getByRole("button", { name: /Open maintenance owner/ }).click();
  const detail = linked.getByRole("region", { name: "Linked Gmail thread detail" });
  await detail.waitFor();
  assert.equal(await detail.locator(".gmail-message-list p").textContent(), messageBody);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await viewportCheck(page, "long_linked_message");
    await withinViewport(
      linked.getByRole("textbox", { name: "Human draft to improve (optional)" }),
    );
  }
  assert.equal(
    await linked.getByRole("button", { name: "Send exact linked reply" }).count(),
    0,
    "Reading never prepares or sends a reply",
  );
  await page.unroute("**/api/gmail-hub/threads?*");
  await page.unroute("**/api/gmail-hub/threads/local-fixture-thread?*");
  journeys.push({
    name: "actual_maintenance_store_and_compiled_linked_message_get_adapter_preserves_long_body_without_preparing_send",
    outcome: "passed",
  });

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await open(page, fixtures.pagePath, "published_long_source");
      assert.equal(
        await page
          .locator("main p, section.content p")
          .filter({ hasText: fixtures.sourceText })
          .count(),
        12,
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Open current workflow communications" })
          .getAttribute("href"),
        "/gmail-hub",
      );
      await viewportCheck(page, "published_long_source");
    }
  }
  journeys.push({
    name: "actual_publication_approval_receipt_readback_preserves_twelve_long_source_blocks_both_themes",
    outcome: "passed",
  });
  await open(
    page,
    "/vendor/batch005-fixture",
    "compiled_vendor_owner_populated_fixture_not_authentication_proof",
  );
  assert.equal(await page.getByRole("link", { name: "Open assigned ticket" }).count(), 8);
  await open(
    page,
    "/vendor/batch005-fixture?state=empty",
    "compiled_vendor_owner_empty_fixture_not_authentication_proof",
  );
  await page.getByRole("heading", { name: "No assigned tickets" }).waitFor();
  journeys.push({
    name: "actual_compiled_vendor_owner_long_and_empty_fixtures_separate_from_unchanged_authenticated_route_guards",
    outcome: "passed",
  });

  await page.route("**/api/gmail-hub/thread-summary", (route) =>
    route.fulfill({
      json: {
        ok: true,
        usedModel: false,
        summary: "Completed local fixture summary",
        waiting_on: "Fixture reviewer",
        suggested_next_action: "Review in Gmail",
        errors: [],
      },
    }),
  );
  await page.route("**/api/gmail-hub/anticipatory-draft", (route) =>
    route.fulfill({
      json: {
        ok: true,
        usedModel: false,
        refusedBeforeModel: false,
        draft: "Review before sending. Local fixture draft only.",
        errors: [],
      },
    }),
  );
  await open(page, "/gmail-hub", "admin_communication_recovery_tools");
  await page.getByText("Admin recovery tools", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Thread text", exact: true })
    .fill("Sanitized local fixture text only.");
  await page.getByRole("button", { name: "Summarize thread", exact: true }).click();
  await page.getByText("Completed local fixture summary", { exact: true }).waitFor();
  await page.unroute("**/api/gmail-hub/thread-summary");
  let releaseSummary;
  const summaryHeld = new Promise((resolve) => {
    releaseSummary = resolve;
  });
  await page.route("**/api/gmail-hub/thread-summary", async (route) => {
    await summaryHeld;
    await route.fulfill({ status: 503, json: { error: "Local fixture unavailable" } });
  });
  await page.getByRole("button", { name: "Summarize thread", exact: true }).click();
  await page.getByText("Previous completed summary", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Completed local fixture summary", { exact: true }).isVisible(),
    true,
  );
  releaseSummary();
  await page.getByRole("alert").filter({ hasText: "Could not summarize" }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Thread text", exact: true }).inputValue(),
    "Sanitized local fixture text only.",
  );
  await page.getByRole("button", { name: "Compose draft", exact: true }).click();
  await page
    .getByText("Review before sending. Local fixture draft only.", { exact: true })
    .waitFor();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Local denied clipboard fixture");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy draft", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Select and copy the displayed draft" })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /^Send/ }).count(), 0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await viewportCheck(
      page,
      "compiled_admin_communication_current_result_and_copy_fallback",
    );
    await withinViewport(page.getByRole("textbox", { name: "Thread text", exact: true }));
  }
  await page.unroute("**/api/gmail-hub/thread-summary");
  await page.unroute("**/api/gmail-hub/anticipatory-draft");
  journeys.push({
    name: "actual_compiled_admin_summary_previous_result_pending_failed_recovery_and_local_draft_copy_fallback_no_provider_dispatch",
    outcome: "passed",
  });
  await runRouteMatrix();
  assert.deepEqual(errors, [], "compiled client exceptions");
  writeFileSync(
    join(output, "checks.json"),
    JSON.stringify(
      {
        observations,
        journeys,
        refused,
        leaseRows: count,
        errors,
        accessibility,
        setupAndWarmupMs,
        humanVerdict: "NOT RUN — no human observer",
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      outcome: "passed",
      observations: observations.length,
      journeys,
      refused: refused.length,
      privateEvidence: output,
    }),
  );
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    writeFileSync(
      join(output, "failed-layout.json"),
      JSON.stringify(
        await lastPage.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (node) =>
                node.getClientRects().length &&
                node.getBoundingClientRect().right > innerWidth + 2,
            )
            .slice(0, 40)
            .map((node) => ({
              tag: node.tagName,
              className: node.className?.baseVal ?? node.className,
              right: node.getBoundingClientRect().right,
              width: node.getBoundingClientRect().width,
            })),
        ),
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    await lastPage
      .screenshot({ path: join(output, "failed.png"), fullPage: true })
      .catch(() => {});
    writeFileSync(join(output, "failed.html"), await lastPage.content(), {
      flag: "wx",
      mode: 0o600,
    });
  }
  writeFileSync(
    join(output, "failed.json"),
    JSON.stringify(
      { observations, journeys, refused, errors, accessibility, failure: error.message },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.error(
    JSON.stringify({
      outcome: "failed",
      failure: error.message,
      privateEvidence: output,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await teardown();
  rmSync(vendorFixtureDirectory, { recursive: true });
}

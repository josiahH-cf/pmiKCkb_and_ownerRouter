// Local compiled owning-component checks. Never accepts a remote origin or person's profile.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { createLocalZoomContext } from "./local-zoom.mjs";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const output = process.env.OPERATIONS_BROWSER_OUTPUT;
assert.ok(output?.startsWith("/home/josiah/.local/state/pmi-kc-operations-20261009/"));
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const [path, component] of [
  ["app/lease-renewal/live/desk/page.tsx", "OperationsRenewalDeskFixture"],
  [
    "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx",
    "OperationsRenewalLeaseFixture",
  ],
])
  writeFileSync(
    path,
    `export {${component} as default} from "@/tests/browser/operations-renewal-fixture";\n`,
  );
const port = await new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1", () => {
    const value = socket.address().port;
    socket.close(() => resolve(value));
  });
});
const origin = `http://localhost:${port}`,
  log = createWriteStream(join(output, "server.log")),
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)],
    {
      env: {
        ...process.env,
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "live_readonly",
        LOCAL_DEMO_AUTH: "true",
        ASK_DEMO_MODE: "true",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser, zoom;
const results = [],
  errors = [],
  writes = [];
async function configure(context) {
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET")
      writes.push({ path: url.pathname, body: request.postDataJSON() });
    if (url.pathname === "/api/personal-view") {
      const body = request.method() === "POST" ? request.postDataJSON() : {};
      return route.fulfill({
        json: {
          preference: {
            surface: body.surface ?? url.searchParams.get("surface"),
            revision: 1,
            value: body.value ?? { query: "", layout: { columns: {} } },
          },
        },
      });
    }
    if (url.pathname === "/api/lease-renewal/pricing-policy")
      return route.fulfill({
        json: {
          policies: [],
          cursor: null,
          policy: null,
          proposal: null,
          assignment: null,
          leaseAssignment: null,
          portfolioAssignment: null,
          policyChanged: false,
          authority: { covered: false, reason: "No reviewed standing agreement" },
          prefill: null,
          workingRevision: 0,
          manualRevision: 0,
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "Local fixture: source unavailable" },
    });
  });
  context.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
}
async function ready() {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error("Local Next process exited");
    try {
      const r = await fetch(`${origin}/lease-renewal/live/desk`, {
        signal: AbortSignal.timeout(10000),
      });
      await r.text();
      if (r.ok) return;
      if (r.status >= 500)
        throw new Error(`Local fixture returned ${r.status}; inspect server.log`);
    } catch (e) {
      if (e.message?.startsWith("Local fixture returned")) throw e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local compiled fixture did not become ready");
}
async function checkTable(page, label) {
  const region = page.getByRole("region", { name: "Renewal table" });
  await region.locator(".table-column-resizer").first().waitFor();
  await region.evaluate((el) => {
    el.scrollTop = 200;
    el.scrollLeft = 700;
  });
  await page.waitForTimeout(100);
  const measure = await region.evaluate((el) => {
    const row = el.querySelector("thead tr:first-child th").getBoundingClientRect(),
      second = el.querySelector("thead tr:nth-child(2) th").getBoundingClientRect();
    return {
      firstBottom: row.bottom,
      secondTop: second.top,
      headerHeight: getComputedStyle(el).getPropertyValue("--table-header-row-height"),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      height: el.clientHeight,
      scrollTop: el.scrollTop,
    };
  });
  assert.ok(
    Math.abs(measure.secondTop - measure.firstBottom) < 2,
    `${label}: wrapped header rows overlap or separate: ${JSON.stringify(measure)}`,
  );
  assert.ok(
    measure.scrollWidth > measure.clientWidth,
    `${label}: horizontal access remains bounded`,
  );
  assert.ok(measure.scrollTop > 0, `${label}: vertical scrolling is available`);
  assert.ok(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth + 2),
    `${label}: table does not force page overflow`,
  );
  await region.evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  await page.mouse.move(1, 1);
  const colors = await page
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows
        .slice(0, 2)
        .map((row) => getComputedStyle(row.querySelector("th")).backgroundColor),
    );
  assert.notEqual(colors[0], colors[1], `${label}: alternating row backgrounds`);
  results.push({ label, ...measure, colors });
}
try {
  await ready();
  const warm = await fetch(`${origin}/lease-renewal/live/desk/lease/9001`, {
    signal: AbortSignal.timeout(60000),
  });
  await warm.text();
  assert.ok(
    warm.ok,
    "Local lease fixture must compile before browser measurement; inspect server.log",
  );
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  await configure(context);
  const page = await context.newPage();
  await page.goto(`${origin}/lease-renewal/live/desk`);
  await page.getByRole("link", { name: "Nonrenewals first" }).waitFor();
  assert.equal(
    await page.locator("tbody tr").first().getAttribute("data-lease-id"),
    "9002",
  );
  await checkTable(page, "1280x800 light normal zoom");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await checkTable(page, "1280x800 dark normal zoom");
  await page.screenshot({ path: join(output, "worklist-dark.png") });
  await page.goto(`${origin}/lease-renewal/live/desk?v=2&sort=due&scope=all`);
  assert.equal(
    await page.locator("tbody tr").first().getAttribute("data-lease-id"),
    "9001",
  );
  const originalUrl = page.url();
  const leaseLink = page
    .locator("tbody tr")
    .first()
    .getByRole("link", { name: "Local 9001 Fixture Lane", exact: true });
  assert.equal(await leaseLink.getAttribute("target"), "_blank");
  writeFileSync(
    join(output, "lease-link.json"),
    JSON.stringify(
      await leaseLink.evaluate((a) => ({
        href: a.href,
        target: a.target,
        rect: a.getBoundingClientRect().toJSON(),
        style: getComputedStyle(a).display,
        hit: document.elementFromPoint(
          a.getBoundingClientRect().x + a.getBoundingClientRect().width / 2,
          a.getBoundingClientRect().y + a.getBoundingClientRect().height / 2,
        )?.outerHTML,
      })),
    ),
  );
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    leaseLink.click({ position: { x: 6, y: 8 } }),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await popup
    .getByRole("heading", { level: 1, name: "Local 9001 Fixture Lane" })
    .waitFor();
  await popup.getByRole("region", { name: "Focus view", exact: true }).waitFor();
  assert.equal(page.url(), originalUrl);
  assert.equal(new URL(popup.url()).hash, "");
  assert.equal(await popup.evaluate(() => scrollY), 0);
  const logRegion = popup.getByRole("region", { name: "Staff status and Status log" });
  await logRegion.getByLabel("Add a note", { exact: true }).waitFor();
  assert.equal(
    await logRegion
      .locator(".renewal-status-log > li")
      .first()
      .innerText()
      .then((t) => t.includes("Local prior activity 8")),
    true,
  );
  assert.equal(
    await logRegion
      .locator("details")
      .getByText("Older entries (3)", { exact: true })
      .count(),
    1,
  );
  await logRegion
    .getByLabel("Add a note", { exact: true })
    .fill("Keep a local unsaved note");
  await popup.getByRole("button", { name: "Full view", exact: true }).click();
  await popup.waitForFunction(() =>
    document
      .querySelector('button[aria-pressed="true"]')
      ?.textContent?.includes("Full view"),
  );
  assert.equal(
    await logRegion.getByLabel("Add a note", { exact: true }).inputValue(),
    "Keep a local unsaved note",
  );
  const paired = await popup.locator(".renewal-primary-progress").evaluate((el) =>
    [...el.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  assert.equal(paired.length, 2);
  assert.ok(Math.abs(paired[0].y - paired[1].y) < 2);
  await popup.getByRole("button", { name: "Focus view", exact: true }).click();
  await popup.getByRole("region", { name: "Focus view", exact: true }).waitFor();
  assert.equal(
    await logRegion.getByLabel("Add a note", { exact: true }).inputValue(),
    "Keep a local unsaved note",
  );
  await popup.setViewportSize({ width: 760, height: 800 });
  const stacked = await popup
    .locator(".renewal-primary-progress")
    .evaluate((el) => [...el.children].map((c) => c.getBoundingClientRect().y));
  assert.ok(stacked[1] > stacked[0]);
  await popup
    .locator(".renewal-primary-progress")
    .screenshot({ path: join(output, "lease-primary-progress.png") });
  await logRegion.screenshot({ path: join(output, "lease-primary-log.png") });
  await popup.screenshot({ path: join(output, "lease-focus-viewport.png") });
  await popup.close();
  const sameName = page
    .locator('tbody tr[data-lease-id="9001"]')
    .getByRole("link", { name: "Local Person", exact: true });
  await sameName.click();
  await page.waitForURL(/ownerKey=p2_/);
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
  assert.equal(await page.locator("tbody tr").count(), 2);
  assert.match(
    await page.getByRole("list", { name: "Active filters" }).innerText(),
    /Contact 101/,
  );
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await page.waitForURL(/sort=due/);
  await page.locator("tbody tr").nth(27).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 28);
  await page.setViewportSize({ width: 760, height: 800 });
  await checkTable(page, "760 narrow");
  await page.setViewportSize({ width: 320, height: 700 });
  await checkTable(page, "320 narrow");
  await context.close();
  zoom = await createLocalZoomContext(origin);
  await configure(zoom.context);
  const zoomPage = await zoom.context.newPage();
  await zoomPage.goto(`${origin}/lease-renewal/live/desk`);
  await zoom.setZoom(zoomPage, 2);
  await checkTable(zoomPage, "actual 200 percent browser zoom");
  await zoomPage.getByRole("region", { name: "Renewal table" }).scrollIntoViewIfNeeded();
  await zoom.screenshot(zoomPage, join(output, "worklist-200-percent.png"));
  assert.deepEqual(errors, []);
  assert.ok(
    writes.every((w) =>
      ["/api/personal-view", "/api/lease-renewal/work-status"].includes(w.path),
    ),
    "Only isolated view persistence and the deliberate local note may be attempted",
  );
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        checks: results,
        errors,
        writes,
        scope:
          "Compiled owning components with deterministic local route adapters; no live provider effects or human observation",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result: "passed", layouts: results.length, output }));
} catch (error) {
  writeFileSync(
    join(output, "failed-result.json"),
    JSON.stringify(
      {
        result: "failed",
        message: String(error),
        checks: results,
        errors,
        writes,
        pages: browser?.contexts().flatMap((c) => c.pages().map((p) => p.url())),
      },
      null,
      2,
    ),
  );
  for (const [i, page] of (
    browser?.contexts().flatMap((c) => c.pages()) ?? []
  ).entries()) {
    await page.screenshot({ path: join(output, `failed-page-${i}.png`) }).catch(() => {});
  }
  throw error;
} finally {
  await zoom?.context.close();
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
      resolve();
    }, 5000);
  });
  log.end();
}

// Real compiled identity entry -> current authorized source -> actual application link.
// Local emulator sessions only; genuine provider reads are allowed, every business POST is refused.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import setup from "../e2e/global-setup.mjs";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-vitest-run-[^/]+\/worktree$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-batch005-browser-test");
let origin;
const teardown = await setup({
  provide(key, value) {
    if (key === "e2eBaseUrl") origin = value;
  },
});
assert.equal(new URL(origin).hostname, "localhost");
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const output = `/tmp/batch005-lookup-browser-${new Date().toISOString().replaceAll(":", "-")}`;
mkdirSync(output, { mode: 0o700 });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  assert.equal(
    (
      await context.request.post(`${origin}/api/auth/demo`, { data: { role: "Admin" } })
    ).status(),
    200,
  );
  let refused = 0;
  await context.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      request.method() === "GET" &&
      !/chat\/sync|oauth\/connect|watch\/start/.test(path)
    )
      return route.continue();
    if (request.method() === "POST" && path === "/api/assistant/query")
      return route.continue();
    refused++;
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.name));
  await page.goto(`${origin}/lease-renewal/live/desk?v=2&scope=all`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const row = page.locator("[data-lease-id]").first();
  const id = await row.getAttribute("data-lease-id");
  assert.match(id ?? "", /^\d+$/);
  const identity = (
    await row
      .locator(":scope > td")
      .nth(1)
      .locator(".renewal-party-name")
      .first()
      .textContent()
  ).trim();
  assert.ok(identity.length > 0);
  const before = await (
    await context.request.get(`${origin}/api/personal-view?surface=renewals`)
  ).json();
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByRole("textbox", { name: "Question", exact: true }).fill(identity);
  const received = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/assistant/query" &&
      response.request().method() === "POST",
  );
  const clicked = performance.now();
  await page.getByRole("button", { name: "Get answer", exact: true }).click();
  await page.getByRole("button", { name: "Stop waiting", exact: true }).waitFor();
  const acknowledgementMs = Math.round(performance.now() - clicked);
  const response = await received;
  assert.equal(response.status(), 200);
  const answer = await response.json();
  assert.equal(answer.interpretedBy, "deterministic");
  const record = answer.groups
    .flatMap((group) => group.items)
    .find((item) => item.ref.id === id);
  assert.ok(
    record,
    "The literal identity must return its actual accessible source lease",
  );
  assert.equal(
    new URL(record.href, origin).pathname,
    `/lease-renewal/live/desk/lease/${id}`,
  );
  const link = page
    .getByRole("region", { name: "Conversation" })
    .getByRole("link", { name: record.title, exact: true });
  await link.waitFor();
  assert.equal(await link.getAttribute("href"), record.href);
  let shortcut = "unavailable_for_this_current_record";
  if (record.sourceHref) {
    const current = await context.request.get(new URL(record.sourceHref, origin).href, {
      maxRedirects: 0,
    });
    assert.ok(
      [302, 303, 307, 308].includes(current.status()),
      "A shown shortcut must resolve its current verified source destination",
    );
    const destination = new URL(current.headers().location);
    assert.ok(destination.hostname.endsWith(".rentvine.com"));
    shortcut = "current_verified_redirect_readback_passed";
  }
  await link.click();
  await page.waitForURL((url) => url.pathname === `/lease-renewal/live/desk/lease/${id}`);
  assert.equal(await page.locator("h1").first().isVisible(), true);
  const after = await (
    await context.request.get(`${origin}/api/personal-view?surface=renewals`)
  ).json();
  assert.deepEqual(
    after,
    before,
    "Assistant/explicit lease entry must not change private saved views",
  );
  assert.deepEqual(clientErrors, []);
  writeFileSync(
    `${output}/checks.json`,
    JSON.stringify(
      {
        outcome: "passed",
        pipeline:
          "actual bare identity form -> actual read-only query route -> current source record -> actual rendered lease link and workspace",
        interpretation: answer.interpretedBy,
        groups: answer.groups.length,
        matchedRecords: answer.groups.reduce((total, group) => total + group.total, 0),
        shortcut,
        acknowledgementMs,
        historyOrOtherRefusedPosts: refused,
        privateViewUnchanged: true,
        businessEffectEvidence: false,
        humanVerdict: "NOT RUN — no human observer",
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    JSON.stringify({
      outcome: "passed",
      privateEvidence: output,
      acknowledgementMs,
      shortcut,
    }),
  );
} catch (error) {
  writeFileSync(`${output}/failed.json`, JSON.stringify({ failure: error.message }), {
    mode: 0o600,
    flag: "wx",
  });
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
}

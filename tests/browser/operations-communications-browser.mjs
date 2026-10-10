// A local compiled composer -> real Firestore service -> deterministic Gmail -> worker journey.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from "node:fs";
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
const fixture = "@/tests/browser/operations-communications-server-fixture";
for (const path of [
  "app/api/gmail-hub/sequences/route.ts",
  "app/api/gmail-hub/sequences/thread/route.ts",
  "app/api/gmail-hub/composition/route.ts",
  "app/api/gmail-hub/sequence-attachments/route.ts",
  "app/api/gmail-hub/threads/route.ts",
  "lib/gmail-hub/workflow-authorization.ts",
  "app/api/search/entities/route.ts",
  "app/search/open/page.tsx",
  "lib/search/server-search.ts",
]) {
  let source = readFileSync(path, "utf8");
  source = source
    .replaceAll('from "@/lib/auth/session"', `from "${fixture}"`)
    .replaceAll('from "@/lib/gmail-hub/sequence-dependencies"', `from "${fixture}"`)
    .replaceAll('from "@/lib/gmail-hub/dependencies"', `from "${fixture}"`)
    .replaceAll('from "@/lib/lease-renewal/live-config"', `from "${fixture}"`)
    .replaceAll('from "@/lib/lease-renewal/live-lease-cache"', `from "${fixture}"`)
    .replaceAll('from "@/lib/auth/page-guards"', `from "${fixture}"`)
    .replaceAll('from "@/lib/lease-renewal/admitted-notice-source"', `from "${fixture}"`);
  writeFileSync(path, source);
}
writeFileSync(
  "app/gmail-hub/page.tsx",
  `export {BrowserCommunicationsFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx",
  'export {OperationsRenewalLeaseFixture as default} from "@/tests/browser/operations-renewal-fixture";',
);
mkdirSync("app/api/operations-verification-only", { recursive: true });
writeFileSync(
  "app/api/operations-verification-only/route.ts",
  `export {controlPOST as POST} from "${fixture}";`,
);
writeFileSync(
  "app/api/gmail-hub/managed-senders/route.ts",
  `export {senderGET as GET} from "${fixture}";`,
);
mkdirSync("app/operations-entry-verification", { recursive: true });
writeFileSync(
  "app/operations-entry-verification/page.tsx",
  `export const dynamic = "force-dynamic"; export {EntryPointsFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/api/notifications/route.ts",
  `export {notificationGET as GET} from "${fixture}";`,
);
writeFileSync(
  "app/api/notifications/mark-read/route.ts",
  `export {notificationReadPOST as POST} from "${fixture}";`,
);
const configPath = join(process.cwd(), "next.config.ts");
const sourceConfig = readFileSync(configPath, "utf8");
assert.ok(sourceConfig.includes("const nextConfig: NextConfig = {"));
writeFileSync(
  configPath,
  sourceConfig.replace(
    "const nextConfig: NextConfig = {",
    "const nextConfig: NextConfig = { experimental: { cpus: 2 },",
  ),
);
const port = await new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1", () => {
    const p = socket.address().port;
    socket.close(() => resolve(p));
  });
});
const origin = `http://localhost:${port}`,
  log = createWriteStream(join(output, "server.log")),
  built = await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
      env: {
        ...process.env,
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        OPERATIONS_BROWSER_FIXTURE: "true",
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
        LOCAL_DEMO_AUTH: "false",
        ASK_DEMO_MODE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    build.stdout.pipe(log, { end: false });
    build.stderr.pipe(log, { end: false });
    build.once("error", reject);
    build.once("exit", (code) =>
      code === 0
        ? resolve(true)
        : reject(
            new Error(`Compiled fixture build failed (${code}); inspect server.log`),
          ),
    );
  }),
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      env: {
        ...process.env,
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        OPERATIONS_BROWSER_FIXTURE: "true",
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
        LOCAL_DEMO_AUTH: "false",
        ASK_DEMO_MODE: "false",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser, zoom;
const errors = [],
  requests = [],
  checks = [];
async function ready() {
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error("Local Next exited");
    try {
      const r = await fetch(`${origin}/gmail-hub`, {
        signal: AbortSignal.timeout(10000),
      });
      await r.text();
      if (r.ok) return;
      if (r.status >= 500)
        throw new Error(`Fixture returned ${r.status}; inspect server.log`);
    } catch (e) {
      if (e.message.startsWith("Fixture returned")) throw e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local fixture did not start");
}
async function control(body) {
  const r = await fetch(`${origin}/api/operations-verification-only`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(`Local worker control returned ${r.status}: ${await r.text()}`);
  return r.json();
}
async function configure(context) {
  await context.route("**/*", (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (u.origin !== origin) return route.abort("blockedbyclient");
    if (!u.pathname.startsWith("/api/")) return route.continue();
    requests.push({ path: u.pathname, method: r.method() });
    if (
      [
        "/api/gmail-hub/sequences",
        "/api/gmail-hub/sequences/thread",
        "/api/gmail-hub/composition",
        "/api/gmail-hub/sequence-attachments",
        "/api/gmail-hub/managed-senders",
        "/api/gmail-hub/threads",
        "/api/notifications",
        "/api/notifications/mark-read",
        "/api/search/entities",
      ].includes(u.pathname)
    )
      return route.continue();
    if (u.pathname === "/api/personal-view")
      return route.fulfill({
        json: {
          preference: {
            surface: u.searchParams.get("surface"),
            revision: 1,
            value: { query: "", layout: { columns: {} } },
          },
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "Synthetic unavailable source" },
    });
  });
  context.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource"))
        errors.push(m.text());
    });
  });
}
async function layout(page, label) {
  assert.ok(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth + 2),
    `${label}: page overflow`,
  );
  if (label === "composer-200-percent")
    await zoom.screenshot(page, join(output, `${label}.png`));
  else await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
  checks.push(label);
}
async function schedule(page, firstDate, limit = 3) {
  await page.getByRole("button", { name: "Add follow-up message", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Follow-up message subject", exact: true })
    .fill("Follow-up synthetic owner update");
  await page
    .getByRole("textbox", { name: "Follow-up message body", exact: true })
    .fill("Separate approved follow-up wording");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByLabel("First date", { exact: true }).fill(firstDate);
  await page.getByLabel("Local time", { exact: true }).fill("09:00");
  await page.getByLabel("Timezone", { exact: true }).fill("America/Chicago");
  await page
    .getByLabel("Repeat every calendar days (optional)", { exact: true })
    .fill("1");
  await page
    .getByLabel("Total send limit including initial (optional)", { exact: true })
    .fill(String(limit));
  await page.getByRole("button", { name: "Schedule messages", exact: true }).click();
  await page.locator('[data-communication-state="active"]').waitFor();
  return new URL(page.url()).searchParams.get("communication");
}
async function recorded(page, state) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/gmail-hub/sequences") &&
        r.request().method() === "GET" &&
        new URL(r.url()).searchParams.has("id"),
    ),
    page.getByRole("button", { name: "Check recorded status", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200);
  const payload = await response.json();
  await page
    .locator(
      `[data-communication-state="${state}"][data-communication-version="${payload.sequence.version}"]`,
    )
    .waitFor();
}
try {
  await ready();
  await control({ clock: "2026-10-09T14:00:00Z" });
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  await configure(context);
  await control({ seedLegacy: true });
  const beforeLegacy = await control({ inspectLegacy: true });
  const saved = await context.newPage();
  await saved.goto(`${origin}/operations-entry-verification`);
  await saved.getByRole("button", { name: /^Notifications, 1 unread/ }).click();
  await saved.getByRole("button", { name: /Renewal communication/ }).click();
  await saved
    .getByRole("heading", { name: "Existing linked conversation", exact: true })
    .waitFor();
  assert.match(saved.url(), /workflow=renewal_lease&record=9001&purpose=renewal_owner/);
  await saved.getByText("Linked Gmail communication", { exact: true }).click();
  await saved
    .getByRole("button", { name: "Load linked communication", exact: true })
    .click();
  await saved
    .getByRole("button", { name: /Open renewal owner/ })
    .first()
    .waitFor();
  assert.equal(
    await saved.getByRole("button", { name: /Open renewal owner/ }).count(),
    3,
  );
  assert.equal(
    await saved
      .getByRole("button", { name: /Send|Schedule|Create Gmail draft|Confirm reply/i })
      .count(),
    0,
  );
  await saved
    .getByRole("link", { name: "Compose in Communications", exact: true })
    .click();
  await saved
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .waitFor();
  assert.match(saved.url(), /compose=renewal_owner&lease=9001/);
  await saved.goto(`${origin}/operations-entry-verification`);
  await saved
    .getByRole("link", { name: "Saved original workflow link", exact: true })
    .click();
  await saved
    .getByRole("heading", { name: "Existing linked conversation", exact: true })
    .waitFor();
  await saved.reload();
  await saved.getByText("Linked Gmail communication", { exact: true }).click();
  await saved
    .getByRole("button", { name: "Load linked communication", exact: true })
    .click();
  await saved
    .getByRole("button", { name: /Open renewal owner/ })
    .first()
    .waitFor();
  assert.equal(
    await saved.getByRole("button", { name: /Open renewal owner/ }).count(),
    3,
  );
  const afterLegacy = await control({ inspectLegacy: true });
  assert.deepEqual(
    [...afterLegacy.legacy].sort((a, b) => a.id.localeCompare(b.id)),
    [...beforeLegacy.legacy].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.equal(afterLegacy.sends.length, 0);
  checks.push(
    "Actual notification and saved/reloaded old URL preserve three private legacy draft/sent/attention identities, enter the current composer only explicitly, and grant no Send/Schedule or migration authority",
  );
  await saved.close();
  const lookup = await context.newPage();
  await lookup.goto(`${origin}/operations-entry-verification`);
  const lookupUrl = lookup.url();
  await lookup
    .getByRole("combobox", { name: "Search records", exact: true })
    .fill("Local 9001");
  const foundOption = lookup.locator(
    'a[role="option"][href="/search/open?type=lease&id=9001"]',
  );
  await foundOption.waitFor();
  const [foundLease] = await Promise.all([
    context.waitForEvent("page"),
    foundOption.click(),
  ]);
  await foundLease.getByRole("region", { name: "Focus view", exact: true }).waitFor();
  assert.equal(lookup.url(), lookupUrl);
  const [foundComposer] = await Promise.all([
    context.waitForEvent("page"),
    foundLease
      .getByRole("link", { name: "Compose owner message in Communications", exact: true })
      .click(),
  ]);
  await foundComposer
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .waitFor();
  assert.match(foundComposer.url(), /compose=renewal_owner&lease=9001/);
  assert.equal((await control({})).sends.length, 0);
  checks.push(
    "Actual shared search -> fresh exact lease resolver -> owning lease workspace -> new-tab current composer preserves the originating page and creates no authorization or send",
  );
  await foundComposer.close();
  await foundLease.close();
  await lookup.close();
  const lease = await context.newPage();
  await lease.goto(`${origin}/lease-renewal/live/desk/lease/9001`);
  await lease.getByRole("region", { name: "Focus view", exact: true }).waitFor();
  const leaseUrl = lease.url();
  const action = lease.getByRole("link", {
    name: "Compose owner message in Communications",
    exact: true,
  });
  const [composer] = await Promise.all([context.waitForEvent("page"), action.click()]);
  await composer.waitForLoadState("domcontentloaded");
  await composer
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .waitFor();
  assert.equal(lease.url(), leaseUrl);
  assert.match(composer.url(), /compose=renewal_owner&lease=9001/);
  assert.ok(
    await composer
      .getByRole("textbox", { name: "Initial message body", exact: true })
      .locator("strong")
      .count(),
  );
  const editor = composer.getByRole("textbox", {
    name: "Initial message body",
    exact: true,
  });
  await editor.evaluate((el) => {
    el.innerHTML =
      '<p>Reviewed <strong>exact address</strong> and <a href="https://example.invalid/form">verified form</a>.</p>';
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });
  await composer
    .getByLabel("Add PDF or image (5 MiB combined)", { exact: true })
    .first()
    .setInputFiles({
      name: "synthetic-review.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    });
  await composer
    .getByRole("link", { name: "synthetic-review.pdf", exact: true })
    .waitFor();
  const id = await schedule(composer, "2026-10-10");
  assert.ok(id);
  assert.equal((await control({})).sends.length, 0);
  await layout(composer, "composer-wide");
  await composer.setViewportSize({ width: 760, height: 800 });
  await layout(composer, "composer-narrow");
  await composer.setViewportSize({ width: 320, height: 700 });
  await layout(composer, "composer-phone");
  await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await configure(context);
  const page = await context.newPage();
  await page.goto(`${origin}/gmail-hub`);
  await page.getByRole("tab", { name: "Scheduled", exact: true }).click();
  await page.getByRole("button", { name: "Open communication", exact: true }).waitFor();
  let result = await control({ clock: "2026-10-10T14:00:00Z", worker: true });
  assert.equal(result.sends.length, 1);
  assert.match(result.sends[0].htmlBody, /<strong>exact address<\/strong>/);
  assert.equal(result.sends[0].attachments[0].filename, "synthetic-review.pdf");
  await page.goto(`${origin}/gmail-hub?communication=${id}`);
  await page.getByRole("heading", { name: "Linked history", exact: true }).waitFor();
  await control({ clock: "2026-10-10T15:00:00Z", reply: true });
  result = await control({ clock: "2026-10-11T14:00:00Z", worker: true });
  assert.equal(result.sends.length, 1);
  await recorded(page, "paused");
  await page.getByRole("button", { name: "Read linked thread", exact: true }).click();
  await page.getByText("Human reply to the approved message", { exact: true }).waitFor();
  await layout(page, "reply-paused");
  checks.push(
    "new lease tab, exact rich/file schedule, closed browser, worker receipt and fresh reply pause",
  );
  await page.getByRole("button", { name: "Back to Communications", exact: true }).click();
  await page.getByRole("tab", { name: "Incoming", exact: true }).click();
  await page.getByRole("button", { name: "Open communication", exact: true }).waitFor();
  await page.getByLabel("Audience", { exact: true }).selectOption("renewal_owner");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  assert.equal(await page.getByLabel("Audience", { exact: true }).inputValue(), "");
  await page.goto(`${origin}/gmail-hub?compose=renewal_owner&lease=9001`);
  await page
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .waitFor();
  const second = await schedule(page, "2026-10-12", 2);
  await control({ clock: "2026-10-12T14:00:00Z", worker: true });
  result = await control({ clock: "2026-10-13T14:00:00Z", worker: true });
  assert.equal(result.sends.length, 3);
  await page.goto(`${origin}/gmail-hub?communication=${second}`);
  await page.locator('[data-communication-state="completed"]').waitFor();
  checks.push("no reply sends one reviewed follow-up and stops at the chosen limit");
  await page.goto(
    `${origin}/gmail-hub?compose=maintenance_owner&ticket=synthetic-ticket`,
  );
  await page
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .waitFor();
  const maintenance = await schedule(page, "2026-10-14");
  await control({ clock: "2026-10-14T14:00:00Z", worker: true });
  await recorded(page, "active");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator('[data-communication-state="paused"]').waitFor();
  await page
    .getByRole("button", { name: "Choose responsible sender", exact: true })
    .click();
  await page
    .getByLabel("Managed staff sender", { exact: true })
    .selectOption("browser-staff-two");
  await page
    .getByRole("button", { name: "Transfer responsibility", exact: true })
    .click();
  await page
    .getByText("browser-staff-two@pmikcmetro.com", { exact: true })
    .first()
    .waitFor();
  result = await control({ clock: "2026-10-15T14:00:00Z", worker: true });
  assert.equal(result.sends.length, 4);
  await control({ actor: "browser-staff-two" });
  await page.goto(`${origin}/gmail-hub?communication=${maintenance}`);
  await page
    .getByRole("button", { name: "Resume reviewed sequence", exact: true })
    .click();
  await page.locator('[data-communication-state="active"]').waitFor();
  result = await control({ worker: true });
  assert.equal(result.sends.length, 5);
  assert.equal(result.sends[4].from, "browser-staff-two@pmikcmetro.com");
  await recorded(page, "active");
  assert.equal(
    await page.getByRole("button", { name: "Read linked thread", exact: true }).count(),
    2,
  );
  checks.push(
    "maintenance pause, transfer, original history, explicit new sender authorization",
  );
  await page.goto(
    `${origin}/gmail-hub?communication=00000000-0000-4000-8000-000000000000`,
  );
  await page.getByRole("alert").waitFor();
  assert.equal((await control({})).sends.length, 5);
  checks.push("forged unavailable ID refuses without dispatch");
  await page.goto(`${origin}/gmail-hub?communication=${id}`);
  await page.getByRole("button", { name: "Read linked thread", exact: true }).click();
  const originalReply = page
    .locator("article")
    .filter({
      has: page.getByText("Human reply to the approved message", { exact: true }),
    })
    .last();
  const originalUrl = page.url();
  const [replyPage] = await Promise.all([
    context.waitForEvent("page"),
    originalReply
      .getByRole("link", { name: "Reply in Communications", exact: true })
      .click(),
  ]);
  await replyPage.waitForLoadState("domcontentloaded");
  const replyBody = replyPage.getByRole("textbox", {
    name: "Initial message body",
    exact: true,
  });
  await replyBody.waitFor();
  assert.equal(page.url(), originalUrl);
  assert.equal(
    await replyPage
      .getByRole("textbox", { name: "Initial message subject", exact: true })
      .inputValue(),
    "Exact synthetic owner update",
  );
  await replyBody.fill("Reviewed teammate response to the original owner message.");
  await control({ lose: true });
  await replyPage.getByRole("button", { name: "Send", exact: true }).click();
  await replyPage
    .getByRole("button", { name: "Check admitted send", exact: true })
    .waitFor();
  await replyPage.reload();
  await replyPage
    .getByRole("button", { name: "Check admitted send", exact: true })
    .click();
  await replyPage.locator('[data-communication-state="paused"]').waitFor();
  const recoveredSequence = await (
    await fetch(
      `${origin}/api/gmail-hub/sequences?id=${new URL(replyPage.url()).searchParams.get("communication")}`,
    )
  ).json();
  assert.equal(recoveredSequence.sequence.confirmedCount, 1);
  assert.equal(recoveredSequence.sequence.unresolvedOccurrenceId, null);
  const replyResult = await control({});
  assert.equal(replyResult.sends.length, 6);
  assert.equal(replyResult.sends[5].from, "browser-staff-two@pmikcmetro.com");
  assert.equal(replyResult.sends[5].threadId, null);
  assert.equal(
    replyResult.sends[5].inReplyTo,
    `<reply-${Date.parse("2026-10-10T15:00:00Z")}@example.invalid>`,
  );
  assert.equal(replyResult.sends[5].subject, "Exact synthetic owner update");
  await layout(replyPage, "linked-reply-recovered");
  checks.push(
    "a teammate opens the exact linked message in a new tab, sends with source-bound recipients and original RFC headers, and recovers one lost send without another dispatch or another mailbox thread ID",
  );

  const hub = await context.newPage();
  await hub.goto(`${origin}/gmail-hub?compose=renewal_owner&lease=9001`);
  await hub
    .getByRole("textbox", { name: "Initial message body", exact: true })
    .fill("Unsent shared worklist wording");
  await hub.getByRole("button", { name: "Save draft", exact: true }).click();
  await hub.locator('[data-communication-state="draft"]').waitFor();
  await hub.getByRole("button", { name: "Back to Communications", exact: true }).click();
  for (const category of ["Incoming", "Outgoing", "Drafts", "Scheduled"]) {
    await hub.getByRole("tab", { name: category, exact: true }).click();
    const panel = hub.getByRole("tabpanel", { name: category, exact: true });
    await panel.locator("article").first().waitFor();
    assert.ok((await panel.locator("article").count()) > 0);
    assert.equal(
      await hub
        .getByRole("tab", { name: category, exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await hub
      .getByLabel("Filter workflow, sender or status", { exact: true })
      .fill("no-such-visible-workflow");
    await panel
      .getByText(`No matching ${category.toLowerCase()} communications in this page.`, {
        exact: true,
      })
      .waitFor();
    await hub.getByRole("button", { name: "Clear filters", exact: true }).click();
    await panel.locator("article").first().waitFor();
  }
  await hub.getByRole("tab", { name: "Outgoing", exact: true }).click();
  await hub.getByLabel("Workflow", { exact: true }).selectOption("maintenance");
  await hub.getByLabel("Audience", { exact: true }).selectOption("maintenance_owner");
  await hub
    .getByLabel("Responsible sender", { exact: true })
    .selectOption("browser-staff-two@pmikcmetro.com");
  const selectedWork = hub
    .getByRole("tabpanel", { name: "Outgoing", exact: true })
    .locator("article");
  assert.equal(await selectedWork.count(), 1);
  assert.match(await selectedWork.innerText(), /Ticket synthetic-ticket/);
  assert.match(await selectedWork.innerText(), /browser-staff-two@pmikcmetro.com/);
  await hub.getByRole("button", { name: "Clear filters", exact: true }).click();
  const outgoingCount = await hub
    .getByRole("tabpanel", { name: "Outgoing", exact: true })
    .locator("article")
    .count();
  const unavailable = async (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Bounded fixture worklist source unavailable" },
    });
  await hub.route("**/api/gmail-hub/sequences", unavailable);
  await hub.getByRole("button", { name: "Refresh worklist", exact: true }).click();
  await hub
    .getByRole("alert")
    .filter({ hasText: "Bounded fixture worklist source unavailable" })
    .waitFor();
  assert.equal(
    await hub
      .getByRole("tabpanel", { name: "Outgoing", exact: true })
      .locator("article")
      .count(),
    outgoingCount,
  );
  await hub.unroute("**/api/gmail-hub/sequences", unavailable);
  await hub.getByRole("button", { name: "Refresh worklist", exact: true }).click();
  await hub
    .getByRole("alert")
    .filter({ hasText: "Bounded fixture worklist source unavailable" })
    .waitFor({ state: "hidden" });
  await hub.getByRole("tab", { name: "Drafts", exact: true }).click();
  const draftPanel = hub.getByRole("tabpanel", { name: "Drafts", exact: true });
  assert.equal(await draftPanel.locator("article").count(), 1);
  await draftPanel
    .getByRole("button", { name: "Open communication", exact: true })
    .click();
  assert.equal(
    await hub
      .getByRole("textbox", { name: "Initial message body", exact: true })
      .innerText(),
    "Unsent shared worklist wording",
  );
  await hub.getByRole("button", { name: "Back to Communications", exact: true }).click();
  await hub.setViewportSize({ width: 320, height: 700 });
  await layout(hub, "hub-phone");
  assert.equal((await control({})).sends.length, 6);
  checks.push(
    "All four actual hub categories retain nonempty/empty/selected states; lane/audience/sender filters compose, a failed refresh preserves prior work distinctly from no matches, and draft/navigation creates no additional authorization or send",
  );
  await hub.close();

  zoom = await createLocalZoomContext(origin);
  await configure(zoom.context);
  const zp = await zoom.context.newPage();
  await zp.goto(`${origin}/gmail-hub?communication=${maintenance}`);
  await zp.getByRole("textbox", { name: "Initial message body", exact: true }).waitFor();
  await zoom.setZoom(zp, 2);
  await layout(zp, "composer-200-percent");
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every((r) => !r.path.includes("/send") && !r.path.includes("draft_create")),
  );
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        checks,
        requests,
        errors,
        scope:
          "Compiled owning composer, real private HTTP/service/Firestore boundaries, deterministic external Gmail and managed-actor adapters; no live customer effect or human observation",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result: "passed", output, checks: checks.length }));
} catch (error) {
  writeFileSync(
    join(output, "failed-result.json"),
    JSON.stringify(
      { result: "failed", message: String(error), checks, requests, errors },
      null,
      2,
    ),
  );
  for (const [i, p] of (browser?.contexts().flatMap((c) => c.pages()) ?? []).entries())
    await p.screenshot({ path: join(output, `failed-${i}.png`) }).catch(() => {});
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

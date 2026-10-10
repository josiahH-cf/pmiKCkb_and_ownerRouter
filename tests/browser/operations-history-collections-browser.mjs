// Compiled private thread and shared monthly collection journeys over actual emulator owners.
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
const fixture = "@/tests/browser/operations-history-collections-fixture";
for (const path of [
  "app/api/assistant/history/route.ts",
  "app/api/assistant/history/[conversationId]/route.ts",
  "app/api/assistant/history/metadata/route.ts",
  "app/api/assistant/history/turns/route.ts",
  "app/api/assistant/history/turns/[operationId]/route.ts",
  "app/api/assistant/query/route.ts",
  "app/api/ask/route.ts",
  "app/api/assistant/saved/route.ts",
  "app/api/assistant/saved/[savedId]/route.ts",
  "app/api/lease-renewal/collections/route.ts",
]) {
  let source = readFileSync(path, "utf8");
  source = source
    .replaceAll('from "@/lib/auth/session"', `from "${fixture}"`)
    .replaceAll(
      'from "@/lib/lease-renewal/shared-collection-source"',
      `from "${fixture}"`,
    )
    .replaceAll('from "@/lib/ask/service"', `from "${fixture}"`)
    .replaceAll('from "@/lib/llm/model-provider"', `from "${fixture}"`)
    .replaceAll('from "@/lib/operational-context/server-context"', `from "${fixture}"`);
  writeFileSync(path, source);
}
writeFileSync(
  "app/page.tsx",
  `export const dynamic = "force-dynamic"; export {HistoryFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/lease-renewal/collections/page.tsx",
  `export const dynamic = "force-dynamic"; export {CollectionsFixture as default} from "${fixture}";`,
);
mkdirSync("app/api/operations-verification-only", { recursive: true });
writeFileSync(
  "app/api/operations-verification-only/route.ts",
  `export {controlPOST as POST} from "${fixture}";`,
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
      const r = await fetch(origin, { signal: AbortSignal.timeout(10000) });
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
  assert.equal(r.status, 200);
  return r.json();
}
async function configure(context) {
  await context.route("**/*", (route) => {
    const request = route.request(),
      u = new URL(request.url());
    if (u.origin !== origin) return route.abort("blockedbyclient");
    if (!u.pathname.startsWith("/api/")) return route.continue();
    requests.push({ path: u.pathname, method: request.method() });
    if (
      u.pathname.startsWith("/api/assistant/history") ||
      u.pathname.startsWith("/api/assistant/saved") ||
      u.pathname === "/api/lease-renewal/collections" ||
      u.pathname === "/api/assistant/query" ||
      u.pathname === "/api/ask"
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
  context.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
}
async function layout(page, name) {
  assert.ok(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth + 2),
    `${name}: page overflow`,
  );
  if (name.includes("200")) await zoom.screenshot(page, join(output, `${name}.png`));
  else await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  checks.push(name);
}
try {
  await ready();
  const seed = await control({});
  assert.equal(
    seed.threadCount,
    1,
    "The fixture must not seed a second thread at build time",
  );
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await configure(context);
  const page = await context.newPage();
  await page.goto(origin);
  await page
    .getByText(
      "Correction remembered; this does not verify membership or owner authority.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.getByRole("region", { name: "Knowledge answer" }).count(), 2);
  assert.equal(
    requests.filter((r) => r.path.includes("query") || r.path === "/api/ask").length,
    0,
  );
  const pinned = () =>
      page.getByRole("navigation", { name: "Pinned conversations", exact: true }),
    history = () => page.getByRole("navigation", { name: "History", exact: true });
  let losePin = true;
  await page.route("**/api/assistant/history/metadata", async (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "pin" && losePin) {
      losePin = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await history()
    .getByRole("button", {
      name: "Pin conversation: Continuing monthly lease discussion",
      exact: true,
    })
    .click();
  await pinned()
    .getByRole("button", {
      name: "Retry pin change: Continuing monthly lease discussion",
      exact: true,
    })
    .waitFor();
  await pinned()
    .getByRole("button", {
      name: "Retry pin change: Continuing monthly lease discussion",
      exact: true,
    })
    .click();
  await pinned()
    .getByRole("button", {
      name: "Unpin conversation: Continuing monthly lease discussion",
      exact: true,
    })
    .waitFor();
  await control({ append: true });
  await pinned()
    .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
    .click();
  await page
    .getByText("Later accepted answer appears when this pin is reopened.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByRole("region", { name: "Knowledge answer" }).count(), 3);
  await page.reload();
  await page
    .getByText("Later accepted answer appears when this pin is reopened.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await pinned()
      .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
      .count(),
    1,
  );
  const positions = await page
    .locator(
      'nav[aria-label="Pinned conversations"],nav[aria-label="Saved questions"],nav[aria-label="History"]',
    )
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  await layout(page, "history-pins-wide");
  await pinned()
    .getByRole("button", {
      name: "Unpin conversation: Continuing monthly lease discussion",
      exact: true,
    })
    .click();
  await history()
    .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("navigation", { name: "Saved questions", exact: true })
      .getByText("Continuing monthly lease discussion", { exact: true })
      .count(),
  );
  checks.push(
    "whole-thread pin lost-response recovery, later accepted turn, refreshed restore, top placement and independent saved question",
  );
  await control({ padding: true });
  await history()
    .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
    .click();
  await page.getByText("Unrelated stored answer 4", { exact: true }).waitFor();
  const beforeAsk = await control({});
  let loseAnswerSave = true;
  await page.route("**/api/assistant/history/turns/*", async (route) => {
    if (route.request().method() === "PUT" && loseAnswerSave) {
      loseAnswerSave = false;
      assert.equal((await route.fetch()).status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("Why that MKD percentage policy?");
  await page
    .getByRole("form", { name: "Ask a question", exact: true })
    .getByRole("button", { name: "Get answer", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry saving", exact: true }).waitFor();
  await page.getByText(/Keep the corrected 3.5% discussion/).waitFor();
  const generated = await control({});
  assert.equal(generated.answers.length, beforeAsk.answers.length + 1);
  const actualMemory = generated.answers.at(-1).memory;
  assert.ok(actualMemory.totalTurns >= 7);
  assert.match(
    JSON.stringify(actualMemory),
    /Use 3.5%, pending actual membership and agreement evidence/,
  );
  assert.match(JSON.stringify(actualMemory), /Correction remembered/);
  const inferenceCount = generated.interpretations.length + generated.answers.length;
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry saving", exact: true })
    .waitFor({ state: "detached" });
  await page.reload();
  await page.getByText(/Keep the corrected 3.5% discussion/).waitFor();
  const restored = await control({});
  assert.equal(restored.interpretations.length + restored.answers.length, inferenceCount);
  assert.equal(
    (await page.request.get(`${origin}/api/assistant/history/${seed.thread}`)).status(),
    200,
  );
  checks.push(
    "actual Ask routes preserve older answer meaning beyond three turns; lost accepted save retries and reloads with no new inference",
  );
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Show my work");
  await page
    .getByRole("form", { name: "Ask a question", exact: true })
    .getByRole("button", { name: "Get answer", exact: true })
    .click();
  await page.getByText("Synthetic assigned follow-up", { exact: true }).waitFor();
  await page
    .getByText("Answer ready and saved to your history.", { exact: true })
    .waitFor();
  const mixed = await control({});
  const original = await (
    await page.request.get(`${origin}/api/assistant/history/${seed.thread}`)
  ).json();
  assert.ok(
    original.turns.some((t) => t.assistant?.groups?.some((g) => g.source === "work")),
  );
  assert.ok(
    original.turns.some((t) => t.knowledge?.answer?.includes("Keep the corrected 3.5%")),
  );
  assert.ok(mixed.reads.includes("work"));
  await layout(page, "history-mixed-wide");
  await page.setViewportSize({ width: 320, height: 800 });
  await layout(page, "history-mixed-phone");
  await page.setViewportSize({ width: 1280, height: 900 });
  await control({ narrow: true });
  await history()
    .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
    .click();
  await page
    .getByText("Your access has changed since this answer, so its records are hidden.", {
      exact: true,
    })
    .first()
    .waitFor();
  assert.equal(
    await page.getByText("Synthetic assigned follow-up", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByText(/Keep the corrected 3.5% discussion/).count(), 0);
  const afterNarrow = await control({});
  assert.equal(
    afterNarrow.interpretations.length + afterNarrow.answers.length,
    mixed.interpretations.length + mixed.answers.length,
  );
  checks.push(
    "one continuing mixed knowledge/operations thread; current-role narrowing removes cached answer details without inference",
  );
  await control({ actor: "browser-history-staff-two" });
  await page.reload();
  await page
    .getByText("No pinned conversations yet. Pin a whole thread to return to it here.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByText("Later accepted answer appears when this pin is reopened.", {
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(
    (await page.request.get(`${origin}/api/assistant/history/${seed.thread}`)).status(),
    404,
  );
  checks.push("second managed staff actor cannot read the first actor's private thread");
  await control({ actor: "browser-history-staff-one" });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Start a new conversation", exact: true })
    .waitFor();
  const beforeNew = await control({});
  await page
    .getByRole("button", { name: "Start a new conversation", exact: true })
    .click();
  await page.getByText(/Started a new conversation/).waitFor();
  assert.equal((await control({})).answers.length, beforeNew.answers.length);
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("Discuss MKD membership evidence in a fresh conversation");
  await page
    .getByRole("form", { name: "Ask a question", exact: true })
    .getByRole("button", { name: "Get answer", exact: true })
    .click();
  await page
    .getByText("Answer ready and saved to your history.", { exact: true })
    .waitFor();
  const afterNew = await control({});
  assert.equal(afterNew.threadCount, beforeNew.threadCount + 1);
  assert.equal(afterNew.answers.length, beforeNew.answers.length + 1);
  assert.deepEqual(afterNew.answers.at(-1).memory, {
    version: "private-conversation-memory/v1",
    totalTurns: 0,
    omittedTurns: 0,
    compressedTurns: 0,
    turns: [],
  });
  await page.reload();
  await page.getByRole("region", { name: "Knowledge answer", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Knowledge answer", exact: true }).count(),
    1,
  );
  assert.equal((await control({})).answers.length, afterNew.answers.length);
  await history()
    .getByRole("button", { name: "Continuing monthly lease discussion", exact: true })
    .click();
  await page
    .getByText("Later accepted answer appears when this pin is reopened.", {
      exact: true,
    })
    .waitFor();
  assert.equal((await control({})).answers.length, afterNew.answers.length);
  checks.push(
    "Explicit New conversation creates one separate accepted thread with no inherited memory; reload and reopening the original whole history perform no inference and retain its accepted turns",
  );
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("Create a RentVine work order for ticket synthetic-case");
  await page
    .getByRole("form", { name: "Ask a question", exact: true })
    .getByRole("button", { name: "Get answer", exact: true })
    .click();
  await page
    .getByText("Answer ready and saved to your history.", { exact: true })
    .waitFor();
  const operationLink = page.getByRole("link", {
    name: "Review the requested maintenance operation",
    exact: true,
  });
  assert.equal(
    await operationLink.getAttribute("href"),
    "/maintenance?ticket_id=synthetic-case",
  );
  assert.equal((await control({})).answers.length, afterNew.answers.length);
  assert.ok((await control({})).reads.includes("maintenance"));
  checks.push(
    "Actual Ask renders an explicit supported operation as the exact current record's normal staff control, without a model generation, command payload, provider attempt or effect receipt",
  );
  await control({ actor: "browser-history-staff-two" });
  await page.goto(`${origin}/lease-renewal/collections`);
  await page.getByLabel("Collection name", { exact: true }).fill("December team leases");
  await page.getByLabel("Period from", { exact: true }).fill("2026-12-01");
  await page.getByLabel("Period through", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Review monthly leases", exact: true }).click();
  await page.getByRole("region", { name: "Reviewed membership", exact: true }).waitFor();
  let loseSave = true;
  await page.route("**/api/lease-renewal/collections", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "save" &&
      loseSave
    ) {
      loseSave = false;
      assert.equal((await route.fetch()).status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Save reviewed collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check recorded change", exact: true })
    .waitFor();
  const pendingUrl = page.url();
  await page.reload();
  await page
    .getByRole("region", { name: "Current collection status", exact: true })
    .getByRole("heading", { name: "December team leases", exact: true })
    .waitFor();
  await page.getByText(/Reviewed membership version 1/).waitFor();
  const collectionUrl = page.url();
  assert.notEqual(collectionUrl, pendingUrl);
  checks.push(
    "reviewed shared monthly membership survives a lost save response and read-only reload receipt recovery",
  );
  await control({ complete: false });
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Renamed December team leases");
  await page.getByRole("button", { name: "Save collection name", exact: true }).click();
  await page.getByText(/Reviewed membership version 2/).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Current collection status" })
      .getByRole("listitem")
      .count(),
    2,
  );
  await page
    .getByRole("button", { name: "Refresh membership for review", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "complete current lease" }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Reviewed membership", exact: true }).count(),
    0,
  );
  await control({ complete: true, changed: true });
  await page.getByRole("button", { name: "Refresh current status", exact: true }).click();
  await page.getByText(/Unavailable; saved membership is kept/).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Current collection status" })
      .getByRole("listitem")
      .count(),
    2,
  );
  await page
    .getByRole("button", { name: "Refresh membership for review", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Reviewed membership", exact: true });
  await review.getByRole("heading", { name: "Additions (1)", exact: true }).waitFor();
  await review.getByRole("heading", { name: "Removals (1)", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Save reviewed collection", exact: true })
    .click();
  await page.getByText(/Reviewed membership version 3/).waitFor();
  await layout(page, "shared-collections-wide");
  await page.setViewportSize({ width: 760, height: 900 });
  await layout(page, "shared-collections-narrow");
  await page.setViewportSize({ width: 320, height: 800 });
  await layout(page, "shared-collections-phone");
  await control({ actor: "browser-history-staff-one", cycle: true });
  await page.goto(collectionUrl);
  await page
    .getByText(/Cycle changed; saved membership is kept/)
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Current collection status" })
      .getByRole("listitem")
      .count(),
    2,
  );
  await page.getByText(/Reviewed membership version 3/).waitFor();
  checks.push(
    "shared staff access, name-only save during source outage, incomplete refresh hold, explicit membership diff and stable changed-cycle membership",
  );
  zoom = await createLocalZoomContext(origin);
  await configure(zoom.context);
  const zp = await zoom.context.newPage();
  await zp.goto(collectionUrl);
  await zp
    .getByRole("region", { name: "Current collection status", exact: true })
    .waitFor();
  await zoom.setZoom(zp, 2);
  await layout(zp, "shared-collections-200-percent");
  assert.deepEqual(errors, []);
  const finalState = await control({});
  assert.equal(finalState.answers.length, afterNew.answers.length);
  assert.equal(finalState.interpretations.length, afterNew.interpretations.length);
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        checks,
        requests,
        errors,
        scope:
          "Production-built owning Ask, private history, metadata and shared collection controls/routes with actual emulator transactions; deterministic managed-actor/source adapters, no live customer/provider effects or human observation",
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

// Production-built header search and exact record navigation over actual emulator owners.
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
const fixture = "@/tests/browser/operations-search-fixture";
for (const path of [
  "app/api/search/entities/route.ts",
  "app/search/page.tsx",
  "app/search/open/page.tsx",
  "app/search/entity/page.tsx",
  "lib/search/server-search.ts",
]) {
  let source = readFileSync(path, "utf8");
  source = source
    .replace(
      'import { requireCapability } from "@/lib/auth/session";',
      `import {requireCapability} from "${fixture}";`,
    )
    .replaceAll('from "@/lib/auth/page-guards"', `from "${fixture}"`)
    .replaceAll('from "@/lib/lease-renewal/live-config"', `from "${fixture}"`)
    .replaceAll('from "@/lib/lease-renewal/admitted-notice-source"', `from "${fixture}"`);
  writeFileSync(path, source);
}
writeFileSync(
  "app/page.tsx",
  `export const dynamic = "force-dynamic"; export {SurfaceFixture as default} from "${fixture}";`,
);
for (const [path, title] of [
  ["app/maintenance/page.tsx", "Maintenance"],
  ["app/gmail-hub/page.tsx", "Communications"],
  ["app/work/page.tsx", "My Work"],
]) {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(
    path,
    `export const dynamic = "force-dynamic"; import {SurfaceFixture} from "${fixture}";export default async function Page(){return SurfaceFixture({title:${JSON.stringify(title)}});}`,
  );
}
for (const path of [
  "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx",
  "app/lease-renewal/live/desk/page.tsx",
])
  writeFileSync(
    path,
    `export const dynamic = "force-dynamic"; export {DestinationFixture as default} from "${fixture}";`,
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
assert.equal(built, true);
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
    if (u.pathname === "/api/search/entities") return route.continue();
    return route.abort("blockedbyclient");
  });
  context.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
}
async function layout(page, name) {
  // A viewport change resolves before Chromium's following resize/style frame. Measure the
  // rendered layout after two frames; keep the same strict overflow/overlap assertions.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.body.scrollWidth,
    html: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("body *")]
      .map((n) => {
        const r = n.getBoundingClientRect();
        return {
          tag: n.tagName,
          class: n.className,
          id: n.id,
          x: r.x,
          right: r.right,
          width: r.width,
          scroll: n.scrollWidth,
        };
      })
      .filter((r) => r.width && r.right > innerWidth + 2)
      .slice(0, 50),
  }));
  writeFileSync(join(output, `layout-${name}.json`), JSON.stringify(geometry, null, 2));
  assert.ok(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth + 2),
    `${name}: page overflow`,
  );
  const boxes = await page.locator(".topbar > *").evaluateAll((nodes) =>
    nodes
      .map((n) => {
        const r = n.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          w: r.width,
          h: r.height,
        };
      })
      .filter((b) => b.w && b.h),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert.ok(
        Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1 ||
          Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1,
        `${name}: header controls overlap`,
      );
    }
  if (name.includes("200")) await zoom.screenshot(page, join(output, `${name}.png`));
  else await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  checks.push(name);
}
try {
  await ready();
  const seed = await control({});
  for (const path of [
    "/search?q=Miller&type=all",
    "/search/open?type=lease&id=702",
    "/search/entity?type=property&id=901",
    "/maintenance",
    "/gmail-hub",
    "/work",
    "/lease-renewal/live/desk/lease/701",
    "/lease-renewal/live/desk/lease/702",
    "/lease-renewal/live/desk",
    "/api/search/entities?q=East+1&limit=8",
    "/api/search/entities?q=Miller&limit=50",
  ]) {
    const warm = await fetch(origin + path);
    await warm.text();
    assert.equal(warm.status, 200);
  }
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await configure(context);
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator(".appearance-trigger[data-ready=true]").waitFor();
  await page
    .getByLabel("Unsaved local note")
    .fill("Edited before search and kept across new tabs");
  const input = page.getByRole("combobox", { name: "Search records", exact: true });
  await input.fill("East 1");
  await page
    .getByRole("option", { name: /East 123 Fixture Lane/ })
    .first()
    .waitFor();
  assert.equal(await input.getAttribute("aria-activedescendant"), null);
  assert.equal(
    await page.getByLabel("Unsaved local note").inputValue(),
    "Edited before search and kept across new tabs",
  );
  const pop = await Promise.all([context.waitForEvent("page"), input.press("Enter")]);
  const all = pop[0];
  await all.waitForURL(/\/search\?q=East\+1&type=all/);
  await all.getByRole("heading", { name: "Entity search", exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Unsaved local note").inputValue(),
    "Edited before search and kept across new tabs",
  );
  assert.equal(new URL(page.url()).pathname, "/");
  await all.close();
  checks.push(
    "Enter with no active suggestion opens complete query results in a new tab and preserves the unsaved starting workspace",
  );
  await page.bringToFront();
  await input.focus();
  assert.equal(await input.inputValue(), "East 1");
  await input.press("ArrowDown");
  await page.waitForFunction(
    () =>
      !!document
        .querySelector('input[aria-label="Search records"],input[role="combobox"]')
        ?.getAttribute("aria-activedescendant"),
  );
  const selectedId = await input.getAttribute("aria-activedescendant");
  assert.ok(selectedId);
  const selectedHref = await page.locator(`[id="${selectedId}"]`).getAttribute("href"),
    targetType = new URL(selectedHref, origin).searchParams.get("type"),
    targetId = new URL(selectedHref, origin).searchParams.get("id");
  const [selected] = await Promise.all([
    context.waitForEvent("page"),
    input.press("Enter"),
  ]);
  await selected.waitForURL((url) => url.pathname !== "/search/open");
  assert.equal(targetType, "lease");
  assert.equal(
    new URL(selected.url()).pathname,
    `/lease-renewal/live/desk/lease/${targetId}`,
  );
  assert.equal(new URL(selected.url()).hash, "");
  await selected.close();
  checks.push(
    "deliberate arrow selection opens the exact fresh lease destination at its top",
  );
  await input.fill("Miller");
  await page.getByLabel("Search entity type", { exact: true }).selectOption("owner");
  await page.getByRole("option", { name: /Owner · 101/ }).waitFor();
  await page.getByRole("option", { name: /Owner · 102/ }).waitFor();
  const owner = page.getByRole("option", { name: /Owner · 102/ });
  const [ownerPage] = await Promise.all([context.waitForEvent("page"), owner.click()]);
  await ownerPage.waitForURL(
    (url) =>
      url.pathname === "/lease-renewal/live/desk" && !!url.searchParams.get("ownerKey"),
  );
  assert.match(new URL(ownerPage.url()).searchParams.get("ownerKey"), /^p2_/);
  await ownerPage.close();
  checks.push(
    "equal-name owners remain distinct and a pointer selection opens the exact source-ID related-lease filter",
  );
  await page.goto(`${origin}/search?q=Miller&type=all`);
  await page.getByRole("button", { name: "Load more results", exact: true }).waitFor();
  const first = await page.locator(".entity-search-results > li").count();
  assert.equal(first, 50);
  await page.getByRole("button", { name: "Load more results", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".entity-search-results > li").length > 50,
  );
  const links = await page
    .locator(".entity-search-results a")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  assert.equal(links.length, new Set(links).size);
  await page.getByLabel("Entity type", { exact: true }).selectOption("owner");
  await page.waitForFunction(
    () => document.querySelectorAll(".entity-search-results > li").length === 2,
  );
  assert.equal(new URL(page.url()).searchParams.get("q"), "Miller");
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".entity-search-results > li").length === 2,
  );
  assert.equal(
    await page.getByLabel("Entity type", { exact: true }).inputValue(),
    "owner",
  );
  checks.push(
    "full results paginate without duplicates, type filters retain the query and refresh preserves both",
  );
  await control({ failed: true });
  await page.goto(`${origin}/search?q=Miller&type=all`);
  await page
    .getByText(
      "Lease and related entity metadata could not be read. Retry this search.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.locator(".entity-search-results > li").count(), 2);
  await control({ failed: false, removed: true });
  await page.goto(`${origin}/search/open?type=lease&id=701`);
  await page.getByRole("heading", { name: "Record unavailable", exact: true }).waitFor();
  checks.push(
    "failed source has an explicit limitation and selected deleted identity cannot navigate to another lease",
  );
  await control({ removed: false });
  for (const path of [
    "/",
    "/maintenance",
    "/gmail-hub",
    "/work",
    "/lease-renewal/live/desk/lease/702",
  ]) {
    await page.goto(origin + path);
    await page.getByRole("combobox", { name: "Search records", exact: true }).waitFor();
    assert.equal(await page.locator(".brand").getAttribute("href"), "/");
    assert.ok(
      await page.getByRole("navigation", { name: "Primary", exact: true }).count(),
    );
  }
  checks.push(
    "one actual shared AppShell exposes the search and home navigation across five signed-in surfaces",
  );
  await page
    .getByRole("combobox", { name: "Search records", exact: true })
    .fill("East 1");
  await page
    .getByRole("option", { name: /East 123 Fixture Lane/ })
    .first()
    .waitFor();
  await layout(page, "search-header-wide-light");
  await page.getByRole("button", { name: /Appearance:/ }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("radio", { name: "Dark", exact: true }).press("Escape");
  await page.getByRole("combobox", { name: "Search records", exact: true }).focus();
  await layout(page, "search-header-wide-dark");
  for (const width of [760, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await layout(page, `search-header-${width}`);
  }
  zoom = await createLocalZoomContext(origin);
  await configure(zoom.context);
  const zp = await zoom.context.newPage();
  await zp.goto(origin);
  await zoom.setZoom(zp, 2);
  await zp.getByRole("combobox", { name: "Search records", exact: true }).fill("East 1");
  await zp
    .getByRole("option", { name: /East 123 Fixture Lane/ })
    .first()
    .waitFor();
  await layout(zp, "search-header-200-percent");
  assert.deepEqual(errors, []);
  assert.ok(requests.every((r) => r.method === "GET"));
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        checks,
        requests,
        errors,
        scope:
          "Actual compiled AppShell/search UI, HTTP search and fresh resolver with owning emulator metadata; synthetic auth/provider and destination-surface adapters; no live effects or human observation",
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

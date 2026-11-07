// S243 R-S243-5 / R-S243-6: capture, check or inspect every help scene against the isolated
// synthetic rehearsal only. Run it through scripts/run-help-rehearsal.sh (managed mode), which
// starts a disposable worktree at the committed HEAD and a Firestore emulator; this script then
// starts the real Next dev server in the Demo descriptor with the synthetic RentVine transport and
// every other outbound connection refused, seeds synthetic fixtures, signs in with each scene's
// local demo role and captures the scene's region at its fixed viewport.
//
// Attach mode (`--base-url http://localhost:<port>`) reuses an already running isolated
// rehearsal. It refuses any origin that is not loopback HTTP, and it refuses a rehearsal whose
// served commit differs from this checkout's HEAD unless `--allow-overlay` is given (recorded).
//
// Modes: default capture; `--check` resolves every scene and writes nothing into the tree;
// `--controls [file]` runs the control-name browser check over every control the manual names
// (or over a list emitted by check-help-controls --emit);
// `--outline` writes role/name outlines of every route to private state; `--serve` keeps the
// rehearsal running. Scenes that cannot be captured are reported and fail the run; none is skipped.
//
// Page functions are plain strings: the script may run under a TypeScript loader whose name
// helpers do not exist inside the browser.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer, Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { compareHelpScene } from "./lib/help-scene-drift.mjs";
import { HELP_FIXTURE_INSTANT } from "./lib/help-rehearsal-clock.mjs";
import { resolveBrowserExecutable } from "./lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "./lib/help-rehearsal-origin.mjs";

const SCENES_PATH = "lib/help/content/scenes.json";
const ROUTE_BUDGET_MS = 120_000;

// Bring a framed region to the top of the viewport, below every sticky or fixed bar pinned to the
// top (for example the renewal workspace toolbar). Element functions are built from source text at
// run time: Playwright calls a function with the element but only evaluates a string as an
// expression, and a function compiled by the TypeScript loader would carry its name helper into the
// page.
const SCROLL_TO_TOP = new Function(
  "element",
  `element.scrollIntoView({ block: "start" });
  let cover = 0;
  for (const node of document.querySelectorAll("body *")) {
    const style = getComputedStyle(node);
    if (style.position !== "sticky" && style.position !== "fixed") continue;
    const rect = node.getBoundingClientRect();
    if (rect.top <= 1 && rect.width > innerWidth * 0.5 && rect.bottom < innerHeight * 0.6)
      cover = Math.max(cover, rect.bottom);
  }
  window.scrollBy(0, -(cover + 12));`,
);

// A scene with `align: "center"` centers its region in the viewport instead.
const SCROLL_TO_CENTER = new Function(
  "element",
  `element.scrollIntoView({ block: "center" });`,
);

// Where a framed region sits in the viewport, to confirm the framing held before the capture.
const PLACEMENT = new Function(
  "element",
  `const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: innerHeight };`,
);
const placed = (placement, align) =>
  align === "center"
    ? placement.top < placement.height && placement.bottom > 0
    : placement.top >= 0 && placement.top < placement.height * 0.6;

// The Next dev overlay (build and compile indicator) is development chrome, not the interface.
const HIDE_DEV_OVERLAY = "nextjs-portal { display: none !important; }";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const joined = argv.find((entry) => entry.startsWith(`${name}=`));
  if (joined) return joined.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const managed = flag("--managed");
const verify = flag("--verify");
const proposals = flag("--review-captures");
const fixedFixture = managed && Boolean(process.env.HELP_REHEARSAL_CLOCK_ORIGIN);
const mode = flag("--serve")
  ? "serve"
  : flag("--outline")
    ? "outline"
    : option("--controls") !== undefined || flag("--controls")
      ? "controls"
      : flag("--check")
        ? "check"
        : "capture";
const allowOverlay = flag("--allow-overlay");
const only = option("--only");
const manifest = JSON.parse(readFileSync(SCENES_PATH, "utf8"));
const helpVersion = manifest.version;
assert.match(
  helpVersion,
  /^V[1-9]\d*\.\d+$/,
  "The scene manifest names no help version.",
);

const output = managed
  ? process.env.HELP_REHEARSAL_OUTPUT
  : join(
      process.env.HOME ?? "/tmp",
      ".local/state/pmi-kc-help-rehearsal",
      `attach-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
assert.ok(output, "No private output directory for this run.");
mkdirSync(output, { recursive: true });
const log = createWriteStream(join(output, "capture-log.jsonl"), { flags: "a" });
const record = (entry) =>
  log.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

let server = null;
let origin;
let sourceSha;
if (managed) {
  if (process.cwd() === "/app") {
    assert.equal(process.env.HELP_REHEARSAL_ISOLATED, "kernel-v1");
    assert.match(process.env.PMI_SOURCE_MANIFEST_SHA256 ?? "", /^[a-f0-9]{64}$/);
  } else {
    assert.match(process.cwd(), /^\/tmp\/pmi-kc-help-rehearsal-[^/]+\/worktree$/);
  }
  assert.equal(
    globalThis.fetch.name,
    "guardedFetch",
    "The Help rehearsal preload is required.",
  );
  assert.equal(Socket.prototype.connect.name, "guardedConnect");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
  sourceSha = process.env.HELP_REHEARSAL_SOURCE_SHA;
  assert.match(sourceSha ?? "", /^[a-f0-9]{40}$/);
  const port = await freePort();
  origin = `http://localhost:${port}`;
  server = startServer(port);
  await waitForServer(origin);
  const { seedHelpRehearsal } = await import("./lib/help-rehearsal-fixtures.mjs");
  const seeded = await seedHelpRehearsal();
  record({ event: "seeded", collections: seeded });
} else {
  const base = option("--base-url");
  if (!base)
    throw new Error(
      "Run through scripts/run-help-rehearsal.sh, or pass --base-url for a running isolated rehearsal.",
    );
  origin = requireLoopbackRehearsalOrigin(base);
  sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

const served = await fetch(`${origin}/api/version`)
  .then((response) => response.json())
  .catch(() => ({ commit: "unknown" }));
const overlay = managed ? process.env.HELP_REHEARSAL_OVERLAY === "true" : allowOverlay;
if (served.commit !== sourceSha && !allowOverlay) {
  await shutdown();
  throw new Error(
    `The rehearsal serves ${served.commit}, not this checkout's ${sourceSha}. Pass --allow-overlay to capture an uncommitted tree; the capture log records it.`,
  );
}
record({
  event: "start",
  mode,
  origin,
  sourceSha,
  servedCommit: served.commit,
  overlay,
  allowOverlay,
  helpVersion,
  fixtureClock: fixedFixture ? HELP_FIXTURE_INSTANT : null,
});

const browser = await chromium.launch({
  executablePath: fixedFixture
    ? process.env.PLAYWRIGHT_CHROME_PATH || chromium.executablePath()
    : resolveBrowserExecutable(),
  headless: true,
});
if (managed) {
  // S252: the prepared lease (its templates, signature and stored comparison) before any scene.
  const { seedHelpPreparedLease } = await import("./lib/help-rehearsal-fixtures.mjs");
  const context = await browser.newContext({
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  try {
    const { automaticStartSetting, routeFromPage } =
      await import("./lib/one-path-rehearsal/seeds.mjs");
    await signIn(page, "Editor");
    const setting = await automaticStartSetting(
      page,
      false,
      "Rendered Help rehearsal holds automatic preparation.",
    );
    assert.equal(setting.state, "seeded", setting.detail);
    const currentSetting = await routeFromPage(
      page,
      "/api/lease-renewal/kickoff-settings",
    );
    assert.equal(
      currentSetting.body?.enabled,
      false,
      "Automatic preparation must stay off.",
    );
    const prepared = await seedHelpPreparedLease({
      page,
      signIn: (role) => signIn(page, role),
    });
    record({ event: "prepared-lease", ...prepared });
    process.stdout.write(`prepared lease ${prepared.leaseId}: ${prepared.detail}\n`);
  } catch (error) {
    await browser.close().catch(() => undefined);
    await shutdown();
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
}
let exitCode = 0;
try {
  if (verify) {
    assert.ok(
      fixedFixture && !overlay && !only,
      "Rendered Help verification needs the full, exact guarded fixture.",
    );
    const sceneStatus = await scenes(true);
    const controlStatus = await controls();
    exitCode = controlStatus || sceneStatus;
  } else if (mode === "serve") {
    process.stdout.write(
      `Help rehearsal serving ${origin} (commit ${served.commit}). Sign in at ${origin}/sign-in with the local demo roles. Stop with Ctrl+C.\n`,
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  } else if (mode === "outline") {
    exitCode = await outline();
  } else if (mode === "controls") {
    exitCode = await controls(option("--controls"));
  } else {
    exitCode = await scenes(mode === "check");
  }
} finally {
  await browser.close().catch(() => undefined);
  await shutdown();
  log.end();
}
process.exit(exitCode);

// Captures (or, with check, resolves) every scene in manifest order.
async function scenes(checkOnly) {
  const target = join(
    proposals ? output : (process.env.HELP_REHEARSAL_TARGET_ROOT ?? process.cwd()),
    "public/help",
    helpVersion,
  );
  if (!checkOnly) mkdirSync(target, { recursive: true });
  const results = [];
  for (const scene of manifest.scenes) {
    if (only && scene.id !== only) continue;
    if (scene.source !== "rehearsal") {
      results.push({
        id: scene.id,
        fixture: scene.fixture,
        state: "provider-only",
        source: scene.source,
      });
      continue;
    }
    try {
      const png = await captureScene(scene);
      const sha256 = createHash("sha256").update(png).digest("hex");
      const filename = `${scene.id}.png`;
      let state = checkOnly ? "resolved" : "captured";
      let difference;
      if (!checkOnly) writeFileSync(join(target, filename), png);
      if (verify) {
        const baseline = join(target, filename);
        difference = existsSync(baseline)
          ? await compareHelpScene(readFileSync(baseline), png)
          : { material: true, reason: "The committed synthetic picture is missing." };
        if (difference.material) {
          const replacement = join(output, "scene-drift", scene.id);
          mkdirSync(replacement, { recursive: true });
          if (existsSync(baseline))
            writeFileSync(join(replacement, "expected.png"), readFileSync(baseline));
          writeFileSync(join(replacement, "observed.png"), png);
          state = "drift";
        } else state = "matched";
      }
      results.push({ id: scene.id, fixture: scene.fixture, state, sha256, difference });
      process.stdout.write(`${state} ${scene.id}\n`);
    } catch (error) {
      results.push({
        id: scene.id,
        state: "uncaptured",
        reason: String(error?.message ?? error).slice(0, 400),
      });
      process.stdout.write(
        `UNCAPTURED ${scene.id}: ${String(error?.message ?? error)}\n`,
      );
    }
  }
  const uncaptured = results.filter((entry) => entry.state === "uncaptured");
  const drift = results.filter((entry) => entry.state === "drift");
  const summary = {
    event: checkOnly ? "check" : "capture",
    sourceSha,
    servedCommit: served.commit,
    overlay,
    helpVersion,
    scenes: results,
    uncaptured: uncaptured.map((entry) => entry.id),
    drift: drift.map((entry) => entry.id),
  };
  record(summary);
  writeFileSync(join(output, "scenes.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `Help scenes: ${results.length}, ${uncaptured.length} uncaptured, ${drift.length} materially changed. Log: ${output}\n`,
  );
  return uncaptured.length || drift.length ? 1 : 0;
}

async function captureScene(scene) {
  const context = await browser.newContext({
    viewport: scene.viewport,
    deviceScaleFactor: 1,
    timezoneId: "America/Chicago",
    locale: "en-US",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  try {
    if (fixedFixture) await page.clock.setFixedTime(new Date(HELP_FIXTURE_INSTANT));
    await signIn(page, scene.role);
    await page.goto(`${origin}${await resolveRoute(page, scene.route)}`, {
      waitUntil: "domcontentloaded",
    });
    // A click before hydration is lost (a menu or view switch would not open), so let the page
    // load its scripts and first reads before acting.
    await quiet(page);
    for (const action of scene.actions ?? []) await perform(page, action);
    // Let in-page navigation (for example a view switch that updates the URL) and data reads finish
    // first: a late navigation would scroll the page back to the top after the region is framed.
    await quiet(page);
    const region = locate(page, scene.region);
    await region.first().waitFor({ state: "visible" });
    const framed = scene.region && scene.region !== "page";
    if (framed && scene.frame === "viewport") {
      // Frame the region, let the page settle and confirm it is still where it was put; a late
      // layout change gets one more framing. A region that will not hold its place fails the scene.
      let placement;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await region
          .first()
          .evaluate(scene.align === "center" ? SCROLL_TO_CENTER : SCROLL_TO_TOP);
        await quiet(page);
        placement = await region.first().evaluate(PLACEMENT);
        if (placed(placement, scene.align)) break;
      }
      assert.ok(
        placed(placement, scene.align),
        `scene ${scene.id} region ${scene.region} is not framed (top ${Math.round(placement.top)} of ${placement.height}).`,
      );
    } else if (framed) await region.first().scrollIntoViewIfNeeded();
    await quiet(page);
    return scene.frame === "region"
      ? await region.first().screenshot({ animations: "disabled", caret: "hide" })
      : await page.screenshot({ animations: "disabled", caret: "hide" });
  } finally {
    await context.close();
  }
}

// The control-name browser check (R-S242-8): every listed control by role and exact accessible
// name inside its stated region. Required controls must be visible; conditional ones report.
// Without a list file it checks every control the manual in this worktree names.
async function controls(file) {
  const listed = file !== undefined && !file.startsWith("--");
  assert.ok(!listed || existsSync(file), `No control list at ${file}.`);
  const list = listed
    ? JSON.parse(readFileSync(file, "utf8"))
    : { controls: (await import("./check-help-controls.mjs")).collectHelpControls() };
  const context = await browser.newContext({
    viewport: { width: 1360, height: 1000 },
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  const byPage = new Map();
  for (const control of list.controls) {
    const key = `${control.role ?? "Admin"}|${control.route}|${(control.actions ?? []).join(",")}`;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(control);
  }
  const report = [];
  let signedInAs = null;
  for (const [key, entries] of byPage) {
    const [role, route] = key.split("|");
    if (signedInAs !== role) {
      await signIn(page, role);
      signedInAs = role;
    }
    let status = null;
    try {
      const response = await page.goto(`${origin}${await resolveRoute(page, route)}`, {
        waitUntil: "domcontentloaded",
      });
      status = response?.status() ?? null;
      const destination = new URL(page.url());
      if (
        !response?.ok() ||
        destination.origin !== origin ||
        destination.pathname === "/sign-in"
      )
        throw new Error(
          `Expected the signed-in route for ${role}. HTTP ${status} at ${destination.pathname}.`,
        );
      // Act only after hydration; a click on a server-rendered button before it is lost.
      await quiet(page);
      for (const action of entries[0].actions ?? []) await perform(page, action);
    } catch (error) {
      for (const entry of entries)
        report.push({
          ...entry,
          state: "missing",
          reason: `route: ${String(error).slice(0, 200)}`,
        });
      continue;
    }
    const states = await Promise.all(entries.map((entry) => controlState(page, entry)));
    for (const [index, entry] of entries.entries()) {
      const state = states[index];
      report.push({
        ...entry,
        state,
        status,
        ...(state === "unavailable"
          ? {
              reason:
                "The documented conditional state did not occur for this role and synthetic fixture.",
            }
          : {}),
      });
      process.stdout.write(
        `${state.padEnd(11)} ${entry.owner} ${entry.step ?? ""} ${entry.role ? `[${entry.role}]` : ""} ${entry.controlRole} "${entry.label}"\n`,
      );
    }
  }
  await context.close();
  const missing = report.filter((entry) => entry.state === "missing");
  writeFileSync(join(output, "controls.json"), `${JSON.stringify(report, null, 2)}\n`);
  record({
    event: "controls",
    total: report.length,
    visible: report.filter((entry) => entry.state === "visible").length,
    unavailable: report.filter((entry) => entry.state === "unavailable").length,
    missing: missing.map((entry) => `${entry.owner}#${entry.step ?? entry.label}`),
  });
  process.stdout.write(
    `Help control check: ${report.length} controls, ${report.filter((entry) => entry.state === "visible").length} visible, ${report.filter((entry) => entry.state === "unavailable").length} conditional-unavailable, ${missing.length} missing. Report: ${join(output, "controls.json")}\n`,
  );
  return missing.length ? 1 : 0;
}

async function controlState(page, entry) {
  const match = controlLocator(page, entry).first();
  try {
    await match.waitFor({
      state: "visible",
      timeout: entry.availability === "conditional" ? 4_000 : 20_000,
    });
    return "visible";
  } catch {
    return entry.availability === "conditional" ? "unavailable" : "missing";
  }
}

// The same semantic locators as scripts/lib/renewal-guide-controls.mjs, plus one case it does not
// need: a select wrapped in its label, whose label text runs straight into the option text (for
// example "Date fieldRentVine lease end"), is found by the label's leading words. A following
// lowercase letter means a longer label ("Date fields"), so it does not match.
function controlLocator(page, entry) {
  const scope = entry.region ? locate(page, entry.region) : page;
  const exact = (text) => new RegExp(`^\\s*${escape(text)}\\s*$`);
  switch (entry.controlRole) {
    case "summary":
      return scope.locator("summary").filter({ hasText: exact(entry.label) });
    case "label":
      return scope.getByLabel(entry.label, { exact: true }).or(
        scope
          .locator("label", {
            hasText: new RegExp(`^\\s*${escape(entry.label)}(?![a-z])`),
          })
          .locator("select"),
      );
    case "phase":
      return scope
        .getByRole("navigation", { name: "Renewal phases", exact: true })
        .getByRole("link")
        .filter({ has: page.getByText(entry.label, { exact: true }) });
    default:
      return scope.getByRole(entry.controlRole, { name: entry.label, exact: true });
  }
}

// `role:Name` scopes by role and exact name; a bare name is a region; `css:` is a selector.
function locate(page, region) {
  // "page" frames the top of the page as it opens, without scrolling.
  if (!region || region === "page") return page.locator("body");
  if (region.startsWith("css:")) return page.locator(region.slice(4));
  const [role, ...name] = region.split(":");
  return name.length
    ? page.getByRole(role, { name: name.join(":"), exact: true })
    : page.getByRole("region", { name: region, exact: true });
}

async function perform(page, action) {
  const [kind, ...rest] = action.split(":");
  const argument = rest.join(":");
  if (kind === "click-button") {
    // S252: a toggle (the Lease view switch, a Renewal path step) reports aria-pressed. A press
    // that lands before the page hydrates is lost, so a toggle is pressed until it reports pressed.
    const button = page.getByRole("button", { name: argument, exact: true }).first();
    for (let press = 1; ; press += 1) {
      await button.click();
      await page.waitForTimeout(250);
      // A button that opens something and goes away (Show anticipated work) is done.
      if ((await button.count()) === 0) break;
      const pressed = await button
        .getAttribute("aria-pressed", { timeout: 2_000 })
        .catch(() => null);
      if (pressed === null || pressed === "true") break;
      assert.ok(press < 10, `The ${argument} button did not take the press.`);
      await page.waitForTimeout(1000);
    }
  } else if (kind === "click-link") {
    await page.getByRole("link", { name: argument, exact: true }).first().click();
    // S252: All leases and filters is an in-page navigation; wait for the table it opens.
    if (argument === "All leases and filters")
      await page.locator("table.renewal-table").first().waitFor({ state: "visible" });
  } else if (kind === "open-summary")
    await page
      .locator("summary")
      .filter({ hasText: new RegExp(`^\\s*${escape(argument)}\\s*$`) })
      .first()
      .click();
  else if (kind === "wait-text")
    await page.getByText(argument, { exact: false }).first().waitFor();
  else if (kind === "scroll-to")
    await locate(page, argument).first().scrollIntoViewIfNeeded();
  else if (kind === "focus")
    await page.getByRole("button", { name: argument, exact: true }).first().focus();
  else if (kind === "print-media") await page.emulateMedia({ media: "print" });
  else throw new Error(`Unknown scene action ${action}.`);
  await page.waitForTimeout(300);
}

async function resolveRoute(page, route) {
  if (!route.includes("[")) return route;
  const fixtures = manifest.routeParameters ?? {};
  let resolved = route;
  for (const [name, value] of Object.entries(fixtures)) {
    resolved = resolved.replaceAll(`[${name}]`, value);
  }
  assert.ok(!resolved.includes("["), `No synthetic fixture resolves ${route}.`);
  return resolved;
}

async function signIn(page, role) {
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  const ok = await page.evaluate(
    `fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role:${JSON.stringify(role)}})}).then(r=>r.ok)`,
  );
  assert.ok(ok, `Local demo ${role} sign-in failed.`);
}

async function quiet(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await settle(page);
}

async function settle(page) {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
  await page.waitForTimeout(500);
}

async function outline() {
  const routes = new Set([
    ...manifest.scenes.map(
      (scene) => `${scene.role}|${scene.route}|${(scene.actions ?? []).join(",")}`,
    ),
    ...(manifest.outlineRoutes ?? []).map((route) => `Admin|${route}|`),
    ...(manifest.outlineVariants ?? []).map(
      (variant) =>
        `${variant.role}|${variant.route}|${(variant.actions ?? []).join(",")}`,
    ),
  ]);
  const dir = join(output, "outlines");
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  let signedInAs = null;
  for (const key of routes) {
    const [role, route, actionList] = key.split("|");
    const actions = actionList ? actionList.split(",") : [];
    if (signedInAs !== role) {
      await signIn(page, role);
      signedInAs = role;
    }
    const file = join(
      dir,
      `${role}${route.replace(/[^a-zA-Z0-9]+/g, "_")}${actions.length ? `__${actions.join("_").replace(/[^a-zA-Z0-9]+/g, "_")}` : ""}.txt`,
    );
    try {
      const response = await page.goto(`${origin}${await resolveRoute(page, route)}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .locator("main")
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1500);
      for (const action of actions) await perform(page, action);
      const snapshot = await page.locator("body").ariaSnapshot();
      writeFileSync(
        file,
        `# ${role} ${route} -> ${page.url()} (${response?.status()})\n${snapshot}\n`,
      );
      process.stdout.write(`outlined ${role} ${route}\n`);
    } catch (error) {
      writeFileSync(file, `# ${role} ${route} FAILED ${String(error).slice(0, 300)}\n`);
    }
  }
  await context.close();
  process.stdout.write(`Outlines: ${dir}\n`);
  return 0;
}

function startServer(port) {
  const preload = join(process.cwd(), "tests/browser/renewal-novdec-journey-network.mjs");
  const serverHome = join(output, "server-home");
  mkdirSync(serverHome, { recursive: true });
  writeFileSync(
    join(serverHome, "synthetic-adc.json"),
    JSON.stringify({
      type: "authorized_user",
      client_id: "synthetic-help",
      client_secret: "synthetic-help",
      refresh_token: "synthetic-help",
    }),
  );
  const serverLog = createWriteStream(join(output, "server.log"));
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      // A minimal environment: no inherited credential, account or provider variable reaches it.
      env: {
        PATH: process.env.PATH,
        HOME: serverHome,
        GOOGLE_APPLICATION_CREDENTIALS: join(serverHome, "synthetic-adc.json"),
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        LANG: "en_US.UTF-8",
        TZ: "America/Chicago",
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          `--import=${preload}`,
          fixedFixture &&
            `--import=${join(process.cwd(), "scripts/lib/help-rehearsal-clock.mjs")}`,
        ]
          .filter(Boolean)
          .join(" "),
        ...(fixedFixture
          ? { HELP_REHEARSAL_CLOCK_ORIGIN: process.env.HELP_REHEARSAL_CLOCK_ORIGIN }
          : {}),
        NOVDEC_JOURNEY_NETWORK_LOG: join(output, "network.jsonl"),
        NOVDEC_JOURNEY_OUTAGE_FLAG: join(output, "synthetic-rentvine-outage"),
        HELP_REHEARSAL_SHEET_FIXTURE: join(
          process.cwd(),
          "scripts/lib/help-rehearsal-sheet.json",
        ),
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "demo",
        LOCAL_DEMO_AUTH: "true",
        ASK_DEMO_MODE: "true",
        APP_COMMIT_SHA: sourceSha,
        FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
        FIREBASE_PROJECT_ID: "pmi-kc-kb-help-rehearsal-test",
        GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-help-rehearsal-test",
        CLOUDSDK_CONFIG: join(output, "no-gcloud-config"),
        RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
        RENTVINE_API_KEY: "synthetic-help-key",
        RENTVINE_API_SECRET: "synthetic-help-secret",
        RENEWAL_SHEET_ID: "synthetic-help-sheet",
        SHEETS_IMPERSONATE_SA: "synthetic-help@example.invalid",
        SHEETS_DWD_SUBJECT: "synthetic-help@pmikcmetro.com",
      },
    },
  );
  child.stdout.pipe(serverLog, { end: false });
  child.stderr.pipe(serverLog, { end: false });
  return child;
}

async function waitForServer(base) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    assert.ok(
      server && server.exitCode === null && !server.signalCode,
      "The local dev server exited before readiness.",
    );
    try {
      const response = await fetch(`${base}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("The local dev server did not become ready.");
}

async function shutdown() {
  if (!server) return;
  const child = server;
  server = null;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function freePort() {
  return new Promise((resolve) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

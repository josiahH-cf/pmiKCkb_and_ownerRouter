import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S145 compiled-browser check of the lease Focus view on the local rehearsal (Demo + live
// read-only, which refuses every write). It opens live lease workspaces, records each Full view
// signature, enters and leaves Focus by pointer and keyboard at desktop and phone widths, and
// requires the Full view to return to the same signature with no write request, navigation or
// page error. It never presses a record, prepare, draft or send control, and it prints structure
// only: no lease identifier, party, address or amount leaves the browser.

import { chromium } from "playwright-core";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const ROUTE_BUDGET_MS = 180_000;
const LEASES = Number(readArgument("--leases") ?? "2");
const DIRTY_MARKER = "S145 unsaved input check";
// Each page's in-flight fetch and XHR reads, tracked from the moment it opens.
const inflightReads = new WeakMap();

const cdpUrl = readArgument("--cdp-url") ?? process.env.DESK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ executablePath: findBrowserExecutable(), headless: true });

const results = [];
try {
  const hrefs = await workspaceLinks();
  for (const href of hrefs) {
    if (results.length >= LEASES) break;
    const result = await verifyLease(href);
    if (result) results.push(result);
  }
} finally {
  await browser.close();
}

assert(
  results.length > 0,
  "No live lease workspace offered the Full view / Focus view switch.",
);
for (const [index, result] of results.entries())
  process.stdout.write(`Lease workspace ${index + 1}: ${JSON.stringify(result)}\n`);
process.stdout.write(
  `S145 Focus view browser smoke passed on ${results.length} live lease workspace(s): Full view is the default, Focus shows one task, and the Full view returns to the same signature by pointer and keyboard at desktop and phone widths with no write request, navigation or page error.\n`,
);

async function workspaceLinks() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await signIn(page);
  await page.goto(`${baseUrl}/lease-renewal`, { waitUntil: "domcontentloaded" });
  const links = page.locator(
    'table.renewal-table tbody tr[data-workspace-available="true"]:is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"]) a.renewal-lease-link',
  );
  await links.first().waitFor();
  const hrefs = (
    await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))
  )
    .filter((href) => href?.startsWith("/lease-renewal/live/desk/lease/"))
    .slice(0, LEASES + 3);
  await context.close();
  assert(
    hrefs.length > 0,
    "No verified lease workspace is available for the Focus smoke.",
  );
  return hrefs;
}

async function verifyLease(href) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  trackReads(page);
  const pageErrors = [];
  const consoleErrors = new Set();
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("console", (message) => {
    // The kind of message only: digits and quoted values are masked and the text is cut short.
    if (message.type() === "error")
      consoleErrors.add(
        message
          .text()
          .replace(/"[^"]*"|'[^']*'/g, "<value>")
          .replace(/\d/g, "#")
          .slice(0, 90),
      );
  });
  await signIn(page);
  await page.goto(new URL(href, baseUrl).href, { waitUntil: "domcontentloaded" });
  const toolbarSwitch = page.locator("[data-renewal-view-switch]");
  try {
    await toolbarSwitch.waitFor({ timeout: ROUTE_BUDGET_MS });
  } catch {
    await context.close();
    return null;
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  const fullButton = page.getByRole("button", { name: "Full view", exact: true });
  const focusButton = page.getByRole("button", { name: "Focus view", exact: true });
  assert(
    (await page.getByRole("group", { name: "Lease view" }).count()) === 1,
    "The lease view switch is not one accessible group.",
  );
  assert(
    (await fullButton.getAttribute("aria-pressed")) === "true" &&
      (await focusButton.getAttribute("aria-pressed")) === "false",
    "Full view is not the default.",
  );
  assert(
    (await page.getByRole("region", { name: "Focus view" }).count()) === 0,
    "The Focus pane is present before Focus view was chosen.",
  );

  // The baseline includes the unsaved marker, so a lost edit fails the comparison too. The page's
  // own reads finish first, so the comparison sees only what switching could have changed.
  const dirty = await dirtyInput(page);
  const baseline = await settledSignature(page);

  // From here on, record every app request and every main-frame navigation.
  const writes = [];
  const appRequests = [];
  let navigations = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
      writes.push(`${request.method()} ${path}`);
    // The shell's own notification poll is periodic and unrelated to the lease view.
    if (path.startsWith("/api/lease-renewal/"))
      appRequests.push(`${request.method()} ${path}`);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });

  // Pointer round trip.
  await focusButton.click();
  const pane = page.getByRole("region", { name: "Focus view" });
  await pane.waitFor();
  assert(
    (await focusButton.getAttribute("aria-pressed")) === "true",
    "Focus view is not pressed.",
  );
  const heading = (await page.locator("#renewal-focus-task-heading").innerText()).trim();
  const hiddenInFocus = await page.locator("[data-renewal-focus-hidden]").count();
  assert(heading.length > 0, "The Focus pane names no task.");
  assert(hiddenInFocus > 0, "Focus view did not narrow the page to one task.");
  const focusOverflow = await overflow(page);
  // Choosing each task is presentation only; it reveals that task's existing controls in place.
  await pane.locator("details.renewal-focus-all > summary").click();
  const choices = pane.locator("[data-renewal-action-id] button");
  const tasks = await choices.count();
  for (let index = 0; index < tasks; index += 1) {
    await choices.nth(index).click();
    await page.waitForTimeout(150);
  }
  await fullButton.click();
  await pane.waitFor({ state: "detached" });
  await expectBaseline(page, baseline, "after the pointer round trip");

  // Keyboard round trip: Enter on Focus view, Shift+Tab to Full view, Space.
  await focusButton.focus();
  await page.keyboard.press("Enter");
  await pane.waitFor();
  await page.keyboard.press("Shift+Tab");
  assert(
    await fullButton.evaluate((node) => node === document.activeElement),
    "Shift+Tab from Focus view did not reach Full view.",
  );
  await page.keyboard.press("Space");
  await pane.waitFor({ state: "detached" });
  await expectBaseline(page, baseline, "after the keyboard round trip");
  const dirtyKept = dirty ? (await dirty.locator.inputValue()) === DIRTY_MARKER : null;

  // Phone width: no horizontal page scroll in either view, and the same Full view on return.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const phoneBaseline = await settledSignature(page);
  const phoneFullOverflow = await overflow(page);
  await focusButton.click();
  await pane.waitFor();
  const phoneFocusOverflow = await overflow(page);
  await fullButton.click();
  await pane.waitFor({ state: "detached" });
  await expectBaseline(page, phoneBaseline, "after the phone-width round trip");

  if (dirty) await dirty.locator.fill(dirty.original);

  assert(
    writes.length === 0,
    `Switching sent ${writes.length} write request(s): ${writes.join(", ")}.`,
  );
  assert(
    appRequests.length === 0,
    `Switching sent ${appRequests.length} app request(s): ${appRequests.join(", ")}.`,
  );
  assert(navigations === 0, `Switching navigated ${navigations} time(s).`);
  assert(
    pageErrors.length === 0,
    `The page raised ${pageErrors.length} error(s): ${pageErrors.join(", ")}.`,
  );
  assert(dirtyKept !== false, "Unsaved input did not survive the Focus round trips.");
  assert(
    !focusOverflow && !phoneFullOverflow && !phoneFocusOverflow,
    "A view scrolls horizontally.",
  );
  await context.close();
  return {
    defaultView: "Full view",
    focusTask: heading,
    elementsNarrowedInFocus: hiddenInFocus,
    tasksChosenInFocus: tasks,
    roundTrips: 3,
    fullViewSignature: "unchanged",
    unsavedInput: dirty ? "kept" : "no unsaved-input field on this lease",
    writeRequests: writes.length,
    appRequests: appRequests.length,
    navigations,
    pageErrors: pageErrors.length,
    consoleErrors: [...consoleErrors],
    horizontalScroll: false,
  };
}

/** The same structural signature the S145 jsdom baseline uses, excluding the additive switch. */
async function signature(page) {
  return page.evaluate(() => {
    const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
    const outside = (element) => !element.closest("[data-renewal-view-switch]");
    const labelOf = (element) => {
      const aria = element.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy)
        return labelledBy
          .split(/\s+/)
          .map((id) => text(document.getElementById(id)))
          .join(" ")
          .trim();
      const labels = element.labels;
      if (labels && labels.length > 0) return text(labels[0]);
      return "";
    };
    const root = document.querySelector("main") ?? document.body;
    const all = (selector) => [...root.querySelectorAll(selector)].filter(outside);
    const visible = (element) => element.getClientRects().length > 0;
    return JSON.stringify({
      regions: all("section[aria-label], [role='region'][aria-label]").map((element) =>
        element.getAttribute("aria-label"),
      ),
      sectionIds: all("[id^='renewal-section-']").map((element) => element.id),
      headings: all("h1, h2, h3, h4").map(
        (element) => `${element.tagName.toLowerCase()}:${text(element)}`,
      ),
      controls: all("input, select, textarea").map(
        (element) =>
          `${element.tagName.toLowerCase()}:${element.getAttribute("type") ?? ""}:${labelOf(element)}:${element.value}`,
      ),
      buttons: all("button").map((element) => labelOf(element) || text(element)),
      links: all("a[href]").map(
        (element) =>
          `${labelOf(element) || text(element)} -> ${element.getAttribute("href")}`,
      ),
      copy: all("[id^='renewal-section-']").map(
        (element) => `${element.id}:${text(element)}`,
      ),
      visible: all("[id^='renewal-section-']").map((element) => visible(element)),
      disclosures: all("details").map((element) => element.open),
      hidden: root.querySelectorAll("[data-renewal-focus-hidden]").length,
    });
  });
}

/**
 * The signature once the page's own reads have finished and two readings two seconds apart agree.
 * A cold rehearsal compiles and reads live sources for many seconds after the first paint.
 */
async function settledSignature(page) {
  const inflight = inflightReads.get(page);
  let previous = await signature(page);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await page.waitForTimeout(2_000);
    const current = await signature(page);
    if (inflight.size === 0 && current === previous) return current;
    previous = current;
  }
  throw new Error("The lease page did not settle within 180 seconds.");
}

/** Track the page's in-flight fetch and XHR requests from the moment it opens. */
function trackReads(page) {
  const inflight = new Set();
  inflightReads.set(page, inflight);
  const done = (request) => inflight.delete(request);
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType())) inflight.add(request);
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

async function expectBaseline(page, baseline, when) {
  let current = await signature(page);
  for (let attempt = 0; attempt < 5 && current !== baseline; attempt += 1) {
    await page.waitForTimeout(1_000);
    current = await signature(page);
  }
  assert(
    current === baseline,
    `The Full view changed ${when}: ${describeDifference(baseline, current)}.`,
  );
}

/** Which parts differ, by key, count and section id only; never the page's values. */
function describeDifference(before, after) {
  const a = JSON.parse(before);
  const b = JSON.parse(after);
  const parts = [];
  for (const key of Object.keys(a)) {
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
    if (!Array.isArray(a[key])) {
      parts.push(`${key} ${a[key]}->${b[key]}`);
      continue;
    }
    const indexes = [];
    for (let index = 0; index < Math.max(a[key].length, b[key].length); index += 1)
      if (JSON.stringify(a[key][index]) !== JSON.stringify(b[key][index]))
        indexes.push(index);
    const sections =
      key === "copy" || key === "visible" || key === "sectionIds"
        ? ` sections ${indexes.map((index) => a.sectionIds[index] ?? b.sectionIds[index]).join("|")}`
        : "";
    parts.push(
      `${key} ${a[key].length}->${b[key].length} at [${indexes.slice(0, 8).join(",")}]${sections}`,
    );
  }
  return parts.join("; ") || "no difference";
}

/** Types a marker into one free-text field of a staff form, without submitting anything. */
async function dirtyInput(page) {
  const candidates = page.locator(
    ".renewal-workspace-body form input[type='text']:visible:not([readonly]):not([disabled]), .renewal-workspace-body form textarea:visible:not([readonly]):not([disabled])",
  );
  if ((await candidates.count()) === 0) return null;
  const locator = candidates.first();
  const original = await locator.inputValue();
  await locator.fill(DIRTY_MARKER);
  return { locator, original };
}

async function overflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function signIn(page) {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Editor" }),
    });
    return response.ok;
  });
  assert(signedIn, "Local rehearsal Editor sign-in did not complete.");
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

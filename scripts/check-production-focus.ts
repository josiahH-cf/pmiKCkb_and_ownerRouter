// S145 production read-only Focus view check (FV-03). After a verified release it opens real lease
// workspaces reached from the renewal desk on the exact serving revision, in the managed owner-admin
// browser profile behind the release assurance's request firewall (every non-GET and every known
// state-changing GET is refused before dispatch and counted). On each workspace it requires: Full
// view is the default; pointer and keyboard round trips return the Full view signature, including
// every disclosure's state, unchanged; switching and choosing tasks send no lease-renewal request,
// write or navigation and raise no page error; the Full view scroll position and the desk return
// link survive; and neither view scrolls horizontally at 390 px or at desktop width. It changes no
// release gate, presses no record, prepare, draft or send control, and prints structure only: no
// lease identifier, path, party, address, amount or page text.
//
//   npx tsx scripts/check-production-focus.ts --live --base-url=https://<service-host> \
//     --expected-commit=<40-hex> --expected-revision=<revision> --service=pmi-kc-app \
//     --profile=<absolute managed profile outside the repository> [--leases=3] [--report=<new file>]

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  closeGuardedManagedBrowser,
  forceCloseGuardedManagedBrowser,
  launchGuardedManagedBrowser,
  withAssuranceTimeout,
} from "../lib/production-assurance";
import {
  describeSignatureDifference,
  pageFullViewSignature,
} from "./lib/renewal-focus-signature.mjs";
import {
  findBrowserExecutable,
  readArg,
  requireExplicitLive,
  resolveManagedProfile,
  resolveProductionTarget,
  safeCliFailure,
  safeSameOrigin,
  verifyExactVersion,
  type ProductionTarget,
} from "./production-assurance-runtime";

export const FOCUS_CHECK_SCHEMA_VERSION = "pmi-kc-focus-check.v1";
const WORKSPACE_LINKS =
  'tr[data-workspace-available="true"]:is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"]) a.renewal-lease-link';
const WORKSPACE_PATH = "/lease-renewal/live/desk/lease/";
const ROUTE_BUDGET_MS = 180_000;
const MIN_LEASES = 3;
const MAX_LEASES = 10;
const DESKTOP = { width: 1440, height: 1000 } as const;
const PHONE = { width: 390, height: 844 } as const;

export interface FocusCheckOptions extends ProductionTarget {
  readonly profile: string;
  readonly leases: number;
  readonly report: string | null;
}

export interface LeaseFocusResult {
  readonly workspace: number;
  readonly defaultView: "Full view";
  readonly focusTaskShown: boolean;
  readonly elementsNarrowedInFocus: number;
  readonly tasksChosenInFocus: number;
  readonly roundTrips: 3;
  readonly fullViewSignature: "unchanged";
  readonly scrollRestored: boolean;
  readonly deskReturnUnchanged: boolean;
  readonly appRequests: number;
  readonly writeRequests: number;
  readonly navigations: number;
  readonly pageErrors: number;
  readonly horizontalScroll: boolean;
}

export interface FocusCheckReport {
  readonly schemaVersion: typeof FOCUS_CHECK_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly versionVerified: { readonly before: boolean; readonly after: boolean };
  readonly workspacesChecked: number;
  readonly results: readonly LeaseFocusResult[];
  readonly mutationAttempts: number;
  readonly blockedRequests: readonly string[];
  readonly verdict: "passed" | "failed";
  readonly failure: string | null;
}

/** Validate the exact live target, the managed profile and the lease count before any browser starts. */
export function parseFocusCheckArgs(
  argv: readonly string[],
  repositoryRoot = process.cwd(),
): FocusCheckOptions {
  requireExplicitLive(argv);
  const target = resolveProductionTarget(argv);
  const profile = resolveManagedProfile(argv, repositoryRoot);
  const leases = Number(readArg(argv, "--leases") ?? String(MIN_LEASES));
  if (!Number.isInteger(leases) || leases < MIN_LEASES || leases > MAX_LEASES)
    throw new Error("lease_count_invalid");
  const report = readArg(argv, "--report");
  return { ...target, profile, leases, report: report ? resolve(report) : null };
}

/** Same-origin lease workspace paths from the desk's links, in desk order, without repeats. */
export function workspacePaths(
  hrefs: readonly (string | null)[],
  origin: string,
): string[] {
  const paths: string[] = [];
  for (const href of hrefs) {
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin || !url.pathname.startsWith(WORKSPACE_PATH)) continue;
    const path = `${url.pathname}${url.search}`;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** A request the lease view switch must never cause: any lease-renewal API call, or any write. */
export function classifyRequest(
  method: string,
  url: string,
  origin: string,
): { readonly app: boolean; readonly write: boolean } {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  let app = false;
  try {
    const parsed = new URL(url);
    app = parsed.origin === origin && parsed.pathname.startsWith("/api/lease-renewal/");
  } catch {
    app = false;
  }
  return { app, write };
}

/** A blocked request for the report: method and path, with digits masked and no query. */
export function maskedRequest(method: string, url: string): string {
  let path = "unparseable";
  try {
    path = new URL(url).pathname.replace(/\d+/g, "#");
  } catch {
    // Keep the placeholder.
  }
  return `${method.toUpperCase()} ${path}`;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

async function settledSignature(page: Page, inflight: Set<unknown>): Promise<string> {
  let previous = await page.evaluate(pageFullViewSignature);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await page.waitForTimeout(2_000);
    const current = await page.evaluate(pageFullViewSignature);
    if (inflight.size === 0 && current === previous) return current;
    previous = current;
  }
  throw new Error("lease_page_not_settled");
}

async function expectSignature(page: Page, baseline: string, code: string) {
  let current = await page.evaluate(pageFullViewSignature);
  for (let attempt = 0; attempt < 5 && current !== baseline; attempt += 1) {
    await page.waitForTimeout(1_000);
    current = await page.evaluate(pageFullViewSignature);
  }
  if (current !== baseline)
    throw new Error(`${code}: ${describeSignatureDifference(baseline, current)}`);
}

async function horizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

/** Press a control by keyboard after focusing it without scrolling the page. */
async function pressWithoutScrolling(page: Page, name: string, key: "Enter" | "Space") {
  const found = await page.evaluate((label) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-renewal-view-switch] button",
      ),
    ].find((candidate) => candidate.textContent?.trim() === label);
    button?.focus({ preventScroll: true });
    return Boolean(button);
  }, name);
  assert(found, "focus_switch_missing");
  await page.keyboard.press(key);
}

async function checkLease(
  context: BrowserContext,
  origin: string,
  path: string,
  workspace: number,
): Promise<LeaseFocusResult | null> {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  await page.setViewportSize(DESKTOP);
  const inflight = new Set<unknown>();
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType())) inflight.add(request);
  });
  page.on("requestfinished", (request) => inflight.delete(request));
  page.on("requestfailed", (request) => inflight.delete(request));
  let pageErrors = 0;
  page.on("pageerror", () => {
    pageErrors += 1;
  });
  try {
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    if (!safeSameOrigin(page.url(), origin)) throw new Error("workspace_left_origin");
    try {
      await page.locator("[data-renewal-view-switch]").first().waitFor();
    } catch {
      return null;
    }
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => undefined);
    const full = page.getByRole("button", { name: "Full view", exact: true });
    const focus = page.getByRole("button", { name: "Focus view", exact: true });
    assert(
      (await page.getByRole("group", { name: "Lease view" }).count()) === 1,
      "focus_switch_not_one_group",
    );
    assert(
      (await full.getAttribute("aria-pressed")) === "true" &&
        (await focus.getAttribute("aria-pressed")) === "false",
      "full_view_not_default",
    );
    const pane = page.getByRole("region", { name: "Focus view" });
    assert((await pane.count()) === 0, "focus_pane_present_by_default");
    const baseline = await settledSignature(page, inflight);
    const url = page.url();
    const deskReturn = () =>
      page
        .locator("a.back-link")
        .first()
        .getAttribute("href")
        .catch(() => null);
    const deskReturnBefore = await deskReturn();

    // From here on, record every request and every main-frame navigation.
    let appRequests = 0;
    let writeRequests = 0;
    let navigations = 0;
    page.on("request", (request) => {
      const kind = classifyRequest(request.method(), request.url(), origin);
      if (kind.app) appRequests += 1;
      if (kind.write) writeRequests += 1;
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    // Pointer round trip, choosing every task in Focus (presentation only).
    await focus.click();
    await pane.waitFor();
    assert(
      (await focus.getAttribute("aria-pressed")) === "true",
      "focus_view_not_pressed",
    );
    const focusTaskShown =
      (await page.locator("#renewal-focus-task-heading").count()) === 1 ||
      (await pane.locator(".renewal-focus-result").count()) === 1;
    assert(focusTaskShown, "focus_pane_without_task_or_result");
    const narrowed = await page.locator("[data-renewal-focus-hidden]").count();
    assert(narrowed > 0, "focus_view_not_narrowed");
    const desktopFocusScroll = await horizontalScroll(page);
    await pane.locator("details.renewal-focus-all > summary").click();
    const choices = pane.locator("[data-renewal-action-id] button");
    const tasks = await choices.count();
    for (let index = 0; index < tasks; index += 1) {
      await choices.nth(index).click();
      await page.waitForTimeout(150);
    }
    await full.click();
    await pane.waitFor({ state: "detached" });
    await expectSignature(page, baseline, "full_view_changed_after_pointer_round_trip");

    // Keyboard round trip from a scrolled Full view: the position comes back as it was.
    await page.evaluate(() =>
      window.scrollTo(0, Math.floor(document.body.scrollHeight / 3)),
    );
    await page.waitForTimeout(300);
    const scrolledTo = await page.evaluate(() => window.scrollY);
    await pressWithoutScrolling(page, "Focus view", "Enter");
    await pane.waitFor();
    await pressWithoutScrolling(page, "Full view", "Space");
    await pane.waitFor({ state: "detached" });
    await page.waitForTimeout(300);
    const scrollRestored =
      Math.abs((await page.evaluate(() => window.scrollY)) - scrolledTo) <= 2;
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectSignature(page, baseline, "full_view_changed_after_keyboard_round_trip");

    // Phone width: no horizontal page scroll in either view, and the same Full view on return.
    await page.setViewportSize(PHONE);
    await page.waitForTimeout(500);
    const phoneBaseline = await settledSignature(page, inflight);
    const phoneFullScroll = await horizontalScroll(page);
    await focus.click();
    await pane.waitFor();
    const phoneFocusScroll = await horizontalScroll(page);
    await full.click();
    await pane.waitFor({ state: "detached" });
    await expectSignature(
      page,
      phoneBaseline,
      "full_view_changed_after_phone_round_trip",
    );
    const desktopFullScroll = await (async () => {
      await page.setViewportSize(DESKTOP);
      await page.waitForTimeout(500);
      return horizontalScroll(page);
    })();

    const deskReturnUnchanged =
      page.url() === url && (await deskReturn()) === deskReturnBefore;
    assert(appRequests === 0, "switching_sent_lease_renewal_request");
    assert(writeRequests === 0, "switching_sent_write_request");
    assert(navigations === 0, "switching_navigated");
    assert(pageErrors === 0, "page_error");
    assert(scrollRestored, "full_view_scroll_not_restored");
    assert(deskReturnUnchanged, "lease_or_desk_context_changed");
    const anyScroll =
      desktopFocusScroll || desktopFullScroll || phoneFullScroll || phoneFocusScroll;
    assert(!anyScroll, "horizontal_scroll");
    return {
      workspace,
      defaultView: "Full view",
      focusTaskShown,
      elementsNarrowedInFocus: narrowed,
      tasksChosenInFocus: tasks,
      roundTrips: 3,
      fullViewSignature: "unchanged",
      scrollRestored,
      deskReturnUnchanged,
      appRequests,
      writeRequests,
      navigations,
      pageErrors,
      horizontalScroll: anyScroll,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function runProductionFocusCheck(
  options: FocusCheckOptions,
): Promise<FocusCheckReport> {
  const versionVerified = { before: false, after: false };
  let mutationAttempts = 0;
  const blockedRequests: string[] = [];
  const results: LeaseFocusResult[] = [];
  let failure: string | null = null;
  try {
    await verifyExactVersion(options);
    versionVerified.before = true;
    const context = await launchGuardedManagedBrowser({
      profile: options.profile,
      executablePath: findBrowserExecutable(),
      headless: true,
      viewport: DESKTOP,
      launchTimeoutMs: 120_000,
      launchPersistentContext: (profile, launchOptions) =>
        chromium.launchPersistentContext(profile, launchOptions),
      onMutationAttempt: () => {
        mutationAttempts += 1;
      },
      onMutationBlocked: (request) =>
        blockedRequests.push(maskedRequest(request.method(), request.url())),
    });
    try {
      const desk = await context.newPage();
      desk.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
      desk.setDefaultTimeout(ROUTE_BUDGET_MS);
      await desk.goto(`${options.origin}/lease-renewal`, {
        waitUntil: "domcontentloaded",
      });
      if (!safeSameOrigin(desk.url(), options.origin))
        throw new Error("desk_left_origin");
      const links = desk.locator(WORKSPACE_LINKS);
      await links.first().waitFor();
      const paths = workspacePaths(
        await links.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href")),
        ),
        options.origin,
      );
      await desk.close();
      for (const path of paths) {
        if (results.length >= options.leases) break;
        const result = await checkLease(
          context,
          options.origin,
          path,
          results.length + 1,
        );
        if (result) results.push(result);
      }
      if (results.length < options.leases) throw new Error("not_enough_focus_workspaces");
    } finally {
      await withAssuranceTimeout(
        () => closeGuardedManagedBrowser(context),
        "focus_check_close_timeout",
        10_000,
        { onTimeout: () => forceCloseGuardedManagedBrowser(context) },
      );
    }
    await verifyExactVersion(options);
    versionVerified.after = true;
  } catch (error) {
    const code = error instanceof Error ? error.message : "focus_check_failed";
    // Keep only the stable code and any value-free signature description.
    failure = /^[a-z0-9_]+(?::[\w\s|,;[\]>.-]*)?$/.test(code)
      ? code
      : safeCliFailure(error);
  }
  const passed =
    failure === null &&
    mutationAttempts === 0 &&
    versionVerified.before &&
    versionVerified.after &&
    results.length >= options.leases;
  return {
    schemaVersion: FOCUS_CHECK_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    expectedCommit: options.expectedCommit,
    expectedRevision: options.expectedRevision,
    versionVerified,
    workspacesChecked: results.length,
    results,
    mutationAttempts,
    blockedRequests,
    verdict: passed ? "passed" : "failed",
    failure,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseFocusCheckArgs(argv);
  const report = await runProductionFocusCheck(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report)
    writeFileSync(options.report, serialized, { encoding: "utf8", flag: "wx" });
  process.stdout.write(serialized);
  return report.verdict === "passed" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Focus check refused: ${safeCliFailure(error)}\n`);
      process.exitCode = 2;
    });

import { mapAssuranceReads } from "../lib/production-assurance/bounded-reads";
import { pathToFileURL } from "node:url";
import type { PredecessorExceptionObserver } from "../lib/production-assurance/predecessor-exception-observer";
import { RENEWAL_DASHBOARD_SECTIONS } from "../lib/lease-renewal/dashboard-sections";

import { chromium, type Page, type Response } from "playwright-core";

import {
  ASSURANCE_RUN_TIMEOUT_MS,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  addDiagnostic,
  assuranceAbortSignal,
  classifyBrowserSignal,
  classifyDeniedRouteOutcome,
  createAssuranceDeadline,
  closeGuardedManagedBrowser,
  emptyDiagnosticCounts,
  forceCloseGuardedManagedBrowser,
  hasBrowserDiagnostics,
  launchGuardedManagedBrowser,
  readVerifiedCloudRunRevisionConfiguration,
  readVerifiedCloudRunOriginBinding,
  remainingAssuranceTime,
  requireRevisionConfigurationFingerprint,
  routesForRole,
  statusClassOf,
  withAssuranceTimeout,
  type AssuranceRole,
  type AssurancePhase,
  type CanaryRouteDefinition,
  type DiagnosticCounts,
  type ProductionAssuranceEvidence,
  type RouteAssuranceEvidence,
} from "../lib/production-assurance";
import {
  findBrowserExecutable,
  hasArg,
  readArg,
  requireExplicitLive,
  resolveManagedProfile,
  resolveProductionTarget,
  resolveRole,
  safeCliFailure,
  safeSameOrigin,
  verifyExactVersion,
  writeAssuranceReport,
  type ProductionTarget,
} from "./production-assurance-runtime";
import {
  preflightProductionAssurance,
  verifiedAssuranceClient,
  type VerifiedProductionAssuranceContext,
} from "./production-assurance-preflight";

const ROUTE_TIMEOUT_MS = 30_000;
const LIVE_RENEWAL_ROUTE_TIMEOUT_MS = 60_000;
const LOADED_STATE_TIMEOUT_MS = 10_000;
const DEFAULT_PROJECT = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-app";

// Live renewal pages wait on current RentVine, Sheet, and supporting-store reads. Keep their
// navigation bounded while allowing a completed read to reach the unchanged route assertions.
export function routeNavigationTimeoutMs(
  definition: Pick<CanaryRouteDefinition, "key">,
): number {
  return definition.key === "renewal_desk" || definition.key === "renewal_workspace"
    ? LIVE_RENEWAL_ROUTE_TIMEOUT_MS
    : ROUTE_TIMEOUT_MS;
}

// Owner decision 2026-10-07: a new revision's first Dashboard render reads its live sources from
// scratch. New recovery instances took 39.1 and 56.5 s for it that day against 15 to 21 s once warm,
// so every recovery preparation paused at the 30-second route bound, and a cold rollback target once
// needed 32.4 s for its first version read against 30 s. Before the bounded reads the canary sends
// one unmeasured version read, and before the measured routes it loads the Dashboard once, unmeasured,
// inside the same guarded context: the mutation firewall stays active, neither warm-up decides
// anything, and no route bound, read bound or assertion changes.
const WARM_UP_PATH = "/";
const WARM_UP_TIMEOUT_MS = 90_000;
/** Time kept back for the measured reads; a warm-up never starts inside it. */
const WARM_UP_RESERVE_MS = 5 * 60 * 1_000;

function warmUpTimeoutMs(deadlineAtMs: number, nowMs: number): number {
  return Math.min(WARM_UP_TIMEOUT_MS, deadlineAtMs - nowMs - WARM_UP_RESERVE_MS);
}

/**
 * Every check of a revision that may be cold warms up first. The post-promotion observation does
 * not: its first checkpoint must start within the one-minute grace, and the candidate checks have
 * already loaded the promoted revision. The approved predecessor exception does not either, because
 * it attributes every blocked request to one measured route.
 */
export function canaryWarmUpRequired(
  options: Pick<LiveCanaryOptions, "phase" | "predecessorExceptionObserver">,
): boolean {
  return (
    (options.phase ?? "candidate") !== "post_promotion" &&
    options.predecessorExceptionObserver === undefined
  );
}

/** Reads the version once and discards the result. Returns whether a read was attempted. */
export async function warmUpVersionRead(
  origin: string,
  deadlineAtMs: number,
  abortSignal?: AbortSignal,
  {
    fetchFn = fetch,
    nowMs = Date.now(),
  }: { fetchFn?: typeof fetch; nowMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = warmUpTimeoutMs(deadlineAtMs, nowMs);
  if (!(timeoutMs > 0)) return false;
  try {
    const response = await fetchFn(`${origin}/api/version`, {
      method: "GET",
      redirect: "manual",
      signal: assuranceAbortSignal(timeoutMs, abortSignal),
    });
    await response.body?.cancel();
  } catch {
    // The warm-up has no verdict; the bounded identity read decides.
  }
  return true;
}

/** Loads the Dashboard once and discards the result. Returns whether a load was attempted. */
export async function warmUpCanaryTarget(
  context: { newPage(): Promise<Pick<Page, "goto" | "close">> },
  origin: string,
  deadlineAtMs: number,
  nowMs = Date.now(),
): Promise<boolean> {
  const timeoutMs = warmUpTimeoutMs(deadlineAtMs, nowMs);
  if (!(timeoutMs > 0)) return false;
  let page: Pick<Page, "goto" | "close"> | null = null;
  try {
    page = await withAssuranceTimeout(
      () => context.newPage(),
      "canary_warm_up_timeout",
      timeoutMs,
    );
    await page.goto(`${origin}${WARM_UP_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
  } catch {
    // The warm-up has no verdict; the measured routes below decide.
  } finally {
    const opened = page;
    if (opened) {
      await withAssuranceTimeout(
        () => opened.close(),
        "canary_page_close_timeout",
        5_000,
      ).catch(() => undefined);
    }
  }
  return true;
}
const STRICT_WORKSPACE_SELECTOR =
  'tr[data-workspace-available="true"]:is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"]) a.renewal-lease-link';
const LEGACY_WORKSPACE_SELECTOR = "a.renewal-lease-link";

type RouteAssertion =
  | { readonly passed: true }
  | {
      readonly passed: false;
      readonly diagnostic: "auth_mismatch" | "landmark_missing";
    };

export interface LiveCanaryOptions extends ProductionTarget {
  readonly role: AssuranceRole;
  readonly profile: string;
  readonly headed?: boolean;
  readonly generatedAt?: string;
  readonly phase?: AssurancePhase;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedConfigurationFingerprint: string;
  readonly deadlineAtMs?: number;
  readonly abortSignal?: AbortSignal;
  readonly assuranceContext?: VerifiedProductionAssuranceContext;
  readonly predecessorExceptionObserver?: PredecessorExceptionObserver;
}

export async function runProductionCanary(
  options: LiveCanaryOptions,
): Promise<ProductionAssuranceEvidence> {
  const deadlineAtMs = options.deadlineAtMs ?? Date.now() + ASSURANCE_RUN_TIMEOUT_MS;
  const deadline = createAssuranceDeadline(deadlineAtMs, options.abortSignal);
  try {
    return await runProductionCanaryWithin(options, deadlineAtMs, deadline.signal);
  } finally {
    deadline.dispose();
  }
}

async function runProductionCanaryWithin(
  options: LiveCanaryOptions,
  deadlineAtMs: number,
  abortSignal: AbortSignal,
): Promise<ProductionAssuranceEvidence> {
  const expectedConfigurationFingerprint = requireRevisionConfigurationFingerprint(
    options.expectedConfigurationFingerprint,
  );
  const assuranceContext =
    options.assuranceContext ??
    (await preflightProductionAssurance({
      project: options.project,
      deadlineAtMs,
      abortSignal,
    }));
  const revisionClient = verifiedAssuranceClient(assuranceContext, options.project);
  const warmUp = canaryWarmUpRequired(options);
  if (warmUp) await warmUpVersionRead(options.origin, deadlineAtMs, abortSignal);
  await runWithinCanaryDeadline(
    () => verifyExactVersion(options, abortSignal),
    deadlineAtMs,
  );
  await runWithinCanaryDeadline(
    () =>
      readVerifiedCloudRunOriginBinding(
        revisionClient,
        {
          project: options.project,
          region: options.region,
          service: options.service,
          expectedRevision: options.expectedRevision,
          origin: options.origin,
          phase: options.phase ?? "candidate",
        },
        abortSignal,
      ),
    deadlineAtMs,
  );
  await runWithinCanaryDeadline(
    () =>
      readVerifiedCloudRunRevisionConfiguration(
        revisionClient,
        {
          project: options.project,
          region: options.region,
          service: options.service,
          expectedRevision: options.expectedRevision,
          expectedConfigurationFingerprint,
        },
        abortSignal,
      ),
    deadlineAtMs,
  );
  const activeRoutes = new Map<
    string,
    (signal: Parameters<typeof classifyBrowserSignal>[0]) => void
  >();
  let workspacePath: string | null = null;
  let mutationOutsideActiveRoute = false;

  // This helper owns Playwright's finite launch timeout and waits for any late-created context to
  // be force-closed. Do not Promise-race it here or a timed-out launch could outlive this run.
  const context = await launchGuardedManagedBrowser({
    profile: options.profile,
    executablePath: findBrowserExecutable(),
    headless: !options.headed,
    viewport: { width: 1440, height: 1000 },
    launchTimeoutMs: remainingAssuranceTime(deadlineAtMs),
    launchPersistentContext: (profile, launchOptions) =>
      chromium.launchPersistentContext(profile, launchOptions),
    onMutationAttempt: () => {
      if (activeRoutes.size > 0) {
        // The firewall cannot safely attribute every background request to a page. Conservatively
        // fail every active route; an unattributed mutation must never disappear in concurrent work.
        for (const record of activeRoutes.values()) record({ kind: "mutation_attempt" });
      } else mutationOutsideActiveRoute = true;
    },
    onMutationBlocked: (request) =>
      options.predecessorExceptionObserver?.mutationBlocked(
        activeRoutes.keys().next().value ?? null,
        request,
      ),
    abortSignal,
  });
  let routes: RouteAssuranceEvidence[] = [];
  try {
    const readRoute = async (
      definition: CanaryRouteDefinition,
    ): Promise<RouteAssuranceEvidence> => {
      const remainingForRoute = remainingAssuranceTime(
        deadlineAtMs,
        routeNavigationTimeoutMs(definition),
      );
      if (remainingForRoute <= 0) {
        return failedRoute(options.role, definition);
      }
      let activeCounts: DiagnosticCounts = emptyDiagnosticCounts();
      let active = false;
      const recordSignal = (
        signal: Parameters<typeof classifyBrowserSignal>[0],
      ): void => {
        if (active)
          activeCounts = addDiagnostic(activeCounts, classifyBrowserSignal(signal));
      };
      const page = await runWithinCanaryDeadline(() => context.newPage(), deadlineAtMs);
      attachPageDiagnostics(page, options.origin, recordSignal);
      page.on("requestfailed", (request) =>
        options.predecessorExceptionObserver?.requestFailed(definition.key, request),
      );
      page.on("console", (message) =>
        options.predecessorExceptionObserver?.consoleMessage(definition.key, message),
      );
      activeCounts = emptyDiagnosticCounts();
      active = true;
      activeRoutes.set(definition.key, recordSignal);
      if (mutationOutsideActiveRoute) {
        recordSignal({ kind: "mutation_attempt" });
        mutationOutsideActiveRoute = false;
      }
      const startedAt = Date.now();
      let response: Response | null = null;
      let passed = false;
      try {
        const path = definition.dynamicFrom ? workspacePath : definition.path;
        if (!path) throw new Error("dynamic_route_unavailable");
        response = await page.goto(`${options.origin}${path}`, {
          waitUntil: "domcontentloaded",
          timeout: remainingForRoute,
        });
        await page.waitForTimeout(750);
        // Landmarks are asserted only on a settled page: an asynchronously loaded panel may still
        // show its loading state, which can carry its own heading, right after navigation.
        const assertion = await assertSettledRoute(
          () =>
            waitForSettledRoute(
              page,
              remainingAssuranceTime(deadlineAtMs, LOADED_STATE_TIMEOUT_MS),
            ),
          () =>
            assertRouteOutcome(
              page,
              definition,
              options.role,
              options.origin,
              response,
              options.expectedCommit,
            ),
        );
        passed = assertion.passed;
        if (!assertion.passed) recordSignal({ kind: assertion.diagnostic });
        await classifyRenderedBoundary(page, recordSignal);
        if (definition.key === "renewal_desk" && passed) {
          workspacePath = await resolveWorkspacePath(
            page,
            options.origin,
            options.phase ?? "candidate",
          );
          if (!workspacePath) {
            recordSignal({ kind: "landmark_missing" });
            passed = false;
          }
        }
      } catch {
        recordSignal({ kind: "landmark_missing" });
        passed = false;
      }
      try {
        // Keep the per-route collector live until the page is fully closed. A late console error,
        // request failure, response, page exception, or mutation must belong to this route rather
        // than disappear between evidence sealing and teardown.
        await withAssuranceTimeout(
          () => page.close(),
          "canary_page_close_timeout",
          Math.max(1, remainingAssuranceTime(deadlineAtMs, 5_000)),
        );
      } catch {
        recordSignal({ kind: "landmark_missing" });
        passed = false;
      }
      active = false;
      activeRoutes.delete(definition.key);
      const outcome =
        passed && !hasBrowserDiagnostics(activeCounts)
          ? definition.expectedOutcome
          : "failed";
      return {
        actorRole: options.role,
        routeKey: definition.key,
        outcome,
        statusClass: statusClassOf(response?.status()),
        elapsedMs: Date.now() - startedAt,
        landmarkPresent: passed,
        diagnostics: activeCounts,
      };
    };
    if (warmUp) await warmUpCanaryTarget(context, options.origin, deadlineAtMs);
    routes = await readCanaryRoutes(
      routesForRole(options.role, options.expectedCommit),
      Boolean(options.predecessorExceptionObserver),
      abortSignal,
      readRoute,
    );
  } finally {
    activeRoutes.clear();
    await withAssuranceTimeout(
      () => closeGuardedManagedBrowser(context),
      "canary_context_close_timeout",
      Math.max(1, remainingAssuranceTime(deadlineAtMs, 5_000)),
      { onTimeout: () => forceCloseGuardedManagedBrowser(context) },
    );
  }

  // Context teardown can expose a final background mutation. Attribute it to the last exercised
  // route so downstream observation cannot see an all-green manifest beside a failed top verdict.
  if (mutationOutsideActiveRoute && routes.length > 0) {
    const lastIndex = routes.length - 1;
    const last = routes[lastIndex];
    routes[lastIndex] = {
      ...last,
      outcome: "failed",
      landmarkPresent: false,
      diagnostics: addDiagnostic(last.diagnostics, "mutation_attempt"),
    };
    mutationOutsideActiveRoute = false;
  }

  const passed =
    routes.every(
      (route) => route.outcome !== "failed" && !hasBrowserDiagnostics(route.diagnostics),
    ) && !mutationOutsideActiveRoute;
  return {
    schemaVersion: PRODUCTION_ASSURANCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    phase: options.phase ?? "candidate",
    expectedCommit: options.expectedCommit,
    expectedRevision: options.expectedRevision,
    actorRole: options.role,
    verdict: passed ? "passed" : "failed",
    routes,
    reconciliation: null,
    monitoring: null,
    observation: null,
  };
}

/** One managed context, bounded pages, stable manifest order. The exact predecessor exception
 * stays serial so its blocked request and matching diagnostics retain one unambiguous route. */
export async function readCanaryRoutes(
  definitions: readonly CanaryRouteDefinition[],
  serialPredecessor: boolean,
  signal: AbortSignal,
  read: (definition: CanaryRouteDefinition) => Promise<RouteAssuranceEvidence>,
): Promise<RouteAssuranceEvidence[]> {
  if (serialPredecessor) return mapAssuranceReads(definitions, 1, signal, read);
  const completions = new Map<
    string,
    {
      promise: Promise<void>;
      resolve: () => void;
      reject: (error: unknown) => void;
    }
  >();
  for (const [index, definition] of definitions.entries()) {
    if (!definition.dynamicFrom) continue;
    if (
      !definitions.slice(0, index).some((source) => source.key === definition.dynamicFrom)
    )
      throw new Error("canary_route_dependency_invalid");
    if (!completions.has(definition.dynamicFrom)) {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      // A deadline can prevent the dependent route from starting; retain the original rejection
      // for any active waiter without allowing an unused rejected promise to escape cleanup.
      void promise.catch(() => undefined);
      completions.set(definition.dynamicFrom, { promise, resolve, reject });
    }
  }
  return mapAssuranceReads(definitions, 3, signal, async (definition) => {
    try {
      // The workspace depends on the actual desk result, not unrelated pages finishing first.
      if (definition.dynamicFrom) await completions.get(definition.dynamicFrom)!.promise;
      signal.throwIfAborted();
      const result = await read(definition);
      completions.get(definition.key)?.resolve();
      return result;
    } catch (error) {
      completions.get(definition.key)?.reject(error);
      throw error;
    }
  });
}

function runWithinCanaryDeadline<T>(
  operation: () => Promise<T>,
  deadlineAtMs: number,
): Promise<T> {
  return withAssuranceTimeout(
    operation,
    "canary_deadline_exceeded",
    remainingAssuranceTime(deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS),
  );
}

function failedRoute(
  role: AssuranceRole,
  definition: CanaryRouteDefinition,
): RouteAssuranceEvidence {
  return {
    actorRole: role,
    routeKey: definition.key,
    outcome: "failed",
    statusClass: "none",
    elapsedMs: 0,
    landmarkPresent: false,
    diagnostics: addDiagnostic(emptyDiagnosticCounts(), "landmark_missing"),
  };
}

export function resolveCanaryCoordinates(argv: readonly string[]): {
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly expectedConfigurationFingerprint: string;
} {
  const project = readArg(argv, "--project") ?? DEFAULT_PROJECT;
  const region = readArg(argv, "--region") ?? DEFAULT_REGION;
  const service = readArg(argv, "--service") ?? DEFAULT_SERVICE;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error("project_invalid");
  }
  if (!/^[a-z]+-[a-z]+[0-9]$/.test(region)) throw new Error("region_invalid");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(service)) {
    throw new Error("service_invalid");
  }
  return {
    project,
    region,
    service,
    expectedConfigurationFingerprint: requireRevisionConfigurationFingerprint(
      readArg(argv, "--expected-config-fingerprint"),
    ),
  };
}

export function resolveCanaryPhase(argv: readonly string[]): AssurancePhase {
  const phase = readArg(argv, "--phase") ?? "candidate";
  if (
    !(
      ["candidate", "post_promotion", "rollback", "recovery_preparation"] as const
    ).includes(phase as AssurancePhase)
  ) {
    throw new Error("assurance_phase_invalid");
  }
  return phase as AssurancePhase;
}

export function workspaceSelectorsForPhase(phase: AssurancePhase): readonly string[] {
  return phase === "rollback" || phase === "recovery_preparation"
    ? [STRICT_WORKSPACE_SELECTOR, LEGACY_WORKSPACE_SELECTOR]
    : [STRICT_WORKSPACE_SELECTOR];
}

export function isCancelledRoutePrefetch(
  request: {
    method(): string;
    resourceType(): string;
    isNavigationRequest(): boolean;
    headers(): Record<string, string>;
    failure(): { errorText: string } | null;
    url(): string;
  },
  origin: string,
): boolean {
  if (
    request.method() !== "GET" ||
    request.resourceType() !== "fetch" ||
    request.isNavigationRequest() ||
    request.headers()["next-router-prefetch"] !== "1" ||
    request.failure()?.errorText !== "net::ERR_ABORTED"
  )
    return false;
  try {
    const url = new URL(request.url());
    return url.origin === origin && !/^\/(?:api|_next)(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

function attachPageDiagnostics(
  page: Page,
  origin: string,
  recordSignal: (signal: Parameters<typeof classifyBrowserSignal>[0]) => void,
): void {
  page.on("console", (message) => {
    const location = message.location().url;
    recordSignal({
      kind: "console",
      level: message.type(),
      firstParty: location === "" || safeSameOrigin(location, origin),
    });
  });
  page.on("pageerror", () => recordSignal({ kind: "page_error" }));
  page.on("requestfailed", (request) => {
    // Next.js cancels speculative page prefetches as priorities change. This observed browser
    // cancellation is not a failed loaded route; API reads, navigation and other failures stay fatal.
    if (isCancelledRoutePrefetch(request, origin)) return;
    recordSignal({
      kind: "request_failed",
      firstParty: safeSameOrigin(request.url(), origin),
    });
  });
  page.on("response", (response) => {
    recordSignal({
      kind: "response",
      firstParty: safeSameOrigin(response.url(), origin),
      status: response.status(),
      expected: false,
    });
  });
}

/**
 * Every request URL of one navigation in order, ending with the final response URL. Playwright hands
 * back the last response; its request chain (`redirectedFrom`) carries each earlier hop.
 */
function navigationHopUrls(page: Page, response: Response | null): string[] {
  const hops: string[] = [];
  let request = response?.request() ?? null;
  while (request) {
    hops.unshift(request.url());
    request = request.redirectedFrom();
  }
  const finalUrl = response?.url() ?? page.url();
  if (hops.length === 0 || hops[hops.length - 1] !== finalUrl) hops.push(finalUrl);
  return hops;
}

async function assertRouteOutcome(
  page: Page,
  definition: CanaryRouteDefinition,
  role: AssuranceRole,
  origin: string,
  response: Response | null,
  expectedCommit: string,
): Promise<RouteAssertion> {
  if (definition.expectedOutcome === "denied") {
    // The guard answers a forbidden route with a redirect to `/sign-in?error=forbidden`, and the
    // sign-in page forwards a live session on to `/`. The denial is proven by that exact hop in the
    // navigation chain, never by where the browser finally rests.
    return classifyDeniedRouteOutcome({
      origin,
      deniedPath: definition.path,
      hopUrls: navigationHopUrls(page, response),
    });
  }
  if (new URL(page.url()).pathname === "/sign-in") {
    return { passed: false, diagnostic: "auth_mismatch" };
  }
  const renderedRole = (await page.locator(".user-role").first().textContent())?.trim();
  if (renderedRole !== role) {
    return { passed: false, diagnostic: "auth_mismatch" };
  }
  if (definition.dynamicFrom === "renewal_desk") {
    return (await hasRenewalWorkspaceLandmarks(page, expectedCommit))
      ? { passed: true }
      : { passed: false, diagnostic: "landmark_missing" };
  }
  if (!definition.heading) {
    return { passed: false, diagnostic: "landmark_missing" };
  }
  const headingPresent =
    (await page
      .getByRole("heading", { name: definition.heading, exact: true })
      .count()) === 1;
  if (!headingPresent) return { passed: false, diagnostic: "landmark_missing" };
  if (definition.key === "communications") {
    // Genuine managed-mailbox read through the ordinary app contract. Return only readiness,
    // never the profile/address or a provider body; the browser mutation guard remains active.
    const connected = await page
      .evaluate(async () => {
        try {
          const response = await fetch("/api/gmail-hub/connection", {
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          const body = (await response.json()) as { status?: unknown };
          return response.ok && body.status === "connected";
        } catch {
          return false;
        }
      })
      .catch(() => false);
    if (!connected) return { passed: false, diagnostic: "landmark_missing" };
  }
  return { passed: true };
}

/** A route that never settles has no verifiable landmark; a settled route gets the exact assertion. */
export async function assertSettledRoute(
  settle: () => Promise<boolean>,
  assert: () => Promise<RouteAssertion>,
): Promise<RouteAssertion> {
  if (!(await settle())) return { passed: false, diagnostic: "landmark_missing" };
  return assert();
}

/**
 * The lease workspace has three exact contracts: the complete S113 dashboard when the Full view is
 * shown (a predecessor opens there), the captured predecessor's six phases, and since S152 the
 * Focus view a lease opens in. Each is asserted as rendered; the canary selects nothing.
 */
export async function hasRenewalWorkspaceLandmarks(
  page: Page,
  expectedCommit?: string,
): Promise<boolean> {
  // The captured Feature 5 predecessor uses the prior labels. Require those exact labels only
  // for its verified commit; the candidate and future revisions require the current manifest.
  const sections =
    expectedCommit === "82a2cf80ab0e17c9a947a54204524f7cd282eb93"
      ? RENEWAL_DASHBOARD_SECTIONS.map((section) => ({
          ...section,
          label:
            (
              { comps: "Comps", owner: "Owner", tenant: "Tenant" } as Record<
                string,
                string
              >
            )[section.id] ?? section.label,
        }))
      : RENEWAL_DASHBOARD_SECTIONS;
  const dashboard = page.getByRole("navigation", {
    name: "Renewal dashboard sections",
    exact: true,
  });
  const legacy = page.getByRole("navigation", { name: "Renewal phases", exact: true });
  if (await dashboard.count()) {
    if (
      (await dashboard.count()) !== 1 ||
      (await legacy.count()) !== 0 ||
      (await dashboard.getByRole("link").count()) !== RENEWAL_DASHBOARD_SECTIONS.length
    )
      return false;
    for (const section of sections) {
      const link = dashboard.getByRole("link", { name: section.label, exact: true });
      const region = page.getByRole("region", { name: section.label, exact: true });
      if (
        (await link.count()) !== 1 ||
        !(await link.isVisible()) ||
        (await region.count()) !== 1 ||
        !(await region.isVisible()) ||
        (await link.getAttribute("href")) !== `#renewal-section-${section.id}`
      )
        return false;
    }
    return true;
  }
  if (await legacy.count())
    return (
      (await legacy.count()) === 1 &&
      (await legacy.isVisible()) &&
      (await legacy.getByRole("link").count()) === 6
    );
  // S152: the lease opens in Focus view. Exactly one view switch whose Focus view is the selected
  // one and whose Full view is offered, and exactly one visible Focus view region.
  const viewSwitch = page.getByRole("group", { name: "Lease view", exact: true });
  if ((await viewSwitch.count()) !== 1 || !(await viewSwitch.isVisible())) return false;
  const focus = viewSwitch.getByRole("button", { name: "Focus view", exact: true });
  const full = viewSwitch.getByRole("button", { name: "Full view", exact: true });
  const pane = page.getByRole("region", { name: "Focus view", exact: true });
  return (
    (await focus.count()) === 1 &&
    (await focus.isVisible()) &&
    (await focus.getAttribute("aria-pressed")) === "true" &&
    (await full.count()) === 1 &&
    (await full.isVisible()) &&
    (await full.getAttribute("aria-pressed")) === "false" &&
    (await pane.count()) === 1 &&
    (await pane.isVisible())
  );
}

async function waitForSettledRoute(
  page: Page,
  timeoutMs = LOADED_STATE_TIMEOUT_MS,
): Promise<boolean> {
  if (timeoutMs <= 0) return false;
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLElement>('[aria-busy="true"]')].every(
          (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display === "none" ||
              style.visibility === "hidden" ||
              rect.width === 0 ||
              rect.height === 0
            );
          },
        ),
      undefined,
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function classifyRenderedBoundary(
  page: Page,
  record: (signal: Parameters<typeof classifyBrowserSignal>[0]) => void,
): Promise<void> {
  const globalBoundary =
    (await page
      .locator('[data-app-error-boundary="global"], body.global-error-body')
      .count()) > 0 ||
    (await page
      .getByRole("heading", { name: "The app hit an error", exact: true })
      .count()) > 0;
  const routeBoundary =
    (await page.locator('[data-app-error-boundary="route"]').count()) > 0 ||
    (await page
      .getByRole("heading", { name: "Something went wrong on this page", exact: true })
      .count()) > 0;
  if (globalBoundary) record({ kind: "error_boundary", boundary: "global" });
  if (routeBoundary) record({ kind: "error_boundary", boundary: "route" });
}

export async function resolveWorkspacePath(
  page: Page,
  origin: string,
  phase: AssurancePhase,
): Promise<string | null> {
  // Never let provider row ordering decide which workspace is exercised. The table publishes the
  // same eligibility predicate as the server loader; absence is an honest inconclusive/failure signal.
  for (const selector of workspaceSelectorsForPhase(phase)) {
    const link = page.locator(selector).first();
    // The captured predecessor can predate these attributes. Check presence before awaiting an
    // attribute so its explicit legacy fallback is reachable; candidate selection stays strict.
    if ((await link.count()) === 0) continue;
    const href = await link.getAttribute("href");
    if (!href) continue;
    const target = new URL(href, origin);
    if (
      target.origin === origin &&
      /^\/lease-renewal\/live\/desk\/lease\/[^/]+$/.test(target.pathname)
    ) {
      return `${target.pathname}${target.search}`;
    }
  }
  return null;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    requireExplicitLive(argv);
    const target = resolveProductionTarget(argv);
    const report = await runProductionCanary({
      ...target,
      ...resolveCanaryCoordinates(argv),
      phase: resolveCanaryPhase(argv),
      role: resolveRole(argv),
      profile: resolveManagedProfile(argv),
      headed: hasArg(argv, "--headed"),
    });
    writeAssuranceReport(argv, report);
    if (report.verdict !== "passed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Production canary refused: ${safeCliFailure(error)}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

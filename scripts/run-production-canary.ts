import { pathToFileURL } from "node:url";

import { chromium, type Page, type Response } from "playwright-core";

import {
  ASSURANCE_RUN_TIMEOUT_MS,
  PRODUCTION_ASSURANCE_SCHEMA_VERSION,
  addDiagnostic,
  classifyBrowserSignal,
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
const LOADED_STATE_TIMEOUT_MS = 10_000;
const DEFAULT_PROJECT = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-app";
const STRICT_WORKSPACE_SELECTOR =
  'tr[data-workspace-available="true"] a.renewal-lease-link';
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
  let activeCounts: DiagnosticCounts = emptyDiagnosticCounts();
  let active = false;
  let workspacePath: string | null = null;
  let mutationOutsideActiveRoute = false;

  const recordSignal = (signal: Parameters<typeof classifyBrowserSignal>[0]): void => {
    if (!active) return;
    activeCounts = addDiagnostic(activeCounts, classifyBrowserSignal(signal));
  };

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
      if (active) recordSignal({ kind: "mutation_attempt" });
      else mutationOutsideActiveRoute = true;
    },
    abortSignal,
  });
  const routes: RouteAssuranceEvidence[] = [];
  try {
    for (const definition of routesForRole(options.role)) {
      const remainingForRoute = remainingAssuranceTime(deadlineAtMs, ROUTE_TIMEOUT_MS);
      if (remainingForRoute <= 0) {
        routes.push(failedRoute(options.role, definition));
        continue;
      }
      const page = await runWithinCanaryDeadline(() => context.newPage(), deadlineAtMs);
      attachPageDiagnostics(page, options.origin, recordSignal);
      activeCounts = emptyDiagnosticCounts();
      active = true;
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
        const assertion = await assertRouteOutcome(page, definition, options.role);
        passed = assertion.passed;
        if (!assertion.passed) recordSignal({ kind: assertion.diagnostic });
        if (
          passed &&
          !(await waitForSettledRoute(
            page,
            remainingAssuranceTime(deadlineAtMs, LOADED_STATE_TIMEOUT_MS),
          ))
        ) {
          recordSignal({ kind: "landmark_missing" });
          passed = false;
        }
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
      const outcome =
        passed && !hasBrowserDiagnostics(activeCounts)
          ? definition.expectedOutcome
          : "failed";
      routes.push({
        actorRole: options.role,
        routeKey: definition.key,
        outcome,
        statusClass: statusClassOf(response?.status()),
        elapsedMs: Date.now() - startedAt,
        landmarkPresent: passed,
        diagnostics: activeCounts,
      });
    }
  } finally {
    active = false;
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
    !(["candidate", "post_promotion", "rollback"] as const).includes(
      phase as AssurancePhase,
    )
  ) {
    throw new Error("assurance_phase_invalid");
  }
  return phase as AssurancePhase;
}

export function workspaceSelectorsForPhase(phase: AssurancePhase): readonly string[] {
  return phase === "rollback"
    ? [STRICT_WORKSPACE_SELECTOR, LEGACY_WORKSPACE_SELECTOR]
    : [STRICT_WORKSPACE_SELECTOR];
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

async function assertRouteOutcome(
  page: Page,
  definition: CanaryRouteDefinition,
  role: AssuranceRole,
): Promise<RouteAssertion> {
  if (definition.expectedOutcome === "denied") {
    const final = new URL(page.url());
    return final.pathname === "/sign-in" &&
      final.searchParams.get("error") === "forbidden"
      ? { passed: true }
      : { passed: false, diagnostic: "auth_mismatch" };
  }
  if (new URL(page.url()).pathname === "/sign-in") {
    return { passed: false, diagnostic: "auth_mismatch" };
  }
  const renderedRole = (await page.locator(".user-role").first().textContent())?.trim();
  if (renderedRole !== role) {
    return { passed: false, diagnostic: "auth_mismatch" };
  }
  if (definition.dynamicFrom === "renewal_desk") {
    return (await page.getByRole("navigation", { name: "Renewal phases" }).count()) === 1
      ? { passed: true }
      : { passed: false, diagnostic: "landmark_missing" };
  }
  if (!definition.heading) {
    return { passed: false, diagnostic: "landmark_missing" };
  }
  return (await page
    .getByRole("heading", { name: definition.heading, exact: true })
    .count()) === 1
    ? { passed: true }
    : { passed: false, diagnostic: "landmark_missing" };
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

async function resolveWorkspacePath(
  page: Page,
  origin: string,
  phase: AssurancePhase,
): Promise<string | null> {
  // Never let provider row ordering decide which workspace is exercised. The table publishes the
  // same eligibility predicate as the server loader; absence is an honest inconclusive/failure signal.
  for (const selector of workspaceSelectorsForPhase(phase)) {
    const href = await page.locator(selector).first().getAttribute("href");
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

import type { ConsoleMessage, Request } from "playwright-core";
import type { GuardedBrowserRequest } from "./guarded-browser";
import { assertProductionAssuranceEvidence } from "./evidence";
import { routesForRole } from "./manifest";
import type { ProductionAssuranceEvidence } from "./types";
import {
  APPROVED_PREDECESSOR,
  PREDECESSOR_EXCEPTION,
  isApprovedPredecessor,
} from "./predecessor-exception.mjs";

/** Collect only the exact blocked legacy defect; the original canary report remains failed. */
export class PredecessorExceptionObserver {
  private readonly blocked = new Set<GuardedBrowserRequest>();
  private readonly failed = new Set<GuardedBrowserRequest>();
  private consoleErrors = 0;

  mutationBlocked(routeKey: string | null, request: GuardedBrowserRequest) {
    if (
      routeKey !== "my_work" ||
      request.method() !== "POST" ||
      request.url() !== `${APPROVED_PREDECESSOR.canonicalOrigin}/api/work`
    )
      return;
    // The serving code's exact serialized body; duplicate keys or any extra content fail closed.
    if (request.postData?.() === '{"action":"reconcile"}') this.blocked.add(request);
  }

  requestFailed(routeKey: string, request: Request) {
    if (
      routeKey === "my_work" &&
      /^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(
        request.failure()?.errorText ?? "",
      )
    )
      this.failed.add(request);
  }

  consoleMessage(routeKey: string, message: ConsoleMessage) {
    if (
      routeKey === "my_work" &&
      message.type() === "error" &&
      message.location().url === `${APPROVED_PREDECESSOR.canonicalOrigin}/api/work` &&
      /^Failed to load resource: net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/.test(
        message.text(),
      )
    )
      this.consoleErrors++;
  }

  evidence(context: object, report: ProductionAssuranceEvidence) {
    assertProductionAssuranceEvidence(report);
    if (
      !isApprovedPredecessor(context) ||
      report.phase !== "rollback" ||
      report.actorRole !== "Admin" ||
      report.routes.length !== routesForRole("Admin").length ||
      report.reconciliation !== null ||
      report.monitoring !== null ||
      report.observation !== null ||
      report.expectedCommit !== APPROVED_PREDECESSOR.expectedCommit ||
      report.expectedRevision !== APPROVED_PREDECESSOR.expectedRevision ||
      report.verdict !== "failed" ||
      this.blocked.size !== 1 ||
      this.failed.size !== 1 ||
      !this.failed.has([...this.blocked][0]) ||
      this.consoleErrors !== 1
    )
      return null;
    for (const route of report.routes) {
      if (
        !route.landmarkPresent ||
        route.statusClass !== "2xx" ||
        route.actorRole !== "Admin"
      )
        return null;
      const legacy = route.routeKey === "my_work";
      if (route.outcome !== (legacy ? "failed" : "rendered")) return null;
      for (const [key, count] of Object.entries(route.diagnostics)) {
        const expected =
          legacy && ["mutation_attempt", "request_failed", "console_error"].includes(key)
            ? 1
            : 0;
        if (count !== expected) return null;
      }
    }
    return PREDECESSOR_EXCEPTION;
  }
}

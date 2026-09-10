import { OWNER_ADMIN_BROWSER_POLICY } from "./release-browser-policy.mjs";

// Owner-approved September 10 exception. These coordinates are deliberately not configurable.
export const APPROVED_PREDECESSOR = Object.freeze({
  browserPolicy: OWNER_ADMIN_BROWSER_POLICY,
  canonicalOrigin: "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
  expectedCommit: "d243911cb20ffb01773072c0e27c723648eeea34",
  expectedRevision: "pmi-kc-app-rmtkmhj1z-8855e4c6dbfb",
});
export const PREDECESSOR_EXCEPTION = Object.freeze({
  code: "owner-approved-blocked-legacy-my-work-reconcile-2026-09-10",
  blockedAttempts: 1,
  matchedRequestFailures: 1,
  matchedConsoleErrors: 1,
  dispatchedWrites: 0,
});

export function isApprovedPredecessor(context) {
  return Object.entries(APPROVED_PREDECESSOR).every(
    ([key, value]) => context[key] === value,
  );
}

export function isExactPredecessorException(evidence) {
  return (
    evidence !== null &&
    typeof evidence === "object" &&
    Object.keys(evidence).length === Object.keys(PREDECESSOR_EXCEPTION).length &&
    Object.entries(PREDECESSOR_EXCEPTION).every(
      ([key, value]) => Object.hasOwn(evidence, key) && evidence[key] === value,
    )
  );
}

export function acceptsPredecessorException(baseline) {
  return (
    isApprovedPredecessor(baseline) &&
    baseline.adminVerdict === "failed_known_legacy_defect" &&
    baseline.editorVerdict === "not_run" &&
    isExactPredecessorException(baseline.legacyException)
  );
}

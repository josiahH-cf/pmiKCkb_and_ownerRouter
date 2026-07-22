"use client";

import { useState } from "react";

import { Metric } from "@/components/ui/Metric";

interface TestLaneResult {
  actionCount: number;
  receiptCount: number;
  attemptCount: number;
  typedAdapterCount: number;
  providerCallCount: number;
}

interface ProductionTestWorkspaceResult {
  mode: "production-test-workspace";
  dataMode: "test";
  liveEvidenceEligible: false;
  liveProviderCallCount: 0;
  vendorBoundary: {
    invited: boolean;
    verifiedEmailTotp: boolean;
    oauthExactScopes: boolean;
    sameMailbox: boolean;
    assignedTicketOnly: boolean;
    wrongMailboxBlocked: boolean;
    exactReplyOneAttempt: boolean;
    disabled: boolean;
    sessionRevoked: boolean;
    tokenRevocationQueued: boolean;
    typedProviderBoundary: boolean;
    liveProviderCalls: 0;
  };
  lease: TestLaneResult;
  maintenance: TestLaneResult;
  providerOperations: string[];
}

const VENDOR_CHECKS = [
  ["invited", "Invite and one-time setup"],
  ["verifiedEmailTotp", "Verified email and TOTP"],
  ["oauthExactScopes", "Exact mailbox scopes"],
  ["sameMailbox", "Same-address mailbox boundary"],
  ["assignedTicketOnly", "Assigned-ticket-only access"],
  ["wrongMailboxBlocked", "Wrong mailbox blocked"],
  ["exactReplyOneAttempt", "Exact reply, one attempt"],
  ["disabled", "Vendor disabled"],
  ["sessionRevoked", "Session revoked"],
  ["tokenRevocationQueued", "Token revocation queued"],
  ["typedProviderBoundary", "Typed Test adapter boundary"],
] as const;

export function V1ProductionTestWorkspacePanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Ready to exercise the complete Vendor, Lease, and Maintenance workflows with invented Test records.",
  );
  const [result, setResult] = useState<ProductionTestWorkspaceResult | null>(null);

  async function runWorkspace() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setMessage("Running the isolated production Test workspace…");
    try {
      const response = await fetch("/api/admin/v1/fake-acceptance", {
        headers: { accept: "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readError(payload) ?? "The Test workspace run failed.");
      }
      if (!isProductionTestWorkspaceResult(payload)) {
        throw new Error(
          "The Test workspace safety boundary could not be verified. Results were withheld.",
        );
      }
      setResult(payload);
      setMessage(
        "Test workspace completed with 0 Live-provider calls. This proves the application's workflow behavior with Live providers inactive.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The Test workspace run failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article aria-labelledby="v1-production-test-title" className="panel ui-stack">
      <div className="panel-heading">
        <div>
          <h2 id="v1-production-test-title">V1 Production Test Workspace</h2>
          <p className="muted">
            Run the real application workflow against isolated in-memory Test adapters and
            invented aliases. No customer record or external provider is contacted.
          </p>
        </div>
        <span className="review-pill" data-testid="v1-production-test-badge">
          TEST · non-Live
        </span>
      </div>

      <div className="notice">
        <strong>Evidence boundary</strong>
        <p className="muted">
          A passing run counts as V1 application workflow evidence. It cannot activate a
          provider, satisfy Live-provider proof, or be reported as a Live write.
        </p>
      </div>

      <div className="ui-metric-grid" aria-label="Test workspace safety boundary">
        <Metric label="Data mode" value="TEST" />
        <Metric label="Live-provider calls" value="0" />
        <Metric label="Live evidence eligible" value="No" />
      </div>

      <p aria-live="polite" className="muted" role="status">
        {message}
      </p>
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => void runWorkspace()}
        type="button"
      >
        {busy ? "Running Test workspace…" : "Run full Test workspace"}
      </button>

      {result ? <WorkspaceResults result={result} /> : null}
    </article>
  );
}

function WorkspaceResults({
  result,
}: Readonly<{ result: ProductionTestWorkspaceResult }>) {
  const vendorPassed = VENDOR_CHECKS.filter(([key]) => result.vendorBoundary[key]).length;

  return (
    <section aria-label="Production Test workspace results" className="ui-stack">
      <div className="ui-metric-grid">
        <Metric
          label="Vendor boundary checks"
          value={`${vendorPassed}/${VENDOR_CHECKS.length}`}
        />
        <Metric label="Lease receipts" value={result.lease.receiptCount} />
        <Metric label="Maintenance receipts" value={result.maintenance.receiptCount} />
        <Metric label="Live-provider calls" value={result.liveProviderCallCount} />
      </div>

      <div className="grid three">
        <section className="compact-record" aria-label="Vendor Test result">
          <h3>Vendor</h3>
          <p>
            {vendorPassed}/{VENDOR_CHECKS.length} boundary checks passed
          </p>
          <p className="muted">
            Live-provider calls: {result.vendorBoundary.liveProviderCalls}
          </p>
          <ul className="compact-list">
            {VENDOR_CHECKS.map(([key, label]) => (
              <li key={key}>
                {label}: {result.vendorBoundary[key] ? "Passed" : "Failed"}
              </li>
            ))}
          </ul>
        </section>
        <LaneResult lane="Lease" result={result.lease} />
        <LaneResult lane="Maintenance" result={result.maintenance} />
      </div>

      <details>
        <summary>Test adapter operations ({result.providerOperations.length})</summary>
        <p className="muted">
          These names describe isolated Test-adapter operations. They are not
          Live-provider calls or Live-provider evidence.
        </p>
        <ul className="compact-list">
          {result.providerOperations.map((operation) => (
            <li key={operation}>
              <code>{operation}</code>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function LaneResult({
  lane,
  result,
}: Readonly<{ lane: "Lease" | "Maintenance"; result: TestLaneResult }>) {
  return (
    <section className="compact-record" aria-label={`${lane} Test result`}>
      <h3>{lane}</h3>
      <dl>
        <dt>Actions</dt>
        <dd>{result.actionCount}</dd>
        <dt>Receipts</dt>
        <dd>{result.receiptCount}</dd>
        <dt>Attempts</dt>
        <dd>{result.attemptCount}</dd>
        <dt>Typed adapters</dt>
        <dd>{result.typedAdapterCount}</dd>
        <dt>Test-adapter calls</dt>
        <dd>{result.providerCallCount}</dd>
      </dl>
    </section>
  );
}

function isProductionTestWorkspaceResult(
  value: unknown,
): value is ProductionTestWorkspaceResult {
  if (!isRecord(value)) return false;
  return (
    value.mode === "production-test-workspace" &&
    value.dataMode === "test" &&
    value.liveEvidenceEligible === false &&
    value.liveProviderCallCount === 0 &&
    isVendorBoundary(value.vendorBoundary) &&
    isTestLaneResult(value.lease) &&
    isTestLaneResult(value.maintenance) &&
    Array.isArray(value.providerOperations) &&
    value.providerOperations.every((operation) => typeof operation === "string")
  );
}

function isVendorBoundary(value: unknown) {
  if (!isRecord(value) || value.liveProviderCalls !== 0) return false;
  return VENDOR_CHECKS.every((check) => typeof value[check[0]] === "boolean");
}

function isTestLaneResult(value: unknown): value is TestLaneResult {
  if (!isRecord(value)) return false;
  return [
    value.actionCount,
    value.receiptCount,
    value.attemptCount,
    value.typedAdapterCount,
    value.providerCallCount,
  ].every((count) => typeof count === "number" && Number.isSafeInteger(count));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(value: unknown) {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

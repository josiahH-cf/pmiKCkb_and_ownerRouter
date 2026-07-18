"use client";

import Link from "next/link";
import { useState } from "react";

import {
  TEST_PUBLICATION_CONFIRMATIONS,
  type TestPublicationFixtureOperation,
} from "@/lib/publication/test-fixture-contract";

interface FixtureStatus {
  active_revision: "baseline" | "revision" | "unknown" | null;
  active_version_id: string | null;
  active_version_number: number | null;
  authority: string;
  baseline_version_id: string | null;
  capture_task_id: string | null;
  capture_task_status: "resolved" | null;
  continuation_ready: boolean;
  data_mode: "test";
  live_evidence_eligible: false;
  policy_ready: boolean;
  rollback_available: boolean;
  scanner_boundary: string;
  state: "missing" | "drifted" | "ready" | "revision_active";
  pinned_process_definition_version_id: string | null;
  pinned_publication_version_id: string | null;
  pinned_test_run_id: string | null;
  version_count: number;
}

export function TrustedPublicationTestFixturePanel({
  spaceId,
}: Readonly<{ spaceId: string }>) {
  const [status, setStatus] = useState<FixtureStatus | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Inspect or restore the repository-authorized Test publication baseline.",
  );

  async function inspect() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/spaces/${encodeURIComponent(spaceId)}/publications/test-fixture`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fixture?: FixtureStatus;
      };
      if (!response.ok || !payload.fixture) {
        throw new Error(payload.error ?? "Test publication fixture is unavailable.");
      }
      setStatus(payload.fixture);
      setMessage(`Test publication fixture state: ${payload.fixture.state}.`);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function mutate(operation: TestPublicationFixtureOperation) {
    setBusy(true);
    try {
      const confirmation =
        operation === "continue_pinned_run"
          ? TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun
          : operation === "restore_baseline"
            ? TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline
            : operation === "publish_revision"
              ? TEST_PUBLICATION_CONFIRMATIONS.publishRevision
              : TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline;
      const response = await fetch(
        `/api/spaces/${encodeURIComponent(spaceId)}/publications/test-fixture`,
        {
          body: JSON.stringify({ confirmation, operation }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { changed: boolean; effect: string; status: FixtureStatus };
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Test publication fixture action failed.");
      }
      setStatus(payload.result.status);
      setMessage(
        payload.result.changed
          ? `Test-only ${payload.result.effect} receipt recorded; active state is ${payload.result.status.state}.`
          : `No duplicate write: the Test publication is already ${payload.result.status.state}.`,
      );
      setConfirmed(false);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel ui-collapse">
      <summary>
        <span className="ui-card-title">Trusted publication Test fixture</span>
        <span className="muted">
          {" "}
          Exact repository-owned content, immutable versions, and reversible baseline.
        </span>
      </summary>
      <div className="ui-stack">
        <p className="muted">
          TEST only. The server accepts two compiled, hash-locked fixture revisions and no
          uploaded content. This proves app publication and rollback mechanics; it does
          not claim a Live malware scanner or provider activation.
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void inspect()}
          type="button"
        >
          Inspect Test publication fixture
        </button>
        {status ? (
          <dl className="summary-list" aria-label="Test publication fixture status">
            <div>
              <dt>Data mode</dt>
              <dd>TEST · never Live evidence</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{status.state}</dd>
            </div>
            <div>
              <dt>Authority</dt>
              <dd>{status.authority}</dd>
            </div>
            <div>
              <dt>Scanner boundary</dt>
              <dd>{status.scanner_boundary}</dd>
            </div>
            <div>
              <dt>Active immutable version</dt>
              <dd>
                {status.active_version_id ?? "Not created"}
                {status.active_version_number
                  ? ` · sequence ${status.active_version_number}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Rollback baseline</dt>
              <dd>{status.baseline_version_id ?? "Not created"}</dd>
            </div>
            <div>
              <dt>Owning Capture Task</dt>
              <dd>
                {status.capture_task_id ?? "Not created"}
                {status.capture_task_status ? ` · ${status.capture_task_status}` : ""}
              </dd>
            </div>
            <div>
              <dt>Pinned source publication</dt>
              <dd>{status.pinned_publication_version_id ?? "Not continued"}</dd>
            </div>
            <div>
              <dt>Pinned process definition</dt>
              <dd>{status.pinned_process_definition_version_id ?? "Not continued"}</dd>
            </div>
            <div>
              <dt>Next pinned Test run</dt>
              <dd>
                {status.pinned_test_run_id ? (
                  <Link href={`/workflow-runs/${status.pinned_test_run_id}`}>
                    {status.pinned_test_run_id}
                  </Link>
                ) : (
                  "Not started"
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        <label>
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />{" "}
          I am operating only the exact isolated Test publication fixture.
        </label>
        <div className="action-row">
          <button
            className="secondary-button"
            disabled={busy || !confirmed}
            onClick={() => void mutate("restore_baseline")}
            type="button"
          >
            Restore Test baseline
          </button>
          <button
            className="secondary-button"
            disabled={busy || !confirmed || status?.state !== "ready"}
            onClick={() => void mutate("publish_revision")}
            type="button"
          >
            Publish exact Test revision
          </button>
          <button
            className="secondary-button"
            disabled={busy || !confirmed || status?.state !== "revision_active"}
            onClick={() => void mutate("rollback_baseline")}
            type="button"
          >
            Roll back Test baseline
          </button>
          <button
            className="secondary-button"
            disabled={
              busy ||
              !confirmed ||
              !status?.active_version_id ||
              (status.state !== "ready" && status.state !== "revision_active")
            }
            onClick={() => void mutate("continue_pinned_run")}
            type="button"
          >
            Start version-pinned Test run
          </button>
        </div>
        <p className="muted" role="status">
          {message}
        </p>
      </div>
    </details>
  );
}

function readError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Test publication fixture action failed.";
}

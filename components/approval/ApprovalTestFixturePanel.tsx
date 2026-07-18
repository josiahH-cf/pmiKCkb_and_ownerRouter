"use client";

import { useState } from "react";

import { APPROVAL_TEST_FIXTURE_CONFIRMATION } from "@/lib/approval/test-fixture-contract";

export function ApprovalTestFixturePanel({
  navigate = (href) => window.location.assign(href),
}: Readonly<{ navigate?: (href: string) => void }> = {}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function restore() {
    setBusy(true);
    setMessage("Restoring isolated Test approval fixtures.");
    try {
      const response = await fetch("/api/approval-queue/test-fixtures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          confirmation: APPROVAL_TEST_FIXTURE_CONFIRMATION,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fixtures?: { item_ids: string[]; restored_count: number; state: string };
      };
      if (!response.ok || !payload.fixtures) {
        throw new Error(payload.error ?? "Test approval fixtures are unavailable.");
      }
      setMessage(
        payload.fixtures.restored_count === 0
          ? "The isolated Test approval baseline is already ready."
          : `Restored ${payload.fixtures.restored_count} isolated Test approval item(s). Reloading the queue.`,
      );
      const firstId = payload.fixtures.item_ids[0];
      navigate(
        firstId
          ? `/approval-queue?item_id=${encodeURIComponent(firstId)}`
          : "/approval-queue",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Test approval fixtures are unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel ui-collapse">
      <summary>
        <span className="ui-card-title">Approval Test fixtures</span>
        <span className="muted">
          {" "}
          Create or restore isolated app-only items for safe role, action, and
          notification checks.
        </span>
      </summary>
      <div className="ui-stack">
        <p className="muted">
          The server binds these records to a distinct enabled non-Admin staff identity
          and the current Admin. Every item is visibly Test. Approval changes app state
          only; Execute and Bulk Execute remain expected denials with no provider call.
        </p>
        <label>
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />{" "}
          Restore only the canonical isolated Test baseline.
        </label>
        <button
          className="secondary-button"
          disabled={!confirmed || busy}
          onClick={() => void restore()}
          type="button"
        >
          Create or restore Test approval fixtures
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </div>
    </details>
  );
}

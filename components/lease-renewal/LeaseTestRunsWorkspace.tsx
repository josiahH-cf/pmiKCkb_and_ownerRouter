"use client";

import Link from "next/link";
import { useState } from "react";

import {
  LEASE_TEST_SCENARIO,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

export function LeaseTestRunsWorkspace({
  initialRuns,
  unavailableNote,
}: Readonly<{
  initialRuns: LeaseTestRunRecord[];
  unavailableNote?: string;
}>) {
  const [runs, setRuns] = useState(initialRuns);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function createRun() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/lease-renewal/test-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: LEASE_TEST_SCENARIO }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        run?: LeaseTestRunRecord;
        error?: string;
      };
      if (response.ok && payload.run) {
        setRuns((previous) => [payload.run!, ...previous]);
        setMessage(
          "Persistent Test run created with invented aliases. No Live record or provider was touched.",
        );
      } else {
        setMessage(payload.error ?? "Could not create the Lease Test run.");
      }
    } catch {
      setMessage("Could not reach the Lease Test run service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel ui-stack" aria-label="Production Lease Test workspace">
      <div className="ui-spread">
        <div>
          <h2 className="section-subtitle">Production Test workspace</h2>
          <p className="muted">
            Create a persistent invented renewal, move it through the app lifecycle, and
            run all explicit Test actions to Done. Test evidence stays in Firestore and
            cannot contact or prove a Live provider.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={pending || Boolean(unavailableNote)}
          onClick={() => void createRun()}
          type="button"
        >
          {pending ? "Creating Test run…" : "Create Test renewal"}
        </button>
      </div>
      {unavailableNote ? <p className="workflow-blocker">{unavailableNote}</p> : null}
      {runs.length === 0 && !unavailableNote ? (
        <p className="muted">No persistent Test renewals yet.</p>
      ) : null}
      {runs.length > 0 ? (
        <ul className="lr-run-list">
          {runs.map((run) => (
            <li key={run.id}>
              <div className="ui-spread">
                <div>
                  <span className="queue-pill" data-value="Needs Attention">
                    TEST DATA
                  </span>{" "}
                  <strong>{run.property_label}</strong>
                  <p className="muted">
                    {run.resident_label} · {run.status} · {run.action_total} explicit Test
                    actions
                  </p>
                </div>
                <Link
                  className="secondary-button"
                  href={`/lease-renewal/runs/${encodeURIComponent(run.id)}`}
                >
                  Open Test journey
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}

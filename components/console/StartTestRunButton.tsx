"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface StartedRun {
  id: string;
  process_name: string;
  status: string;
  next_action: string;
}

/**
 * Starts a SIMULATION-only test run for a process definition, reusing the exact endpoint the Console
 * process picker uses (POST /api/process-definitions/{id}/test-runs). It never sends or writes a system
 * of record — the ceiling is a test run the operator opens on its run page. Editor-gated by the caller
 * (rendered only when the viewer can start a run).
 */
export function StartTestRunButton({
  fallbackHref,
  processDefinitionId,
}: Readonly<{ fallbackHref: string; processDefinitionId: string }>) {
  const [pending, setPending] = useState(false);
  const [run, setRun] = useState<StartedRun | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/process-definitions/${encodeURIComponent(processDefinitionId)}/test-runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "Started from the Console anticipation lane." }),
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as { run: StartedRun };
        setRun(payload.run);
      } else {
        setUnavailable(true);
      }
    } catch {
      setError("Test run could not be started. Try again or open the space.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (run) {
    return (
      <p className="muted">
        Test run started. <Link href={`/workflow-runs/${run.id}`}>View the test run</Link>
      </p>
    );
  }

  if (unavailable) {
    return (
      <p className="muted" role="status">
        This process is not available to start.{" "}
        <Link href={fallbackHref}>Open the space</Link>
      </p>
    );
  }

  return (
    <>
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void start()}
        type="button"
      >
        {pending ? "Starting…" : "Start a test run"}
      </button>
      {error ? <p className="muted">{error}</p> : null}
      {error ? (
        <Link className="console-anticipated-open" href={fallbackHref}>
          Open the space
        </Link>
      ) : null}
    </>
  );
}

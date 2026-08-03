"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface StartedRun {
  id: string;
}

/** Starts one ordinary app-plane workflow. It does not execute a provider or system-of-record write. */
export function StartRunButton({
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
        `/api/process-definitions/${encodeURIComponent(processDefinitionId)}/runs`,
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
      setError("Run could not be started. Try again or open the Space.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (run) {
    return (
      <p className="muted">
        Run started. <Link href={`/workflow-runs/${run.id}`}>View the run</Link>
      </p>
    );
  }

  if (unavailable) {
    return (
      <p className="muted" role="status">
        This process is not available to start.{" "}
        <Link href={fallbackHref}>Open the Space</Link>
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
        {pending ? "Starting…" : "Start run"}
      </button>
      {error ? <p className="muted">{error}</p> : null}
      {error ? (
        <Link className="console-anticipated-open" href={fallbackHref}>
          Open the Space
        </Link>
      ) : null}
    </>
  );
}

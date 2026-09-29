"use client";
import { useState } from "react";
import type { DerivedArtifactRecord } from "@/lib/lease-documents/derived-artifact-contract";

/** Explicit actions only; opening the lease never prepares or approves an artifact. */
export function FilledArtifactPanel({
  leaseId,
  snapshotId,
  artifactId,
}: Readonly<{ leaseId: string; snapshotId: string; artifactId: string }>) {
  const identity = { leaseId, snapshotId, artifactId };
  const [state, setState] = useState<{
    supported: boolean;
    reason?: string;
    record: DerivedArtifactRecord | null;
    canPrepare: boolean;
    canApprove: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState(false);
  const [operation, setOperation] = useState<{
    action: "prepare" | "approve";
    id: string;
  } | null>(null);
  async function run(action?: "prepare" | "approve") {
    setBusy(true);
    setError(null);
    try {
      const id =
        operation && action && operation.action === action
          ? operation.id
          : crypto.randomUUID();
      if (action) setOperation({ action, id });
      const response = await fetch(
        `/api/lease-renewal/filled-artifact${action ? "" : `?${new URLSearchParams(identity)}`}`,
        action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...identity,
                action,
                operationId: id,
                ...(action === "prepare"
                  ? { expectedCurrentId: state?.record?.id ?? null }
                  : {
                      derivedId: state!.record!.id,
                      outputHash: state!.record!.outputHash,
                      inspected,
                    }),
              }),
            }
          : { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "This document could not be read or prepared.");
      if (action) setState((old) => (old ? { ...old, record: payload.record } : old));
      else setState(payload);
      setOperation(null);
      setInspected(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Document operation failed.");
    } finally {
      setBusy(false);
    }
  }
  const record = state?.record;
  return (
    <div className="ui-stack-tight" aria-busy={busy}>
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={() => run()}
      >
        {state ? "Refresh filled document" : "Check filled document"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {state && !state.supported ? <p>{state.reason}</p> : null}
      {state?.supported ? (
        <>
          <p>
            Prepare a copy using the current approved facts and reviewed form fields.
            Inspect the downloaded PDF before approving its exact bytes. Signatures remain
            a human handoff.
          </p>
          {state.canPrepare && !record?.approval ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => run("prepare")}
            >
              {record ? "Prepare a replacement filled PDF" : "Prepare filled PDF"}
            </button>
          ) : null}
          {record ? (
            <>
              <a
                className="text-link"
                href={`/api/lease-renewal/filled-artifact?${new URLSearchParams({ ...identity, derivedId: record.id })}`}
              >
                Download filled PDF for inspection
              </a>
              <p>
                Saved PDF fields were reopened and compared. Approval:{" "}
                {record.approval
                  ? "approved for this exact output"
                  : "awaiting inspection"}
                .
              </p>
              <details>
                <summary>Filled values and provenance</summary>
                <p>Output SHA-256: {record.outputHash}</p>
                <p>
                  Original SHA-256: {record.originalHash} · map {record.mapVersion}
                </p>
                <ul>
                  {Object.entries(record.comparison.allFields).map(([field, value]) => (
                    <li key={field}>
                      {field}: {value === null ? "unsigned signature" : String(value)}
                    </li>
                  ))}
                </ul>
              </details>
              {state.canApprove && !record.approval ? (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={inspected}
                      disabled={busy}
                      onChange={(event) => setInspected(event.target.checked)}
                    />{" "}
                    I inspected this downloaded PDF, its complete values and layout, and
                    approve these exact bytes.
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !inspected}
                    onClick={() => run("approve")}
                  >
                    Approve exact filled PDF
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <p>No filled output has been prepared for this packet.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

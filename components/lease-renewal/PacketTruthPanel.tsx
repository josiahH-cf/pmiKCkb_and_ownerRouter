"use client";

import { useEffect, useRef, useState } from "react";

import { REQUIRED_LEASE_ARTIFACTS } from "@/lib/lease-documents/artifact-catalog";
import type {
  PacketVisibleState,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

const NEXT_ACTION: Record<PacketVisibleState, string> = {
  "Not evaluated": "Evaluate packet truth from approved sources.",
  "Needs input":
    "Supply the named verified facts or publish the named approved artifacts.",
  Conflict: "An Admin must resolve each conflict with an exact source and reason.",
  "Ready for preview": "Request an exact-hash preview for human review.",
  Previewed: "Review the exact preview before an Admin decision.",
  Approved: "Execute only through the exact confirmed S34 action contract.",
  Superseded: "Reload and evaluate the current successor snapshot.",
  "Provider pending": "Reconcile the existing provider attempt before retrying.",
  "Partially executed": "Reconcile the existing partial attempt before retrying.",
  Executed: "Tenant execution evidence is complete for this packet.",
  Failed: "Preserve the receipt, correct the blocker, and reconcile before retrying.",
  Cancelled: "Evidence is preserved; evaluate a successor before continuing.",
};

export function PacketTruthPanel({
  initialSnapshot,
  leaseId,
  transactionId,
}: Readonly<{
  initialSnapshot: RenewalPacketSnapshot | null;
  leaseId: string;
  transactionId: string;
}>) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  async function evaluate() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/lease-renewal/packet-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          leaseId,
          transactionId,
          expectedCurrentSnapshotId: snapshot?.snapshotId ?? null,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        snapshot?: RenewalPacketSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Packet truth could not be evaluated.");
      }
      setSnapshot(payload.snapshot);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof Error ? caught.message : "Packet truth could not be evaluated.",
      );
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  const state = snapshot?.visibleState ?? "Not evaluated";
  return (
    <section
      aria-busy={loading}
      aria-labelledby="packet-truth-heading"
      className="ui-stack"
    >
      <div className="ui-spread">
        <div className="ui-stack-tight">
          <h3 id="packet-truth-heading">Document packet truth</h3>
          <p className="muted">
            State: <strong>{state}</strong>
            {snapshot ? ` · snapshot ${snapshot.snapshotVersion}` : ""}
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={evaluate}
          type="button"
        >
          {loading
            ? "Evaluating…"
            : snapshot
              ? "Evaluate current truth"
              : "Evaluate packet"}
        </button>
      </div>

      {loading && snapshot ? (
        <p role="status">
          Checking current sources. The committed snapshot remains visible.
        </p>
      ) : null}
      {error ? (
        <div className="ui-stack-tight" role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={evaluate} type="button">
            Retry evaluation
          </button>
        </div>
      ) : null}

      {!snapshot ? (
        <div className="ui-stack-tight">
          <p>No packet has been evaluated.</p>
          <p className="muted">
            Evaluation is local packet preparation only. It does not contact Dotloop or
            create a document.
          </p>
        </div>
      ) : (
        <PacketSnapshotDetails snapshot={snapshot} />
      )}

      <div className="ui-stack-tight">
        <strong>Current approved-artifact dependencies</strong>
        <p className="muted">
          Spike S66-A found no verified field/signature catalog. These are dependencies,
          not fallback templates or generated legal copy.
        </p>
        <ul className="ui-rows">
          {REQUIRED_LEASE_ARTIFACTS.map((artifact) => (
            <li key={artifact.kind}>Approved artifact unavailable: {artifact.label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PacketSnapshotDetails({
  snapshot,
}: Readonly<{ snapshot: RenewalPacketSnapshot }>) {
  const manifest = snapshot.manifest;
  return (
    <div className="ui-stack">
      <p>
        <strong>Next action:</strong> {NEXT_ACTION[snapshot.visibleState]}
      </p>
      <p className="muted">
        Packet type: {snapshot.packetContext ?? "Not classified"} · catalog{" "}
        {snapshot.catalogVersion}
        {snapshot.current ? " · current" : " · superseded"}
      </p>

      {snapshot.blockers.length > 0 ? (
        <div className="ui-stack-tight">
          <strong>Blockers</strong>
          <ul className="ui-rows">
            {snapshot.blockers.map((blocker, index) => (
              <li
                id={`packet-blocker-${index}`}
                key={`${blocker.code}-${blocker.scope}-${blocker.fieldKey ?? index}`}
                tabIndex={0}
              >
                {blocker.label} <span className="muted">({blocker.scope})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {manifest ? (
        <>
          <div className="ui-stack-tight">
            <strong>Included artifacts</strong>
            {manifest.includedArtifacts.length > 0 ? (
              <ul className="ui-rows">
                {manifest.includedArtifacts.map((artifact) => (
                  <li key={artifact.artifactId}>
                    {artifact.label} · version {artifact.version} · {artifact.audience}
                    <span className="muted">: {artifact.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No artifact is currently includable.</p>
            )}
          </div>
          <div className="ui-stack-tight">
            <strong>Excluded / undecided artifacts</strong>
            {manifest.excludedArtifacts.length > 0 ? (
              <ul className="ui-rows">
                {manifest.excludedArtifacts.map((artifact) => (
                  <li key={`${artifact.artifactId}-${artifact.kind}`}>
                    {artifact.label}: {artifact.ruleResult}
                    <span className="muted">: {artifact.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">None.</p>
            )}
          </div>
          <p>
            Required {manifest.audience} participants: {manifest.participants.length} ·
            bound fields: {manifest.fields.length}
          </p>
        </>
      ) : null}

      <details>
        <summary>Source and hash evidence</summary>
        <div className="ui-stack-tight">
          <p className="muted">Payload hash: {snapshot.payloadHash}</p>
          <ul className="ui-rows">
            {snapshot.sourceVersions.map((source) => (
              <li
                key={`${source.system}-${source.reference}-${source.version ?? "current"}`}
              >
                {source.system} · {source.reference}
                {source.version ? ` · ${source.version}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

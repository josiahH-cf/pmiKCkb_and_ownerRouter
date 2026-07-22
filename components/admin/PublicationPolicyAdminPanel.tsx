"use client";

import { useState } from "react";
import { resolveDataMode } from "@/lib/data-mode";
import type { PublicationPolicyRecord } from "@/lib/publication/types";

export function PublicationPolicyAdminPanel({
  initialPolicies,
  spaces,
  unavailableNote,
}: Readonly<{
  initialPolicies: PublicationPolicyRecord[];
  spaces: readonly { id: string; name: string }[];
  unavailableNote?: string;
}>) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [message, setMessage] = useState(
    unavailableNote ?? "Publication trust policies loaded.",
  );
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    connectorId: "",
    reason: "",
    rootId: "",
    scannerKey: "",
    sensitivityCeiling: "Medium",
    spaces: [] as string[],
  });

  async function createPolicy() {
    if (busy) return;
    setBusy(true);
    setMessage("Creating audited publication policy.");
    try {
      const response = await fetch("/api/admin/publication-policies", {
        body: JSON.stringify({
          allowedSpaces: form.spaces,
          connectorId: form.connectorId,
          reason: form.reason,
          rootId: form.rootId,
          scannerKey: form.scannerKey,
          sensitivityCeiling: form.sensitivityCeiling,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readResponse<{ policy: PublicationPolicyRecord }>(response);
      setPolicies((current) => [...current, payload.policy]);
      setForm({
        connectorId: "",
        reason: "",
        rootId: "",
        scannerKey: "",
        sensitivityCeiling: "Medium",
        spaces: [],
      });
      setMessage("Publication policy created with launch-safe type and size defaults.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  async function disablePolicy(policy: PublicationPolicyRecord) {
    const reason = window.prompt("Reason for disabling this publication policy?");
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/publication-policies/${policy.id}`, {
        body: JSON.stringify({ enabled: false, reason }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = await readResponse<{ policy: PublicationPolicyRecord }>(response);
      setPolicies((current) =>
        current.map((item) => (item.id === policy.id ? payload.policy : item)),
      );
      setMessage("Publication policy disabled and audited.");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleSpace(spaceId: string) {
    setForm((current) => ({
      ...current,
      spaces: current.spaces.includes(spaceId)
        ? current.spaces.filter((id) => id !== spaceId)
        : [...current.spaces, spaceId],
    }));
  }

  return (
    <article className="panel">
      <h2>Trusted Publication Policies</h2>
      <p className="muted">{message}</p>
      <p className="muted">
        The connector and root define this space&rsquo;s authority boundary. Existing
        policies may only be tightened; widening requires a new audited policy.
      </p>
      <div className="workflow-record-list">
        {policies.map((policy) => (
          <div className="compact-record" key={policy.id}>
            <strong>
              {policy.connectorId} / {policy.rootId}
            </strong>
            <p className="muted">
              {resolveDataMode(policy) === "test" ? "TEST" : "LIVE"} ·{" "}
              {policy.enabled ? "Enabled" : "Disabled"} ·{" "}
              {policy.allowedSpaces.join(", ")} · sensitivity ≤{" "}
              {policy.sensitivityCeiling} · scanner {policy.scannerKey}
            </p>
            {policy.enabled ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void disablePolicy(policy)}
                type="button"
              >
                Disable
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="workflow-two-column-fields">
        <label>
          Connector ID
          <input
            disabled={busy}
            onChange={(event) => setForm({ ...form, connectorId: event.target.value })}
            value={form.connectorId}
          />
        </label>
        <label>
          Root ID
          <input
            disabled={busy}
            onChange={(event) => setForm({ ...form, rootId: event.target.value })}
            value={form.rootId}
          />
        </label>
        <label>
          Scanner provider key
          <input
            disabled={busy}
            onChange={(event) => setForm({ ...form, scannerKey: event.target.value })}
            value={form.scannerKey}
          />
        </label>
        <label>
          Sensitivity ceiling
          <select
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, sensitivityCeiling: event.target.value })
            }
            value={form.sensitivityCeiling}
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>
      </div>
      <fieldset disabled={busy}>
        <legend>Allowed Spaces</legend>
        <div className="checkbox-list">
          {spaces.map((space) => (
            <label key={space.id}>
              <input
                checked={form.spaces.includes(space.id)}
                onChange={() => toggleSpace(space.id)}
                type="checkbox"
              />
              {space.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Plain-English reason
        <textarea
          disabled={busy}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          rows={2}
          value={form.reason}
        />
      </label>
      <button
        className="primary-button"
        disabled={busy || form.spaces.length === 0}
        onClick={() => void createPolicy()}
        type="button"
      >
        Create policy
      </button>
    </article>
  );
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok)
    throw new Error(payload.error || "Publication policy request failed.");
  return payload;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Publication policy request failed.";
}

"use client";

import { useState } from "react";
import { Button, ConfirmationDialog } from "@/components/ui";
import { resolveStoredDataMode } from "@/lib/data-mode";
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
  const [pendingDisable, setPendingDisable] = useState<PublicationPolicyRecord | null>(
    null,
  );
  const [disableReason, setDisableReason] = useState("");
  const [disableError, setDisableError] = useState("");
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

  function requestDisable(policy: PublicationPolicyRecord) {
    setPendingDisable(policy);
    setDisableReason("");
    setDisableError("");
  }

  async function disablePolicy() {
    const policy = pendingDisable;
    const reason = disableReason.trim();
    if (!policy || busy || !reason) return;
    setBusy(true);
    setDisableError("");
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
      setPendingDisable(null);
      setDisableReason("");
    } catch (error) {
      setDisableError(`${readError(error)} Try again or cancel without changing it.`);
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
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {message}
      </p>
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
              {resolveStoredDataMode(policy) === "test" ? "TEST" : "LIVE"} ·{" "}
              {policy.enabled ? "Enabled" : "Disabled"} ·{" "}
              {policy.allowedSpaces.join(", ")} · sensitivity ≤{" "}
              {policy.sensitivityCeiling} · scanner {policy.scannerKey}
            </p>
            {policy.enabled ? (
              <Button
                disabled={busy}
                onClick={() => requestDisable(policy)}
                variant="secondary"
              >
                Disable
              </Button>
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
      <Button
        busy={busy && pendingDisable === null}
        busyLabel="Creating policy"
        disabled={busy || form.spaces.length === 0}
        onClick={() => void createPolicy()}
      >
        Create policy
      </Button>
      <ConfirmationDialog
        busy={busy}
        busyLabel="Disabling policy"
        confirmDisabled={disableReason.trim().length === 0}
        confirmLabel="Disable policy"
        confirmVariant="destructive"
        description="Disabling this policy stops new publication through this exact connector and root."
        error={disableError}
        onCancel={() => {
          setPendingDisable(null);
          setDisableReason("");
          setDisableError("");
        }}
        onConfirm={() => void disablePolicy()}
        open={pendingDisable !== null}
        title="Disable publication policy"
      >
        {pendingDisable ? (
          <>
            <dl className="ui-confirmation-summary">
              <dt>Policy</dt>
              <dd>
                {pendingDisable.connectorId} / {pendingDisable.rootId}
              </dd>
            </dl>
            <label htmlFor="publication-policy-disable-reason">
              Reason
              <textarea
                disabled={busy}
                id="publication-policy-disable-reason"
                onChange={(event) => setDisableReason(event.target.value)}
                required
                rows={3}
                value={disableReason}
              />
            </label>
          </>
        ) : null}
      </ConfirmationDialog>
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

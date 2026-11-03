"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useState } from "react";
import { Button, ConfirmationDialog } from "@/components/ui";
import { resolveStoredDataMode } from "@/lib/data-mode";
import type { PublicationPolicyRecord } from "@/lib/publication/types";
import { MANAGED_PROCESS_SCANNER_KEY } from "@/lib/publication/managed-scanner-config";
import { RenewalOriginalPublicationPolicy } from "./RenewalOriginalPublicationPolicy";

async function currentProcessReview(definitionId: string) {
  const payload = await readResponse<{
    publicationReview?: { contentHash: string; revision: string };
  }>(await fetch(`/api/process-definitions/${encodeURIComponent(definitionId)}`));
  const review = payload.publicationReview;
  if (
    !review ||
    !/^[a-f0-9]{64}$/.test(review.contentHash) ||
    !/^[a-f0-9]{64}$/.test(review.revision)
  )
    throw new Error(
      "Current process review metadata is unavailable. Reload before reviewing these bytes.",
    );
  return review;
}

function ProcessPolicyByteReview({
  policy,
  onChange,
}: {
  policy: PublicationPolicyRecord;
  onChange: (policy: PublicationPolicyRecord) => void;
}) {
  const [review, setReview] = useState<{ contentHash: string; revision: string } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const definitionId =
    policy.resourceScope?.resourceId.slice("process-definition:".length) ?? "";
  async function load() {
    setPending(true);
    setReview(null);
    setConfirmed(false);
    try {
      setReview(await currentProcessReview(definitionId));
      setNotice(
        "Review the current process and exact hash before saving this new byte review.",
      );
    } catch (error) {
      setNotice(readError(error));
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!review || !confirmed || !policy.resourceScope || pending) return;
    setPending(true);
    try {
      const payload = await readResponse<{ policy: PublicationPolicyRecord }>(
        await fetch(`/api/admin/publication-policies/${policy.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            expectedContentHash: policy.resourceScope.contentHash,
            expectedDefinitionRevision: review.revision,
            resourceScope: {
              ...policy.resourceScope,
              contentHash: review.contentHash,
              reviewedNoClientData: true,
            },
          }),
        }),
      );
      onChange(payload.policy);
      setReview(null);
      setConfirmed(false);
      setReason("");
      setNotice(
        "Exact process byte review saved and audited. Publication still requires its real scanner and current-source checks.",
      );
    } catch (error) {
      setNotice(readError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <details>
      <summary>Review changed process bytes</summary>
      <p>
        This keeps the same policy, process, root and Space boundary. It grants no file or
        folder publication.
      </p>
      <a href={`/processes/${encodeURIComponent(definitionId)}`}>Review this process</a>
      <Button variant="secondary" disabled={pending} onClick={() => void load()}>
        Load changed process review
      </Button>
      {review ? (
        <>
          <p>
            Current SHA-256: {review.contentHash}. Revision: {review.revision}.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I reviewed this process guidance and it contains no client/customer or
            personal record values.
          </label>
          <label>
            Reason for this byte review
            <textarea
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            disabled={pending || !confirmed || reason.trim().length < 8}
            onClick={() => void save()}
          >
            Save exact process byte review
          </Button>
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </details>
  );
}

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
    processDefinitionId: "",
    processContentHash: "",
    processDefinitionRevision: "",
    reviewedNoClientData: false,
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
          ...(form.processDefinitionId.trim()
            ? {
                resourceScope: {
                  resourceType: "process_definition",
                  resourceId: `process-definition:${form.processDefinitionId.trim()}`,
                  contentHash: form.processContentHash.trim(),
                  reviewedNoClientData: form.reviewedNoClientData,
                },
                expectedDefinitionRevision: form.processDefinitionRevision.trim(),
              }
            : {}),
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
        processDefinitionId: "",
        processContentHash: "",
        processDefinitionRevision: "",
        reviewedNoClientData: false,
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
  async function loadProcessReview() {
    if (busy || !form.processDefinitionId.trim()) return;
    setBusy(true);
    try {
      const review = await currentProcessReview(form.processDefinitionId.trim());
      setForm((current) => ({
        ...current,
        processContentHash: review.contentHash,
        processDefinitionRevision: review.revision,
        reviewedNoClientData: false,
      }));
      setMessage(
        "Current process hash and revision loaded. Review the process before recording the no-client-data review.",
      );
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(false);
    }
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
      <p className="muted">
        Existing managed staff ownership and audit metadata is retained. The exact
        reviewed hash covers the full canonical bytes, including that metadata; this
        review does not claim it was erased.
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
            {policy.resourceScope?.resourceType === "process_definition" ? (
              <>
                <p className="muted">
                  Process only:{" "}
                  {policy.resourceScope.resourceId.replace(/^process-definition:/, "")}.
                  File and folder publication are excluded. Reviewed SHA-256:{" "}
                  {policy.resourceScope.contentHash}.
                </p>
                <ProcessPolicyByteReview
                  policy={policy}
                  onChange={(next) =>
                    setPolicies((current) =>
                      current.map((entry) => (entry.id === next.id ? next : entry)),
                    )
                  }
                />
              </>
            ) : null}
            {policy.resourceScope?.resourceType === "file" ? (
              <RenewalOriginalPublicationPolicy
                policy={policy}
                onSave={(next) =>
                  setPolicies((current) =>
                    current.map((entry) => (entry.id === next.id ? next : entry)),
                  )
                }
              />
            ) : null}
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
      <RenewalOriginalPublicationPolicy
        onSave={(next) => setPolicies((current) => [...current, next])}
      />
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
          <span id="publication-exact-process-label">
            Exact process definition ID (optional)
          </span>
          <input
            aria-labelledby="publication-exact-process-label"
            aria-describedby="publication-exact-process-hint"
            disabled={busy}
            value={form.processDefinitionId}
            onChange={(event) =>
              setForm({ ...form, processDefinitionId: event.target.value })
            }
          />
          <span className="muted" id="publication-exact-process-hint">
            Limits this policy to one existing process. Required for the managed process
            scanner; files and folders remain excluded.
          </span>
        </label>
        <label>
          Reviewed process SHA-256
          <input
            disabled={busy}
            value={form.processContentHash}
            onChange={(event) =>
              setForm({ ...form, processContentHash: event.target.value })
            }
          />
        </label>
        <label>
          Reviewed process revision
          <input
            disabled={busy}
            value={form.processDefinitionRevision}
            onChange={(event) =>
              setForm({ ...form, processDefinitionRevision: event.target.value })
            }
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy || !form.processDefinitionId.trim()}
          onClick={() => void loadProcessReview()}
        >
          Load current process review
        </Button>
        {form.processDefinitionId.trim() ? (
          <a href={`/processes/${encodeURIComponent(form.processDefinitionId.trim())}`}>
            Review this process
          </a>
        ) : null}
        <label>
          <input
            type="checkbox"
            disabled={busy}
            checked={form.reviewedNoClientData}
            onChange={(event) =>
              setForm({ ...form, reviewedNoClientData: event.target.checked })
            }
          />
          I reviewed this process guidance and it contains no client/customer or personal
          record values.
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
        disabled={
          busy ||
          form.spaces.length === 0 ||
          (form.scannerKey.trim() === MANAGED_PROCESS_SCANNER_KEY &&
            !form.processDefinitionId.trim()) ||
          (Boolean(form.processDefinitionId.trim()) &&
            (!/^[a-f0-9]{64}$/.test(form.processContentHash.trim()) ||
              !/^[a-f0-9]{64}$/.test(form.processDefinitionRevision.trim()) ||
              !form.reviewedNoClientData))
        }
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

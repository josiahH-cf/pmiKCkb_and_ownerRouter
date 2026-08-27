"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import {
  SPACE_PROVISION_CONFIRMATION,
  SPACE_RETIRE_CONFIRMATION,
} from "@/lib/admin/space-provisioning-contract";
import type { SpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import type { SpaceRequest } from "@/lib/firestore/space-requests";

// S36 request + exact fixed-plan preview. No generic cloud command or caller-selected resource id is
// exposed; execution stays closed until one owner-approved pilot packet is supplied.
export function SpaceRequestPanel({
  initialRequests,
}: Readonly<{ initialRequests: SpaceRequest[] }>) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [sources, setSources] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<{
    value: SpaceProvisioningPlan;
    requestId: string;
    executionEnabled: boolean;
  } | null>(null);

  const id = { name: useId(), scope: useId(), sources: useId() };
  const ready = name.trim().length >= 2 && scope.trim().length >= 3;

  async function submit() {
    setPending(true);
    setError("");
    setPlan(null);
    const intendedSources = sources
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      const response = await fetch("/api/admin/spaces/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope: scope.trim(), intendedSources }),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          plan: SpaceProvisioningPlan;
          request: { id: string };
          executionEnabled: boolean;
        };
        setPlan({
          value: payload.plan,
          requestId: payload.request.id,
          executionEnabled: payload.executionEnabled,
        });
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the Space request.");
      }
    } catch {
      setError("Could not reach the Space request service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <Field htmlFor={id.name} label="Space name" required>
        <input
          id={id.name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example: Owner Statements"
          value={name}
        />
      </Field>
      <Field htmlFor={id.scope} label="What is this Space for?" required>
        <textarea
          id={id.scope}
          onChange={(event) => setScope(event.target.value)}
          rows={3}
          value={scope}
        />
      </Field>
      <Field htmlFor={id.sources} label="Intended sources (one per line, optional)">
        <textarea
          id={id.sources}
          onChange={(event) => setSources(event.target.value)}
          rows={4}
          value={sources}
        />
      </Field>
      <div className="ui-row">
        <Button disabled={!ready || pending} onClick={() => void submit()} type="button">
          {pending ? "Saving…" : "Request Space and review fixed plan"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {plan ? (
        <ProvisioningPlanView
          executionEnabled={plan.executionEnabled}
          plan={plan.value}
          requestId={plan.requestId}
        />
      ) : null}

      {initialRequests.length > 0 ? (
        <div className="ui-stack">
          <h2 className="section-title">Prior requests</h2>
          <ul className="ui-rows">
            {initialRequests.map((request) => (
              <li className="ui-stack-tight" key={request.id}>
                <span>
                  <strong>{request.name}</strong>{" "}
                  <span className="muted">({request.spaceId})</span>
                </span>
                <span className="muted">{request.scope}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProvisioningPlanView({
  executionEnabled,
  plan,
  requestId,
}: Readonly<{
  executionEnabled: boolean;
  plan: SpaceProvisioningPlan;
  requestId: string;
}>) {
  const [sourceObjectUri, setSourceObjectUri] = useState("");
  const [approvalEvidenceRef, setApprovalEvidenceRef] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [operation, setOperation] = useState<"provision" | "retire">("provision");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  const fieldId = {
    source: useId(),
    approval: useId(),
    confirmation: useId(),
  };

  async function executePilot() {
    setPending(true);
    setResult("");
    try {
      const response = await fetch("/api/admin/spaces/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation,
          pilotPacket: {
            requestId,
            confirmedSpaceId: plan.spaceId,
            sourceObjectUri: sourceObjectUri.trim(),
            approvalEvidenceRef: approvalEvidenceRef.trim(),
          },
          attemptKey: crypto.randomUUID(),
          confirmation,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        receipt?: { id: string; providerOperationRef: string };
      };
      if (!response.ok || !payload.receipt) {
        setResult(payload.error ?? "The exact pilot operation was refused.");
        return;
      }
      setResult(
        `Receipted ${operation}: ${payload.receipt.id} (${payload.receipt.providerOperationRef})`,
      );
    } catch {
      setResult("Could not reach the exact Space pilot service.");
    } finally {
      setPending(false);
    }
  }

  const expectedConfirmation =
    operation === "provision" ? SPACE_PROVISION_CONFIRMATION : SPACE_RETIRE_CONFIRMATION;
  const executionReady =
    executionEnabled &&
    plan.readyForAuthorization &&
    sourceObjectUri.trim().length > 0 &&
    approvalEvidenceRef.trim().length >= 3 &&
    confirmation === expectedConfirmation;

  return (
    <div className="ui-stack">
      <h2 className="section-title">Exact resource preview for {plan.spaceId}</h2>
      {plan.alreadyExists ? (
        <p className="muted">
          Heads up: a Space keyed {plan.spaceId} already exists in the config. Pick a
          different name or update that Space instead of creating a duplicate.
        </p>
      ) : null}
      <dl className="review-grid">
        <div>
          <dt>Fixed shape</dt>
          <dd>{plan.shape}</dd>
        </div>
        <div>
          <dt>Project / location</dt>
          <dd>
            {plan.projectId} / {plan.location}
          </dd>
        </div>
        <div>
          <dt>Data store</dt>
          <dd>{plan.dataStoreId}</dd>
        </div>
        <div>
          <dt>Isolated source prefix</dt>
          <dd>{plan.sourcePrefix ?? "Readback unavailable"}</dd>
        </div>
        <div>
          <dt>Runtime identity</dt>
          <dd>{plan.runtimeServiceAccount}</dd>
        </div>
        <div>
          <dt>Exact preview hash</dt>
          <dd>{plan.previewHash}</dd>
        </div>
      </dl>
      {plan.blockers.length ? (
        <div className="notice notice-warning">
          <strong>Provisioning remains closed</strong>
          <ul className="compact-list">
            {plan.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <h3>Resources</h3>
      <ul className="compact-list">
        {plan.resourceDisclosure.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Identity and IAM</h3>
      <ul className="compact-list">
        {plan.iamDisclosure.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Cost boundary</h3>
      <ul className="compact-list">
        {plan.costDisclosure.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Isolated retirement</h3>
      <ul className="compact-list">
        {plan.retirementDisclosure.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Post-provision deployment mappings</h3>
      <pre className="draft-box">{plan.envLocalLines.join("\n")}</pre>
      <p className="muted">
        <strong>Exact external input still required:</strong> {plan.externalInputRequired}
      </p>
      <h3>Notes</h3>
      <ul className="ui-rows">
        {plan.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <div className="notice notice-warning ui-stack-tight">
        <strong>Separate exact-confirmed pilot operation</strong>
        <p>
          This control is inert until the owner enables the reviewed runtime flag and
          supplies the exact approved packet. It cannot target another project, bucket,
          data store, or identity.
        </p>
      </div>
      <div className="ui-row">
        <Button
          onClick={() => {
            setOperation("provision");
            setConfirmation("");
          }}
          type="button"
          variant={operation === "provision" ? "primary" : "secondary"}
        >
          Provision one pilot
        </Button>
        <Button
          onClick={() => {
            setOperation("retire");
            setConfirmation("");
          }}
          type="button"
          variant={operation === "retire" ? "primary" : "secondary"}
        >
          Retire only this pilot
        </Button>
      </div>
      <Field htmlFor={fieldId.source} label="Approved first JSONL source object">
        <input
          id={fieldId.source}
          onChange={(event) => setSourceObjectUri(event.target.value)}
          placeholder={`${plan.sourcePrefix ?? "gs://…/"}first-source.jsonl`}
          value={sourceObjectUri}
        />
      </Field>
      <Field htmlFor={fieldId.approval} label="Owner approval evidence reference">
        <input
          id={fieldId.approval}
          onChange={(event) => setApprovalEvidenceRef(event.target.value)}
          value={approvalEvidenceRef}
        />
      </Field>
      <Field htmlFor={fieldId.confirmation} label="Exact confirmation">
        <input
          id={fieldId.confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={expectedConfirmation}
          value={confirmation}
        />
      </Field>
      <Button
        disabled={!executionReady || pending}
        onClick={() => void executePilot()}
        type="button"
      >
        {pending ? "Running exact readback…" : `Confirm and ${operation}`}
      </Button>
      {!executionEnabled ? (
        <p className="muted">
          Runtime execution is closed. Preview and packet preparation remain available.
        </p>
      ) : null}
      {result ? <p className="muted">{result}</p> : null}
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";

import type {
  LiveVendorLifecycleActionKey,
  LiveVendorLifecycleExecuted,
  LiveVendorLifecyclePrepared,
  LiveVendorLifecycleReconciled,
} from "@/lib/vendor/live-lifecycle-service";

type InviteIntent = {
  actionKey: "vendor.account.invite";
  company: string;
  email: string;
  reason: string;
  ticketId: string;
};

type AssignmentIntent = {
  actionKey: "vendor.assignment.change";
  assignmentOperation: "assign" | "remove";
  reason: string;
  ticketId: string;
  vendorId: string;
};

type DisableIntent = {
  actionKey: "vendor.account.disable";
  reason: string;
  vendorId: string;
};

type LifecycleIntent = InviteIntent | AssignmentIntent | DisableIntent;

type PreparedState = {
  intent: LifecycleIntent;
  outcome: LiveVendorLifecyclePrepared;
};

export type LiveVendorLifecycleAvailability = Readonly<
  Record<LiveVendorLifecycleActionKey, boolean>
>;

const ACTIONS_ENDPOINT = "/api/admin/vendors/live/actions";

export function LiveVendorLifecyclePanel({
  availability,
}: {
  availability: LiveVendorLifecycleAvailability;
}) {
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [busy, setBusy] = useState<"execute" | "prepare" | "reconcile" | null>(null);
  const [message, setMessage] = useState(
    "Only actions marked Available can prepare an exact Live preview. Approval and execution are separate steps.",
  );
  const [canReconcile, setCanReconcile] = useState(false);
  const inviteAvailable = availability["vendor.account.invite"];
  const assignmentAvailable = availability["vendor.assignment.change"];
  const disableAvailable = availability["vendor.account.disable"];

  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTicketId, setInviteTicketId] = useState("");
  const [inviteReason, setInviteReason] = useState("");

  const [assignmentVendorId, setAssignmentVendorId] = useState("");
  const [assignmentTicketId, setAssignmentTicketId] = useState("");
  const [assignmentOperation, setAssignmentOperation] = useState<"assign" | "remove">(
    "assign",
  );
  const [assignmentReason, setAssignmentReason] = useState("");

  const [disableVendorId, setDisableVendorId] = useState("");
  const [disableReason, setDisableReason] = useState("");

  async function prepare(intent: LifecycleIntent) {
    if (!availability[intent.actionKey]) {
      setPrepared(null);
      setCanReconcile(false);
      setMessage(
        `The ${intent.actionKey} action is closed in Production and cannot prepare a preview.`,
      );
      return;
    }
    setBusy("prepare");
    setPrepared(null);
    setCanReconcile(false);
    setMessage("Reloading authoritative sources and preparing the exact preview…");
    try {
      const outcome = await postLifecycle<LiveVendorLifecyclePrepared>({
        ...intent,
        operation: "prepare",
      });
      setPrepared({ intent, outcome });
      setMessage(
        "Preview prepared. Open its Approval Queue item; execute only after that exact preview is approved.",
      );
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(null);
    }
  }

  async function executePrepared() {
    if (!prepared) return;
    setBusy("execute");
    setCanReconcile(false);
    setMessage("Executing the approved action once…");
    try {
      const outcome = await postLifecycle<LiveVendorLifecycleExecuted>({
        ...prepared.intent,
        confirmedPreviewHash: prepared.outcome.preview.previewHash,
        executionId: prepared.outcome.preview.executionId,
        operation: "execute",
      });
      if (outcome.status === "needs_reconciliation") {
        setCanReconcile(true);
        setMessage(
          "The provider outcome is ambiguous. Do not retry. Reconcile this consumed attempt.",
        );
      } else if (outcome.status === "succeeded") {
        setMessage(
          outcome.resultRecorded
            ? "The action succeeded and its bodyless result was recorded."
            : "The action was already complete.",
        );
      } else {
        setMessage(
          "The action did not succeed. Review the execution record before preparing another action.",
        );
      }
    } catch (error) {
      const status = error instanceof LifecycleHttpError ? error.status : undefined;
      if (status === undefined || status >= 500) {
        setCanReconcile(true);
        setMessage(
          `The response was lost or unavailable. Do not retry execution; reconcile first. ${readError(error)}`,
        );
      } else {
        setMessage(readError(error));
      }
    } finally {
      setBusy(null);
    }
  }

  async function reconcilePrepared() {
    if (!prepared) return;
    setBusy("reconcile");
    setMessage("Reading the provider outcome without creating another attempt…");
    try {
      const outcome = await postLifecycle<LiveVendorLifecycleReconciled>({
        ...prepared.intent,
        executionId: prepared.outcome.preview.executionId,
        operation: "reconcile",
      });
      if (outcome.status === "succeeded") {
        setCanReconcile(false);
        if (outcome.outcome === "not_applicable") {
          setMessage(
            "No new provider effect was created by this corrective attempt. Review the Vendor invitation state. If the account is still pending setup, prepare a fresh exact-confirmed setup-link reissue preview with a new exact recovery reason. Active or disabled accounts require the separately governed account-reset lifecycle; this invitation flow cannot reset them.",
          );
        } else {
          setMessage(
            outcome.duplicate
              ? "The recorded execution was already successful."
              : "Reconciliation found the provider effect and recorded success.",
          );
        }
      } else {
        setMessage(
          "The provider effect was not found. The process may have stopped before the provider claim. Keep this execution for Admin review and do not retry the same preview. After review, prepare a fresh preview with a new exact recovery reason.",
        );
      }
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setBusy(null);
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void prepare({
      actionKey: "vendor.account.invite",
      company: inviteCompany,
      email: inviteEmail,
      reason: inviteReason,
      ticketId: inviteTicketId,
    });
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void prepare({
      actionKey: "vendor.assignment.change",
      assignmentOperation,
      reason: assignmentReason,
      ticketId: assignmentTicketId,
      vendorId: assignmentVendorId,
    });
  }

  function submitDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void prepare({
      actionKey: "vendor.account.disable",
      reason: disableReason,
      vendorId: disableVendorId,
    });
  }

  return (
    <>
      <section aria-labelledby="live-vendor-actions-title" className="panel">
        <h2 id="live-vendor-actions-title">Live Vendor lifecycle</h2>
        <p className="muted">
          Production actions use current Live records and their exact committed Registry
          gates. For an Available action, preparing never changes an account or
          assignment; execution remains blocked until the linked Approval Queue item is
          approved.
        </p>
        <p aria-live="polite" role="status">
          {message}
        </p>
      </section>

      <div className="grid two">
        <form className="panel" onSubmit={submitInvite}>
          <h2>Invite a Vendor</h2>
          <p className="muted">
            Use this flow for a new Vendor or an exact setup-link reissue while the
            account is still pending setup. An active or disabled account cannot be reset
            here; it requires the separately governed account-reset lifecycle.
          </p>
          <ActionAvailabilityNotice
            actionKey="vendor.account.invite"
            available={inviteAvailable}
          />
          <label>
            Company
            <input
              disabled={!inviteAvailable}
              maxLength={160}
              onChange={(event) => setInviteCompany(event.target.value)}
              required
              value={inviteCompany}
            />
          </label>
          <label>
            Email
            <input
              disabled={!inviteAvailable}
              maxLength={320}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              type="email"
              value={inviteEmail}
            />
          </label>
          <label>
            Initial maintenance ticket
            <input
              disabled={!inviteAvailable}
              maxLength={160}
              onChange={(event) => setInviteTicketId(event.target.value)}
              required
              value={inviteTicketId}
            />
          </label>
          <label>
            Admin reason
            <textarea
              disabled={!inviteAvailable}
              maxLength={500}
              minLength={3}
              onChange={(event) => setInviteReason(event.target.value)}
              required
              value={inviteReason}
            />
          </label>
          <button disabled={busy !== null || !inviteAvailable} type="submit">
            Prepare invitation preview
          </button>
        </form>

        <form className="panel" onSubmit={submitAssignment}>
          <h2>Assign or remove a Vendor</h2>
          <ActionAvailabilityNotice
            actionKey="vendor.assignment.change"
            available={assignmentAvailable}
          />
          <label>
            Vendor reference
            <input
              disabled={!assignmentAvailable}
              maxLength={160}
              onChange={(event) => setAssignmentVendorId(event.target.value)}
              required
              value={assignmentVendorId}
            />
          </label>
          <label>
            Maintenance ticket
            <input
              disabled={!assignmentAvailable}
              maxLength={160}
              onChange={(event) => setAssignmentTicketId(event.target.value)}
              required
              value={assignmentTicketId}
            />
          </label>
          <fieldset>
            <legend>Assignment change</legend>
            <label>
              <input
                checked={assignmentOperation === "assign"}
                disabled={!assignmentAvailable}
                name="assignment-operation"
                onChange={() => setAssignmentOperation("assign")}
                type="radio"
                value="assign"
              />
              Assign
            </label>
            <label>
              <input
                checked={assignmentOperation === "remove"}
                disabled={!assignmentAvailable}
                name="assignment-operation"
                onChange={() => setAssignmentOperation("remove")}
                type="radio"
                value="remove"
              />
              Remove
            </label>
          </fieldset>
          <label>
            Admin reason
            <textarea
              disabled={!assignmentAvailable}
              maxLength={500}
              minLength={3}
              onChange={(event) => setAssignmentReason(event.target.value)}
              required
              value={assignmentReason}
            />
          </label>
          <button disabled={busy !== null || !assignmentAvailable} type="submit">
            Prepare assignment preview
          </button>
        </form>

        <form className="panel" onSubmit={submitDisable}>
          <h2>Disable a Vendor</h2>
          <ActionAvailabilityNotice
            actionKey="vendor.account.disable"
            available={disableAvailable}
          />
          <label>
            Vendor reference
            <input
              disabled={!disableAvailable}
              maxLength={160}
              onChange={(event) => setDisableVendorId(event.target.value)}
              required
              value={disableVendorId}
            />
          </label>
          <label>
            Admin reason
            <textarea
              disabled={!disableAvailable}
              maxLength={500}
              minLength={3}
              onChange={(event) => setDisableReason(event.target.value)}
              required
              value={disableReason}
            />
          </label>
          <button disabled={busy !== null || !disableAvailable} type="submit">
            Prepare disable preview
          </button>
        </form>
      </div>

      {prepared ? (
        <section aria-labelledby="exact-vendor-preview-title" className="panel">
          <h2 id="exact-vendor-preview-title">Exact Live effect preview</h2>
          <p>{prepared.outcome.preview.exactEffect}</p>
          <dl>
            <dt>Target</dt>
            <dd>{prepared.outcome.preview.target}</dd>
            <dt>Action key</dt>
            <dd>
              <code>{prepared.outcome.preview.actionKey}</code>
            </dd>
            <dt>Execution</dt>
            <dd>
              <code>{prepared.outcome.preview.executionId}</code>
            </dd>
            <dt>Preview hash</dt>
            <dd>
              <code>{prepared.outcome.preview.previewHash}</code>
            </dd>
          </dl>
          <table>
            <caption>Every value bound to approval and execution</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Exact value</th>
              </tr>
            </thead>
            <tbody>
              {prepared.outcome.preview.fields.map((field) => (
                <tr key={field.name}>
                  <th scope="row">{field.label}</th>
                  <td>{String(field.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Keep this page open so this exact prepared preview remains available. Approval
            Queue opens in a new tab; return here after approval to execute it.
          </p>
          <p>
            <a
              href={prepared.outcome.approvalQueueHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open this item in Approval Queue
            </a>
          </p>
          <button
            disabled={busy !== null || !availability[prepared.intent.actionKey]}
            onClick={() => void executePrepared()}
          >
            Execute the approved exact preview
          </button>
          {canReconcile ? (
            <button
              disabled={busy !== null}
              onClick={() => void reconcilePrepared()}
              type="button"
            >
              Reconcile consumed attempt
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function ActionAvailabilityNotice({
  actionKey,
  available,
}: {
  actionKey: LiveVendorLifecycleActionKey;
  available: boolean;
}) {
  return (
    <p className="muted">
      {available ? "Available: " : "Unavailable: "}
      <code>{actionKey}</code>
      {available
        ? " is open for exact preview and Approval Queue review."
        : " is closed in Production. This form cannot prepare or execute."}
    </p>
  );
}

class LifecycleHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LifecycleHttpError";
  }
}

async function postLifecycle<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(ACTIONS_ENDPOINT, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  if (!response.ok) {
    throw new LifecycleHttpError(
      typeof payload.error === "string"
        ? payload.error
        : "The Live Vendor lifecycle request was refused.",
      response.status,
    );
  }
  return payload as T;
}

function readError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The Live Vendor lifecycle request could not be completed.";
}

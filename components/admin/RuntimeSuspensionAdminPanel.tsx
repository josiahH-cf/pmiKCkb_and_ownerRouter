"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { Button, Field } from "@/components/ui";
import type {
  RuntimeActionSuspensionRecord,
  RuntimeSuspensionAdminSnapshot,
  RuntimeSuspensionActionOption,
  RuntimeSuspensionMutationResult,
} from "@/lib/firestore/runtime-action-suspensions";
import {
  RUNTIME_SUSPENSION_EXPECTED_ID_HEADER,
  RUNTIME_SUSPENSION_GLOBAL_KEY,
  RUNTIME_SUSPENSION_OPAQUE_INCIDENT_REF_PATTERN,
  RUNTIME_SUSPENSION_OPERATION_ID_HEADER,
  RUNTIME_SUSPENSION_REASON_CODES,
  RUNTIME_SUSPENSION_REASON_LABELS,
  RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
  RUNTIME_SUSPENSION_UUID_PATTERN,
  type RuntimeSuspensionReasonCode,
} from "@/lib/operations/runtime-suspension-policy";

const ENDPOINT = "/api/admin/runtime-suspension";

type Operation = "suspend" | "clear";
type Pending = "change" | "refresh" | null;

interface ListResponse {
  actions?: RuntimeSuspensionActionOption[];
  suspensions?: RuntimeActionSuspensionRecord[];
  unreadableActionKeys?: string[];
  hasUnknownRecords?: boolean;
  error?: string;
}

export function RuntimeSuspensionAdminPanel({
  initialActions,
  initialSnapshot,
  unavailableNote,
}: Readonly<{
  initialActions: readonly RuntimeSuspensionActionOption[];
  initialSnapshot: RuntimeSuspensionAdminSnapshot;
  unavailableNote?: string;
}>) {
  const ids = {
    action: useId(),
    confirmation: useId(),
    incident: useId(),
    reason: useId(),
  };
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [actions, setActions] = useState([...initialActions]);
  const [suspensions, setSuspensions] = useState([...initialSnapshot.suspensions]);
  const [unreadableActionKeys, setUnreadableActionKeys] = useState([
    ...initialSnapshot.unreadableActionKeys,
  ]);
  const [hasUnknownRecords, setHasUnknownRecords] = useState(
    initialSnapshot.hasUnknownRecords,
  );
  const [operation, setOperation] = useState<Operation>("suspend");
  const [actionKey, setActionKey] = useState(
    initialActions[0]?.key ?? RUNTIME_SUSPENSION_GLOBAL_KEY,
  );
  const [reasonCode, setReasonCode] =
    useState<RuntimeSuspensionReasonCode>("provider_outage");
  const [incidentRef, setIncidentRef] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [listUnavailable, setListUnavailable] = useState(unavailableNote ?? "");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);

  const currentSuspension = suspensions.find((record) => record.action_key === actionKey);
  const currentOption = actions.find((action) => action.key === actionKey);
  const knownUnreadableActionKeys = unreadableActionKeys.filter(
    (key) =>
      actions.some((action) => action.key === key) &&
      !suspensions.some((record) => record.action_key === key),
  );
  const currentUnreadable =
    !currentSuspension && knownUnreadableActionKeys.includes(actionKey);
  const formLocked = Boolean(listUnavailable) || outcomeUnknown || refreshRequired;
  const knownSelection = actions.some((action) => action.key === actionKey);
  const exactConfirmation = confirmation === actionKey;
  const clearWithoutCurrent =
    operation === "clear" && !currentSuspension && !currentUnreadable;
  const canSubmit =
    pending === null &&
    knownSelection &&
    (operation === "clear" || currentOption?.effectTarget === true) &&
    exactConfirmation &&
    !clearWithoutCurrent &&
    (!formLocked || outcomeUnknown);

  function changeOperation(next: Operation) {
    if (outcomeUnknown) return;
    setOperation(next);
    setReasonCode(next === "clear" ? "incident_resolved" : "provider_outage");
    resetUnsubmittedIntent();
  }

  function selectAction(next: string) {
    if (outcomeUnknown) return;
    setActionKey(next);
    resetUnsubmittedIntent();
  }

  function resetUnsubmittedIntent() {
    setConfirmation("");
    setOperationId(null);
    setError("");
    setStatus("");
  }

  function prepareClear(
    key: string,
    options: Readonly<{ incidentRef?: string; unreadable?: boolean }> = {},
  ) {
    if (formLocked || pending !== null) return;
    setOperation("clear");
    setActionKey(key);
    setReasonCode("incident_resolved");
    setIncidentRef(options.incidentRef ?? "");
    setConfirmation("");
    setOperationId(null);
    setError("");
    setStatus(
      options.unreadable
        ? `Type ${key} exactly, then confirm that this unreadable stop record should be repaired and cleared.`
        : `Type ${key} exactly, then confirm that this specific stop should be cleared.`,
    );
    confirmationRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    let id = operationId;
    if (!id) {
      try {
        id = globalThis.crypto.randomUUID();
      } catch {
        setError(
          "This browser could not create a safe operation id. Reload and try again.",
        );
        return;
      }
      setOperationId(id);
    }

    const expectedSuspensionId =
      operation === "clear"
        ? (currentSuspension?.suspension_id ??
          (currentUnreadable ? RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION : undefined))
        : undefined;
    if (operation === "clear" && !expectedSuspensionId) {
      setError("Refresh the list before clearing this Production action stop.");
      return;
    }

    setPending("change");
    setError("");
    setStatus(
      outcomeUnknown
        ? "Retrying the same change with its original operation id."
        : operation === "clear"
          ? "Clearing the exact current Production action stop."
          : "Stopping the selected Production action.",
    );

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        [RUNTIME_SUSPENSION_OPERATION_ID_HEADER]: id,
      };
      if (expectedSuspensionId) {
        headers[RUNTIME_SUSPENSION_EXPECTED_ID_HEADER] = expectedSuspensionId;
      }
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: operation,
          actionKey,
          reasonCode,
          ...(incidentRef ? { incidentRef } : {}),
          confirmation,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status >= 500) {
          markOutcomeUnknown();
          return;
        }
        setOutcomeUnknown(false);
        setOperationId(null);
        setError(responseError(payload) ?? "The Production action stop was not changed.");
        setStatus("");
        if (response.status === 409) {
          setRefreshRequired(true);
        }
        return;
      }
      const result = parseMutationResponse(payload, actionKey, operation);
      if (!result) {
        markOutcomeUnknown();
        return;
      }

      setOutcomeUnknown(false);
      setOperationId(null);
      const acceptedMessage = result.replayed
        ? "The earlier change was found and was not applied twice."
        : operation === "clear"
          ? "The Production action stop was cleared."
          : "The Production action is now stopped.";
      const refreshed = await loadLatest();
      setConfirmation("");
      setStatus(
        refreshed
          ? `${acceptedMessage} The current list is refreshed.`
          : `${acceptedMessage} The current list could not be refreshed. Reload it before another change.`,
      );
    } catch {
      markOutcomeUnknown();
    } finally {
      setPending(null);
    }
  }

  function markOutcomeUnknown() {
    setOutcomeUnknown(true);
    setError(
      "The response was lost or unavailable, so the outcome is unknown. Refresh the list to inspect current state, or retry this unchanged request with the same operation id.",
    );
    setStatus("");
  }

  async function loadLatest(): Promise<boolean> {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as ListResponse;
      if (
        !response.ok ||
        !Array.isArray(payload.actions) ||
        !Array.isArray(payload.suspensions) ||
        !Array.isArray(payload.unreadableActionKeys) ||
        typeof payload.hasUnknownRecords !== "boolean"
      ) {
        setListUnavailable(
          payload.error ??
            "Runtime suspension state is unavailable. Executable actions remain closed when this state cannot be read.",
        );
        return false;
      }
      setActions(payload.actions);
      setSuspensions(payload.suspensions);
      setUnreadableActionKeys(payload.unreadableActionKeys);
      setHasUnknownRecords(payload.hasUnknownRecords);
      setListUnavailable("");
      setRefreshRequired(false);
      return true;
    } catch {
      setListUnavailable(
        "Runtime suspension state is unavailable. Executable actions remain closed when this state cannot be read.",
      );
      return false;
    }
  }

  async function refresh() {
    setPending("refresh");
    setError("");
    setStatus("");
    const refreshed = await loadLatest();
    if (refreshed) {
      setOutcomeUnknown(false);
      setOperationId(null);
      setConfirmation("");
      setStatus("The current Production action-stop list is refreshed.");
    }
    setPending(null);
  }

  return (
    <article className="panel" aria-labelledby="runtime-suspension-title">
      <h2 id="runtime-suspension-title">Stop a Production Action</h2>
      <p className="muted">
        For a Sev-1 incident, stop the affected gated effect here first. Do not wait for a
        deploy. This control can only close an Action Registry-gated provider attempt; it
        cannot open a Registry gate, disconnect a provider, or stop the read-only live
        desks and connection diagnostics.
      </p>
      {listUnavailable ? (
        <div role="alert">
          <p>{listUnavailable}</p>
          <p className="muted">
            The list is not treated as empty. Executable actions fail closed when the
            suspension state cannot be read.
          </p>
        </div>
      ) : null}
      {!listUnavailable && hasUnknownRecords ? (
        <div role="alert">
          <p>
            One or more stop records use an unknown action key. Their identifiers are
            hidden.
          </p>
          <p className="muted">
            Production actions remain closed when affected state cannot be read. Use
            server-side review to resolve these records.
          </p>
        </div>
      ) : null}
      <div className="action-row">
        <Button
          disabled={pending !== null}
          onClick={() => void refresh()}
          variant="secondary"
        >
          {pending === "refresh" ? "Refreshing" : "Refresh current stops"}
        </Button>
      </div>

      <section aria-labelledby="active-runtime-suspensions-title">
        <h3 id="active-runtime-suspensions-title">Current action stops</h3>
        {listUnavailable ? null : suspensions.length === 0 &&
          knownUnreadableActionKeys.length === 0 &&
          !hasUnknownRecords ? (
          <p className="muted">No runtime suspensions are active.</p>
        ) : suspensions.length > 0 || knownUnreadableActionKeys.length > 0 ? (
          <div className="workflow-record-list">
            {suspensions.map((record) => {
              const option = actions.find((item) => item.key === record.action_key);
              return (
                <article className="compact-record" key={record.action_key}>
                  <strong>
                    {record.action_key === RUNTIME_SUSPENSION_GLOBAL_KEY
                      ? "All gated Production effects are stopped"
                      : (option?.label ?? "Production action stopped")}
                  </strong>
                  <p>
                    Action key: <code>{record.action_key}</code>
                  </p>
                  <p>Reason: {RUNTIME_SUSPENSION_REASON_LABELS[record.reason_code]}</p>
                  {record.incident_ref ? (
                    <p>
                      Incident reference: <code>{record.incident_ref}</code>
                    </p>
                  ) : null}
                  <p className="muted">
                    {formatChangedAt(record.suspended_at)} · by{" "}
                    {record.suspended_by_email}
                  </p>
                  <Button
                    disabled={pending !== null || formLocked}
                    onClick={() =>
                      prepareClear(record.action_key, {
                        incidentRef: record.incident_ref,
                      })
                    }
                    size="compact"
                    variant="secondary"
                  >
                    Prepare to clear {record.action_key}
                  </Button>
                </article>
              );
            })}
            {knownUnreadableActionKeys.map((key) => {
              const option = actions.find((item) => item.key === key);
              return (
                <article className="compact-record" key={key}>
                  <strong>
                    {key === RUNTIME_SUSPENSION_GLOBAL_KEY
                      ? "All gated Production effects are closed by an unreadable stop record"
                      : `${option?.label ?? "Production action"} is closed`}
                  </strong>
                  <p>
                    Action key: <code>{key}</code>
                  </p>
                  <p>
                    This known action has an unreadable stop record. It remains closed.
                  </p>
                  <Button
                    disabled={pending !== null || formLocked}
                    onClick={() => prepareClear(key, { unreadable: true })}
                    size="compact"
                    variant="secondary"
                  >
                    Prepare to repair and clear {key}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <form aria-busy={pending === "change"} className="ui-stack" onSubmit={submit}>
        <fieldset disabled={pending !== null || formLocked}>
          <legend>Change type</legend>
          <label>
            <input
              checked={operation === "suspend"}
              name="runtime-suspension-operation"
              onChange={() => changeOperation("suspend")}
              type="radio"
              value="suspend"
            />{" "}
            Stop or update a stop
          </label>
          <label>
            <input
              checked={operation === "clear"}
              name="runtime-suspension-operation"
              onChange={() => changeOperation("clear")}
              type="radio"
              value="clear"
            />{" "}
            Clear a current stop
          </label>
        </fieldset>

        <Field htmlFor={ids.action} label="Production action" required>
          <select
            disabled={pending !== null || formLocked}
            onChange={(event) => selectAction(event.target.value)}
            value={actionKey}
          >
            {actions.map((action) => (
              <option key={action.key} value={action.key}>
                {action.label} ({action.key})
              </option>
            ))}
          </select>
        </Field>

        <Field htmlFor={ids.reason} label="Reason" required>
          <select
            disabled={pending !== null || formLocked}
            onChange={(event) => {
              setReasonCode(event.target.value as RuntimeSuspensionReasonCode);
              resetUnsubmittedIntent();
            }}
            value={reasonCode}
          >
            {RUNTIME_SUSPENSION_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {RUNTIME_SUSPENSION_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          hint="Optional ticket ID such as INC-42 or SEV1.2026-001. Do not enter a resident, address, message, URL, path, or token."
          htmlFor={ids.incident}
          label="Incident reference"
        >
          <input
            autoComplete="off"
            disabled={pending !== null || formLocked}
            maxLength={64}
            onChange={(event) => {
              setIncidentRef(event.target.value);
              resetUnsubmittedIntent();
            }}
            pattern={RUNTIME_SUSPENSION_OPAQUE_INCIDENT_REF_PATTERN.source}
            spellCheck={false}
            type="text"
            value={incidentRef}
          />
        </Field>

        <Field
          error={
            operation === "suspend" && currentOption?.effectTarget === false
              ? "This read-only source is outside the effect-stop scope. This option is available only to clear its existing record."
              : operation === "clear" && !currentSuspension && !currentUnreadable
                ? "This action has no current stop. Refresh or choose an active stop."
                : undefined
          }
          hint={
            <>
              Type <code>{actionKey}</code> exactly. Matching is case-sensitive and
              whitespace-sensitive.
            </>
          }
          htmlFor={ids.confirmation}
          label="Exact confirmation"
          required
        >
          <input
            autoComplete="off"
            disabled={pending !== null || formLocked}
            maxLength={128}
            onChange={(event) => {
              if (!outcomeUnknown) {
                setConfirmation(event.target.value);
                setOperationId(null);
                setError("");
              }
            }}
            ref={confirmationRef}
            spellCheck={false}
            type="text"
            value={confirmation}
          />
        </Field>

        <div className="action-row">
          <Button disabled={!canSubmit} size="large" type="submit">
            {pending === "change"
              ? "Applying change"
              : outcomeUnknown
                ? "Retry the same change"
                : operation === "clear"
                  ? "Clear this action stop"
                  : currentSuspension || currentUnreadable
                    ? "Update this action stop"
                    : "Stop this action now"}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="auth-message" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p aria-live="polite" className="muted" role="status">
          {status}
        </p>
      ) : null}
    </article>
  );
}

function parseMutationResponse(
  payload: unknown,
  expectedActionKey: string,
  operation: Operation,
): RuntimeSuspensionMutationResult | null {
  if (!isPlainObject(payload) || !hasExactKeys(payload, ["suspension"])) {
    return null;
  }
  const result = payload.suspension;
  if (
    !isPlainObject(result) ||
    !hasOnlyKeys(result, [
      "actionKey",
      "status",
      "suspensionId",
      "changed",
      "replayed",
    ]) ||
    result.actionKey !== expectedActionKey ||
    !["clear", "suspended", "unreadable"].includes(String(result.status)) ||
    typeof result.changed !== "boolean" ||
    typeof result.replayed !== "boolean" ||
    result.changed === result.replayed
  ) {
    return null;
  }

  const status = result.status as RuntimeSuspensionMutationResult["status"];
  if (status === "suspended") {
    if (
      typeof result.suspensionId !== "string" ||
      !RUNTIME_SUSPENSION_UUID_PATTERN.test(result.suspensionId)
    ) {
      return null;
    }
  } else if (Object.hasOwn(result, "suspensionId")) {
    return null;
  }

  if (result.changed && status !== (operation === "suspend" ? "suspended" : "clear")) {
    return null;
  }

  return {
    actionKey: result.actionKey,
    status,
    ...(status === "suspended" ? { suspensionId: result.suspensionId as string } : {}),
    changed: result.changed,
    replayed: result.replayed,
  };
}

function responseError(payload: unknown): string | undefined {
  return isPlainObject(payload) && typeof payload.error === "string"
    ? payload.error
    : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key))
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function formatChangedAt(createdAt: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(createdAt)
    ? `${createdAt.slice(0, 10)} ${createdAt.slice(11, 16)}`
    : createdAt;
}

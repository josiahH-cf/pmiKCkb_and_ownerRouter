"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  QUEUE_AUDIENCE_GROUPS,
  QUEUE_ITEM_STATUSES,
  QUEUE_RISK_LEVELS,
  queueActionAvailability,
} from "@/lib/approval/queue";
import type { Role } from "@/lib/auth/roles";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

type QueueActionMode = "assign" | "disable" | "return" | "snooze";

interface QueueDetail {
  activity: ApprovalQueueActivityRecord[];
  item: ApprovalQueueItemRecord;
}

interface QueueFilters {
  assignee_uid: string;
  audience_group: string;
  due_date: string;
  process_run_id: string;
  required_approver_uid: string;
  risk: string;
  status: string;
}

const emptyFilters: QueueFilters = {
  assignee_uid: "",
  audience_group: "",
  due_date: "",
  process_run_id: "",
  required_approver_uid: "",
  risk: "",
  status: "",
};

export function ApprovalQueue({
  currentUser,
  initialActivity,
  initialError,
  initialItems,
}: Readonly<{
  currentUser: { role: Role; uid: string };
  initialActivity: ApprovalQueueActivityRecord[];
  initialError?: string;
  initialItems: ApprovalQueueItemRecord[];
}>) {
  const firstInitialItem = initialItems.at(0);
  const [items, setItems] = useState(initialItems);
  const [selectedItemId, setSelectedItemId] = useState(firstInitialItem?.id ?? null);
  const [detailsById, setDetailsById] = useState<Record<string, QueueDetail>>(
    firstInitialItem
      ? {
          [firstInitialItem.id]: {
            activity: initialActivity,
            item: firstInitialItem,
          },
        }
      : {},
  );
  const [filters, setFilters] = useState<QueueFilters>(emptyFilters);
  const [listError, setListError] = useState(initialError);
  const [message, setMessage] = useState(initialError ?? "Approval Queue connected.");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<QueueActionMode | null>(null);
  const [reason, setReason] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [assigneeUid, setAssigneeUid] = useState("");
  const [requiredApproverUid, setRequiredApproverUid] = useState("");

  const selectedItem = useMemo(() => {
    if (!selectedItemId) {
      return null;
    }

    return (
      detailsById[selectedItemId]?.item ??
      items.find((item) => item.id === selectedItemId) ??
      null
    );
  }, [detailsById, items, selectedItemId]);
  const selectedActivity = selectedItemId
    ? (detailsById[selectedItemId]?.activity ?? [])
    : [];
  const actionAvailability = selectedItem
    ? queueActionAvailability(currentUser, selectedItem)
    : null;

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoadingList(true);
    setMessage("Loading approval queue.");

    try {
      const response = await fetch(`/api/approval-queue${filterQuery(filters)}`);
      const payload = await readJsonResponse<{ items: ApprovalQueueItemRecord[] }>(
        response,
      );

      setItems(payload.items);
      setDetailsById({});
      setListError(undefined);
      const firstItemId = payload.items.at(0)?.id ?? null;
      setSelectedItemId(firstItemId);
      setActionMode(null);
      setMessage(
        payload.items.length > 0
          ? "Approval Queue connected."
          : hasActiveFilters(filters)
            ? "No queue items match these filters."
            : "Nothing is currently waiting for review.",
      );
      if (firstItemId) {
        void loadDetail(firstItemId, { silent: true });
      }
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setListError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function resetFilters() {
    setFilters(emptyFilters);
    setIsLoadingList(true);
    setMessage("Loading approval queue.");

    try {
      const response = await fetch("/api/approval-queue");
      const payload = await readJsonResponse<{ items: ApprovalQueueItemRecord[] }>(
        response,
      );

      setItems(payload.items);
      setDetailsById({});
      setListError(undefined);
      const firstItemId = payload.items.at(0)?.id ?? null;
      setSelectedItemId(firstItemId);
      setActionMode(null);
      setMessage(
        payload.items.length > 0
          ? "Approval Queue connected."
          : "Nothing is currently waiting for review.",
      );
      if (firstItemId) {
        void loadDetail(firstItemId, { silent: true });
      }
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setListError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function loadDetail(itemId: string, options: { silent?: boolean } = {}) {
    setLoadingDetailId(itemId);
    if (!options.silent) {
      setMessage("Loading queue item.");
    }

    try {
      const response = await fetch(`/api/approval-queue/${encodeURIComponent(itemId)}`);
      const payload = await readJsonResponse<QueueDetail>(response);

      setDetailsById((current) => ({ ...current, [itemId]: payload }));
      setItems((current) => replaceItem(current, payload.item));
      if (!options.silent) {
        setMessage("Queue item loaded.");
      }
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function transitionSelectedItem(input: Record<string, string>) {
    if (!selectedItem) {
      return;
    }

    if (
      input.action === "approve" &&
      selectedItem.risk === "High" &&
      !window.confirm("This is a High-risk approval. Approve this queue item?")
    ) {
      return;
    }

    setBusyAction(input.action ?? "action");
    setMessage("Saving queue item.");

    try {
      const response = await fetch(
        `/api/approval-queue/${encodeURIComponent(selectedItem.id)}`,
        {
          body: JSON.stringify(input),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const payload = await readJsonResponse<QueueDetail>(response);

      setDetailsById((current) => ({ ...current, [payload.item.id]: payload }));
      setItems((current) => replaceItem(current, payload.item));
      setActionMode(null);
      setReason("");
      setSnoozeUntil("");
      setMessage("Queue item updated.");
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    setActionMode(null);
    setReason("");
    setSnoozeUntil("");

    if (!detailsById[itemId]) {
      void loadDetail(itemId);
    }
  }

  function startAction(mode: QueueActionMode) {
    setActionMode(mode);
    setReason("");
    setSnoozeUntil("");
    setAssigneeUid(selectedItem?.assignee_uid ?? "");
    setRequiredApproverUid(selectedItem?.required_approver_uid ?? "");
  }

  function submitReasonedAction(action: "disable" | "return") {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setMessage(
        action === "return"
          ? "Return for Revision requires a reason."
          : "Disable Action requires a reason.",
      );
      return;
    }

    void transitionSelectedItem({ action, reason: trimmedReason });
  }

  function submitSnooze() {
    const trimmedReason = reason.trim();

    if (!trimmedReason || !snoozeUntil) {
      setMessage("Snooze requires a date and reason.");
      return;
    }

    void transitionSelectedItem({
      action: "snooze",
      reason: trimmedReason,
      snooze_until: snoozeUntil,
    });
  }

  function submitAssign() {
    if (!assigneeUid.trim() && !requiredApproverUid.trim()) {
      setMessage("Assign requires an assignee or required approver.");
      return;
    }

    void transitionSelectedItem({
      action: "assign",
      assignee_uid: assigneeUid.trim(),
      required_approver_uid: requiredApproverUid.trim(),
    });
  }

  return (
    <div className="approval-queue-shell">
      <form className="panel queue-filter-bar" onSubmit={applyFilters}>
        <label>
          Process/run
          <input
            name="process_run_id"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                process_run_id: event.target.value,
              }))
            }
            value={filters.process_run_id}
          />
        </label>
        <label>
          Status
          <select
            name="status"
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
            value={filters.status}
          >
            <option value="">Any status</option>
            {QUEUE_ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Risk
          <select
            name="risk"
            onChange={(event) =>
              setFilters((current) => ({ ...current, risk: event.target.value }))
            }
            value={filters.risk}
          >
            <option value="">Any risk</option>
            {QUEUE_RISK_LEVELS.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </label>
        <label>
          Audience
          <select
            name="audience_group"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                audience_group: event.target.value,
              }))
            }
            value={filters.audience_group}
          >
            <option value="">Any audience</option>
            {QUEUE_AUDIENCE_GROUPS.map((audience) => (
              <option key={audience} value={audience}>
                {audience}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <input
            name="assignee_uid"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                assignee_uid: event.target.value,
              }))
            }
            value={filters.assignee_uid}
          />
        </label>
        <label>
          Approver
          <input
            name="required_approver_uid"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                required_approver_uid: event.target.value,
              }))
            }
            value={filters.required_approver_uid}
          />
        </label>
        <label>
          Due date
          <input
            name="due_date"
            onChange={(event) =>
              setFilters((current) => ({ ...current, due_date: event.target.value }))
            }
            type="date"
            value={filters.due_date}
          />
        </label>
        <div className="queue-filter-actions">
          <button className="primary-button compact-button" disabled={isLoadingList}>
            {isLoadingList ? "Loading" : "Apply"}
          </button>
          <button
            className="secondary-button compact-button"
            disabled={isLoadingList}
            onClick={() => void resetFilters()}
            type="button"
          >
            Reset
          </button>
        </div>
      </form>

      <p className="muted queue-status-message">{message}</p>

      {listError ? (
        <article className="panel">
          <h2>Approval Queue unavailable</h2>
          <p className="muted">{listError}</p>
          <p className="muted">Use Reset to retry the queue connection.</p>
        </article>
      ) : items.length === 0 ? (
        <article className="panel">
          <h2>Nothing is currently waiting for review</h2>
          <p className="muted">
            {hasActiveFilters(filters)
              ? "No queue items match these filters."
              : "Nothing is currently waiting for review."}
          </p>
        </article>
      ) : (
        <div className="approval-queue-layout">
          <section className="panel queue-list-panel" aria-label="Queue items">
            <div className="queue-list">
              {items.map((item) => (
                <button
                  aria-current={item.id === selectedItemId ? "true" : undefined}
                  className="queue-row"
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                  type="button"
                >
                  <span className="queue-row-main">
                    <strong>{item.action_needed}</strong>
                    <span>{item.process_run_ref.label}</span>
                  </span>
                  <span className="queue-row-meta">
                    <QueuePill label={item.status} tone="status" />
                    <QueuePill label={item.risk} tone="risk" />
                    <span>Assignee: {displayValue(item.assignee_uid)}</span>
                    <span>Approver: {displayValue(item.required_approver_uid)}</span>
                    <span>Due: {displayValue(item.due_date)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel queue-detail-panel" aria-label="Queue item detail">
            {selectedItem ? (
              <>
                <div className="panel-heading compact-heading">
                  <div>
                    <h2>{selectedItem.action_needed}</h2>
                    <p className="muted">{selectedItem.process_run_ref.label}</p>
                  </div>
                  {loadingDetailId === selectedItem.id ? (
                    <span className="review-pill">Loading</span>
                  ) : null}
                </div>

                <div className="queue-detail-grid">
                  <DetailField label="Status" value={selectedItem.status} />
                  <DetailField label="Risk" value={selectedItem.risk} />
                  <DetailField label="Audience" value={selectedItem.audience_group} />
                  <DetailField label="Item type" value={selectedItem.item_type} />
                  <DetailField
                    label="Assignee"
                    value={displayValue(selectedItem.assignee_uid)}
                  />
                  <DetailField
                    label="Required approver"
                    value={displayValue(selectedItem.required_approver_uid)}
                  />
                  <DetailField
                    label="Due date"
                    value={displayValue(selectedItem.due_date)}
                  />
                  <DetailField
                    label="Affected action"
                    value={displayValue(selectedItem.affected_system_action)}
                  />
                </div>

                <div className="queue-detail-actions">
                  <a
                    className="secondary-button compact-button"
                    href={selectedItem.direct_link}
                  >
                    Open Run
                  </a>
                  <button
                    className="primary-button compact-button"
                    disabled={busyAction !== null || !actionAvailability?.approve}
                    onClick={() => void transitionSelectedItem({ action: "approve" })}
                    title={actionAvailability?.approveReason}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="secondary-button compact-button"
                    disabled={
                      busyAction !== null || !actionAvailability?.returnForRevision
                    }
                    onClick={() => startAction("return")}
                    type="button"
                  >
                    Return
                  </button>
                  <button
                    className="secondary-button compact-button"
                    disabled={busyAction !== null || !actionAvailability?.snooze}
                    onClick={() => startAction("snooze")}
                    type="button"
                  >
                    Snooze
                  </button>
                  {actionAvailability?.assign ? (
                    <button
                      className="secondary-button compact-button"
                      disabled={busyAction !== null}
                      onClick={() => startAction("assign")}
                      type="button"
                    >
                      Assign
                    </button>
                  ) : null}
                  {actionAvailability?.disable ? (
                    <button
                      className="secondary-button compact-button"
                      disabled={busyAction !== null}
                      onClick={() => startAction("disable")}
                      type="button"
                    >
                      Disable Action
                    </button>
                  ) : null}
                </div>

                {actionMode ? (
                  <div className="queue-action-form">
                    {actionMode === "assign" ? (
                      <>
                        <label>
                          Assignee
                          <input
                            onChange={(event) => setAssigneeUid(event.target.value)}
                            value={assigneeUid}
                          />
                        </label>
                        <label>
                          Required approver
                          <input
                            onChange={(event) =>
                              setRequiredApproverUid(event.target.value)
                            }
                            value={requiredApproverUid}
                          />
                        </label>
                        <button
                          className="primary-button compact-button"
                          disabled={busyAction !== null}
                          onClick={submitAssign}
                          type="button"
                        >
                          Save Assignment
                        </button>
                      </>
                    ) : (
                      <>
                        {actionMode === "snooze" ? (
                          <label>
                            Snooze until
                            <input
                              onChange={(event) => setSnoozeUntil(event.target.value)}
                              type="date"
                              value={snoozeUntil}
                            />
                          </label>
                        ) : null}
                        <label>
                          Reason
                          <textarea
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            value={reason}
                          />
                        </label>
                        <button
                          className="primary-button compact-button"
                          disabled={busyAction !== null}
                          onClick={() => {
                            if (actionMode === "snooze") {
                              submitSnooze();
                              return;
                            }
                            submitReasonedAction(actionMode);
                          }}
                          type="button"
                        >
                          Save
                        </button>
                      </>
                    )}
                    <button
                      className="secondary-button compact-button"
                      disabled={busyAction !== null}
                      onClick={() => setActionMode(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                <section className="queue-activity">
                  <h3>Activity</h3>
                  {selectedActivity.length === 0 ? (
                    <p className="muted">No Activity entries loaded yet.</p>
                  ) : (
                    <ol className="compact-list">
                      {selectedActivity.map((entry) => (
                        <li key={entry.id}>
                          <strong>{activityLabel(entry.action)}</strong>
                          <span className="muted">
                            {" "}
                            by {entry.actor_uid} on {formatDateTime(entry.created_at)}
                          </span>
                          {entry.previous_state || entry.new_state ? (
                            <span>
                              {" "}
                              ({displayValue(entry.previous_state)} to{" "}
                              {displayValue(entry.new_state)})
                            </span>
                          ) : null}
                          {entry.reason ? <p>{entry.reason}</p> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </>
            ) : (
              <p className="muted">Select a queue item to review details.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function QueuePill({
  label,
  tone,
}: Readonly<{ label: string; tone: "risk" | "status" }>) {
  return (
    <span className="queue-pill" data-tone={tone} data-value={label}>
      {label}
    </span>
  );
}

function DetailField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="queue-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterQuery(filters: QueueFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();

    if (trimmed) {
      params.set(key, trimmed);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function hasActiveFilters(filters: QueueFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function replaceItem(
  items: ApprovalQueueItemRecord[],
  replacement: ApprovalQueueItemRecord,
) {
  return items.map((item) => (item.id === replacement.id ? replacement : item));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return payload as T;
}

function readApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }

  return "Approval Queue request failed.";
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Approval Queue request failed.";
}

function displayValue(value: string | undefined) {
  return value?.trim() || "Not set";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function activityLabel(action: ApprovalQueueActivityRecord["action"]) {
  const labels: Record<ApprovalQueueActivityRecord["action"], string> = {
    approved: "Approved",
    assigned: "Assigned",
    blocked: "Blocked",
    closed: "Closed",
    comment: "Comment",
    created: "Created",
    disabled: "Disabled",
    refreshed: "Refreshed",
    returned: "Returned",
    snoozed: "Snoozed",
    unblocked: "Unblocked",
    unsnoozed: "Unsnoozed",
  };

  return labels[action];
}

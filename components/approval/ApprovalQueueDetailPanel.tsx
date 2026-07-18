import type { Dispatch, SetStateAction } from "react";
import type { ApprovalQueueActionAvailability } from "@/lib/approval/queue";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";
import {
  activityLabel,
  displayValue,
  formatDateTime,
  type QueueActionMode,
} from "./ApprovalQueueModel";

interface QueueDetailPanelProps {
  actionAvailability: ApprovalQueueActionAvailability | null;
  actionMode: QueueActionMode | null;
  assigneeUid: string;
  busyAction: string | null;
  loadingDetailId: string | null;
  onApprove: () => void;
  onCancelAction: () => void;
  onStartAction: (mode: QueueActionMode) => void;
  onSubmitAssign: () => void;
  onSubmitReasonedAction: (action: "approve" | "disable" | "return") => void;
  onSubmitSnooze: () => void;
  reason: string;
  requiredApproverUid: string;
  selectedActivity: ApprovalQueueActivityRecord[];
  selectedItem: ApprovalQueueItemRecord | null;
  setAssigneeUid: Dispatch<SetStateAction<string>>;
  setReason: Dispatch<SetStateAction<string>>;
  setRequiredApproverUid: Dispatch<SetStateAction<string>>;
  setSnoozeUntil: Dispatch<SetStateAction<string>>;
  snoozeUntil: string;
}

export function QueueDetailPanel({
  actionAvailability,
  actionMode,
  assigneeUid,
  busyAction,
  loadingDetailId,
  onApprove,
  onCancelAction,
  onStartAction,
  onSubmitAssign,
  onSubmitReasonedAction,
  onSubmitSnooze,
  reason,
  requiredApproverUid,
  selectedActivity,
  selectedItem,
  setAssigneeUid,
  setReason,
  setRequiredApproverUid,
  setSnoozeUntil,
  snoozeUntil,
}: Readonly<QueueDetailPanelProps>) {
  return (
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
            <DetailField
              label="Data mode"
              value={selectedItem.data_mode === "test" ? "Test" : "Live"}
            />
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
            <DetailField label="Due date" value={displayValue(selectedItem.due_date)} />
            <DetailField
              label="Affected action"
              value={displayValue(selectedItem.affected_system_action)}
            />
            <DetailField
              label="Execution target"
              value={displayValue(selectedItem.action_execution_target)}
            />
          </div>

          <p className="muted">
            {selectedItem.data_mode === "test"
              ? "Test fixture: this decision changes app-only Test state and cannot contact a provider."
              : selectedItem.action_execution_id
                ? "Approval authorizes the exact execution preview. It does not make the provider attempt; execution remains a separate owning-workflow action."
                : "Approval changes this app decision only. It does not execute an external action."}
          </p>

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
              onClick={onApprove}
              title={actionAvailability?.approveReason}
              type="button"
            >
              {selectedItem.action_execution_id ? "Approve for execution" : "Approve"}
            </button>
            <button
              className="secondary-button compact-button"
              disabled={busyAction !== null || !actionAvailability?.returnForRevision}
              onClick={() => onStartAction("return")}
              type="button"
            >
              Return
            </button>
            <button
              className="secondary-button compact-button"
              disabled={busyAction !== null || !actionAvailability?.snooze}
              onClick={() => onStartAction("snooze")}
              type="button"
            >
              Snooze
            </button>
            {actionAvailability?.assign ? (
              <button
                className="secondary-button compact-button"
                disabled={busyAction !== null}
                onClick={() => onStartAction("assign")}
                type="button"
              >
                Assign
              </button>
            ) : null}
            {actionAvailability?.disable ? (
              <button
                className="secondary-button compact-button"
                disabled={busyAction !== null}
                onClick={() => onStartAction("disable")}
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
                      onChange={(event) => setRequiredApproverUid(event.target.value)}
                      value={requiredApproverUid}
                    />
                  </label>
                  <button
                    className="primary-button compact-button"
                    disabled={busyAction !== null}
                    onClick={onSubmitAssign}
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
                        onSubmitSnooze();
                        return;
                      }
                      onSubmitReasonedAction(actionMode);
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
                onClick={onCancelAction}
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

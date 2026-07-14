import type { Dispatch, SetStateAction } from "react";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import {
  BULK_ACTION_LIMIT,
  requiresBulkReason,
  type BulkActionMode,
  type BulkQueueResult,
} from "./ApprovalQueueModel";

interface QueueBulkPanelProps {
  allVisibleSelected: boolean;
  bulkAction: BulkActionMode;
  bulkAssigneeUid: string;
  bulkPreview: {
    highRiskApprovals: number;
    linkedHighRiskApprovals: number;
    knownSkipped: number;
    ready: number;
  };
  bulkReason: string;
  bulkRequiredApproverUid: string;
  bulkResult: BulkQueueResult | null;
  bulkSnoozeUntil: string;
  busyAction: string | null;
  onClearSelection: () => void;
  onSubmitBulkAction: () => void;
  onToggleAllVisible: () => void;
  selectedBulkItems: ApprovalQueueItemRecord[];
  setBulkAction: Dispatch<SetStateAction<BulkActionMode>>;
  setBulkAssigneeUid: Dispatch<SetStateAction<string>>;
  setBulkReason: Dispatch<SetStateAction<string>>;
  setBulkRequiredApproverUid: Dispatch<SetStateAction<string>>;
  setBulkSnoozeUntil: Dispatch<SetStateAction<string>>;
}

export function QueueBulkPanel({
  allVisibleSelected,
  bulkAction,
  bulkAssigneeUid,
  bulkPreview,
  bulkReason,
  bulkRequiredApproverUid,
  bulkResult,
  bulkSnoozeUntil,
  busyAction,
  onClearSelection,
  onSubmitBulkAction,
  onToggleAllVisible,
  selectedBulkItems,
  setBulkAction,
  setBulkAssigneeUid,
  setBulkReason,
  setBulkRequiredApproverUid,
  setBulkSnoozeUntil,
}: Readonly<QueueBulkPanelProps>) {
  return (
    <section className="panel queue-bulk-panel" aria-label="Bulk actions">
      <div className="panel-heading compact-heading">
        <div>
          <h2>Bulk actions</h2>
          <p className="muted">
            {selectedBulkItems.length} selected. {bulkPreview.ready} ready by visible
            checks, {bulkPreview.knownSkipped} likely skipped. Max {BULK_ACTION_LIMIT} per
            request.
          </p>
        </div>
        <label className="queue-select-all">
          <input
            checked={allVisibleSelected}
            onChange={onToggleAllVisible}
            type="checkbox"
          />
          Select visible
        </label>
      </div>
      <div className="queue-bulk-controls">
        <label>
          Action
          <select
            onChange={(event) => setBulkAction(event.target.value as BulkActionMode)}
            value={bulkAction}
          >
            <option value="approve">Approve</option>
            <option value="return">Return for Revision</option>
            <option value="assign">Assign</option>
            <option value="snooze">Snooze</option>
            <option value="disable">Disable Action</option>
            <option value="execute">Execute</option>
          </select>
        </label>
        {bulkAction === "assign" ? (
          <>
            <label>
              Assignee
              <input
                onChange={(event) => setBulkAssigneeUid(event.target.value)}
                value={bulkAssigneeUid}
              />
            </label>
            <label>
              Required approver
              <input
                onChange={(event) => setBulkRequiredApproverUid(event.target.value)}
                value={bulkRequiredApproverUid}
              />
            </label>
          </>
        ) : null}
        {bulkAction === "snooze" ? (
          <label>
            Snooze until
            <input
              onChange={(event) => setBulkSnoozeUntil(event.target.value)}
              type="date"
              value={bulkSnoozeUntil}
            />
          </label>
        ) : null}
        {requiresBulkReason(bulkAction) ||
        (bulkAction === "approve" && bulkPreview.linkedHighRiskApprovals > 0) ? (
          <label className="queue-bulk-reason">
            Reason
            <textarea
              onChange={(event) => setBulkReason(event.target.value)}
              rows={2}
              value={bulkReason}
            />
          </label>
        ) : null}
        <button
          className="primary-button compact-button"
          disabled={busyAction !== null || selectedBulkItems.length === 0}
          onClick={onSubmitBulkAction}
          type="button"
        >
          Apply Bulk
        </button>
        <button
          className="secondary-button compact-button"
          disabled={busyAction !== null || selectedBulkItems.length === 0}
          onClick={onClearSelection}
          type="button"
        >
          Clear
        </button>
      </div>
      <p className="muted queue-bulk-preview">
        {bulkPreview.highRiskApprovals > 0
          ? `${bulkPreview.highRiskApprovals} High-risk approval(s) require confirmation. `
          : ""}
        {bulkAction === "execute"
          ? "Execute is visible for v1, but current items will be skipped until approved executable action runtime exists."
          : "The server checks every selected item again before updating it."}
      </p>
      {bulkResult ? (
        <div className="queue-bulk-results" aria-live="polite">
          <strong>
            {bulkResult.summary.updated} updated, {bulkResult.summary.skipped} skipped,{" "}
            {bulkResult.summary.failed} failed
          </strong>
          <ol className="compact-list">
            {bulkResult.results.slice(0, 8).map((result) => (
              <li key={result.item_id}>
                <span>{result.item_id}</span>: <strong>{result.outcome}</strong> -{" "}
                {result.message}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

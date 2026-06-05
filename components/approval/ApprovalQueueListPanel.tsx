import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import { displayValue } from "./ApprovalQueueModel";

interface QueueListPanelProps {
  items: ApprovalQueueItemRecord[];
  onSelectItem: (itemId: string) => void;
  onToggleBulkItem: (itemId: string) => void;
  selectedBulkIds: Set<string>;
  selectedItemId: string | null;
}

export function QueueListPanel({
  items,
  onSelectItem,
  onToggleBulkItem,
  selectedBulkIds,
  selectedItemId,
}: Readonly<QueueListPanelProps>) {
  return (
    <section className="panel queue-list-panel" aria-label="Queue items">
      <div className="queue-list">
        {items.map((item) => (
          <div
            className="queue-row"
            key={item.id}
            data-current={item.id === selectedItemId ? "true" : undefined}
          >
            <label className="queue-row-select">
              <input
                checked={selectedBulkIds.has(item.id)}
                onChange={() => onToggleBulkItem(item.id)}
                type="checkbox"
              />
              <span className="sr-only">Select {item.action_needed}</span>
            </label>
            <button
              className="queue-row-open"
              onClick={() => onSelectItem(item.id)}
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
          </div>
        ))}
      </div>
    </section>
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

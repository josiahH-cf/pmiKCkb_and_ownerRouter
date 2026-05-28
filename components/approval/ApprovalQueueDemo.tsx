"use client";

import { useMemo, useState } from "react";

interface QueueItem {
  id: string;
  kind: "SOP" | "Template" | "Placeholder";
  status: string;
  title: string;
}

export function ApprovalQueueDemo({
  canApprove,
  items,
}: Readonly<{ canApprove: boolean; items: QueueItem[] }>) {
  const [queueItems, setQueueItems] = useState(items);
  const activeItems = useMemo(
    () =>
      queueItems.filter((item) => item.status === "In Review" || item.status === "Open"),
    [queueItems],
  );

  function approve(itemId: string) {
    setQueueItems((records) =>
      records.map((record) =>
        record.id === itemId
          ? {
              ...record,
              status: record.kind === "Placeholder" ? "Resolved" : "Approved",
            }
          : record,
      ),
    );
  }

  if (activeItems.length === 0) {
    return (
      <div className="panel">
        <p>No in-review items are present in the local demo queue.</p>
      </div>
    );
  }

  return (
    <div className="queue-list">
      {activeItems.map((item) => (
        <article className="panel queue-item" key={item.id}>
          <div>
            <h2>{item.title}</h2>
            <p className="muted">
              {item.kind} - {item.status}
            </p>
          </div>
          <button
            className="primary-button"
            disabled={!canApprove}
            onClick={() => approve(item.id)}
            type="button"
          >
            {item.kind === "Placeholder" ? "Resolve" : "Approve"}
          </button>
        </article>
      ))}
    </div>
  );
}

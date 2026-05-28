"use client";

import { useMemo, useState } from "react";
import type { ApprovalQueueItem } from "@/lib/approval/queue";

type QueueItem = ApprovalQueueItem;

export function ApprovalQueueDemo({
  actorUid,
  apiBacked,
  canApprove,
  items,
}: Readonly<{
  actorUid: string;
  apiBacked: boolean;
  canApprove: boolean;
  items: QueueItem[];
}>) {
  const [queueItems, setQueueItems] = useState(items);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [message, setMessage] = useState(
    apiBacked ? "Editable API connected." : "Using local demo queue.",
  );
  const activeItems = useMemo(
    () =>
      queueItems.filter((item) => item.status === "In Review" || item.status === "Open"),
    [queueItems],
  );

  async function approve(item: QueueItem) {
    if (!canApprove || busyItemId) {
      return;
    }

    if (!apiBacked) {
      updateLocalStatus(item.id, nextStatusFor(item.kind));
      setMessage("Updated local demo queue.");
      return;
    }

    setBusyItemId(item.id);
    setMessage("Saving.");

    try {
      await updateEditableQueueItem(item, actorUid);
      updateLocalStatus(item.id, nextStatusFor(item.kind));
      setMessage(
        item.kind === "Placeholder"
          ? "Resolved through editable API."
          : "Approved through editable API.",
      );
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setBusyItemId(null);
    }
  }

  function updateLocalStatus(itemId: string, status: string) {
    setQueueItems((records) =>
      records.map((record) =>
        record.id === itemId
          ? {
              ...record,
              status,
            }
          : record,
      ),
    );
  }

  if (activeItems.length === 0) {
    return (
      <div className="panel">
        <p>{message}</p>
        <p>No in-review items are present in the approval queue.</p>
      </div>
    );
  }

  return (
    <div className="queue-list">
      <p className="muted">{message}</p>
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
            disabled={!canApprove || busyItemId !== null}
            onClick={() => void approve(item)}
            type="button"
          >
            {busyItemId === item.id
              ? "Saving"
              : item.kind === "Placeholder"
                ? "Resolve"
                : "Approve"}
          </button>
        </article>
      ))}
    </div>
  );
}

async function updateEditableQueueItem(item: QueueItem, actorUid: string) {
  if (item.kind === "SOP") {
    await fetchEditable(`/api/sops/${item.id}`, {
      body: JSON.stringify({
        last_reviewed_at: new Date().toISOString(),
        note: "Approved from Approval Queue.",
        status: "Approved",
      }),
      method: "PATCH",
    });
    return;
  }

  if (item.kind === "Template") {
    await fetchEditable(`/api/templates/${item.id}`, {
      body: JSON.stringify({
        approved_by_uid: actorUid,
        last_reviewed_at: new Date().toISOString(),
        note: "Approved from Approval Queue.",
        status: "Approved",
      }),
      method: "PATCH",
    });
    return;
  }

  await fetchEditable(`/api/placeholders/${item.id}`, {
    body: JSON.stringify({
      note: "Resolved from Approval Queue.",
      resolution: "Resolved during Approval Queue review.",
      status: "Resolved",
    }),
    method: "PATCH",
  });
}

async function fetchEditable(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(readApiError(payload));
  }
}

function nextStatusFor(kind: QueueItem["kind"]) {
  return kind === "Placeholder" ? "Resolved" : "Approved";
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

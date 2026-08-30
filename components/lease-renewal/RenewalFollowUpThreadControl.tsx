"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";

export function RenewalFollowUpThreadControl({
  canEdit,
  leaseId,
  projection,
}: Readonly<{
  canEdit: boolean;
  leaseId: string;
  projection: RenewalFollowUpProjection;
}>) {
  const router = useRouter();
  const currentSource = projection.linkedThread;
  const [purpose, setPurpose] = useState<"renewal_owner" | "renewal_tenant">(
    currentSource?.purpose ?? "renewal_tenant",
  );
  const [threadId, setThreadId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"link" | "refresh" | null>(null);
  const [status, setStatus] = useState("");

  function context(
    selectedPurpose: "renewal_owner" | "renewal_tenant",
  ): WorkflowCommunicationContext {
    return {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: leaseId,
      purpose: selectedPurpose,
      actionKey: "gmail.mailbox.read",
      sourceRefs: [`rentvine:lease:${leaseId}`],
    };
  }

  async function linkThread() {
    if (!threadId.trim() || !reason.trim() || pending) return;
    setPending("link");
    setStatus("");
    try {
      const response = await fetch("/api/gmail-hub/communications/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: context(purpose),
          threadId: threadId.trim(),
          reason: reason.trim(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The thread could not be linked.");
      setThreadId("");
      setReason("");
      setStatus("Exact linked-thread evidence recorded. No message was sent.");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The thread could not be linked.",
      );
    } finally {
      setPending(null);
    }
  }

  async function refreshThread() {
    if (!currentSource || pending) return;
    setPending("refresh");
    setStatus("");
    try {
      const response = await fetch("/api/gmail-hub/communications/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: context(currentSource.purpose),
          threadId: currentSource.threadId,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "The linked thread could not be refreshed.");
      setStatus(
        body.status === "needs_verification"
          ? "The exact thread is unavailable; contact state now needs verification."
          : "The exact linked thread was refreshed read-only. No message was sent.",
      );
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The linked thread could not be refreshed.",
      );
    } finally {
      setPending(null);
    }
  }

  if (!canEdit) return null;

  return (
    <details>
      <summary>Link or refresh exact Gmail evidence</summary>
      <div className="ui-stack">
        <p className="muted">
          This reads one opaque Gmail thread and records only message identity, time, and
          direction. It cannot draft, reply, or send.
        </p>
        {currentSource ? (
          <button
            className="secondary-button"
            disabled={pending !== null}
            onClick={() => void refreshThread()}
            type="button"
          >
            {pending === "refresh" ? "Refreshing…" : "Refresh this linked thread"}
          </button>
        ) : null}
        <label className="select-field">
          Communication party
          <select
            onChange={(event) =>
              setPurpose(event.target.value as "renewal_owner" | "renewal_tenant")
            }
            value={purpose}
          >
            <option value="renewal_owner">Owner</option>
            <option value="renewal_tenant">Tenant</option>
          </select>
        </label>
        <label>
          Exact Gmail thread ID
          <input
            maxLength={200}
            onChange={(event) => setThreadId(event.target.value)}
            value={threadId}
          />
        </label>
        <label>
          Reason for linking
          <input
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </label>
        <button
          className="secondary-button"
          disabled={!threadId.trim() || !reason.trim() || pending !== null}
          onClick={() => void linkThread()}
          type="button"
        >
          {pending === "link" ? "Linking…" : "Link exact thread"}
        </button>
        {status ? <p role="status">{status}</p> : null}
      </div>
    </details>
  );
}

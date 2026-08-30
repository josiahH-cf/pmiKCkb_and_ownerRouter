"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";

export function RenewalFollowUpAttentionControl({
  canEdit,
  projection,
}: Readonly<{ canEdit: boolean; projection: RenewalFollowUpProjection }>) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const item = projection.workItem;
  if (!canEdit || !item) return null;

  const action = projection.attentionState === "dismissed" ? "reopen" : "dismiss";

  async function transition() {
    if (!reason.trim() || pending || !item) return;
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/lease-renewal/follow-up-attention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          attention: {
            leaseId: item.leaseId,
            dedupeKey: item.dedupeKey,
            dueAtIso: item.dueAtIso,
            lastContactAtIso: item.lastContactAtIso,
            policyVersion: item.policyVersion,
            policyScope: item.policyScope,
            sourceRefs: item.sourceRefs,
          },
          reason: reason.trim(),
          idempotencyKey: globalThis.crypto.randomUUID(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The follow-up attention state could not change.");
      }
      setReason("");
      setStatus(
        action === "dismiss"
          ? "This exact due item is dismissed with audit evidence."
          : "This exact due item is reopened with audit evidence.",
      );
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The follow-up attention state could not change.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <p className="muted">
        Attention state:{" "}
        {projection.attentionState === "dismissed" ? "Dismissed" : "Open"}
      </p>
      <label>
        Reason to {action}
        <input
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <button
        className="secondary-button"
        disabled={!reason.trim() || pending}
        onClick={() => void transition()}
        type="button"
      >
        {pending
          ? "Recording…"
          : action === "dismiss"
            ? "Dismiss due item"
            : "Reopen due item"}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

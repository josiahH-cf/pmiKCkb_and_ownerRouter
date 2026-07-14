"use client";

import { useState } from "react";

import { COMMUNICATIONS_RETENTION_TARGETS } from "@/lib/gmail-hub/retention-policy";

const collections = Object.keys(COMMUNICATIONS_RETENTION_TARGETS);

export function CommunicationsRetentionAdminPanel() {
  const [action, setAction] = useState<"hold" | "release">("hold");
  const [caseReference, setCaseReference] = useState("");
  const [collection, setCollection] = useState(collections[0] ?? "");
  const [recordId, setRecordId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(
    "Policy v1.0 is active in code; TTL deployment and cleanup scheduling remain gated.",
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage("Recording the bodyless legal-hold decision.");
    try {
      const response = await fetch("/api/admin/communications-retention/holds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          caseReference,
          collection,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
          reason,
          recordId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        legalHold?: boolean;
        status?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Legal hold failed.");
      setMessage(
        `${payload.status === "duplicate" ? "Already recorded" : "Recorded"}: legal hold ${
          payload.legalHold ? "active" : "released"
        }. Reason and case reference were stored only as hashes.`,
      );
      setReason("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Legal hold failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel ui-stack">
      <h2>Communications Retention</h2>
      <p className="muted">{message}</p>
      <p className="muted">
        Confirmation 30d · dedupe 7d · sync 90d · workflow link 365d · bodyless audit 7y.
        Holds pause deletion; releasing a hold never restores deleted data.
      </p>
      <div className="workflow-two-column-fields">
        <label>
          Action
          <select
            disabled={busy}
            onChange={(event) => setAction(event.target.value as "hold" | "release")}
            value={action}
          >
            <option value="hold">Apply legal hold</option>
            <option value="release">Release legal hold</option>
          </select>
        </label>
        <label>
          Bodyless record collection
          <select
            disabled={busy}
            onChange={(event) => setCollection(event.target.value)}
            value={collection}
          >
            {collections.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Record ID
          <input
            disabled={busy}
            maxLength={500}
            onChange={(event) => setRecordId(event.target.value)}
            value={recordId}
          />
        </label>
        <label>
          Case reference
          <input
            disabled={busy}
            maxLength={200}
            onChange={(event) => setCaseReference(event.target.value)}
            value={caseReference}
          />
        </label>
      </div>
      <label>
        Plain-English reason
        <textarea
          disabled={busy}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          value={reason}
        />
      </label>
      <button
        className="secondary-button"
        disabled={
          busy || !recordId.trim() || !caseReference.trim() || reason.trim().length < 8
        }
        onClick={() => void submit()}
        type="button"
      >
        {action === "hold" ? "Apply legal hold" : "Release legal hold"}
      </button>
    </article>
  );
}

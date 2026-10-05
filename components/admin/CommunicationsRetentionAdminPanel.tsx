"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useRef, useState } from "react";

import { COMMUNICATIONS_RETENTION_TARGETS } from "@/lib/gmail-hub/retention-contract";

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
  const [uncertain, setUncertain] = useState(false);
  const [failed, setFailed] = useState(false);
  const dispatched = useRef(false);
  const pendingBody = useRef<string | null>(null);

  async function submit(recover = false) {
    if (dispatched.current || (pendingBody.current && !recover)) return;
    dispatched.current = true;
    pendingBody.current ??= JSON.stringify({
      action,
      caseReference,
      collection,
      idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
      reason,
      recordId,
    });
    const previouslyUnknown = uncertain;
    let knownRefusal = false;
    setBusy(true);
    setFailed(false);
    setMessage("Recording the bodyless legal-hold decision.");
    try {
      const response = await fetch("/api/admin/communications-retention/holds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: pendingBody.current,
      });
      knownRefusal = response.status >= 400 && response.status < 500;
      const payload = (await response.json()) as {
        error?: string;
        legalHold?: boolean;
        status?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Legal hold failed.");
      if (
        !["changed", "duplicate"].includes(payload.status ?? "") ||
        typeof payload.legalHold !== "boolean" ||
        (payload.status === "changed" &&
          payload.legalHold !== (JSON.parse(pendingBody.current).action === "hold"))
      )
        throw new Error("Missing legal-hold receipt");
      setMessage(
        `${payload.status === "duplicate" ? "Already recorded" : "Recorded"}: legal hold ${
          payload.legalHold ? "active" : "released"
        }. Reason and case reference were stored only as hashes.`,
      );
      pendingBody.current = null;
      setUncertain(false);
      setReason("");
    } catch (error) {
      setFailed(true);
      if (knownRefusal && !previouslyUnknown) {
        pendingBody.current = null;
        setMessage(error instanceof Error ? error.message : "Legal hold was refused.");
      } else {
        setUncertain(true);
        setMessage(
          "Decision is not confirmed. Your inputs and exact attempt are retained. Retry exact decision uses the same server idempotency key; it does not create a different decision.",
        );
      }
    } finally {
      dispatched.current = false;
      setBusy(false);
    }
  }

  return (
    <article className="panel ui-stack" aria-busy={busy || undefined}>
      <h2>Communications Retention</h2>
      <p className="muted" role={failed ? "alert" : "status"}>
        {message}
      </p>
      <p className="muted">
        Confirmation 30d · dedupe 7d · sync 90d · workflow link 365d · bodyless audit 7y.
        Holds pause deletion; releasing a hold never restores deleted data.
      </p>
      <div className="workflow-two-column-fields">
        <label>
          Action
          <select
            disabled={busy || uncertain}
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
            disabled={busy || uncertain}
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
            disabled={busy || uncertain}
            maxLength={500}
            onChange={(event) => setRecordId(event.target.value)}
            value={recordId}
          />
        </label>
        <label>
          Case reference
          <input
            disabled={busy || uncertain}
            maxLength={200}
            onChange={(event) => setCaseReference(event.target.value)}
            value={caseReference}
          />
        </label>
      </div>
      <label>
        Plain-English reason
        <textarea
          disabled={busy || uncertain}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          value={reason}
        />
      </label>
      <button
        className="secondary-button"
        disabled={
          busy ||
          uncertain ||
          !recordId.trim() ||
          !caseReference.trim() ||
          reason.trim().length < 8
        }
        onClick={() => void submit()}
        type="button"
      >
        {action === "hold" ? "Apply legal hold" : "Release legal hold"}
      </button>
      {uncertain ? (
        <button
          className="secondary-button"
          disabled={busy}
          type="button"
          onClick={() => void submit(true)}
        >
          Retry exact decision
        </button>
      ) : null}
    </article>
  );
}

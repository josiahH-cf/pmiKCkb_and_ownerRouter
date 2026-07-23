"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import type { AskCorrectionRecord } from "@/lib/firestore/types";

// S32 Admin review lane for Ask corrections. Lists Proposed corrections with Approve / Dismiss. Approve is
// the ONLY path that acts: it files the proposed KB entry as a Draft placeholder (which STILL needs its own
// approval) and marks the correction Approved. Dismiss marks it Dismissed. Admin-gated by the /admin page.

const KIND_LABELS: Record<AskCorrectionRecord["kind"], string> = {
  wrong_fact: "Wrong fact",
  wrong_source: "Wrong source",
  missing_detail: "Missing detail",
  wrong_process: "Wrong process",
};

export function KbCorrectionsPanel({
  proposed,
}: Readonly<{ proposed: AskCorrectionRecord[] }>) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  async function decide(id: string, decision: "approve" | "dismiss") {
    setPendingId(id);
    setError("");
    try {
      const response = await fetch(`/api/ask/corrections/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (response.ok) {
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the decision.");
      }
    } catch {
      setError("Could not reach the corrections service.");
    } finally {
      setPendingId("");
    }
  }

  return (
    <article className="admin-panel">
      <h2>Answer corrections</h2>
      <p className="muted">
        Filing a correction proposes a change only. Approving files a Draft KB entry that
        still needs its own approval before it affects answers. Nothing self-modifies.
      </p>
      {proposed.length === 0 ? (
        <p className="muted">No corrections are waiting for review.</p>
      ) : (
        <ul className="ui-rows">
          {proposed.map((correction) => (
            <li className="ui-stack-tight" key={correction.id}>
              <div className="ui-spread">
                <strong>{correction.question}</strong>
                <span className="muted">{KIND_LABELS[correction.kind]}</span>
              </div>
              <p>{correction.note}</p>
              <div className="ui-row">
                <Button
                  disabled={pendingId === correction.id}
                  onClick={() => void decide(correction.id, "approve")}
                  type="button"
                >
                  Approve (file a Draft)
                </Button>
                <Button
                  disabled={pendingId === correction.id}
                  onClick={() => void decide(correction.id, "dismiss")}
                  type="button"
                  variant="secondary"
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="muted">{error}</p> : null}
    </article>
  );
}

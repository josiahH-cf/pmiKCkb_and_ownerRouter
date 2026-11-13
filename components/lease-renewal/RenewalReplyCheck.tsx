"use client";

// S275 R-S275-3: while a step waits on the owner or the tenant, the Now card keeps naming what is
// watched (S247 R-S247-5) and adds when the app last checked for a reply, or that it has not yet.
// "Check for a reply now" observes that lease's watched messages once through the existing
// sequences refresh action and re-reads the step. A failed read says so with its time; the step
// keeps waiting. Nothing here records an answer or chooses an outcome.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import {
  REPLY_CHECK_WORDS,
  replyCheckFailedLine,
  replyCheckLine,
  type ReplyCheckEvidence,
} from "@/lib/lease-renewal/outreach-evidence";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

const SEQUENCES_ROUTE = "/api/gmail-hub/sequences";

/** One refresh of one message; the failure time when it did not read cleanly, else null. */
async function checkOne(id: string): Promise<number | null> {
  try {
    const response = await fetchWithDeadline(SEQUENCES_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "refresh", id }),
    });
    if (!response.ok) return Date.now();
    const body = (await response.json().catch(() => null)) as {
      sequence?: { observation?: { state?: string; checkedAtMs?: number } | null };
    } | null;
    const observation = body?.sequence?.observation;
    if (observation?.state === "current") return null;
    return typeof observation?.checkedAtMs === "number"
      ? observation.checkedAtMs
      : Date.now();
  } catch {
    return Date.now();
  }
}

export function RenewalReplyCheck({
  check,
  canEdit,
}: Readonly<{
  check: ReplyCheckEvidence | null | undefined;
  canEdit: boolean;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // A failure this page saw, shown until the step is read again with a newer check.
  const [failedAtMs, setFailedAtMs] = useState<number | null>(null);
  const shownFailure =
    failedAtMs !== null && (check?.lastCheckedAtMs ?? 0) <= failedAtMs
      ? failedAtMs
      : null;
  const line =
    shownFailure !== null ? replyCheckFailedLine(shownFailure) : replyCheckLine(check);
  const ids = check?.sequenceIds ?? [];

  async function run() {
    if (busy || !ids.length) return;
    setBusy(true);
    try {
      let failed: number | null = null;
      for (const id of ids) {
        const result = await checkOne(id);
        if (result !== null) failed = Math.max(failed ?? 0, result);
      }
      setFailedAtMs(failed);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight" data-renewal-field="reply-check">
      <p
        data-renewal-reply-check={
          shownFailure !== null || (check?.failedAtMs ?? null) !== null
            ? "failed"
            : check?.lastCheckedAtMs != null
              ? "checked"
              : "not-checked"
        }
        role={shownFailure !== null ? "alert" : undefined}
      >
        {line}
      </p>
      {canEdit && ids.length ? (
        <p>
          <Button
            busy={busy}
            busyLabel={REPLY_CHECK_WORDS.checking}
            data-renewal-reply-check-action
            onClick={() => void run()}
            size="compact"
            variant="secondary"
          >
            {REPLY_CHECK_WORDS.check}
          </Button>
        </p>
      ) : null}
    </div>
  );
}

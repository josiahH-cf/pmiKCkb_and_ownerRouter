"use client";

// S275 R-S275-5: the Communications page's one Gmail check, shown on load on the Incoming and
// Scheduled tabs. It runs the manual check for the viewer's own mailbox (R-S275-2: the linked
// history and every watched or open message of that mailbox, read-only) and then reloads the lists.
// One caller-made attempt key is the check's identity: a check whose answer was lost is sent again
// with the same key, so it is never run twice.

import { useRef, useState } from "react";

import { Button } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

export const CHECK_GMAIL_WORDS = {
  check: "Check Gmail now",
  checking: "Checking Gmail…",
  failed:
    "The Gmail check did not finish. Choose Check Gmail now again; the same check is sent again.",
} as const;

const DONE_STATUSES = ["processed", "duplicate", "bounded_resync", "initialized"];

/** The status line after a check: when it ran and any message it could not read cleanly. */
export function checkGmailResultLine(
  result: { sequences?: { notChecked?: number } | null },
  atMs: number,
): string {
  const notChecked = result.sequences?.notChecked ?? 0;
  const line = `Gmail checked at ${formatBusinessTimestamp(new Date(atMs).toISOString())}.`;
  return notChecked > 0
    ? `${line} ${notChecked} renewal message${notChecked === 1 ? "" : "s"} could not be read this time; check again.`
    : line;
}

export function CheckGmailNow({ onChecked }: Readonly<{ onChecked: () => void }>) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const attemptKey = useRef<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    attemptKey.current ??= globalThis.crypto.randomUUID();
    try {
      const response = await fetchWithDeadline("/api/gmail-hub/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptKey: attemptKey.current }),
      });
      const data = (await response.json().catch(() => null)) as {
        status?: string;
        error?: string;
        sequences?: { notChecked?: number } | null;
      } | null;
      if (!response.ok || !data || !DONE_STATUSES.includes(String(data.status)))
        throw new Error(data?.error ?? "The Gmail check was not confirmed.");
      attemptKey.current = null;
      setStatus(checkGmailResultLine(data, Date.now()));
      onChecked();
    } catch {
      setFailed(true);
      setStatus(CHECK_GMAIL_WORDS.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-row" data-communication-field="check-gmail">
      <Button
        busy={busy}
        busyLabel={CHECK_GMAIL_WORDS.checking}
        onClick={() => void run()}
        variant="secondary"
      >
        {CHECK_GMAIL_WORDS.check}
      </Button>
      {status ? <p role={failed ? "alert" : "status"}>{status}</p> : null}
    </div>
  );
}

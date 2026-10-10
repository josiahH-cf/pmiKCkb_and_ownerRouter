"use client";
import { useState } from "react";
import { workflowComposerHref } from "@/lib/gmail-hub/composer-navigation";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { Button, Card } from "@/components/ui";
interface Attempt {
  executionId: string;
  state: string;
  recoveryAvailable: boolean;
  updatedAt: string;
  attemptCount: number;
}
export function MaintenanceOwnerNoticeDraftComposer({
  ticketRef,
}: Readonly<{ ticketRef: string }>) {
  const [attempts, setAttempts] = useState<Attempt[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [body, setBody] = useState(""),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  async function load(older = false) {
    setPending(true);
    setNotice("");
    try {
      const q = new URLSearchParams({
        ticketRef,
        ...(older && cursor ? { cursor } : {}),
      });
      const response = await fetch(`/api/maintenance/owner-notice-draft?${q}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Earlier attempts could not be read.");
      setAttempts((old) => (older ? [...old, ...result.attempts] : result.attempts));
      setCursor(result.cursor);
      if (!result.attempts.length && !older)
        setNotice(
          "No earlier owner-notice attempts are recorded for your account on this ticket.",
        );
    } catch (error) {
      setNotice(
        waitFailureMessage(
          error,
          error instanceof Error
            ? error.message
            : "Earlier attempts could not be read. Retry reads saved status only.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  async function recover(executionId: string) {
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/maintenance/owner-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticketRef,
          reconcile: { executionId },
          ...(body ? { body } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ??
            "The original inputs could not be verified. The earlier attempt remains unresolved.",
        );
      setNotice(
        result.reason ??
          result.reasons?.join(" ") ??
          "The earlier status was read. Nothing was sent or drafted.",
      );
      await load();
      setNotice(
        result.reason ?? "The earlier status was read. Nothing was sent or drafted.",
      );
    } catch (error) {
      setNotice(
        waitFailureMessage(
          error,
          error instanceof Error
            ? error.message
            : "Recovery could not be confirmed. The same attempt remains recorded; nothing new was dispatched.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <h3 className="section-title">Owner message</h3>
      <a
        className="primary-button"
        target="_blank"
        rel="noopener noreferrer"
        href={workflowComposerHref({ ticketId: ticketRef, purpose: "maintenance_owner" })}
      >
        Compose owner message in Communications
      </a>
      <details>
        <summary>Earlier Gmail draft attempts</summary>
        <p>
          Read your original attempt. Recovery compares its original inputs; changed or
          unavailable inputs keep an unresolved outcome. It never creates a new draft.
        </p>
        <Button disabled={pending} onClick={() => void load()}>
          Read earlier attempts
        </Button>
        {attempts.map((attempt) => (
          <div key={attempt.executionId}>
            <p>
              {attempt.state} · {attempt.updatedAt}
            </p>
            {attempt.recoveryAvailable ? (
              <Button
                disabled={pending}
                onClick={() => void recover(attempt.executionId)}
              >
                Recover original attempt
              </Button>
            ) : null}
          </div>
        ))}
        {cursor ? (
          <Button disabled={pending} onClick={() => void load(true)}>
            Load older attempts
          </Button>
        ) : null}
        {attempts.some((a) => a.recoveryAvailable) ? (
          <label>
            Original reviewed wording (only if it was edited)
            <textarea value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        ) : null}
      </details>
      {notice ? <p role="status">{notice}</p> : null}
    </Card>
  );
}

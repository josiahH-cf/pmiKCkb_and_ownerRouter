"use client";

import { useEffect, useId, useState } from "react";

import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import type {
  OwnerApprovalChoices,
  OwnerReplyChoice,
} from "@/lib/lease-renewal/owner-approval-evidence";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

export const OWNER_DECISION_FROM_REPLY_ID = "renewal-owner-decision-from-reply";
export const OWNER_DECISION_RECORD_LABEL = "Record this decision";

const REVISION = "revision_requested";
const DECLINE = "declined_non_renewal";
const REPLY_PREFIX = "reply\u0000";

/** Display one observed reply through the existing exact linked-thread read; never store its body. */
function OwnerReplyPreview({ reply }: Readonly<{ reply: OwnerReplyChoice }>) {
  const [retry, setRetry] = useState(0);
  // Until this exact read settles, its loading state follows its inputs directly.
  const key = JSON.stringify([
    reply.sequenceId,
    reply.threadId,
    reply.messageId,
    reply.senderEmail,
    retry,
  ]);
  const [read, setRead] = useState<{
    key: string;
    state: "ready" | "failed";
    body?: string;
    truncated?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!reply.threadId || !reply.messageId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      id: reply.sequenceId,
      thread: reply.threadId,
      sender: reply.senderEmail,
    });
    void fetchWithDeadline(`/api/gmail-hub/sequences/thread?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("reply_unavailable");
        const data = await response.json();
        const message = Array.isArray(data?.thread?.messages)
          ? data.thread.messages.find(
              (entry: { id?: unknown }) => entry.id === reply.messageId,
            )
          : null;
        if (!message || typeof message.bodyText !== "string" || !message.bodyText.trim())
          throw new Error("reply_unavailable");
        if (!controller.signal.aborted)
          setRead({
            key,
            state: "ready",
            body: message.bodyText,
            truncated: message.bodyTruncated === true,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRead({ key, state: "failed" });
      });
    return () => controller.abort();
  }, [key, reply.sequenceId, reply.threadId, reply.messageId, reply.senderEmail]);
  const current = read?.key === key ? read : null;
  return (
    <section aria-label="Owner reply" className="ui-stack-tight">
      <h3 className="section-subtitle">Owner reply</h3>
      <p className="muted">
        Received {formatBusinessTimestamp(reply.receivedAt)} in {reply.senderEmail}.
      </p>
      {!reply.threadId || !reply.messageId ? (
        <p role="status">
          The saved reply has no readable message link. Read the linked conversation in
          Communications before recording its decision.
        </p>
      ) : current?.state === "ready" ? (
        <>
          <p className="renewal-owner-reply-body">{current.body}</p>
          {current.truncated ? (
            <p role="note">
              Part of this reply is shown. Read the full linked conversation before
              recording its decision.
            </p>
          ) : null}
        </>
      ) : current?.state === "failed" ? (
        <>
          <p role="alert">
            The owner&apos;s reply text could not be read. The reply record and your
            entries are kept.
          </p>
          <Button
            onClick={() => setRetry((value) => value + 1)}
            variant="secondary"
            size="compact"
          >
            Try again
          </Button>
        </>
      ) : (
        <p role="status">Reading the owner&apos;s reply.</p>
      )}
    </section>
  );
}

/**
 * S252 (L36, R-S252-1, inside S248 BEH-S248-2): the owner's decision from an observed reply,
 * recorded on the Now card in at most three deliberate actions with nothing preselected.
 *
 * Choosing "Approved in the reply received {time} in {mailbox}" is one deliberate choice that
 * names how the owner approved (that reply in this lease's renewal thread) and when (the time it
 * was received). The mailbox is the staff mailbox whose thread holds the reply, as the S234 reply
 * choice reads ("Reply received {time} in {mailbox}"); the inbound evidence keeps no sender address. Who approved is chosen from the lease's current owners of record. "Record this
 * decision" records it through the same staff-record action the Owner response form uses, with
 * the same S234 approval evidence, and the server checks the party and the reply again. An
 * authorized representative or another channel stays on the Owner response form.
 */
export function RenewalOwnerDecisionFromReply({
  choices,
  disabled,
  onRecord,
}: Readonly<{
  choices: OwnerApprovalChoices;
  disabled: boolean;
  onRecord: (action: RenewalWorkspaceAction) => Promise<unknown> | void;
}>) {
  const id = useId();
  const [decision, setDecision] = useState("");
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const roster = choices.roster;
  const reply = decision.startsWith(REPLY_PREFIX)
    ? (choices.replies.find(
        (entry) =>
          `${REPLY_PREFIX}${entry.sequenceId}\u0000${entry.evidenceId}` === decision,
      ) ?? null)
    : null;

  function action(): RenewalWorkspaceAction | string {
    if (!decision) return "Before recording, choose the owner's decision.";
    if (decision === DECLINE) return { kind: "owner_response", outcome: DECLINE };
    if (decision === REVISION)
      return {
        kind: "owner_response",
        outcome: REVISION,
        ...(note.trim() ? { reason: note.trim() } : {}),
      };
    const owner = roster?.find((entry) => entry.sourceRef === party) ?? null;
    if (!reply || !roster || !choices.rosterFingerprint)
      return "The reply or the lease's owner list could not be read, so use Owner response below.";
    if (!owner) return "Before recording Approved, choose who approved.";
    return {
      kind: "owner_response",
      outcome: "approved_terms",
      approval: {
        party: {
          kind: "owner",
          sourceRef: owner.sourceRef,
          label: owner.label,
          rosterFingerprint: choices.rosterFingerprint,
        },
        channel: {
          kind: "linked_reply",
          sequenceId: reply.sequenceId,
          evidenceId: reply.evidenceId,
        },
        occurredAt: new Date(reply.receivedAt).toISOString(),
      },
    };
  }

  function submit() {
    const next = action();
    if (typeof next === "string") {
      setError(next);
      return;
    }
    setError("");
    void onRecord(next);
  }

  const option = (value: string, label: string) => (
    <label className="ui-row renewal-owner-decision-option" key={value}>
      <input
        checked={decision === value}
        disabled={disabled}
        name={`${id}-decision`}
        onChange={() => {
          setDecision(value);
          setError("");
        }}
        type="radio"
        value={value}
      />{" "}
      {label}
    </label>
  );

  return (
    <fieldset
      className="ui-stack-tight"
      data-renewal-field="owner-decision-from-reply"
      id={OWNER_DECISION_FROM_REPLY_ID}
      tabIndex={-1}
    >
      <legend>The owner&apos;s decision</legend>
      {choices.replies[0] ? (
        <OwnerReplyPreview reply={reply ?? choices.replies[0]} />
      ) : null}
      {choices.replies.map((entry) =>
        option(
          `${REPLY_PREFIX}${entry.sequenceId}\u0000${entry.evidenceId}`,
          `Approved in the reply received ${formatBusinessTimestamp(entry.receivedAt)} in ${entry.senderEmail}`,
        ),
      )}
      {option(REVISION, "Asked for a change")}
      {option(DECLINE, "Declined / non-renewal")}
      {reply && roster ? (
        <Field htmlFor={`${id}-party`} label="Who approved in this reply" required>
          <select
            disabled={disabled}
            id={`${id}-party`}
            onChange={(event) => {
              setParty(event.target.value);
              setError("");
            }}
            value={party}
          >
            <option value="">Choose who approved</option>
            {roster.map((owner) => (
              <option key={owner.sourceRef} value={owner.sourceRef}>
                {owner.label} (owner of record)
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {reply && !roster ? (
        <p data-renewal-field="owner-approval-unavailable" role="status">
          The lease&apos;s current owner list could not be read, so an approval can&apos;t
          be recorded now. Refresh the lease data, then record the approval.
        </p>
      ) : null}
      {decision === REVISION ? (
        <Field htmlFor={`${id}-note`} label="What the owner asked to change (optional)">
          <textarea
            disabled={disabled}
            id={`${id}-note`}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </Field>
      ) : null}
      <div className="ui-row">
        <Button disabled={disabled} onClick={submit} type="button">
          {OWNER_DECISION_RECORD_LABEL}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="muted">
        Owner response below records an authorized representative, another written channel
        or a conversation.
      </p>
    </fieldset>
  );
}

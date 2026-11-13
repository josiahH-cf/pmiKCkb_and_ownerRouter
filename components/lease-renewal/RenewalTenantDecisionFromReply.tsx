"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import type { OwnerReplyChoice } from "@/lib/lease-renewal/owner-approval-evidence";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";
import { RenewalReplyPreview } from "./RenewalOwnerDecisionFromReply";

export const TENANT_DECISION_FROM_REPLY_ID = "renewal-tenant-decision-from-reply";
export const TENANT_DECISION_FROM_REPLY_TITLE = "Record the tenant's answer";
export const TENANT_DECISION_RECORD_LABEL = "Record this decision";

const COUNTER = "counter_change_requested";
const DECLINE = "declined_nonrenewing";
const REPLY_PREFIX = "reply\u0000";

/** "Reply received 11/12/2026, 12:20 PM CST in staff@example.com": the reply an answer cites. */
export function tenantReplySource(reply: OwnerReplyChoice): string {
  return `Reply received ${formatBusinessTimestamp(reply.receivedAt)} in ${reply.senderEmail}`.slice(
    0,
    240,
  );
}

/**
 * S275 R-S275-4: a tenant reply behaves as an owner reply (S252, inside S248 R-S248-4). Once the
 * reply watch records a reply to the tenant offer, "Record the tenant's decision" leads the step,
 * and this Now card section shows the reply text read live through the exact linked-thread read
 * (never stored) and the reply as an evidence choice. Nothing is preselected (S234 R-S234-1).
 *
 * Choosing "Accepted in the reply received {time} in {mailbox}" is one deliberate choice: the
 * answer is recorded as Accepted with that reply as its source and the time it was received. The
 * mailbox is the staff mailbox whose thread holds the reply; no sender address is shown or kept.
 * "Record this decision" records through the same staff-record action the Tenant response form
 * uses; nothing is recorded until staff choose it. The Tenant response form below still records
 * another channel, a conversation, and the exact offer an acceptance covers (S264).
 */
export function RenewalTenantDecisionFromReply({
  replies,
  disabled,
  onRecord,
}: Readonly<{
  replies: readonly OwnerReplyChoice[];
  disabled: boolean;
  onRecord: (action: RenewalWorkspaceAction) => Promise<unknown> | void;
}>) {
  const id = useId();
  const [decision, setDecision] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reply = decision.startsWith(REPLY_PREFIX)
    ? (replies.find(
        (entry) =>
          `${REPLY_PREFIX}${entry.sequenceId}\u0000${entry.evidenceId}` === decision,
      ) ?? null)
    : null;

  function action(): (RenewalWorkspaceAction & { kind: "tenant_response" }) | string {
    if (!decision) return "Before recording, choose the tenant's decision.";
    if (decision === COUNTER) return { kind: "tenant_response", outcome: COUNTER };
    if (decision === DECLINE) return { kind: "tenant_response", outcome: DECLINE };
    if (!reply) return "The reply could not be read, so use Tenant response below.";
    return {
      kind: "tenant_response",
      outcome: "accepted",
      source: tenantReplySource(reply),
      occurredAt: new Date(reply.receivedAt).toISOString(),
    };
  }

  function submit() {
    const next = action();
    if (typeof next === "string") {
      setError(next);
      return;
    }
    setError("");
    setSaving(true);
    void Promise.resolve(onRecord(next))
      .catch(() =>
        setError(
          "The tenant's answer was not saved. Your choice is kept; record it again.",
        ),
      )
      .finally(() => setSaving(false));
  }

  const option = (value: string, label: string) => (
    <label className="ui-row renewal-owner-decision-option" key={value}>
      <input
        checked={decision === value}
        disabled={disabled || saving}
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
      data-renewal-field="tenant-decision-from-reply"
      id={TENANT_DECISION_FROM_REPLY_ID}
      tabIndex={-1}
    >
      <legend>{TENANT_DECISION_FROM_REPLY_TITLE}</legend>
      {replies[0] ? (
        <RenewalReplyPreview audience="tenant" reply={reply ?? replies[0]} />
      ) : null}
      {replies.map((entry) =>
        option(
          `${REPLY_PREFIX}${entry.sequenceId}\u0000${entry.evidenceId}`,
          `Accepted in the reply received ${formatBusinessTimestamp(entry.receivedAt)} in ${entry.senderEmail}`,
        ),
      )}
      {option(COUNTER, "Asked for a change")}
      {option(DECLINE, "Declined / not renewing")}
      <div className="ui-row">
        <Button
          busy={saving}
          busyLabel="Recording…"
          disabled={disabled}
          onClick={submit}
          type="button"
        >
          {TENANT_DECISION_RECORD_LABEL}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="muted">
        Tenant response below records another channel or a conversation, and the offer an
        acceptance covers.
      </p>
    </fieldset>
  );
}

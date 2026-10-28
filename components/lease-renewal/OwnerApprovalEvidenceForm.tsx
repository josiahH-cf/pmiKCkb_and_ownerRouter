"use client";

import { useId, useState } from "react";

import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";

/**
 * S234 R-S234-1: recording "Approved" names who approved for the owner, how and when. Nothing is
 * pre-selected, a reply is chosen from this lease's own owner thread, and an unreadable owner
 * list records nothing. The server checks the party and the reply again.
 */
export function OwnerApprovalEvidenceForm({
  choices,
  disabled,
  onRecord,
}: Readonly<{
  choices: OwnerApprovalChoices | undefined;
  disabled: boolean;
  onRecord: (approval: OwnerApprovalInput) => void;
}>) {
  const id = useId();
  const [party, setParty] = useState(""),
    [name, setName] = useState(""),
    [capacity, setCapacity] = useState(""),
    [channel, setChannel] = useState(""),
    [reply, setReply] = useState(""),
    [medium, setMedium] = useState(""),
    [reference, setReference] = useState(""),
    [participants, setParticipants] = useState(""),
    [when, setWhen] = useState(""),
    [error, setError] = useState("");
  const roster = choices?.roster ?? null;
  const replies = choices?.replies ?? [];
  if (!roster)
    return (
      <p role="status" data-renewal-field="owner-approval-unavailable">
        The lease&apos;s current owner list could not be read, so an approval can&apos;t
        be recorded now. Refresh the lease data, then record the approval.
      </p>
    );
  function submit() {
    const owner = roster?.find((entry) => entry.sourceRef === party) ?? null;
    const occurred = Date.parse(when);
    const approval: OwnerApprovalInput = {
      ...(party === "representative"
        ? name.trim() && capacity.trim()
          ? {
              party: {
                kind: "representative",
                name: name.trim(),
                capacity: capacity.trim(),
              },
            }
          : {}
        : party && owner && choices?.rosterFingerprint
          ? {
              party: {
                kind: "owner",
                sourceRef: owner.sourceRef,
                label: owner.label,
                rosterFingerprint: choices.rosterFingerprint,
              },
            }
          : {}),
      ...(channel === "linked_reply" && reply
        ? {
            channel: {
              kind: "linked_reply",
              sequenceId: reply.split("\u0000")[0],
              evidenceId: reply.split("\u0000")[1],
            },
          }
        : channel === "written" && medium.trim() && reference.trim()
          ? {
              channel: {
                kind: "written",
                medium: medium.trim(),
                reference: reference.trim(),
              },
            }
          : channel === "conversation" && participants.trim()
            ? { channel: { kind: "conversation", participants: participants.trim() } }
            : {}),
      ...(Number.isFinite(occurred)
        ? { occurredAt: new Date(occurred).toISOString() }
        : {}),
    };
    const missing = [
      !approval.party && "who approved",
      !approval.channel && "how they approved",
      !approval.occurredAt && "when they approved",
    ].filter(Boolean);
    if (missing.length) {
      setError(`Before recording Approved, add ${missing.join(", ")}.`);
      return;
    }
    setError("");
    onRecord(approval);
  }
  return (
    <fieldset className="ui-stack" data-renewal-field="owner-approval-evidence">
      <legend>Who approved, how and when</legend>
      <Field htmlFor={`${id}-party`} label="Who approved" required>
        <select
          disabled={disabled}
          id={`${id}-party`}
          value={party}
          onChange={(event) => setParty(event.target.value)}
        >
          <option value="">Choose who approved</option>
          {roster.map((owner) => (
            <option key={owner.sourceRef} value={owner.sourceRef}>
              {owner.label} (owner of record)
            </option>
          ))}
          <option value="representative">Authorized representative</option>
        </select>
      </Field>
      {party === "representative" ? (
        <>
          <Field htmlFor={`${id}-name`} label="Representative name" required>
            <input
              disabled={disabled}
              id={`${id}-name`}
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            htmlFor={`${id}-capacity`}
            label="Capacity"
            hint="For example, the owner's property manager or attorney, as the owner designated."
            required
          >
            <input
              disabled={disabled}
              id={`${id}-capacity`}
              maxLength={200}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      <Field htmlFor={`${id}-channel`} label="How they approved" required>
        <select
          disabled={disabled}
          id={`${id}-channel`}
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="">Choose how they approved</option>
          {replies.length ? (
            <option value="linked_reply">
              Reply in this lease&apos;s renewal thread
            </option>
          ) : null}
          <option value="written">Another written channel</option>
          <option value="conversation">Conversation</option>
        </select>
      </Field>
      {channel === "linked_reply" ? (
        <Field htmlFor={`${id}-reply`} label="Reply" required>
          <select
            disabled={disabled}
            id={`${id}-reply`}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          >
            <option value="">Choose the reply</option>
            {replies.map((entry) => (
              <option
                key={entry.evidenceId}
                value={`${entry.sequenceId}\u0000${entry.evidenceId}`}
              >
                Reply received {formatBusinessTimestamp(entry.receivedAt)} in{" "}
                {entry.senderEmail}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {channel === "written" ? (
        <>
          <Field
            htmlFor={`${id}-medium`}
            label="Channel"
            hint="For example, a text message or a signed letter."
            required
          >
            <input
              disabled={disabled}
              id={`${id}-medium`}
              maxLength={120}
              value={medium}
              onChange={(event) => setMedium(event.target.value)}
            />
          </Field>
          <Field
            htmlFor={`${id}-reference`}
            label="Reference"
            hint="Where the written approval is kept. Never paste its text or a customer value."
            required
          >
            <input
              disabled={disabled}
              id={`${id}-reference`}
              maxLength={240}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      {channel === "conversation" ? (
        <Field htmlFor={`${id}-participants`} label="Participants" required>
          <input
            disabled={disabled}
            id={`${id}-participants`}
            maxLength={240}
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
          />
        </Field>
      ) : null}
      <Field htmlFor={`${id}-when`} label="When they approved" required>
        <input
          disabled={disabled}
          id={`${id}-when`}
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
        />
      </Field>
      <div className="ui-row">
        <Button disabled={disabled} onClick={submit} type="button">
          Record approval
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </fieldset>
  );
}

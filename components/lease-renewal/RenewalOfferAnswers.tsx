"use client";

// S264 R-S264-6 (AC-S264-6): the existing response editors record which exact offer an answer
// covers. A tenant decision names the confirmed send it answers, or an app-prepared offer staff
// verified was sent outside the app (with where they verified it), or that it has no one exact
// offer; the newest unsent draft is never chosen for staff. An owner approval of the exact terms
// covers the offer's charges only when staff record that the owner approved the reviewed offer as
// it stands. Coverage comes with the tenant message's own read (read again after every save of
// the work record or the message) and is shown with the answer: acceptance of an earlier offer
// needs verification. These controls save through the work record's one save, with the answer,
// and add no request of their own.

import { useId, useState } from "react";

import { Button, Field } from "@/components/ui";
import type {
  OfferAnswerInput,
  OfferAnswersView,
} from "@/lib/lease-renewal/offer-answers";

import { useRenewalNowCard, type OfferAnswersRead } from "./RenewalNowCardContext";

export type { OfferAnswersRead, OfferAnswersView };
type OfferAnswerCandidateView = OfferAnswersView["candidates"][number];

const TENANT_DECISIONS = new Set([
  "accepted",
  "counter_change_requested",
  "declined_nonrenewing",
]);

const text = (value: unknown): value is string => typeof value === "string";
const textOrNull = (value: unknown) => value === null || text(value);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The view as the tenant message read carried it; null when absent or not in this shape. */
export function offerAnswersViewOf(raw: unknown): OfferAnswersView | null {
  if (!record(raw) || !Array.isArray(raw.candidates)) return null;
  const current = raw.current;
  if (
    current !== null &&
    !(
      record(current) &&
      text(current.snapshotId) &&
      text(current.snapshotHash) &&
      text(current.summary) &&
      typeof current.charged === "boolean"
    )
  )
    return null;
  const candidatesValid = raw.candidates.every(
    (candidate: unknown) =>
      record(candidate) &&
      (candidate.kind === "linked_communication"
        ? text(candidate.sequenceId) && text(candidate.occurrenceId)
        : candidate.kind === "external_offer" && text(candidate.executionId)) &&
      textOrNull(candidate.at) &&
      text(candidate.snapshotId) &&
      text(candidate.summary) &&
      typeof candidate.current === "boolean",
  );
  const tenant = raw.tenant;
  const tenantValid =
    tenant === null ||
    (record(tenant) &&
      text(tenant.outcome) &&
      text(tenant.eventId) &&
      textOrNull(tenant.attribution) &&
      textOrNull(tenant.answered) &&
      text(tenant.coverage) &&
      text(tenant.line));
  const owner = raw.owner;
  const ownerValid =
    owner === null ||
    (record(owner) &&
      text(owner.eventId) &&
      text(owner.scope) &&
      text(owner.coverage) &&
      text(owner.line));
  return candidatesValid && tenantValid && ownerValid
    ? (raw as unknown as OfferAnswersView)
    : null;
}

/** The tenant offer's recorded answers, as the one tenant message read last carried them. */
export function useOfferAnswers(): OfferAnswersRead {
  return useRenewalNowCard()?.offerAnswers ?? { view: null, failed: false };
}

function day(at: string | null): string {
  return at
    ? new Date(at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })
    : "an unknown date";
}

function candidateKey(candidate: OfferAnswerCandidateView): string {
  return candidate.kind === "linked_communication"
    ? `sent:${candidate.sequenceId}:${candidate.occurrenceId}`
    : `draft:${candidate.executionId}`;
}

function candidateLabel(candidate: OfferAnswerCandidateView): string {
  const when = day(candidate.at);
  const offer = `${candidate.summary}${candidate.current ? " (the current offer)" : ""}`;
  return candidate.kind === "linked_communication"
    ? `Sent ${when}: ${offer}`
    : `Gmail draft prepared ${when}, sent from Gmail: ${offer}`;
}

/**
 * The tenant decision's offer: what it answers, its coverage now, and the choice to record.
 * `eventId` is the work record's current tenant answer; a read of another answer shows nothing.
 */
export function TenantOfferAnswer({
  outcome,
  eventId,
  answers,
  canEdit,
  pending,
  onRecord,
}: Readonly<{
  outcome: string;
  eventId: string | null;
  answers: OfferAnswersRead;
  canEdit: boolean;
  pending: boolean;
  onRecord: (offer: OfferAnswerInput) => void;
}>) {
  const id = useId();
  const [choice, setChoice] = useState("");
  const [reference, setReference] = useState("");
  const view = answers.view;
  if (!TENANT_DECISIONS.has(outcome) || (!view && !answers.failed)) return null;
  const recorded =
    view?.tenant && view.tenant.eventId === eventId && view.tenant.outcome === outcome
      ? view.tenant
      : null;
  const chosen =
    view?.candidates.find((candidate) => candidateKey(candidate) === choice) ?? null;
  const input: OfferAnswerInput | null =
    choice === "unattributed"
      ? { kind: "unattributed" }
      : chosen?.kind === "linked_communication"
        ? {
            kind: "linked_communication",
            sequenceId: chosen.sequenceId!,
            occurrenceId: chosen.occurrenceId!,
          }
        : chosen?.kind === "external_offer" && reference.trim().length >= 3
          ? {
              kind: "external_offer",
              executionId: chosen.executionId!,
              reference: reference.trim(),
            }
          : null;
  return (
    <div
      className="ui-stack-tight"
      data-offer-answer-coverage={recorded?.coverage ?? "unread"}
      data-renewal-offer-answer="tenant"
    >
      {answers.failed ? (
        <p role="alert">
          The offers this answer could respond to could not be read. Reload to review
          them.
        </p>
      ) : null}
      {recorded ? (
        <p data-offer-answer-line="tenant" role="note">
          {recorded.line}
        </p>
      ) : null}
      {recorded?.answered ? (
        <p className="muted" data-offer-answer-answered>
          Answers the offer: {recorded.answered}.
        </p>
      ) : null}
      {canEdit && view ? (
        <>
          <Field
            htmlFor={`${id}-offer`}
            label="Which offer does this answer respond to?"
            hint="Choose the offer the tenant received: a confirmed send, or a Gmail draft you verified was sent."
          >
            <select
              disabled={pending}
              id={`${id}-offer`}
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Choose the offer</option>
              {view.candidates.map((candidate) => (
                <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                  {candidateLabel(candidate)}
                </option>
              ))}
              <option value="unattributed">
                Not one exact offer (record the answer as it is)
              </option>
            </select>
          </Field>
          {chosen?.kind === "external_offer" ? (
            <Field
              htmlFor={`${id}-reference`}
              label="Where you verified it was sent"
              hint="For example, the Gmail Sent folder entry and its date."
            >
              <input
                disabled={pending}
                id={`${id}-reference`}
                maxLength={300}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="ui-row">
            <Button
              disabled={pending || !input}
              onClick={() => {
                if (input) onRecord(input);
              }}
              size="compact"
              variant="secondary"
            >
              Record the offer this answers
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The owner approval's choice to cover the reviewed offer's exact charges, and its coverage. */
export function OwnerOfferApproval({
  answers,
  checked,
  disabled,
  onChange,
}: Readonly<{
  answers: OfferAnswersRead;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}>) {
  const id = useId();
  const current = answers.view?.current;
  if (!current?.charged) return null;
  return (
    <div className="ui-stack-tight" data-renewal-offer-answer="owner-choice">
      <Field
        htmlFor={`${id}-offer`}
        label="The owner approved these exact offer charges"
        hint={`${current.summary}. Choose this only when the owner approved these charges as listed.`}
      >
        <input
          checked={checked}
          disabled={disabled}
          id={`${id}-offer`}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
      </Field>
    </div>
  );
}

/**
 * The recorded owner approval's coverage of the current offer's charges. `eventId` is the work
 * record's current owner answer; a read of another answer shows nothing.
 */
export function OwnerOfferCoverageLine({
  answers,
  eventId,
}: Readonly<{ answers: Pick<OfferAnswersRead, "view">; eventId: string | null }>) {
  const owner = answers.view?.owner;
  if (!owner || owner.eventId !== eventId) return null;
  return (
    <p data-offer-answer-coverage={owner.coverage} data-offer-answer-line="owner">
      {owner.line}
    </p>
  );
}

// S233 R-S233-1/R-S233-2: what actually happened to each renewal message, in one vocabulary.
// Each outgoing attempt reads "Accepted by Gmail", "Failed delivery", "Not confirmed, checking" or
// "Not sent: …"; each incoming message reads "Reply received", "Automatic response" or, for a
// delivery report no single attempt can be tied to, "Failed delivery, attempt not identified".
// Nothing here says delivered or read: Gmail can show neither. Pure and client-safe.

import type {
  CommunicationInboundEvidence,
  CommunicationOccurrence,
  CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import type { GmailMessageView } from "@/lib/gmail-runtime/types";

const ATTEMPT_RFC_ID = /^<pmi-([a-f0-9]{64})@pmikcmetro\.com>$/;

/** The occurrence id an app-sent RFC Message-ID names, or null for any other id. */
export function attemptOccurrenceIdOf(rfcMessageId: string): string | null {
  return ATTEMPT_RFC_ID.exec(rfcMessageId.trim())?.[1] ?? null;
}

/**
 * R-S233-2: the one sent attempt a delivery report refers to. Its In-Reply-To names it first; then
 * exactly one attempt id quoted in the report or in its References; then the only attempt in the
 * same thread. Two candidates at any step, or none, mean the attempt is not identified.
 */
export function correlateBounceAttempt(
  message: Pick<GmailMessageView, "threadId" | "inReplyTo" | "references" | "bodyText">,
  attempts: ReadonlyArray<{ threadId: string; rfcMessageId: string }>,
): string | null {
  const only = (matches: ReadonlyArray<{ rfcMessageId: string }>) =>
    matches.length === 1 ? attemptOccurrenceIdOf(matches[0].rfcMessageId) : null;
  const replied = attempts.filter(
    (attempt) => attempt.rfcMessageId === message.inReplyTo?.trim(),
  );
  if (replied.length) return only(replied);
  const quoted = attempts.filter((attempt) =>
    message.bodyText.includes(attempt.rfcMessageId),
  );
  if (quoted.length) return only(quoted);
  const referenced = attempts.filter((attempt) =>
    message.references.includes(attempt.rfcMessageId),
  );
  if (referenced.length) return only(referenced);
  return only(attempts.filter((attempt) => attempt.threadId === message.threadId));
}

export interface CommunicationEvidenceEntry {
  readonly key: string;
  readonly direction: "outgoing" | "incoming";
  readonly label: string;
  readonly atMs: number;
}

const NOT_SENT_REASONS: Record<NonNullable<CommunicationOccurrence["reason"]>, string> = {
  paused_before_dispatch: "it was paused before it went out",
  provider_refusal: "Gmail refused it",
  provider_unknown: "Gmail gave no clear answer",
};

/** Lease, renewal cycle and audience, named once for every message of the communication. */
export function communicationEvidenceHeading(
  sequence: Pick<CommunicationSequence, "context" | "noticeCycleId">,
): string {
  const audience =
    sequence.context.purpose === "renewal_owner"
      ? "Owner message"
      : sequence.context.purpose === "renewal_tenant"
        ? "Tenant message"
        : "Message";
  const cycle = sequence.noticeCycleId
    ? `renewal cycle ${sequence.noticeCycleId.slice(0, 8)}`
    : "renewal cycle not recorded";
  return `${audience} · Lease ${sequence.context.entityId} · ${cycle}`;
}

/**
 * R-S233-1: one entry per attempt and per incoming message, oldest first. A correlated delivery
 * report turns its attempt into "Failed delivery"; it is never listed twice.
 */
export function describeCommunicationEvidence(input: {
  sequence: Pick<CommunicationSequence, "inbound">;
  occurrences: readonly CommunicationOccurrence[];
  formatTimestamp: (atMs: number) => string;
}): CommunicationEvidenceEntry[] {
  const inbound: readonly CommunicationInboundEvidence[] = input.sequence.inbound ?? [];
  const attemptIds = new Set(input.occurrences.map((occurrence) => occurrence.id));
  const bounceFor = (occurrenceId: string) =>
    inbound.find(
      (entry) => entry.kind === "bounce" && entry.attemptOccurrenceId === occurrenceId,
    );
  const at = input.formatTimestamp;
  const entries: CommunicationEvidenceEntry[] = input.occurrences.map((occurrence) => {
    const bounce = occurrence.state === "sent" ? bounceFor(occurrence.id) : undefined;
    const sentAtMs =
      occurrence.sentAtMs ?? occurrence.settledAtMs ?? occurrence.claimedAtMs;
    const label = bounce
      ? `Failed delivery ${at(bounce.receivedAtMs)}`
      : occurrence.state === "sent"
        ? `Accepted by Gmail ${at(sentAtMs)}`
        : occurrence.state === "refused"
          ? `Not sent: ${occurrence.reason ? NOT_SENT_REASONS[occurrence.reason] : "the send was refused"}`
          : "Not confirmed, checking";
    return {
      key: `attempt:${occurrence.id}`,
      direction: "outgoing",
      label: `${occurrence.index === 0 ? "Initial message" : `Follow-up ${occurrence.index}`}: ${label}`,
      atMs: bounce?.receivedAtMs ?? sentAtMs,
    };
  });
  for (const entry of inbound) {
    if (
      entry.kind === "bounce" &&
      entry.attemptOccurrenceId &&
      attemptIds.has(entry.attemptOccurrenceId)
    )
      continue;
    entries.push({
      key: `incoming:${entry.id}`,
      direction: "incoming",
      label:
        entry.kind === "human"
          ? `Reply received ${at(entry.receivedAtMs)}`
          : entry.kind === "auto_reply"
            ? `Automatic response ${at(entry.receivedAtMs)}`
            : entry.kind === "bounce"
              ? `Failed delivery, attempt not identified ${at(entry.receivedAtMs)}`
              : `Message from an address not on this conversation ${at(entry.receivedAtMs)}`,
      atMs: entry.receivedAtMs,
    });
  }
  return entries.sort((left, right) => left.atMs - right.atMs);
}

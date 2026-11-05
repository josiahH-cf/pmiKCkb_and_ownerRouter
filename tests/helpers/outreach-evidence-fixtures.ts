// S248 synthetic evidence: renewal messages linked to a lease, as the app's own records hold them.
// Every id, address and time is invented.

import type {
  LeaseOutreachEvidenceInput,
  LinkedRenewalMessageEvidence,
  OutreachAudience,
  StoredOutreachRecord,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

export const EVIDENCE_CYCLE = "7d2e3f40-5162-4c73-9d84-9e0f1a2b3c4d";
export const OTHER_CYCLE = "8e3f4051-6273-4d84-8e95-af0b1c2d3e4f";
/** Accepted by Gmail: 10:00 Central on November 4, 2026. */
export const SENT_AT_MS = Date.parse("2026-11-04T16:00:00.000Z");
export const REPLY_AT_MS = Date.parse("2026-11-05T15:30:00.000Z");
export const SENDER = "fixture-staff@pmikcmetro.com";

let counter = 0;
const id = (prefix: string) => `${prefix}-${(counter += 1).toString().padStart(4, "0")}`;

export function message(
  overrides: Partial<LinkedRenewalMessageEvidence> & {
    readonly audience?: OutreachAudience;
    readonly acceptedAtMs?: number | null;
    readonly replyAtMs?: number | null;
    readonly bounceAtMs?: number | null;
    readonly occurrenceId?: string;
  } = {},
): LinkedRenewalMessageEvidence {
  const occurrenceId = overrides.occurrenceId ?? `${"a".repeat(60)}${(counter += 1).toString(16).padStart(4, "0")}`;
  const acceptedAtMs =
    overrides.acceptedAtMs === undefined ? SENT_AT_MS : overrides.acceptedAtMs;
  return {
    sequenceId: overrides.sequenceId ?? id("sequence"),
    audience: overrides.audience ?? "owner",
    cycleId: overrides.cycleId === undefined ? EVIDENCE_CYCLE : overrides.cycleId,
    createdAtMs: overrides.createdAtMs ?? SENT_AT_MS - 60_000,
    scheduledForMs: overrides.scheduledForMs ?? null,
    unconfirmed: overrides.unconfirmed ?? false,
    accepted:
      overrides.accepted ??
      (acceptedAtMs === null
        ? []
        : [{ occurrenceId, sentAtMs: acceptedAtMs, senderEmail: SENDER }]),
    replies:
      overrides.replies ??
      (overrides.replyAtMs ? [{ id: id("reply"), receivedAtMs: overrides.replyAtMs }] : []),
    failedDeliveries:
      overrides.failedDeliveries ??
      (overrides.bounceAtMs
        ? [{ id: id("bounce"), receivedAtMs: overrides.bounceAtMs, occurrenceId }]
        : []),
  };
}

export function evidenceInput(
  messages: readonly LinkedRenewalMessageEvidence[],
  extra: Partial<LeaseOutreachEvidenceInput> = {},
): LeaseOutreachEvidenceInput {
  return { readable: true, messages, records: [], drafts: [], ...extra };
}

export function correctedRecord(
  leaseId: string,
  from: LinkedRenewalMessageEvidence,
  reason = "This message went to the wrong lease.",
): StoredOutreachRecord {
  const first = from.accepted[0]!;
  return {
    occurrenceId: first.occurrenceId,
    sequenceId: from.sequenceId,
    leaseId,
    cycleId: from.cycleId!,
    audience: from.audience,
    sentAtMs: first.sentAtMs,
    senderEmail: first.senderEmail,
    correction: { reason, byUid: "synthetic-operator", atMs: SENT_AT_MS + 3_600_000 },
  };
}

/** A work record on the evidence cycle, with each action applied at the given time. */
export function recordedState(
  leaseId: string,
  actions: readonly { action: RenewalWorkspaceAction; atIso: string }[] = [],
  cycleId = EVIDENCE_CYCLE,
): RenewalWorkspaceState {
  let state = emptyRenewalWorkspace(leaseId, cycleId, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  for (const [index, { action, atIso }] of actions.entries())
    state = planRenewalWorkspaceAction(state, action, {
      actorUid: "synthetic-operator",
      recordedAt: atIso,
      eventId: `${leaseId}-event-${index}`,
    });
  return state;
}

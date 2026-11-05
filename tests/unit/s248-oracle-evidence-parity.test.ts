import { describe, expect, it } from "vitest";

import { SYNTHETIC_APPROVAL } from "@/tests/helpers/owner-approval";
import { linkedRenewalMessageEvidence } from "@/lib/firestore/renewal-outreach-records";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import {
  outreachFill,
  projectOutreachEvidence,
  type StoredOutreachRecord,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  manualRenewalSummary,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { projectIndependentStaffLaneManualRenewal } from "@/lib/production-assurance/manual-renewal-projection";
import { projectIndependentOutreachFill } from "@/lib/production-assurance/outreach-evidence-projection";
import {
  INDEPENDENT_EVIDENCE_STAGE_CONTRACT_MARKER,
  INDEPENDENT_ONE_STATUS_CONTRACT_MARKER,
  countIndependentContractMarkerMismatches,
  independentContractReadsEvidence,
} from "@/lib/production-assurance/renewal-source-projection";
import { recordedState } from "@/tests/helpers/outreach-evidence-fixtures";

// S248 release reconciliation (ARCH-S248-3): the app's desk projection and the oracle's
// independent projection derive the same compared facts for every evidence state. The app reads
// the communications through its store mapping and its pure evidence projection; the oracle reads
// the same raw documents with its own copy of the rule. Each case is compared on the facts the
// desk row renders under the evidence-stage marker: the suggested next activity
// (data-manual-next) and who has the move on a response step (data-waiting-party and the status).

const LEASE = "9105";
const CYCLE = "6a7b8c9d-0e1f-4a2b-8c3d-4e5f60718293";
const OTHER_CYCLE = "6a7b8c9d-0e1f-4a2b-8c3d-4e5f60719999";
const SENT = Date.parse("2026-11-04T16:00:00.000Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

let counter = 0;
function occurrence() {
  counter += 1;
  return counter.toString(16).padStart(64, "c");
}

interface SequenceOptions {
  readonly audience?: "owner" | "tenant";
  readonly cycleId?: string | null;
  readonly leaseId?: string;
  readonly sentAt?: readonly number[];
  readonly replyAt?: readonly number[];
  readonly bounceOn?: "first" | "none";
  readonly scheduled?: boolean;
  readonly unconfirmed?: boolean;
  readonly purged?: boolean;
}

/** A raw communication document, as the store holds it, with no message content. */
function sequence(options: SequenceOptions = {}): CommunicationSequence & {
  purged?: boolean;
} {
  const ids = (options.sentAt ?? [SENT]).map(() => occurrence());
  const threads = (options.sentAt ?? [SENT]).map((sentAtMs, index) => ({
    senderEmail: "fixture-staff@pmikcmetro.com",
    threadId: "thread-1",
    messageId: `message-${index}`,
    rfcMessageId: `<pmi-${ids[index]}@pmikcmetro.com>`,
    sentAtMs,
  }));
  const inbound = [
    ...(options.replyAt ?? []).map((receivedAtMs, index) => ({
      id: `mailbox:reply-${index}`,
      senderEmail: "fixture-staff@pmikcmetro.com",
      threadId: "thread-1",
      messageId: `reply-${index}`,
      kind: "human" as const,
      receivedAtMs,
    })),
    ...(options.bounceOn === "first" && ids[0]
      ? [
          {
            id: "mailbox:bounce",
            senderEmail: "fixture-staff@pmikcmetro.com",
            threadId: "thread-1",
            messageId: "bounce",
            kind: "bounce" as const,
            receivedAtMs: SENT + HOUR,
            attemptOccurrenceId: ids[0],
          },
        ]
      : []),
  ];
  return {
    id: `sequence-${counter}`,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: options.leaseId ?? LEASE,
      purpose: options.audience === "tenant" ? "renewal_tenant" : "renewal_owner",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: [],
    },
    initial: {
      subject: "Sample",
      paragraphs: [[{ text: "Synthetic" }]],
      attachmentIds: [],
    },
    followUp: null,
    schemaVersion: "workflow-communication-sequence/v1",
    workflowLabel: "Sample lease",
    version: 3,
    responsibleUid: "synthetic-operator",
    senderEmail: "fixture-staff@pmikcmetro.com",
    state: options.unconfirmed
      ? "needs_reconciliation"
      : options.scheduled
        ? "active"
        : "completed",
    createdAtMs: SENT - HOUR,
    updatedAtMs: SENT,
    createdByUid: "synthetic-operator",
    authorization: {
      revision: 1,
      approvedByUid: "synthetic-operator",
      senderEmail: "fixture-staff@pmikcmetro.com",
      approvedAtMs: SENT - HOUR,
      payloadHash: "b".repeat(64),
      materialSourceHash: "a".repeat(64),
      to: ["owner@example.invalid"],
      cc: [],
      sourceRefs: [],
      initial: {
        subject: "Sample",
        plainText: "Synthetic",
        htmlBody: "<p>Synthetic</p>",
        attachments: [],
      },
      followUp: null,
      schedule: options.scheduled
        ? ({ timeZone: "America/Chicago" } as unknown as NonNullable<
            CommunicationSequence["authorization"]
          >["schedule"])
        : null,
    },
    nextDueAtMs: options.scheduled ? SENT + 24 * HOUR : null,
    confirmedCount: options.scheduled || options.unconfirmed ? 0 : threads.length,
    lastSentAtMs: null,
    pause: null,
    unresolvedOccurrenceId: options.unconfirmed ? occurrence() : null,
    linkedThreads: [],
    threads: options.scheduled || options.unconfirmed ? [] : threads,
    observedMessageIds: [],
    inbound,
    noticeCycleId: options.cycleId === undefined ? CYCLE : options.cycleId,
    observation: null,
    lastOperation: { id: "operation-1", hash: "c".repeat(64) },
    ...(options.purged ? { purged: true } : {}),
  };
}

function correction(of: CommunicationSequence, audience: "owner" | "tenant") {
  const thread = of.threads[0]!;
  const occurrenceId = /<pmi-([0-9a-f]{64})@/.exec(thread.rfcMessageId)![1]!;
  return {
    schemaVersion: "renewal-outreach-record/v1",
    origin: "app_send",
    occurrenceId,
    sequenceId: of.id,
    leaseId: LEASE,
    cycleId: CYCLE,
    audience,
    sentAtMs: thread.sentAtMs,
    senderEmail: thread.senderEmail,
    correction: {
      reason: "Synthetic test message.",
      byUid: "synthetic-operator",
      atMs: SENT + HOUR,
    },
  };
}

const outreach = (
  outcome: "done" | "waiting" | "not_started",
): RenewalWorkspaceAction => ({
  kind: "activity",
  activity: "owner_outreach",
  outcome,
});
const tenantOffer = (outcome: "done" | "waiting"): RenewalWorkspaceAction => ({
  kind: "activity",
  activity: "tenant_offer",
  outcome,
});
const ownerAnswer = (
  outcome: "approved_terms" | "no_response" | "revision_requested",
): RenewalWorkspaceAction =>
  outcome === "approved_terms"
    ? { kind: "owner_response", outcome, approval: SYNTHETIC_APPROVAL }
    : { kind: "owner_response", outcome };
const tenantAnswer = (
  outcome: "awaiting_response" | "accepted" | "needs_verification",
): RenewalWorkspaceAction => ({ kind: "tenant_response", outcome });

interface Case {
  readonly name: string;
  readonly actions: readonly { action: RenewalWorkspaceAction; atMs: number }[];
  readonly sequences: readonly (CommunicationSequence & { purged?: boolean })[];
  readonly corrections?: (sequences: readonly CommunicationSequence[]) => unknown[];
}

const APPROVED_AT = SENT - 2 * HOUR;
const approved = [{ action: ownerAnswer("approved_terms"), atMs: APPROVED_AT }];

const CASES: readonly Case[] = [
  { name: "no record, no message", actions: [], sequences: [] },
  { name: "accepted owner message", actions: [], sequences: [sequence()] },
  {
    name: "owner reply after the message",
    actions: [],
    sequences: [sequence({ replyAt: [SENT + 5 * HOUR] })],
  },
  {
    name: "owner reply before the message does not count",
    actions: [],
    sequences: [sequence({ replyAt: [SENT - 5 * HOUR] })],
  },
  {
    name: "delivery failure",
    actions: [],
    sequences: [sequence({ bounceOn: "first" })],
  },
  { name: "scheduled", actions: [], sequences: [sequence({ scheduled: true })] },
  { name: "not confirmed", actions: [], sequences: [sequence({ unconfirmed: true })] },
  { name: "another cycle", actions: [], sequences: [sequence({ cycleId: OTHER_CYCLE })] },
  { name: "no cycle", actions: [], sequences: [sequence({ cycleId: null })] },
  { name: "another lease", actions: [], sequences: [sequence({ leaseId: "9104" })] },
  { name: "retired communication", actions: [], sequences: [sequence({ purged: true })] },
  {
    name: "removed by staff",
    actions: [],
    sequences: [sequence()],
    corrections: (sequences) => [correction(sequences[0]!, "owner")],
  },
  {
    name: "removed first message, a later one counts",
    actions: [],
    sequences: [sequence(), sequence({ sentAt: [SENT + 3 * HOUR] })],
    corrections: (sequences) => [correction(sequences[0]!, "owner")],
  },
  {
    name: "staff recorded outreach waiting before the send",
    actions: [{ action: outreach("waiting"), atMs: SENT - HOUR }],
    sequences: [sequence()],
  },
  {
    name: "staff recorded outreach waiting after the send (a check)",
    actions: [{ action: outreach("waiting"), atMs: SENT + HOUR }],
    sequences: [sequence()],
  },
  {
    name: "staff recorded outreach done (agreeing)",
    actions: [{ action: outreach("done"), atMs: SENT + HOUR }],
    sequences: [sequence()],
  },
  {
    name: "no response recorded before the owner reply",
    actions: [
      { action: outreach("done"), atMs: SENT },
      { action: ownerAnswer("no_response"), atMs: SENT + HOUR },
    ],
    sequences: [sequence({ replyAt: [SENT + 5 * HOUR] })],
  },
  {
    name: "no response recorded after the owner reply",
    actions: [
      { action: outreach("done"), atMs: SENT },
      { action: ownerAnswer("no_response"), atMs: SENT + 6 * HOUR },
    ],
    sequences: [sequence({ replyAt: [SENT + 5 * HOUR] })],
  },
  {
    name: "revision requested with an owner reply",
    actions: [
      { action: outreach("done"), atMs: SENT },
      { action: ownerAnswer("revision_requested"), atMs: SENT + HOUR },
    ],
    sequences: [sequence({ replyAt: [SENT + 5 * HOUR] })],
  },
  {
    name: "approved, tenant offer accepted after the terms",
    actions: [{ action: outreach("done"), atMs: APPROVED_AT - HOUR }, ...approved],
    sequences: [sequence({ audience: "tenant" })],
  },
  {
    name: "approved, tenant offer sent before the terms",
    actions: [
      { action: outreach("done"), atMs: SENT - 4 * HOUR },
      {
        action: ownerAnswer("approved_terms"),
        atMs: SENT + HOUR,
      },
    ],
    sequences: [sequence({ audience: "tenant" })],
  },
  {
    name: "approved, tenant replied",
    actions: [{ action: outreach("done"), atMs: APPROVED_AT - HOUR }, ...approved],
    sequences: [sequence({ audience: "tenant", replyAt: [SENT + 2 * HOUR] })],
  },
  {
    name: "approved, tenant awaiting response recorded before the reply",
    actions: [
      { action: outreach("done"), atMs: APPROVED_AT - HOUR },
      ...approved,
      { action: tenantOffer("done"), atMs: SENT },
      { action: tenantAnswer("awaiting_response"), atMs: SENT + HOUR },
    ],
    sequences: [sequence({ audience: "tenant", replyAt: [SENT + 2 * HOUR] })],
  },
  {
    name: "approved, tenant answer needs verification with a reply",
    actions: [
      { action: outreach("done"), atMs: APPROVED_AT - HOUR },
      ...approved,
      { action: tenantOffer("done"), atMs: SENT },
      { action: tenantAnswer("needs_verification"), atMs: SENT + HOUR },
    ],
    sequences: [sequence({ audience: "tenant", replyAt: [SENT + 2 * HOUR] })],
  },
  {
    name: "approved, tenant offer bounced",
    actions: [{ action: outreach("done"), atMs: APPROVED_AT - HOUR }, ...approved],
    sequences: [sequence({ audience: "tenant", bounceOn: "first" })],
  },
  {
    name: "owner and tenant messages together",
    actions: [...approved],
    sequences: [
      sequence({ sentAt: [APPROVED_AT - 3 * HOUR] }),
      sequence({ audience: "tenant", sentAt: [SENT] }),
    ],
  },
];

function stateFor(entry: Case): RenewalWorkspaceState {
  return recordedState(
    LEASE,
    entry.actions.map(({ action, atMs }) => ({ action, atIso: iso(atMs) })),
    CYCLE,
  );
}

function appFacts(state: RenewalWorkspaceState, entry: Case, records: unknown[]) {
  // The app: the store's own mapping, then the pure evidence projection and the staff lane.
  const messages = entry.sequences
    .filter((value) => !value.purged)
    .flatMap((value) => {
      const evidence = linkedRenewalMessageEvidence(value);
      return evidence && value.context.entityId === LEASE ? [evidence] : [];
    });
  const evidence = projectOutreachEvidence(
    {
      readable: true,
      messages,
      records: records as StoredOutreachRecord[],
      drafts: [],
    },
    state.cycleId,
  );
  const summary = manualRenewalSummary(state, {
    evidence: outreachFill(state, evidence),
  });
  return {
    nextActivity: summary.nextActivity,
    awaited:
      summary.nextActivity === "owner_response" ||
      summary.nextActivity === "tenant_response"
        ? summary.waitingParty === "staff"
          ? null
          : summary.waitingParty
        : null,
  };
}

function oracleFacts(state: RenewalWorkspaceState, entry: Case, records: unknown[]) {
  const independent = projectIndependentStaffLaneManualRenewal(
    state,
    projectIndependentOutreachFill(
      state,
      entry.sequences.filter(
        (value) => value.context.entityId === LEASE,
      ) as unknown as Record<string, unknown>[],
      records as Record<string, unknown>[],
    ),
  );
  return {
    nextActivity: independent.nextActivity,
    awaited: independent.awaitedParty ?? null,
  };
}

describe("S248 the oracle derives the desk's evidence-stage facts independently", () => {
  for (const entry of CASES)
    it(entry.name, () => {
      const state = stateFor(entry);
      const records = entry.corrections?.(entry.sequences) ?? [];
      expect(oracleFacts(state, entry, records)).toEqual(appFacts(state, entry, records));
    });

  it("covers every evidence state the app distinguishes", () => {
    const states = new Set<string>();
    for (const entry of CASES) {
      const state = stateFor(entry);
      const messages = entry.sequences.flatMap((value) => {
        const evidence = linkedRenewalMessageEvidence(value);
        return evidence ? [evidence] : [];
      });
      const records = (entry.corrections?.(entry.sequences) ??
        []) as StoredOutreachRecord[];
      const evidence = projectOutreachEvidence(
        { readable: true, messages, records, drafts: [] },
        state.cycleId,
      );
      states.add(evidence.owner.state);
      states.add(evidence.tenant.state);
    }
    // A Gmail draft is not stored on the communication; it changes no compared fact.
    expect([...states].sort()).toEqual(
      [
        "accepted",
        "delivery_failed",
        "none",
        "replied",
        "scheduled",
        "unconfirmed",
      ].sort(),
    );
  });

  it("the evidence changes the compared facts only under the evidence-stage marker", () => {
    const entry = CASES.find((value) => value.name === "accepted owner message")!;
    const state = stateFor(entry);
    // Under S232's rules (no evidence) the owner outreach is still the next activity.
    expect(projectIndependentStaffLaneManualRenewal(state).nextActivity).toBe(
      "owner_outreach",
    );
    expect(oracleFacts(state, entry, []).nextActivity).toBe("owner_response");
    expect(
      independentContractReadsEvidence(INDEPENDENT_EVIDENCE_STAGE_CONTRACT_MARKER),
    ).toBe(true);
    expect(independentContractReadsEvidence(INDEPENDENT_ONE_STATUS_CONTRACT_MARKER)).toBe(
      false,
    );
    expect(
      independentContractReadsEvidence(null, INDEPENDENT_EVIDENCE_STAGE_CONTRACT_MARKER),
    ).toBe(true);
    // A page mixing the S232 and S248 markers never reconciles.
    expect(
      countIndependentContractMarkerMismatches([
        INDEPENDENT_EVIDENCE_STAGE_CONTRACT_MARKER,
        INDEPENDENT_ONE_STATUS_CONTRACT_MARKER,
        INDEPENDENT_EVIDENCE_STAGE_CONTRACT_MARKER,
      ]),
    ).toBe(1);
  });
});

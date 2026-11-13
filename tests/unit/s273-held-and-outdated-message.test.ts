// S273: a held or out-of-date renewal message on the lease, and its one update, at the pure
// projection: the stored communication's unsent work (scheduled, held, unconfirmed) for both
// audiences, the out-of-date comparison against the lease's current values (no worker run), the
// step and desk words with both values, the carried send time of the update, the read-only list of
// earlier attempts and the stored scheduled time. Synthetic values only: every id, address, time
// and amount is invented; nothing here sends, saves, claims or looks anything up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { linkedRenewalMessageEvidence } from "@/lib/firestore/renewal-outreach-records";
import { sequenceHash } from "@/lib/gmail-hub/sequence-store";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import {
  audienceEvidenceSentence,
  projectOutreachEvidence,
  type LeaseOutreachEvidenceInput,
} from "@/lib/lease-renewal/outreach-evidence";
import { projectRenewalBatchRow } from "@/lib/lease-renewal/renewal-batch-row";
import {
  projectRenewalStage,
  summarizeRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import {
  UNSENT_MESSAGE_WORDS,
  appendUnsentHistory,
  carriedSendTime,
  communicationWordingRevision,
  earlierAttemptsOf,
  earlierAttemptLine,
  keepSettledMessageBases,
  projectUnsentMessage,
  scheduledStoredLine,
  unsentAttemptOnResume,
  unsentAttemptOnSave,
  unsentAttemptOnSettle,
  unsentOutOfDate,
  unsentUpdateRefusal,
  unsentWorkEvidence,
  type LeaseMessageBasis,
} from "@/lib/lease-renewal/unsent-message";
import {
  EVIDENCE_CYCLE,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

const LEASE = "9273";
const LABEL = "101 Sample Pl";
const SENDER = "synthetic-s273-staff@pmikcmetro.com";
/** Reviewed 11/12/2026, 11:00 AM CST. */
const APPROVED_AT = Date.parse("2026-11-12T17:00:00.000Z");
/** Scheduled for 11/13/2026, 9:00 AM CST. */
const DUE_AT = Date.parse("2026-11-13T15:00:00.000Z");
/** Held on 11/12/2026, 12:21 PM CST. */
const HELD_AT = Date.parse("2026-11-12T18:21:00.000Z");
/** The page read, before the due time. */
const NOW = Date.parse("2026-11-12T19:00:00.000Z");

type Audience = "owner" | "tenant";

/**
 * The content basis a renewal target reports: `changed` is the tenant offer's renewal end date, or
 * the owner message's rent to recommend.
 */
function contentValues(audience: Audience, changed?: string): ReviewedInput[] {
  const common = [
    reviewedInput("address", "Property address", LABEL),
    reviewedInput("template", "Approved template", "Synthetic template", "t".repeat(64)),
  ];
  return audience === "tenant"
    ? [
        ...common,
        reviewedInput("renewalRent", "Renewal rent", "$1,425.00"),
        reviewedInput("renewalStart", "Renewal start date", "01/01/2027"),
        reviewedInput("renewalEnd", "Renewal end date", changed ?? "12/31/2027"),
      ]
    : [
        ...common,
        reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
        reviewedInput("rentToRecommend", "Rent to recommend", changed ?? "$1,425.00"),
      ];
}

const wording = plainCommunicationMessage(
  "Lease renewal for 101 Sample Pl",
  "Rent $1,425.00 from 01/01/2027 through 12/31/2027.",
);

/** A stored-shape initial renewal message with an authorization and no accepted send. */
function stored(
  overrides: Partial<CommunicationSequence> = {},
  audience: Audience = "tenant",
): CommunicationSequence {
  const values = contentValues(audience);
  return {
    schemaVersion: "workflow-communication-sequence/v1",
    id: `4b1c1f7e-0000-4000-8000-00000000927${audience === "owner" ? "1" : "2"}`,
    workflowLabel: LABEL,
    version: 4,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: LEASE,
      purpose: audience === "owner" ? "renewal_owner" : "renewal_tenant",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: [`rentvine:lease:${LEASE}`],
    },
    initial: wording,
    followUp: null,
    responsibleUid: "synthetic-s273-staff",
    senderEmail: SENDER,
    state: "active",
    createdAtMs: APPROVED_AT - 60_000,
    updatedAtMs: APPROVED_AT,
    createdByUid: "synthetic-s273-staff",
    authorization: {
      revision: 1,
      approvedByUid: "synthetic-s273-staff",
      senderEmail: SENDER,
      approvedAtMs: APPROVED_AT,
      payloadHash: "b".repeat(64),
      materialSourceHash: "a".repeat(64),
      to: [`${audience}@example.invalid`],
      cc: [],
      sourceRefs: [`rentvine:lease:${LEASE}`],
      initial: {
        subject: wording.subject,
        plainText: "Rent $1,425.00 from 01/01/2027 through 12/31/2027.",
        htmlBody: "<p>Rent $1,425.00 from 01/01/2027 through 12/31/2027.</p>",
        attachments: [],
      },
      followUp: null,
      schedule: {
        firstDate: "2026-11-13",
        time: "09:00",
        timeZone: "America/Chicago",
        everyDays: null,
        endDate: null,
        sendLimit: 1,
      },
      signatureSetup: {
        uid: "synthetic-s273-staff",
        email: SENDER,
        revision: 1,
        choice: "filled",
        contentHash: "c".repeat(64),
      },
    },
    nextDueAtMs: DUE_AT,
    confirmedCount: 0,
    lastSentAtMs: null,
    pause: null,
    unresolvedOccurrenceId: null,
    linkedThreads: [],
    threads: [],
    observedMessageIds: [],
    noticeCycleId: EVIDENCE_CYCLE,
    authorizedContentBasis: {
      revision: 1,
      digest: sequenceHash(values),
      values,
      draftHash: "d".repeat(64),
    },
    observation: null,
    lastOperation: { id: "operation", hash: "hash" },
    ...overrides,
  } as CommunicationSequence;
}

const held = (
  cause: NonNullable<CommunicationSequence["pause"]>["cause"],
  extra: Partial<CommunicationSequence> = {},
  audience: Audience = "tenant",
) =>
  stored(
    {
      state: "paused",
      nextDueAtMs: null,
      pause: {
        cause,
        byUid: "communication-worker",
        atMs: HELD_AT,
        evidenceIds: [],
      },
      ...extra,
    },
    audience,
  );

/** The lease's current read: the content basis for these values, settled unless said otherwise. */
function current(
  audience: Audience,
  changed?: string,
  extra: Partial<LeaseMessageBasis> = {},
): LeaseMessageBasis {
  const values = contentValues(audience, changed);
  return {
    settled: true,
    digest: sequenceHash(values),
    legacyDigest: sequenceHash({ legacy: values }),
    values,
    wordingRevision: communicationWordingRevision(wording),
    wordingSavedAtMs: null,
    ...extra,
  };
}

function evidenceFor(
  sequences: readonly CommunicationSequence[],
  currentMessage?: LeaseOutreachEvidenceInput["currentMessage"],
): LeaseOutreachEvidenceInput {
  return {
    readable: true,
    messages: sequences.flatMap((sequence) => {
      const evidence = linkedRenewalMessageEvidence(sequence);
      return evidence ? [evidence] : [];
    }),
    records: [],
    drafts: [],
    ...(currentMessage ? { currentMessage } : {}),
  };
}

function context(outreach: LeaseOutreachEvidenceInput): RenewalStageContext {
  return {
    leaseId: LEASE,
    staffRecordUnavailable: false,
    standingAgreement: null,
    housingAssistance: null,
    numbers: { verified: true, openDifferences: 0 },
    term: { monthToMonth: false, reviewNeeded: false },
    moveOutInitiated: false,
    sourceRenewal: null,
    verification: null,
    handStatus: null,
    outreach,
    cycleDateIso: "2026-12-31",
  };
}

const stageFor = (outreach: LeaseOutreachEvidenceInput) =>
  projectRenewalStage(recordedState(LEASE), context(outreach));

describe("S273 ARCH-S273-1 / R-S273-1: one projection of unsent authorized work", () => {
  it("ARCH-S273-1: a message paused before any accepted send projects as held with its cause and time (it read as nothing before)", () => {
    const evidence = linkedRenewalMessageEvidence(held("staff"))!;
    expect(evidence.unsent).toMatchObject({
      state: "held",
      atMs: HELD_AT,
      cause: "staff",
      authorizationRevision: 1,
    });
    const projected = projectOutreachEvidence(
      evidenceFor([held("staff")]),
      EVIDENCE_CYCLE,
    );
    expect(projected.tenant.unsent).toMatchObject({ state: "held", kind: "held_other" });
  });

  it("AC-S273-1: a scheduled, a held and an unconfirmed message each project for both audiences", () => {
    for (const audience of ["owner", "tenant"] as const) {
      const cases: [CommunicationSequence, string][] = [
        [stored({}, audience), "scheduled"],
        [held("changed_source", {}, audience), "held"],
        [
          stored(
            { state: "needs_reconciliation", unresolvedOccurrenceId: "e".repeat(64) },
            audience,
          ),
          "unconfirmed",
        ],
      ];
      for (const [sequence, state] of cases) {
        const projected = projectOutreachEvidence(
          evidenceFor([sequence]),
          EVIDENCE_CYCLE,
        );
        expect(projected[audience].unsent?.state, `${audience} ${state}`).toBe(state);
      }
    }
  });

  it("R-S273-1: a reply, a sent message and a draft hold no unsent work", () => {
    expect(
      unsentWorkEvidence(
        stored({ authorization: null, state: "draft", nextDueAtMs: null }),
      ),
    ).toBeNull();
    expect(
      unsentWorkEvidence(stored({ confirmedCount: 1, state: "completed" })),
    ).toBeNull();
    const reply = stored({
      context: {
        ...stored().context,
        actionKey: "gmail.thread.reply",
        replyTo: {
          sequenceId: "4b1c1f7e-0000-4000-8000-000000000001",
          threadId: "thread-1",
          senderEmail: SENDER,
          parentId: "parent-1",
        },
      },
    });
    expect(unsentWorkEvidence(reply)).toBeNull();
  });

  it("R-S273-1: the evidence carries no message body and no recipient address", () => {
    const evidence = JSON.stringify(linkedRenewalMessageEvidence(held("changed_source")));
    expect(evidence).not.toMatch(/example\.invalid/);
    expect(evidence).not.toMatch(/Rent \$1,425\.00 from/);
  });
});

describe("S273 ARCH-S273-2 / R-S273-2: out of date on the next read, before any worker run", () => {
  it("ARCH-S273-2 / AC-S273-2: a changed content value marks the scheduled message out of date with both values", () => {
    const unsent = unsentWorkEvidence(stored())!;
    expect(unsentOutOfDate(unsent, current("tenant"))).toEqual({ kind: "current" });
    const verdict = unsentOutOfDate(unsent, current("tenant", "06/30/2027"));
    expect(verdict).toMatchObject({
      kind: "out_of_date",
      wording: false,
      changes: [
        {
          key: "renewalEnd",
          label: "Renewal end date",
          previous: "12/31/2027",
          current: "06/30/2027",
        },
      ],
    });
  });

  it("AC-S273-2: the lease's own wording saved after the authorization, with a new revision, is a difference", () => {
    const unsent = unsentWorkEvidence(stored())!;
    const edited = current("tenant", "12/31/2027", {
      wordingRevision: "ffffffffffff",
      wordingSavedAtMs: APPROVED_AT + 60_000,
    });
    expect(unsentOutOfDate(unsent, edited)).toMatchObject({
      kind: "out_of_date",
      wording: true,
      changes: [],
    });
    // Saved before the authorization, or saved with the same revision: no difference.
    expect(
      unsentOutOfDate(unsent, { ...edited, wordingSavedAtMs: APPROVED_AT - 60_000 }),
    ).toEqual({ kind: "current" });
    expect(
      unsentOutOfDate(
        unsent,
        current("tenant", "12/31/2027", { wordingSavedAtMs: APPROVED_AT + 60_000 }),
      ),
    ).toEqual({ kind: "current" });
  });

  it("AC-S273-2: wording edited on the communication itself is not a difference", () => {
    // Communications re-authorized new wording; the lease's own record was not saved after it.
    const edited = stored({
      authorization: {
        ...stored().authorization!,
        initial: {
          ...stored().authorization!.initial,
          plainText: "Edited in Communications.",
        },
      },
    });
    expect(unsentOutOfDate(unsentWorkEvidence(edited)!, current("tenant"))).toEqual({
      kind: "current",
    });
  });

  it("AC-S273-2: an unsettled read keeps the prior state, so the cue does not flicker", () => {
    const unsent = unsentWorkEvidence(stored())!;
    const changed = current("tenant", "06/30/2027");
    const unsettled = { ...current("tenant"), settled: false };
    expect(unsentOutOfDate(unsent, unsettled)).toEqual({ kind: "unknown" });
    const kept = keepSettledMessageBases({ tenant: changed }, { tenant: unsettled });
    expect(kept?.tenant).toBe(changed);
    expect(unsentOutOfDate(unsent, kept?.tenant).kind).toBe("out_of_date");
    // A settled read replaces the prior one.
    expect(
      keepSettledMessageBases({ tenant: changed }, { tenant: current("tenant") })?.tenant
        ?.settled,
    ).toBe(true);
  });

  it("ARCH-S273-2: the comparison is pure and runs on read: the module writes, fetches and claims nothing", () => {
    const source = readFileSync(
      join(process.cwd(), "lib", "lease-renewal", "unsent-message.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\bfetch\(|getAdminFirestore|runTransaction|\.set\(|\.create\(/,
    );
  });
});

describe("S273 R-S273-3: the step and the desk row say what is true and offer one repair", () => {
  it("BEH-S273-2: a changed end date shows on the step and the desk row with both values before any tick", () => {
    const outreach = evidenceFor([stored()], {
      tenant: current("tenant", "06/30/2027"),
    });
    const stage = stageFor(outreach);
    const step = stage.steps.find((item) => item.id === "offer-tenant")!;
    expect(step.detail).toBe(
      "Scheduled offer is out of date. Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027 on the lease.",
    );
    expect(step.primary?.label).toBe("Review the updated offer");
    expect(step.unsent?.secondary?.label).toBe("Cancel the scheduled offer");
    expect(stage.currentStepId).toBe("offer-tenant");
    const summary = summarizeRenewalStage(stage);
    expect(summary.messageCue).toEqual({
      kind: "out_of_date",
      label: "Scheduled message out of date",
      stepId: "offer-tenant",
    });
    expect(summary.triage?.rank).toBe(0);
  });

  it("BEH-S273-3: held for changed facts reads with its time, the values and the same two actions", () => {
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(held("changed_source"))!,
      current("tenant", "06/30/2027"),
    );
    expect(view.kind).toBe("held_changed");
    expect(view.line).toBe(
      "Offer held on 11/12/2026, 12:21 PM CST because the lease changed.",
    );
    expect(view.differences).toEqual([
      "Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027 on the lease.",
    ]);
    expect(view.primary?.label).toBe("Review the updated offer");
    expect(view.secondary?.label).toBe("Cancel the scheduled offer");
    expect(view.cue?.label).toBe(UNSENT_MESSAGE_WORDS.cueHeld);
  });

  it("R-S273-3: a hold with stored changed inputs and no current read still names the values", () => {
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(
        held("changed_source", {
          pause: {
            cause: "changed_source",
            byUid: "communication-worker",
            atMs: HELD_AT,
            evidenceIds: [],
            changedInputs: [
              {
                key: "renewalEnd",
                label: "Renewal end date",
                previous: "12/31/2027",
                current: "06/30/2027",
              },
            ],
          },
        }),
      )!,
      null,
    );
    expect(view.differences).toEqual([
      "Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027 on the lease.",
    ]);
  });

  it("R-S273-3: held for another cause shows the existing cause label and its existing recovery", () => {
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(held("staff"))!,
      current("tenant"),
    );
    expect(view.kind).toBe("held_other");
    expect(view.line).toBe("Offer held on 11/12/2026, 12:21 PM CST: Paused by staff.");
    expect(view.primary).toEqual({
      label: "Review this tenant communication",
      action: "open_communication",
    });
    expect(view.secondary).toBeNull();
  });

  it("R-S273-3 (preservation): a scheduled and current message keeps its line and its review action", () => {
    const stage = stageFor(evidenceFor([stored()], { tenant: current("tenant") }));
    const step = stage.steps.find((item) => item.id === "offer-tenant")!;
    expect(step.unsent).toBeUndefined();
    expect(step.scheduled).toBe(true);
    expect(step.primary?.label).toBe("Review the scheduled tenant message");
    expect(step.detail).toBe("Tenant message scheduled for 11/13/2026, 9:00 AM CST");
    expect(summarizeRenewalStage(stage).messageCue).toBeUndefined();
  });

  it("R-S273-3: an older authorization with no stored values shows the state without the values", () => {
    const older = held("changed_source", { authorizedContentBasis: undefined });
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(older)!,
      current("tenant", "06/30/2027"),
    );
    expect(view.kind).toBe("held_changed");
    expect(view.differences).toEqual([]);
  });

  it("BEH-S273-5: the owner step says owner message where the tenant step says offer", () => {
    const outOfDate = projectUnsentMessage(
      { sequenceId: "s", audience: "owner" },
      unsentWorkEvidence(stored({}, "owner"))!,
      current("owner", "$1,500.00"),
    );
    expect(outOfDate.line).toBe("Scheduled owner message is out of date.");
    expect(outOfDate.differences).toEqual([
      "Rent to recommend: $1,425.00 in the scheduled message, $1,500.00 on the lease.",
    ]);
    expect(outOfDate.primary?.label).toBe("Review the updated owner message");
    expect(outOfDate.secondary?.label).toBe("Cancel the scheduled owner message");
    const heldOwner = projectUnsentMessage(
      { sequenceId: "s", audience: "owner" },
      unsentWorkEvidence(held("changed_source", {}, "owner"))!,
      null,
    );
    expect(heldOwner.line).toBe(
      "Owner message held on 11/12/2026, 12:21 PM CST because the lease changed.",
    );
    const stage = stageFor(
      evidenceFor([held("changed_source", {}, "owner")], {
        owner: current("owner", "$1,500.00"),
      }),
    );
    expect(stage.steps.find((item) => item.id === "ask-owner")?.primary?.label).toBe(
      "Review the updated owner message",
    );
    expect(summarizeRenewalStage(stage).messageCue).toMatchObject({
      label: "Message held",
      stepId: "ask-owner",
    });
  });

  it("R-S273-3: the desk row shows one cue linking to the step", () => {
    const stage = summarizeRenewalStage(
      stageFor(evidenceFor([held("changed_source")], { tenant: current("tenant") })),
    );
    const deskRow = getRenewalDeskView().items[0]!;
    const row = projectRenewalBatchRow(
      { ...deskRow, renewalStage: stage },
      { sourceReadAtIso: null, todayIso: "2026-11-12" },
    );
    expect(row.messageCue).toEqual({
      kind: "held",
      label: "Message held",
      stepId: "offer-tenant",
    });
    // A row whose stage holds no such message shows no cue.
    expect(
      projectRenewalBatchRow(
        {
          ...deskRow,
          renewalStage: summarizeRenewalStage(
            stageFor(evidenceFor([stored()], { tenant: current("tenant") })),
          ),
        },
        { sourceReadAtIso: null, todayIso: "2026-11-12" },
      ).messageCue,
    ).toBeUndefined();
  });
});

describe("S273 R-S273-4: the update carries the earlier time and refuses a communication it cannot update", () => {
  it("BEH-S273-4: the earlier date and time are carried while still in the future", () => {
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(stored())!,
      current("tenant", "06/30/2027"),
    );
    expect(carriedSendTime(view, NOW)).toEqual({ date: "2026-11-13", time: "09:00" });
    // A held message keeps its authorized wall time.
    const heldView = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(held("changed_source"))!,
      null,
    );
    expect(carriedSendTime(heldView, NOW)).toEqual({ date: "2026-11-13", time: "09:00" });
  });

  it("AC-S273-4: a past time starts empty so Send now is offered", () => {
    const view = projectUnsentMessage(
      { sequenceId: "s", audience: "tenant" },
      unsentWorkEvidence(held("changed_source"))!,
      null,
    );
    expect(carriedSendTime(view, DUE_AT + 60_000)).toBeNull();
  });

  it("R-S273-4: only the responsible sender updates this lease's unsent message", () => {
    const expected = {
      sequenceId: stored().id,
      leaseId: LEASE,
      audience: "tenant" as const,
      senderEmail: SENDER,
    };
    expect(unsentUpdateRefusal(held("changed_source"), expected)).toBeNull();
    expect(
      unsentUpdateRefusal(held("changed_source"), {
        ...expected,
        senderEmail: "another-s273-staff@pmikcmetro.com",
      }),
    ).toBe(UNSENT_MESSAGE_WORDS.notResponsible);
    expect(
      unsentUpdateRefusal(stored({ state: "cancelled", nextDueAtMs: null }), expected),
    ).toBe(UNSENT_MESSAGE_WORDS.changedElsewhere);
    expect(
      unsentUpdateRefusal(stored({ unresolvedOccurrenceId: "e".repeat(64) }), expected),
    ).toBe(UNSENT_MESSAGE_WORDS.checkSendFirst);
    expect(unsentUpdateRefusal(stored({}, "owner"), expected)).toBe(
      UNSENT_MESSAGE_WORDS.changedElsewhere,
    );
  });
});

describe("S273 R-S273-5: earlier attempts stay reachable, read only", () => {
  it("AC-S273-3: held then updated, scheduled then updated, unconfirmed then resolved and cancelled each read with time, state and cause", () => {
    const heldThenUpdated = unsentAttemptOnSave(
      held("changed_source"),
      HELD_AT + 600_000,
    )!;
    expect(heldThenUpdated).toMatchObject({
      state: "held",
      cause: "changed_source",
      atMs: HELD_AT,
      resolution: "updated",
    });
    expect(earlierAttemptLine(heldThenUpdated)).toBe(
      "Held on 11/12/2026, 12:21 PM CST (The lease or recipient facts changed), then updated on 11/12/2026, 12:31 PM CST.",
    );
    const scheduledThenUpdated = unsentAttemptOnSave(stored(), HELD_AT)!;
    expect(earlierAttemptLine(scheduledThenUpdated)).toBe(
      "Scheduled for 11/13/2026, 9:00 AM CST, then updated on 11/12/2026, 12:21 PM CST.",
    );
    const resolved = unsentAttemptOnSettle(
      stored({ state: "needs_reconciliation", unresolvedOccurrenceId: "e".repeat(64) }),
      { index: 0, state: "ambiguous", claimedAtMs: DUE_AT },
      DUE_AT + 600_000,
    )!;
    expect(earlierAttemptLine(resolved)).toBe(
      "Not confirmed from 11/13/2026, 9:00 AM CST (The send could not be confirmed; checking), then resolved on 11/13/2026, 9:10 AM CST.",
    );
    const cancelled = earlierAttemptsOf(
      stored({
        state: "cancelled",
        nextDueAtMs: null,
        pause: { cause: "staff", byUid: "staff", atMs: HELD_AT, evidenceIds: [] },
      }),
    );
    expect(cancelled.map(earlierAttemptLine)).toEqual([
      "Cancelled on 11/12/2026, 12:21 PM CST before it was sent.",
    ]);
  });

  it("R-S273-5: a second save after the same authorization adds nothing; a Resume adds held then resumed", () => {
    expect(
      unsentAttemptOnSave(held("edited", { wordingSavedAfterRevision: 1 }), NOW),
    ).toBeNull();
    expect(unsentAttemptOnResume(held("staff"), NOW)).toMatchObject({
      state: "held",
      cause: "staff",
      resolution: "resumed",
    });
    // An ordinary send's claim settling never reads as unconfirmed.
    expect(
      unsentAttemptOnSettle(
        stored(),
        { index: 0, state: "claimed", claimedAtMs: DUE_AT },
        DUE_AT,
      ),
    ).toBeNull();
  });

  it("R-S273-5: the cycle's earlier attempts are listed for the audience, oldest first", () => {
    const entry = unsentAttemptOnSave(held("changed_source"), HELD_AT + 600_000)!;
    const updated = stored({
      unsentHistory: appendUnsentHistory(undefined, entry),
      authorization: { ...stored().authorization!, revision: 2 },
    });
    const cancelledEarlier = stored({
      id: "4b1c1f7e-0000-4000-8000-000000009279",
      createdAtMs: APPROVED_AT - 3_600_000,
      state: "cancelled",
      nextDueAtMs: null,
      pause: {
        cause: "staff",
        byUid: "staff",
        atMs: HELD_AT - 3_000_000,
        evidenceIds: [],
      },
    });
    const projected = projectOutreachEvidence(
      evidenceFor([cancelledEarlier, updated]),
      EVIDENCE_CYCLE,
    );
    expect(projected.tenant.earlierAttempts?.map((attempt) => attempt.line)).toEqual([
      "Cancelled on 11/12/2026, 11:31 AM CST before it was sent.",
      "Held on 11/12/2026, 12:21 PM CST (The lease or recipient facts changed), then updated on 11/12/2026, 12:31 PM CST.",
    ]);
    expect(projected.owner.earlierAttempts).toBeUndefined();
  });
});

describe("S273 R-S273-7 / BEH-S273-1: the stored scheduled time", () => {
  it("R-S273-7: the confirmation shows the stored time in the settled date and time format", () => {
    expect(scheduledStoredLine(DUE_AT)).toBe(
      "Scheduled for 11/13/2026, 9:00 AM CST. It counts as sent once Gmail accepts it.",
    );
    expect(scheduledStoredLine(null)).toBe(
      "Scheduled. It counts as sent once Gmail accepts it.",
    );
  });

  it("BEH-S273-1 / AC-S273-1: after a reload the step reads the same stored date and time", () => {
    const projected = projectOutreachEvidence(evidenceFor([stored()]), EVIDENCE_CYCLE);
    expect(projected.tenant.scheduledForMs).toBe(DUE_AT);
    expect(audienceEvidenceSentence(projected.tenant)).toBe(
      "Tenant message scheduled for 11/13/2026, 9:00 AM CST",
    );
  });

  it("R-S273-7: the client-only scheduled line is gone from the lease review", () => {
    const source = readFileSync(
      join(process.cwd(), "components", "lease-renewal", "RenewalPreparedMessage.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/at \$\{scheduleTime\} Central/);
    expect(source).toContain("scheduledStoredLine(result.sequence.nextDueAtMs)");
  });
});

describe("S273 AC-S273-6: no step sends, cancels or resumes without the staff confirmation it shows", () => {
  it("AC-S273-6: reading the evidence and the stage changes nothing on the stored communication", () => {
    const sequence = held("changed_source");
    const before = JSON.stringify(sequence);
    stageFor(evidenceFor([sequence], { tenant: current("tenant", "06/30/2027") }));
    expect(JSON.stringify(sequence)).toBe(before);
  });

  it("AC-S273-6: the lease review sends, schedules and cancels only from its confirmation handlers", () => {
    const source = readFileSync(
      join(process.cwd(), "components", "lease-renewal", "RenewalPreparedMessage.tsx"),
      "utf8",
    );
    const cancel = source.slice(source.indexOf("async function cancelUnsent()"));
    expect(cancel.slice(0, cancel.indexOf("\n  }\n"))).toContain('action: "cancel"');
    // The cancel request is made only from the cancel confirmation's own handler.
    expect(source).toMatch(/onConfirm=\{\(\) => void cancelUnsent\(\)\}/);
    // The update's review saves nothing: its save is made inside confirm().
    const review = source.slice(source.indexOf("const prepareUpdateReview = async"));
    expect(review.slice(0, review.indexOf("\n  };\n"))).not.toMatch(/action: "save"/);
  });
});

import { describe, expect, it } from "vitest";

import {
  OWNER_DECISION_AFTER_REPLY_LABEL,
  manualRenewalSummary,
} from "@/lib/lease-renewal/workspace-state";
import {
  DERIVED_OUTREACH_ORIGIN_LABEL,
  audienceEvidenceSentence,
  derivedOutreachAttribution,
  outreachFill,
  outreachScopeFor,
  projectOutreachEvidence,
} from "@/lib/lease-renewal/outreach-evidence";
import { staffLaneGuidance } from "@/lib/lease-renewal/desk-guidance";
import { projectRenewalStage } from "@/lib/lease-renewal/renewal-stage";
import {
  EVIDENCE_CYCLE,
  OTHER_CYCLE,
  REPLY_AT_MS,
  SENT_AT_MS,
  correctedRecord,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S248: the evidence the app already holds moves the lease. Synthetic records only.

const LEASE = "4801";
const lane = (
  state: ReturnType<typeof recordedState>,
  input: ReturnType<typeof evidenceInput>,
) =>
  manualRenewalSummary(state, {
    evidence: outreachFill(state, projectOutreachEvidence(input, state.cycleId)),
  });

describe("S248 ARCH-S248-1: the stage reads the cycle's message evidence as pure inputs", () => {
  it("an accepted owner message with no staff entry waits on the owner response (AC-S248-1)", () => {
    const state = recordedState(LEASE);
    const before = manualRenewalSummary(state);
    // Fail-first: without the evidence the staff record alone names Owner outreach.
    expect(before.nextActivity).toBe("owner_outreach");
    const summary = lane(state, evidenceInput([message()]));
    expect(summary.nextActivity).toBe("owner_response");
    expect(summary.waitingParty).toBe("owner");
    expect(staffLaneGuidance(summary).status).toBe("waiting");
  });

  it("an unconfirmed, a scheduled or a bounced message never counts as outreach (BEH-S248-3)", () => {
    const state = recordedState(LEASE);
    for (const [name, entry, sentence] of [
      [
        "unconfirmed",
        message({ acceptedAtMs: null, unconfirmed: true }),
        "The send was not confirmed",
      ],
      [
        "scheduled",
        message({ acceptedAtMs: null, scheduledForMs: SENT_AT_MS + 86_400_000 }),
        "Owner message scheduled for 11/05/2026, 10:00 AM CST",
      ],
      ["bounced", message({ bounceAtMs: SENT_AT_MS + 60_000 }), "Delivery failed"],
    ] as const) {
      const input = evidenceInput([entry]);
      const evidence = projectOutreachEvidence(input, EVIDENCE_CYCLE);
      expect(evidence.owner.derived, name).toBeNull();
      expect(audienceEvidenceSentence(evidence.owner), name).toBe(sentence);
      expect(lane(state, input).nextActivity, name).toBe("owner_outreach");
    }
  });

  it("an unsent Gmail draft reads its own state and records nothing (R-S248-6)", () => {
    const state = recordedState(LEASE);
    const input = evidenceInput([], {
      drafts: [{ audience: "owner", cycleId: EVIDENCE_CYCLE, createdAtMs: SENT_AT_MS }],
    });
    const evidence = projectOutreachEvidence(input, EVIDENCE_CYCLE);
    expect(evidence.owner.state).toBe("draft");
    expect(audienceEvidenceSentence(evidence.owner)).toBe(
      "Draft waiting in Gmail since 11/04/2026, 10:00 AM CST",
    );
    expect(lane(state, input).nextActivity).toBe("owner_outreach");
  });

  it("only a message for this lease's audience and current cycle counts (AC-S248-4)", () => {
    const state = recordedState(LEASE);
    for (const entry of [
      message({ cycleId: OTHER_CYCLE }),
      message({ cycleId: null }),
      message({ audience: "tenant" }),
    ])
      expect(lane(state, evidenceInput([entry])).nextActivity).toBe("owner_outreach");
  });

  it("an unreadable evidence read derives nothing", () => {
    const state = recordedState(LEASE);
    const evidence = projectOutreachEvidence(
      { readable: false, messages: [message()], records: [], drafts: [] },
      EVIDENCE_CYCLE,
    );
    expect(evidence.readable).toBe(false);
    expect(outreachFill(state, evidence).owner_outreach).toBeNull();
  });
});

describe("S248 BEH-S248-2: a reply hands the move to staff and chooses no outcome", () => {
  it("names the decision as the next step and leaves the owner response unset", () => {
    const state = recordedState(LEASE);
    const summary = lane(state, evidenceInput([message({ replyAtMs: REPLY_AT_MS })]));
    expect(summary.nextActivity).toBe("owner_response");
    expect(summary.waitingParty).toBe("staff");
    expect(summary.ownerReplied).toBe(true);
    expect(staffLaneGuidance(summary).action).toMatchObject({
      kind: "act",
      label: OWNER_DECISION_AFTER_REPLY_LABEL,
    });
    // AC-S248-3: nothing is preselected; the staff record holds no owner response.
    expect(state.ownerResponse).toBeNull();
    const evidence = projectOutreachEvidence(
      evidenceInput([message({ replyAtMs: REPLY_AT_MS })]),
      EVIDENCE_CYCLE,
    );
    expect(audienceEvidenceSentence(evidence.owner)).toBe("Owner replied 11/05/2026");
  });

  it("a staff answer recorded after the reply decides again", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "owner_response", outcome: "no_response" },
        atIso: new Date(REPLY_AT_MS + 60_000).toISOString(),
      },
    ]);
    const summary = lane(state, evidenceInput([message({ replyAtMs: REPLY_AT_MS })]));
    expect(summary.waitingParty).toBe("owner");
    expect(summary.ownerReplied).toBeUndefined();
  });
});

describe("S248 R-S248-8/R-S248-9 (extends S232 R-S232-4): nothing recorded, agreeing, disagreeing", () => {
  const evidence = projectOutreachEvidence(evidenceInput([message()]), EVIDENCE_CYCLE);

  it("nothing recorded: the evidence fills the step", () => {
    const fill = outreachFill(recordedState(LEASE), evidence);
    expect(fill.owner_outreach?.origin).toBe("app_send");
    expect(fill.checks).toEqual([]);
  });

  it("agreeing: a staff record of the same outreach is one fact", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: new Date(SENT_AT_MS + 120_000).toISOString(),
      },
    ]);
    const fill = outreachFill(state, evidence);
    expect(fill.owner_outreach).toBeNull();
    expect(fill.agreeing).toEqual(["owner_outreach"]);
    expect(fill.checks).toEqual([]);
  });

  it("disagreeing after the evidence time: Needs a check with both facts, neither wins", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "not_started" },
        atIso: new Date(SENT_AT_MS + 120_000).toISOString(),
      },
    ]);
    const fill = outreachFill(state, evidence);
    expect(fill.owner_outreach).toBeNull();
    expect(fill.checks).toHaveLength(1);
    expect(fill.checks[0]!.staffRecord).toContain("Owner outreach is not started");
    expect(fill.checks[0]!.appEvidence).toContain("accepted by Gmail");
    // The staff record stands for the step itself.
    expect(manualRenewalSummary(state, { evidence: fill }).nextActivity).toBe(
      "owner_outreach",
    );
  });

  it("a different staff record from before the evidence time is filled by the later evidence", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "waiting" },
        atIso: new Date(SENT_AT_MS - 3_600_000).toISOString(),
      },
    ]);
    const fill = outreachFill(state, evidence);
    expect(fill.owner_outreach).not.toBeNull();
    expect(fill.checks).toEqual([]);
  });
});

describe("S248 ARCH-S248-3 / BEH-S248-5: derived records carry their origin and are correctable", () => {
  it("a derived fact reads its origin, never recorded by staff or verified (AC-S248-3)", () => {
    const evidence = projectOutreachEvidence(evidenceInput([message()]), EVIDENCE_CYCLE);
    const words = derivedOutreachAttribution(evidence.owner.derived!);
    expect(words.startsWith(DERIVED_OUTREACH_ORIGIN_LABEL)).toBe(true);
    expect(words).not.toMatch(/recorded by staff|verified/i);
    // Rebuilt on read when the record write after the send did not land.
    expect(evidence.owner.derived!.stored).toBe(false);
  });

  it("This was not the renewal outreach removes the derived record, keeps it as history and reopens the step", () => {
    const sent = message();
    const state = recordedState(LEASE);
    const input = evidenceInput([sent], { records: [correctedRecord(LEASE, sent)] });
    const evidence = projectOutreachEvidence(input, EVIDENCE_CYCLE);
    expect(evidence.owner.derived).toBeNull();
    expect(evidence.owner.corrected).toHaveLength(1);
    expect(evidence.owner.corrected[0]!.reason).toBe(
      "This message went to the wrong lease.",
    );
    expect(lane(state, input).nextActivity).toBe("owner_outreach");
  });
});

describe("S248 tenant offer: the same rules for Tenant offer delivered", () => {
  it("an accepted tenant message after approval records the offer; one before the terms does not", () => {
    const approvedAt = new Date(SENT_AT_MS - 86_400_000).toISOString();
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: approvedAt,
      },
      {
        action: {
          kind: "owner_response",
          outcome: "approved_terms",
          approval: {
            party: { kind: "representative", name: "Sample Agent", capacity: "Manager" },
            channel: { kind: "conversation", participants: "Sample Agent and staff" },
            occurredAt: approvedAt,
          },
        },
        atIso: approvedAt,
      },
    ]);
    const after = lane(state, evidenceInput([message({ audience: "tenant" })]));
    expect(after.nextActivity).toBe("tenant_response");
    expect(after.waitingParty).toBe("tenant");
    const before = lane(
      state,
      evidenceInput([
        message({ audience: "tenant", acceptedAtMs: SENT_AT_MS - 2 * 86_400_000 }),
      ]),
    );
    expect(before.nextActivity).toBe("tenant_offer");
  });
});

describe("S248 AC-S248-4: a message sent before the lease had a work record", () => {
  const context = (outreach: ReturnType<typeof evidenceInput>) => ({
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
    lastContactAtIso: null,
    threadCheck: null,
    outreach,
  });

  it("moves a lease with no work record to the owner's response, and a reply to the team", () => {
    const sent = message({ cycleId: null });
    const waiting = projectRenewalStage(null, context(evidenceInput([sent])));
    expect(waiting.currentStepId).toBe("ask-owner");
    expect(waiting.stageLine).toMatch(/^Waiting on owner response since 11\/04\/2026/);
    const replied = projectRenewalStage(
      null,
      context(evidenceInput([message({ cycleId: null, replyAtMs: REPLY_AT_MS })])),
    );
    expect(replied.nextStep.label).toBe(OWNER_DECISION_AFTER_REPLY_LABEL);
    expect(replied.evidenceLine).toBe("Owner replied 11/05/2026");
    // Nothing at all: the lease reads as before.
    expect(projectRenewalStage(null, context(evidenceInput([]))).currentStepId).toBe(
      "compare-market",
    );
  });

  it("counts for the dated record established after it, never for one that began before", () => {
    const sent = message({ cycleId: null });
    const after = recordedState(LEASE, [
      {
        action: { kind: "owner_response", outcome: "no_response" },
        atIso: new Date(SENT_AT_MS + 3_600_000).toISOString(),
      },
    ]);
    expect(
      projectOutreachEvidence(evidenceInput([sent]), outreachScopeFor(after)).owner
        .derived,
    ).not.toBeNull();
    const before = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "not_started" },
        atIso: new Date(SENT_AT_MS - 3_600_000).toISOString(),
      },
    ]);
    expect(
      projectOutreachEvidence(evidenceInput([sent]), outreachScopeFor(before)).owner
        .derived,
    ).toBeNull();
    // A message that named another cycle never counts, whatever the record.
    expect(
      projectOutreachEvidence(
        evidenceInput([message({ cycleId: OTHER_CYCLE })]),
        outreachScopeFor(after),
      ).owner.derived,
    ).toBeNull();
    expect(after.cycleId).toBe(EVIDENCE_CYCLE);
  });
});

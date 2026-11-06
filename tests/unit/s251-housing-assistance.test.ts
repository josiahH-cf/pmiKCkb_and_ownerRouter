import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyRenewalCohort } from "@/lib/lease-renewal/cohort";
import { runKickoffPreparation } from "@/lib/lease-renewal/kickoff-preparation-service";
import { kickoffFactsFor, UNREAD_KICKOFF_SUPPORT } from "@/lib/lease-renewal/kickoff-facts";
import { renewalPathSteps } from "@/lib/lease-renewal/renewal-path";
import { renewalBatchRowTags } from "@/lib/lease-renewal/renewal-batch-row";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import { parseWorkingFieldValue } from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { SYNTHETIC_APPROVAL } from "@/tests/helpers/owner-approval";

// S251: Housing assistance recorded once on the lease, with its own renewal order. Synthetic
// leases and an invented program name only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const PROGRAM = "Example Housing Assistance Office";
const ASSISTED = { program: PROGRAM } as const;
const CYCLE = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
let event = 0;
const meta = () => ({
  actorUid: "synthetic-editor",
  recordedAt: "2026-11-06T15:00:00.000Z",
  eventId: `00000000-0000-4000-8000-${String(++event).padStart(12, "0")}`,
});
const fresh = () =>
  emptyRenewalWorkspace("9103", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
const apply = (state: RenewalWorkspaceState, ...actions: unknown[]) =>
  actions.reduce<RenewalWorkspaceState>(
    (current, action) =>
      planRenewalWorkspaceAction(current, action as RenewalWorkspaceAction, meta()),
    state,
  );
const lane = (state: RenewalWorkspaceState | null, assisted = true) =>
  (
    manualRenewalSummary as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof manualRenewalSummary>
  )(state, { housingAssistance: assisted ? ASSISTED : null });

const CONTEXT: RenewalStageContext = {
  leaseId: "9103",
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
  outreach: null,
};
const assistedContext: RenewalStageContext = { ...CONTEXT, housingAssistance: ASSISTED };

describe("S251 ARCH-S251-1: one optional fact on the lease-bound working record", () => {
  it("accepts No, or Yes with the program and an optional contact and notes", () => {
    expect(parseWorkingFieldValue("housing_assistance", { status: "no" })).toMatchObject({
      ok: true,
    });
    expect(
      parseWorkingFieldValue("housing_assistance", {
        status: "yes",
        program: PROGRAM,
        contact: "Sample caseworker, 555-0100",
        notes: "Renewal packet due thirty days before the lease end.",
      }),
    ).toMatchObject({ ok: true });
    // Yes names the program.
    expect(
      parseWorkingFieldValue("housing_assistance", { status: "yes", program: " " }),
    ).toMatchObject({ ok: false });
  });
});

describe("S251 ARCH-S251-2 / AC-S251-1: the assisted order", () => {
  it("leads with the program contact, then the owner's answer on renewing, then the rent choice", () => {
    expect(lane(null).nextActivity).toBe("program_contact");
    let state = fresh();
    expect(lane(state).nextActivity).toBe("program_contact");
    state = apply(state, {
      kind: "activity",
      activity: "program_contact",
      outcome: "done",
      reason: "The program needs the owner's renewal letter thirty days ahead.",
      occurredAt: "2026-11-05T15:00:00.000Z",
    });
    expect(lane(state).nextActivity).toBe("owner_outreach");
    state = apply(state, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Call with the owner",
    });
    expect(lane(state)).toMatchObject({
      nextActivity: "owner_response",
      waitingParty: "owner",
    });
    state = apply(state, {
      kind: "owner_response",
      outcome: "renew_tenant",
      source: "Sample Owner by phone",
      occurredAt: "2026-11-06T14:00:00.000Z",
    });
    // Renew is recorded: the rent choice is the team's move.
    expect(lane(state)).toMatchObject({
      nextActivity: "owner_response",
      waitingParty: "staff",
    });
    state = apply(state, { kind: "rent_choice", choice: "keep_current" });
    expect(lane(state).nextActivity).toBe("tenant_offer");
  });

  it("the stage names the steps in that order with the program's name, and a lease without the fact is unchanged", () => {
    const stage = projectRenewalStage(null, assistedContext);
    expect(stage.currentStepId).toBe("assisted-program-contact");
    expect(stage.nextStep.label).toBe(`Contact ${PROGRAM} about the renewal process`);
    expect(stage.steps.map((step) => step.label).slice(0, 4)).toEqual([
      "Check the numbers",
      `Contact ${PROGRAM} about the renewal process`,
      "Ask the owner whether to renew this tenant",
      "Rent for this renewal",
    ]);
    const standard = projectRenewalStage(null, CONTEXT);
    expect(standard.steps.map((step) => step.id)).toEqual([
      "check-numbers",
      "compare-market",
      "ask-owner",
      "offer-tenant",
      "documents",
      "finish-up",
      "complete",
    ]);
    expect(standard.currentStepId).toBe("compare-market");
  });

  it("after the program contact the owner's answer is next, and Do not renew moves the lease to the non-renewal handoff (BEH-S251-2)", () => {
    const contacted = apply(fresh(), {
      kind: "activity",
      activity: "program_contact",
      outcome: "done",
    });
    expect(projectRenewalStage(contacted, assistedContext).currentStepId).toBe(
      "assisted-owner-renewal-answer",
    );
    const declined = apply(contacted, {
      kind: "owner_response",
      outcome: "declined_non_renewal",
      source: "Sample Owner by email",
      occurredAt: "2026-11-06T14:00:00.000Z",
    });
    expect(lane(declined).nextActivity).toBe("non_renewal_handoff");
    const stage = projectRenewalStage(declined, assistedContext);
    expect(stage.currentStepId).toBe("non-renewal-handoff");
    const noAnswer = apply(contacted, {
      kind: "owner_response",
      outcome: "no_response",
      source: "Left a message",
    });
    expect(projectRenewalStage(noAnswer, assistedContext)).toMatchObject({
      currentStepId: "assisted-owner-renewal-answer",
      waiting: { party: "the owner" },
    });
  });
});

describe("S251 BEH-S251-3: Keep the current rent or Propose a change", () => {
  const renewed = () =>
    apply(
      fresh(),
      { kind: "activity", activity: "program_contact", outcome: "done" },
      { kind: "activity", activity: "owner_outreach", outcome: "done" },
      { kind: "owner_response", outcome: "renew_tenant", source: "Sample Owner" },
    );
  it("before a choice, the rent step is current and nothing is preselected", () => {
    const stage = projectRenewalStage(renewed(), assistedContext);
    expect(stage.currentStepId).toBe("assisted-rent");
    expect(stage.steps.find((step) => step.id === "assisted-rent")?.detail).toBeNull();
  });
  it("Keep leads to the tenant offer with the comparison and the owner's rent decision not part of the path", () => {
    const kept = apply(renewed(), { kind: "rent_choice", choice: "keep_current" });
    const stage = projectRenewalStage(kept, assistedContext);
    expect(stage.currentStepId).toBe("offer-tenant");
    for (const id of ["compare-market", "ask-owner"])
      expect(stage.steps.find((step) => step.id === id)).toMatchObject({
        state: "not_part",
        detail: "Not part of this lease's path",
      });
  });
  it("Propose brings in the prepared comparison, the recommendation and the owner's rent decision", () => {
    const proposed = apply(renewed(), { kind: "rent_choice", choice: "propose_change" });
    const stage = projectRenewalStage(proposed, assistedContext);
    expect(stage.currentStepId).toBe("compare-market");
    for (const id of ["compare-market", "ask-owner"])
      expect(stage.steps.find((step) => step.id === id)?.state).not.toBe("not_part");
    expect(
      renewalPathSteps({
        nonRenewal: null,
        monthToMonth: false,
        standingAgreement: null,
        housingAssistance: { program: PROGRAM, rentChoice: "propose_change" },
      })
        .filter((step) => step.applies)
        .map((step) => step.id),
    ).toContain("ask-owner");
  });
});

describe("S251 BEH-S251-7 / R-S251-8: out of order, and an approval of terms settles both", () => {
  it("an approval recorded first settles the renewing answer and the rent together", () => {
    const approved = apply(
      fresh(),
      { kind: "activity", activity: "program_contact", outcome: "done" },
      {
        kind: "owner_response",
        outcome: "approved_terms",
        approval: SYNTHETIC_APPROVAL,
      },
    );
    const stage = projectRenewalStage(approved, assistedContext);
    for (const id of ["assisted-owner-renewal-answer", "assisted-rent"])
      expect(stage.steps.find((step) => step.id === id)?.state, id).toBe("done");
    expect(lane(approved).nextActivity).toBe("tenant_offer");
  });
  it("any step can be worked out of order and every step keeps its primary action (AC-S251-2)", () => {
    const stage = projectRenewalStage(null, assistedContext);
    for (const step of stage.steps.filter(
      (entry) => entry.state !== "done" && entry.state !== "not_part",
    ))
      expect(step.primary, step.id).not.toBeNull();
  });
});

describe("S251 R-S251-9 / BEH-S251-5: the later follow-up follows the fact", () => {
  const accepted = () =>
    apply(
      fresh(),
      { kind: "activity", activity: "owner_outreach", outcome: "done" },
      { kind: "owner_response", outcome: "approved_terms", approval: SYNTHETIC_APPROVAL },
      { kind: "activity", activity: "tenant_offer", outcome: "done" },
      { kind: "tenant_response", outcome: "accepted" },
      ...[
        "information_form",
        "form_returned",
        "documents",
        "document_delivery",
        "signatures",
        "insurance",
        "rhino",
        "pet",
        "charges",
        "inspection",
        "filter",
        "utilities",
      ].map((activity) => ({ kind: "activity", activity, outcome: "done" })),
    );
  it("with No or not set the assisted-housing follow-up asks for nothing", () => {
    expect(lane(accepted(), false).nextActivity).toBe("complete");
    const stage = projectRenewalStage(accepted(), CONTEXT);
    expect(
      stage.finishUp.find((item) => item.key === "follow-up:assisted_housing"),
    ).toMatchObject({ detail: "Not part of this lease's path" });
  });
  it("with Yes it is part of the lease's path", () => {
    const state = apply(accepted(), {
      kind: "activity",
      activity: "program_contact",
      outcome: "done",
    });
    expect(lane(state).nextActivity).toBe("assisted_housing");
  });
});

describe("S251 ARCH-S251-3 / BEH-S251-6 / AC-S251-3: assistance wording is a suggestion only", () => {
  const classify = (fields: Record<string, unknown>) =>
    classifyRenewalCohort(
      // The program signal reads the first present key, as the RentVine export carries it.
      [{ leaseID: 9113, endDate: "2027-01-31", ...fields }],
      { windows: [{ startIso: "2026-11-01", endIso: "2027-03-31" }] },
    ).classifications[0]!;
  it("voucher, Section 8 and HAP wording keep the lease a target and show the suggestion", () => {
    for (const fields of [
      { tags: "Housing choice voucher" },
      { leaseType: "Section 8 Program" },
      { program: "HAP contract" },
    ]) {
      const lease = classify(fields);
      expect(lease.disposition, JSON.stringify(fields)).not.toBe("skip");
      expect(lease).toMatchObject({ housingAssistanceMention: true });
    }
  });
  it("program and PadSplit wording without assistance words keep Program lease", () => {
    for (const fields of [{ program: "PadSplit" }, { leaseType: "Rental program" }])
      expect(classify(fields)).toMatchObject({ disposition: "skip", reason: "program" });
  });
});

describe("S251 ARCH-S251-4 / BEH-S251-4 / AC-S251-4: no paid comparison before Propose a change", () => {
  const deps = (read: Record<string, unknown>) => {
    const lookup = vi.fn(async () => ({
      ok: true,
      confidence: "Likely",
      observationId: "obs-1",
    }));
    return {
      lookup,
      deps: {
        automaticStartEnabled: async () => true,
        readLease: async () => ({
          cycleDateIso: "2026-12-31",
          inWorkingBatch: true,
          workRecordCycleId: CYCLE,
          housingAssistance: ASSISTED,
          ...read,
        }),
        storedComparison: async () => false,
        allowanceReached: async () => false,
        claim: async () => ({ claimed: true, record: {} }),
        settle: async () => undefined,
        release: async () => undefined,
        lookup,
      } as never,
    };
  };
  const actor = {
    uid: "synthetic-editor",
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as never;
  it("an assisted lease is held back until Propose a change, then looked up once", async () => {
    const held = deps({});
    const result = await runKickoffPreparation(
      actor,
      { leaseId: "9103", trigger: "automatic", operationId: "op-1" },
      held.deps,
    );
    expect(result.status).toBe("held_back");
    expect(held.lookup).not.toHaveBeenCalled();
    const proposed = deps({ rentChangeProposed: true });
    const after = await runKickoffPreparation(
      actor,
      { leaseId: "9103", trigger: "automatic", operationId: "op-2" },
      proposed.deps,
    );
    expect(after.status).toBe("prepared");
    expect(proposed.lookup).toHaveBeenCalledTimes(1);
  });
  it("the desk's preparation projection holds the comparison back for the stored fact", () => {
    const facts = kickoffFactsFor({
      leaseId: "9103",
      cycleDateIso: "2026-12-31",
      contractualRent: 1600,
      leaseEndIso: "2026-12-31",
      workingCurrentRent: null,
      address: "300 Sample Street",
      dataCheck: null,
      manual: fresh(),
      working: null,
      sourceReadable: true,
      ownerRecipient: { state: "ready" },
      support: {
        ...UNREAD_KICKOFF_SUPPORT,
        observationsByLease: new Map(),
        allowanceReached: false,
      },
      housingAssistance: ASSISTED,
    });
    expect(facts.comparison.state).toBe("held_back");
    const proposed = kickoffFactsFor({
      leaseId: "9103",
      cycleDateIso: "2026-12-31",
      contractualRent: 1600,
      leaseEndIso: "2026-12-31",
      workingCurrentRent: null,
      address: "300 Sample Street",
      dataCheck: null,
      manual: apply(fresh(), { kind: "rent_choice", choice: "propose_change" }),
      working: null,
      sourceReadable: true,
      ownerRecipient: { state: "ready" },
      support: {
        ...UNREAD_KICKOFF_SUPPORT,
        observationsByLease: new Map(),
        allowanceReached: false,
      },
      housingAssistance: ASSISTED,
    });
    expect(proposed.comparison.state).toBe("none");
  });
});

describe("S251 R-S251-11 / AC-S251-5: the tag reads the stored fact; the fact changes nothing else", () => {
  it("the Housing assistance tag comes from Yes only", () => {
    const tags = (housingAssistance: unknown) =>
      renewalBatchRowTags({ renewalPricing: undefined, housingAssistance } as never, {
        needsCheck: false,
        checkDetail: null,
      }).map((tag) => tag.label);
    expect(tags({ status: "yes", program: PROGRAM })).toEqual(["Housing assistance"]);
    expect(tags({ status: "no" })).toEqual([]);
    expect(tags(undefined)).toEqual([]);
  });
  it("recording the program contact and the rent choice changes no rent, charge or source update", () => {
    const before = fresh();
    const after = apply(
      before,
      { kind: "activity", activity: "program_contact", outcome: "done" },
      { kind: "rent_choice", choice: "keep_current" },
    );
    expect(after.sourceUpdates).toEqual(before.sourceUpdates);
    expect(after.ownerResponse).toBeNull();
    expect(after.termsRevision).toBe(before.termsRevision);
  });
});

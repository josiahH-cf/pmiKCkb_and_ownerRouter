import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { classifyRenewalCohort, type DateWindow } from "@/lib/lease-renewal/cohort";
import { buildDeskLeaseGuidance } from "@/lib/lease-renewal/desk-guidance";
import { projectGuidedPriority } from "@/lib/lease-renewal/guided-priority";
import {
  runKickoffPreparation,
  type KickoffLeaseRead,
  type KickoffPreparationDeps,
} from "@/lib/lease-renewal/kickoff-preparation-service";
import {
  OFF_CYCLE_REVIEW_TARGET,
  OFF_CYCLE_REVIEW_WORDS,
  currentOffCycleReview,
  endDateReviewsByLease,
  offCycleDecisionLine,
  offCycleEndDateSentence,
  offCycleHoldLine,
  offCyclePreparationHold,
  offCycleReadinessItem,
  offCycleReviewHistory,
  offCycleStageBlocker,
  type OffCycleEndDateReview,
} from "@/lib/lease-renewal/off-cycle-review";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { projectRenewalStage } from "@/lib/lease-renewal/renewal-stage";
import {
  emptyRenewalWorkspace,
  manualActionSheetIntent,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S282 "Record the review of an off-cycle lease end date": the pure record, its effect on the
// cohort, the stage blocker, the readiness row, the Guided priority, the desk reason and the month's
// preparation run. Fail-first on the starting state: lib/lease-renewal/off-cycle-review.ts did not
// exist, the cohort read no review (an "Include" left the lease on review), the stage blocker
// pointed at the rent and charges region, and the readiness list never read the blocker.
// Values are synthetic; nothing here reads a source or writes a record.

const LEASE = "9106";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const OFF_CYCLE_END = "2027-01-14";
const OTHER_OFF_CYCLE_END = "2027-01-20";
const MONTH_END = "2027-01-31";
const JANUARY: DateWindow[] = [{ startIso: "2027-01-01", endIso: "2027-01-31" }];
const STAFF = "editor1@pmikcmetro.com";
const RECORDED_AT = "2026-11-13T16:00:00.000Z";

function lease(endDate: string): RawLease {
  return { leaseID: LEASE, endDate, leaseType: "Fixed Term" };
}

function review(
  decision: "include" | "hold",
  endDateIso = OFF_CYCLE_END,
  overrides: Partial<OffCycleEndDateReview> = {},
): OffCycleEndDateReview {
  return {
    eventId: `00000000-0000-4000-8000-${decision === "include" ? "000000000001" : "000000000002"}`,
    cycleId: CYCLE_ID,
    endDateIso,
    decision,
    reason: decision === "include" ? "Owner confirmed the date" : "Waiting on the owner",
    actorUid: "editor-1",
    actorLabel: STAFF,
    recordedAt: RECORDED_AT,
    ...overrides,
  };
}

function classify(endDate: string, reviews: readonly OffCycleEndDateReview[] = []) {
  return classifyRenewalCohort([lease(endDate)], {
    windows: JANUARY,
    endDateReviews: reviews.length ? new Map([[LEASE, reviews]]) : undefined,
  });
}

function emptyState(): RenewalWorkspaceState {
  return emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: OFF_CYCLE_END,
    source: "RentVine lease end",
  });
}

function record(
  state: RenewalWorkspaceState,
  action: RenewalWorkspaceAction,
  n: number,
): RenewalWorkspaceState {
  return planRenewalWorkspaceAction(state, action, {
    actorUid: "editor-1",
    actorLabel: STAFF,
    recordedAt: RECORDED_AT,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  });
}

/** The off-cycle lease as a desk row the stage context reads (the sample lease, re-dated). */
function offCycleRow() {
  const base = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const summary = {
    ...base.summary,
    id: LEASE,
    endDateIso: OFF_CYCLE_END,
    disposition: "review" as const,
    reason: "off_cycle_date" as const,
    reasonLabel: "Off-cycle end date",
    offCycleEndDate: {
      endDateIso: OFF_CYCLE_END,
      state: "needs_review" as const,
      line: OFF_CYCLE_REVIEW_WORDS.needsReview,
    },
  };
  const guidance = buildDeskLeaseGuidance({
    summary,
    process: null,
    dataCheck: null,
    rentvineCurrentRent: 1180,
    rentDecision: null,
    currencyState: "fresh",
    readComplete: true,
  });
  return { ...summary, guidance };
}

describe("ARCH-S282-1: one app-owned review per lease, cycle and end date value, read by the cohort", () => {
  it("ARCH-S282-1: an off-cycle end date in the window starts on review, needing review", () => {
    const cohort = classify(OFF_CYCLE_END);
    const [entry] = cohort.classifications;
    expect(entry).toMatchObject({
      disposition: "review",
      reason: "off_cycle_date",
      offCycle: { endDateIso: OFF_CYCLE_END, state: "needs_review", review: null },
    });
    expect(cohort.summary.byReason.off_cycle_date).toBe(1);
  });

  it("ARCH-S282-1: Include for the exact end date clears the hold and the lease joins the actionable cohort", () => {
    const cohort = classify(OFF_CYCLE_END, [review("include")]);
    const [entry] = cohort.classifications;
    expect(entry.disposition).toBe("actionable");
    expect(entry.reason).toBe("actionable");
    expect(entry.offCycle).toMatchObject({ state: "included" });
    expect(cohort.actionable).toHaveLength(1);
    expect(cohort.summary.byReason.off_cycle_date).toBe(0);
  });

  it("ARCH-S282-1: the reviews come from each lease's current work record", () => {
    const state = record(
      emptyState(),
      {
        kind: "end_date_review",
        decision: "include",
        endDateIso: OFF_CYCLE_END,
        reason: "Owner confirmed the date",
      },
      1,
    );
    const byLease = endDateReviewsByLease(new Map([[LEASE, state]]));
    expect(byLease?.get(LEASE)).toHaveLength(1);
    expect(endDateReviewsByLease(undefined)).toBeUndefined();
    expect(
      classifyRenewalCohort([lease(OFF_CYCLE_END)], {
        windows: JANUARY,
        endDateReviews: byLease,
      }).classifications[0]?.disposition,
    ).toBe("actionable");
  });
});

describe("BEH-S282-3 / AC-S282-2: Keep on hold keeps the block, counted under its existing reason", () => {
  it("BEH-S282-3: a hold keeps the review disposition and the off-cycle count", () => {
    const cohort = classify(OFF_CYCLE_END, [review("hold")]);
    const [entry] = cohort.classifications;
    expect(entry).toMatchObject({
      disposition: "review",
      reason: "off_cycle_date",
      offCycle: { state: "held" },
    });
    expect(cohort.summary.byReason.off_cycle_date).toBe(1);
    expect(cohort.needsReview).toHaveLength(1);
  });

  it("BEH-S282-3: the hold line names the reason, who set it and when", () => {
    expect(offCycleHoldLine(review("hold"))).toBe(
      `Off-cycle end date on hold: Waiting on the owner. Set by ${STAFF} on 11/13/2026.`,
    );
  });

  it("BEH-S282-3: the latest review for the same value governs", () => {
    const later = review("hold", OFF_CYCLE_END, {
      eventId: "00000000-0000-4000-8000-000000000009",
      recordedAt: "2026-11-14T16:00:00.000Z",
    });
    expect(
      classify(OFF_CYCLE_END, [review("include"), later]).classifications[0],
    ).toMatchObject({
      disposition: "review",
      offCycle: { state: "held" },
    });
  });
});

describe("BEH-S282-4 / AC-S282-3: a changed end date asks again", () => {
  const reviews = [review("include")];

  it("BEH-S282-4: another off-cycle value brings the block back, with the earlier decision as history", () => {
    const [entry] = classify(OTHER_OFF_CYCLE_END, reviews).classifications;
    expect(entry).toMatchObject({
      disposition: "review",
      reason: "off_cycle_date",
      offCycle: { endDateIso: OTHER_OFF_CYCLE_END, state: "needs_review", review: null },
    });
    expect(currentOffCycleReview(reviews, OTHER_OFF_CYCLE_END)).toBeNull();
    expect(offCycleReviewHistory(reviews, OTHER_OFF_CYCLE_END)).toEqual(reviews);
  });

  it("BEH-S282-4: a correction to a month end removes the block, with no form and no decision", () => {
    const [entry] = classify(MONTH_END, reviews).classifications;
    expect(entry.disposition).toBe("actionable");
    expect(entry.offCycle).toBeUndefined();
    expect(offCycleStageBlocker({ endDateIso: MONTH_END }, [])).toBeNull();
  });

  it("AC-S282-3: the restored original value finds its decision only when the recorded value matches exactly", () => {
    expect(classify(OFF_CYCLE_END, reviews).classifications[0]?.disposition).toBe(
      "actionable",
    );
    expect(currentOffCycleReview(reviews, "2027-01-14T00:00:00.000Z")).toBeNull();
    expect(currentOffCycleReview(reviews, null)).toBeNull();
  });
});

describe("AC-S282-1 / ARCH-S282-2: the record through the workspace save path's planner", () => {
  it("AC-S282-1: a review without a reason is refused and nothing is planned", () => {
    expect(() =>
      record(
        emptyState(),
        {
          kind: "end_date_review",
          decision: "include",
          endDateIso: OFF_CYCLE_END,
          reason: "   ",
        } as RenewalWorkspaceAction,
        1,
      ),
    ).toThrow(OFF_CYCLE_REVIEW_WORDS.reasonRequired);
    expect(() =>
      record(
        emptyState(),
        {
          kind: "end_date_review",
          endDateIso: OFF_CYCLE_END,
          reason: "Owner confirmed",
        } as unknown as RenewalWorkspaceAction,
        1,
      ),
    ).toThrow();
  });

  it("AC-S282-1: the record holds the cycle, end date value, decision, reason, actor and time", () => {
    const state = record(
      emptyState(),
      {
        kind: "end_date_review",
        decision: "hold",
        endDateIso: OFF_CYCLE_END,
        reason: "  Waiting on the owner  ",
      },
      7,
    );
    expect(state.revision).toBe(1);
    expect(state.endDateReviews).toEqual([
      {
        eventId: "00000000-0000-4000-8000-000000000007",
        cycleId: CYCLE_ID,
        endDateIso: OFF_CYCLE_END,
        decision: "hold",
        reason: "Waiting on the owner",
        actorUid: "editor-1",
        actorLabel: STAFF,
        recordedAt: RECORDED_AT,
      },
    ]);
    // A review is its own record: no staff activity, terms revision or Sheet value moves.
    expect(state.termsRevision).toBe(0);
    expect(state.activities).toEqual({});
    expect(state.sourceUpdates).toEqual({});
  });

  it("BEH-S282-4: a later review is appended, so an earlier decision stays as history", () => {
    let state = record(
      emptyState(),
      {
        kind: "end_date_review",
        decision: "include",
        endDateIso: OFF_CYCLE_END,
        reason: "Owner confirmed",
      },
      1,
    );
    state = record(
      state,
      {
        kind: "end_date_review",
        decision: "hold",
        endDateIso: OTHER_OFF_CYCLE_END,
        reason: "New date to check",
      },
      2,
    );
    expect(state.endDateReviews?.map((entry) => entry.endDateIso)).toEqual([
      OFF_CYCLE_END,
      OTHER_OFF_CYCLE_END,
    ]);
    expect(offCycleReviewHistory(state.endDateReviews, OTHER_OFF_CYCLE_END)).toHaveLength(
      1,
    );
  });

  it("AC-S282-5: a review prepares no Sheet value and names no provider effect", () => {
    const action: RenewalWorkspaceAction = {
      kind: "end_date_review",
      decision: "include",
      endDateIso: OFF_CYCLE_END,
      reason: "Owner confirmed",
    };
    expect(manualActionSheetIntent(action)).toBeNull();
    const state = record(emptyState(), action, 1);
    expect(Object.keys(state.sourceUpdates)).toEqual([]);
  });
});

describe("ARCH-S282-3 / AC-S282-4 / BEH-S282-1: the Now card and both readiness lists read one blocker", () => {
  it("BEH-S282-1: the off-cycle lease's blocker reads Review the lease end date and lands on the form", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    // The guidance verification that is the off-cycle hold itself gives way to the review.
    expect(context.verification).toBeNull();
    expect(context.offCycleEndDate).toEqual({ endDateIso: OFF_CYCLE_END });
    const stage = projectRenewalStage(emptyState(), context);
    expect(stage.blocker).toEqual({
      kind: "off_cycle_end_date",
      label: "Review the lease end date",
      target: OFF_CYCLE_REVIEW_TARGET,
      line: "Off-cycle end date: needs review",
    });
    expect(stage.stageLine).toBe("Needs verification: Off-cycle end date");
    // ARCH-S282-3: the readiness row is read from that same blocker.
    expect(offCycleReadinessItem(stage.blocker)).toEqual({
      key: "off_cycle_end_date",
      label: "Lease end date",
      text: "Lease end date: needs review (off-cycle)",
      ready: false,
      fix: { label: "Review the lease end date", target: OFF_CYCLE_REVIEW_TARGET },
    });
  });

  it("AC-S282-4: with Include recorded, there is no blocker and no readiness row, so the two agree", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    const included = record(
      emptyState(),
      {
        kind: "end_date_review",
        decision: "include",
        endDateIso: OFF_CYCLE_END,
        reason: "Owner confirmed",
      },
      1,
    );
    const stage = projectRenewalStage(included, context);
    expect(stage.blocker).toBeNull();
    expect(offCycleReadinessItem(stage.blocker)).toBeNull();
    expect(stage.stageLine).not.toMatch(/Off-cycle/);
  });

  it("BEH-S282-3: with Keep on hold recorded, the block stays with the reason, actor and time", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    const held = record(
      emptyState(),
      {
        kind: "end_date_review",
        decision: "hold",
        endDateIso: OFF_CYCLE_END,
        reason: "Waiting on the owner",
      },
      1,
    );
    const stage = projectRenewalStage(held, context);
    const line = `Off-cycle end date on hold: Waiting on the owner. Set by ${STAFF} on 11/13/2026.`;
    expect(stage.blocker).toMatchObject({ label: "Review the lease end date", line });
    expect(stage.stageLine).toBe(line);
    expect(offCycleReadinessItem(stage.blocker)?.text).toBe(
      "Lease end date: needs review (off-cycle)",
    );
  });

  it("ARCH-S282-3: any other verification keeps its own blocker and no off-cycle row", () => {
    const row = offCycleRow();
    const unread = renewalStageContextFor(
      {
        ...row,
        guidance: {
          ...row.guidance,
          action: {
            kind: "needs_verification",
            label: "Lease data is out of date. Refresh to see current data.",
            destination: { kind: "none" },
          },
        },
      },
      null,
      null,
    );
    const stage = projectRenewalStage(emptyState(), unread);
    expect(stage.blocker).toMatchObject({ target: null });
    expect(offCycleReadinessItem(stage.blocker)).toBeNull();
  });
});

describe("S269 preservation: the end date review sits where the lease end fix is", () => {
  it("BEH-S282-1: on the current step the review leads as an exact Check the numbers fix", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    const stage = projectRenewalStage(emptyState(), context);
    const shown = { ...stage.steps.find((step) => step.id === stage.currentStepId)! };
    const priority = projectGuidedPriority({ stage, shown, canEdit: true });
    expect(priority.state).toBe("missing");
    expect(priority.lead).toMatchObject({
      key: "off-cycle-end-date",
      label: "Review the lease end date",
      target: OFF_CYCLE_REVIEW_TARGET,
      owner: "check-numbers",
    });
    expect(priority.crossOutcome).toBe(shown.id !== "check-numbers");
  });

  it("orders Check the numbers: the end date review first, then the base rent", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    const stage = projectRenewalStage(emptyState(), context);
    const shown = {
      ...stage.steps.find((step) => step.id === "check-numbers")!,
      state: "current" as const,
    };
    const priority = projectGuidedPriority({
      stage: { ...stage, currentStepId: "check-numbers" },
      shown,
      canEdit: true,
      lease: { endMissing: false, baseRentFix: true },
    });
    expect(priority.inputs.map((entry) => entry.key)).toEqual([
      "off-cycle-end-date",
      "current-base-rent",
    ]);
  });

  it("a read-only person sees the state with no lead", () => {
    const context = renewalStageContextFor(offCycleRow(), null, null);
    const stage = projectRenewalStage(emptyState(), context);
    const shown = stage.steps.find((step) => step.id === stage.currentStepId)!;
    expect(projectGuidedPriority({ stage, shown, canEdit: false }).lead).toBeNull();
  });
});

describe("R-S282-5 / AC-S282-2: the desk row's reason", () => {
  it("R-S282-5: names the decision, the staff member and the day", () => {
    expect(offCycleDecisionLine(review("include"))).toBe(
      `Off-cycle end date: included by ${STAFF} on 11/13/2026`,
    );
    expect(offCycleDecisionLine(review("hold"))).toBe(
      `Off-cycle end date: on hold by ${STAFF} on 11/13/2026`,
    );
  });

  it("R-S282-1: the form's first line names the date and that it is not a month end", () => {
    expect(offCycleEndDateSentence(OFF_CYCLE_END)).toBe(
      "This lease ends 01/14/2027, which is not a month end.",
    );
  });
});

describe("AC-S282-2: the month's Prepare run treats only an included lease as a target", () => {
  const actor: AuthenticatedUser = {
    uid: "editor-1",
    email: STAFF,
    hd: "pmikcmetro.com",
    role: "Editor",
  };
  function deps(read: Partial<KickoffLeaseRead>) {
    const claim = vi.fn<KickoffPreparationDeps["claim"]>(async () => {
      throw new Error("claimed");
    });
    const lookup = vi.fn<KickoffPreparationDeps["lookup"]>();
    const value: KickoffPreparationDeps = {
      readLease: async () => ({
        cycleDateIso: OFF_CYCLE_END,
        inWorkingBatch: true,
        workRecordCycleId: CYCLE_ID,
        housingAssistance: null,
        ...read,
      }),
      storedComparison: async () => false,
      allowanceReached: async () => false,
      claim,
      settle: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
      lookup,
    };
    return { value, claim, lookup };
  }
  const request = {
    leaseId: LEASE,
    trigger: "staff" as const,
    operationId: "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    month: "2027-01",
    cycleDateIso: OFF_CYCLE_END,
  };

  it("AC-S282-2: a lease needing review or on hold is refused with its reason and nothing is claimed", async () => {
    for (const fact of [
      classify(OFF_CYCLE_END).classifications[0]?.offCycle,
      classify(OFF_CYCLE_END, [review("hold")]).classifications[0]?.offCycle,
    ]) {
      const hold = offCyclePreparationHold(fact);
      expect(hold).toMatch(/off-cycle end date/);
      const { value, claim, lookup } = deps({ offCycleHold: hold });
      const result = await runKickoffPreparation(actor, request, value);
      expect(result).toMatchObject({
        status: "refused",
        code: "outside_working_batch",
        message: hold,
        billed: false,
      });
      expect(claim).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    }
  });

  it("AC-S282-2: after Include the lease is a target and preparation proceeds to its claim", async () => {
    const fact = classify(OFF_CYCLE_END, [review("include")]).classifications[0]
      ?.offCycle;
    expect(offCyclePreparationHold(fact)).toBeNull();
    const { value, claim } = deps({ offCycleHold: offCyclePreparationHold(fact) });
    await expect(runKickoffPreparation(actor, request, value)).rejects.toThrow("claimed");
    expect(claim).toHaveBeenCalledTimes(1);
  });
});

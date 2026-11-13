import { describe, expect, it } from "vitest";

import {
  OUTREACH_ACTIVITY,
  outreachFill,
  outreachScopeFor,
  projectOutreachEvidence,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  RENEWAL_FINISH_UP_WORDS,
  RENEWAL_STAGE_NEXT_STEP,
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import {
  derivedOutreachSheetIntent,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  REPLY_AT_MS,
  SENT_AT_MS,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S248 review fixes on the one stage projection, synthetic records only:
// - R-S248-9 / L41: under "Needs a check" neither fact wins, so the one next step settles the
//   check at the staff record; it is never a new send.
// - R-S248-9: a "No response" saved after an observed reply is a check with both facts.
// - R-S248-2: a scheduled first message offers nothing to send again or to record.
// - R-S248-7: a verified operating Sheet or RentVine receipt marks its Finish up item done,
//   verified by the provider, distinct from recorded by staff; nothing completes the lease.
// - R-S248-11: a derived tenant offer holds the same Sheet field and Done a staff record holds.

const LEASE = "4802";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function context(
  outreach: ReturnType<typeof evidenceInput> | null,
  extra: Partial<RenewalStageContext> = {},
): RenewalStageContext {
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
    lastContactAtIso: null,
    threadCheck: null,
    outreach,
    cycleDateIso: "2026-12-31",
    ...extra,
  };
}

describe("S248 Needs a check never asks for a new send", () => {
  it("a staff outreach record saved after an accepted send makes settling the check the one next step", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "waiting" },
        atIso: iso(SENT_AT_MS + HOUR),
      },
    ]);
    const stage = projectRenewalStage(state, context(evidenceInput([message()])));
    expect(stage.stageLine).toMatch(/^Needs a check: /);
    expect(stage.check?.sentence).toContain("The staff record says Owner outreach");
    expect(stage.check?.sentence).toContain("show the owner message accepted by Gmail");
    expect(stage.currentStepId).toBe("ask-owner");
    expect(stage.nextStep.label).toBe(RENEWAL_STAGE_NEXT_STEP.settleCheck);
    const ask = stage.steps.find((step) => step.id === "ask-owner")!;
    expect(ask.primary).toEqual({
      label: RENEWAL_STAGE_NEXT_STEP.settleCheck,
      target: "renewal-manual-owner_outreach",
    });
    // S279 R-S279-3 (rewritten on purpose): the check reads once, in the stage line with its
    // fix, so the step's own detail no longer repeats it.
    expect(ask.detail).toBeNull();
    expect(stage.stageLine).toBe(
      "Needs a check: The staff record says Owner outreach is waiting. The app's records show the owner message accepted by Gmail on 11/04/2026. Record the owner outreach.",
    );
    for (const label of [stage.nextStep.label, ask.primary?.label])
      expect(label).not.toMatch(/Send the owner message/);
  });

  it("a No response saved after an observed owner reply is a check with both facts", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
      {
        action: { kind: "owner_response", outcome: "no_response" },
        atIso: iso(REPLY_AT_MS + HOUR),
      },
    ]);
    const input = evidenceInput([message({ replyAtMs: REPLY_AT_MS })]);
    const fill = outreachFill(
      state,
      projectOutreachEvidence(input, outreachScopeFor(state)),
    );
    // The staff record stays in the lane; the reply does not replace it.
    expect(fill.ownerReplyAtMs).toBeNull();
    expect(fill.checks).toEqual([
      expect.objectContaining({
        audience: "owner",
        subject: "response",
        staffRecord: expect.stringContaining("the owner response is No response"),
        appEvidence: expect.stringContaining("show an owner reply received"),
      }),
    ]);
    const stage = projectRenewalStage(state, context(input));
    expect(stage.stageLine).toMatch(/^Needs a check: /);
    expect(stage.nextStep.label).toBe(RENEWAL_STAGE_NEXT_STEP.settleCheck);
    expect(stage.steps.find((step) => step.id === "ask-owner")!.primary).toEqual({
      label: RENEWAL_STAGE_NEXT_STEP.settleCheck,
      target: "renewal-manual-owner_response",
    });
    // A No response saved before the reply still hands the move to the team, with no check.
    const before = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
      {
        action: { kind: "owner_response", outcome: "no_response" },
        atIso: iso(REPLY_AT_MS - HOUR),
      },
    ]);
    const handed = outreachFill(
      before,
      projectOutreachEvidence(input, outreachScopeFor(before)),
    );
    expect(handed.ownerReplyAtMs).toBe(REPLY_AT_MS);
    expect(handed.checks).toEqual([]);
  });
});

describe("S248 a scheduled first message", () => {
  it("shows its schedule with its own controls and offers nothing to send again or record", () => {
    const scheduled = message({
      acceptedAtMs: null,
      scheduledForMs: SENT_AT_MS + 24 * HOUR,
    });
    const stage = projectRenewalStage(
      recordedState(LEASE),
      context(evidenceInput([scheduled])),
    );
    const ask = stage.steps.find((step) => step.id === "ask-owner")!;
    expect(ask.state).toBe("waiting");
    expect(ask.scheduled).toBe(true);
    expect(ask.detail).toMatch(/^Owner message scheduled for /);
    expect(ask.primary).toEqual({
      label: "Review the scheduled owner message",
      target: "renewal-card-message-owner",
    });
    // An accepted message is not scheduled: its waiting step keeps Send again.
    const accepted = projectRenewalStage(
      recordedState(LEASE),
      context(evidenceInput([message()])),
    );
    expect(accepted.steps.find((step) => step.id === "ask-owner")!.scheduled).toBe(
      undefined,
    );
  });
});

describe("S248 R-S248-7 a verified receipt marks its Finish up item done", () => {
  const withSheet = (state: RenewalWorkspaceState["sourceUpdates"][string]["state"]) => {
    const recorded = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "insurance", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
    ]);
    const field = Object.keys(recorded.sourceUpdates)[0]!;
    return {
      field,
      state: {
        ...recorded,
        sourceUpdates: {
          [field]: { ...recorded.sourceUpdates[field]!, state },
        },
      } as RenewalWorkspaceState,
    };
  };

  it("an operating Sheet update read back after its confirmation reads verified by the provider", () => {
    const pending = withSheet("pending");
    const verified = withSheet("verified");
    const before = projectRenewalStage(pending.state, context(null));
    const after = projectRenewalStage(verified.state, context(null));
    const item = (stage: typeof before) =>
      stage.finishUp.find((entry) => entry.key === `sheet:${pending.field}`)!;
    expect(item(before)).toMatchObject({ done: false, origin: null });
    expect(item(after)).toEqual({
      key: `sheet:${pending.field}`,
      label: expect.stringMatching(/^Operating Sheet: /),
      done: true,
      origin: "provider_verified",
      detail: RENEWAL_FINISH_UP_WORDS.providerVerified,
    });
    // The staff-recorded follow-up reads in its own words.
    expect(after.finishUp.find((entry) => entry.key === "follow-up:insurance")).toEqual(
      expect.objectContaining({
        done: true,
        origin: "staff",
        detail: RENEWAL_FINISH_UP_WORDS.staff,
      }),
    );
    expect(RENEWAL_FINISH_UP_WORDS.staff).not.toBe(
      RENEWAL_FINISH_UP_WORDS.providerVerified,
    );
    expect(after.steps.find((step) => step.id === "finish-up")!.detail).toMatch(
      /verified by the provider's receipt$/,
    );
    // A receipt completes nothing: the lease is not complete without the staff confirmation.
    expect(after.stage.key).not.toBe("complete_staff_status");
  });

  it("a RentVine update's receipt marks its item done; an update without one stays open", () => {
    const stage = projectRenewalStage(
      recordedState(LEASE),
      context(null, {
        providerUpdates: [
          {
            id: "rentvine:dates",
            label: "RentVine lease renewal dates",
            verified: true,
            stateLabel: "Applied with receipt",
          },
          {
            id: "rentvine:charge",
            label: "RentVine recurring charge update",
            verified: false,
            stateLabel: "Prepared, awaiting confirmation",
          },
        ],
      }),
    );
    expect(stage.finishUp.filter((item) => item.key.startsWith("rentvine:"))).toEqual([
      {
        key: "rentvine:rentvine:dates",
        label: "RentVine lease renewal dates",
        done: true,
        origin: "provider_verified",
        detail: RENEWAL_FINISH_UP_WORDS.providerVerified,
      },
      {
        key: "rentvine:rentvine:charge",
        label: "RentVine recurring charge update",
        done: false,
        origin: null,
        detail: "Prepared, awaiting confirmation",
      },
    ]);
  });
});

describe("S248 R-S248-11 the derived Sheet value", () => {
  it("is the staff record's field and Done, attributed to the app's confirmed send", () => {
    const staff = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "tenant_offer", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
    ]).sourceUpdates.renewal_letter_sent!;
    const derived = derivedOutreachSheetIntent(OUTREACH_ACTIVITY.tenant)!;
    expect(derived.field).toBe(staff.intent.field);
    expect(String(derived.value)).toMatch(/^Done/);
    expect(String(staff.intent.value)).toMatch(/^Done/);
    expect(JSON.stringify(derived)).not.toMatch(/recorded by staff|verified/i);
    // Owner outreach has no Sheet column, for a staff record and a derived one alike.
    expect(
      recordedState(LEASE, [
        {
          action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
          atIso: iso(SENT_AT_MS),
        },
      ]).sourceUpdates,
    ).toEqual({});
    expect(derivedOutreachSheetIntent(OUTREACH_ACTIVITY.owner)).toBeNull();
  });
});

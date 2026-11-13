import { describe, expect, it } from "vitest";

import {
  GUIDED_MESSAGE_GROUP_LABELS,
  GUIDED_PRIORITY_TIER,
  GUIDED_RETURN_LABELS,
  GUIDED_SECONDARY_WORK_LABELS,
  GUIDED_VERIFICATION_LABELS,
  includedResourceFix,
  projectGuidedPriority,
  type GuidedPriorityFacts,
} from "@/lib/lease-renewal/guided-priority";
import {
  RENEWAL_PATH_STANDARD_STEPS,
  RENEWAL_PATH_STEP_IDS,
  type RenewalPathStepId,
} from "@/lib/lease-renewal/renewal-path";
import {
  projectMessageReadiness,
  RESOURCE_ADMIN_HANDOFF,
  resourceEntryHref,
} from "@/lib/lease-renewal/message-readiness";
import type { TenantResourceInclusion } from "@/lib/lease-renewal/tenant-resource-inclusion";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import {
  projectRenewalStage,
  RENEWAL_STAGE_NEXT_STEP,
  type RenewalPathStepView,
  type RenewalStage,
} from "@/lib/lease-renewal/renewal-stage";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { evidenceInput, message } from "@/tests/helpers/outreach-evidence-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S269 R-S269-1 / ARCH-S269-1 / AC-S269-1: one live priority per Guided outcome, read from the
// shared stage projection and the facts the page already holds. Fail-first on the base source:
// lib/lease-renewal/guided-priority.ts did not exist, so every case here failed on import.
// Values are synthetic.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

function step(
  id: RenewalPathStepId,
  overrides: Partial<RenewalPathStepView> = {},
): RenewalPathStepView {
  return {
    id,
    label: id,
    state: "current",
    detail: null,
    primary: null,
    controls: [],
    ...overrides,
  };
}

/** A stage whose shown step is current, with nothing waiting or unconfirmed. */
function stage(shown: RenewalPathStepView, overrides: Partial<RenewalStage> = {}) {
  return {
    stage: { key: "verifying_lease_and_rent", label: "Verifying lease and rent" },
    stageLine: "",
    currentStepId: shown.id,
    nextStep: { label: "", stepId: shown.id, processStepId: null },
    waiting: null,
    evidenceLine: null,
    steps: [shown],
    check: null,
    evidenceCheck: null,
    derived: [],
    handStatusLine: null,
    blocker: null,
    evidence: {
      owner: { unconfirmedSequenceId: null, corrected: [] },
      tenant: { unconfirmedSequenceId: null, corrected: [] },
    },
    finishUp: [],
    ...overrides,
  } as unknown as RenewalStage;
}

function facts(
  shown: RenewalPathStepView,
  extra: Partial<GuidedPriorityFacts> = {},
  stageOverrides: Partial<RenewalStage> = {},
): GuidedPriorityFacts {
  return { stage: stage(shown, stageOverrides), shown, canEdit: true, ...extra };
}

describe("AC-S269-1: the precedence of the one live priority", () => {
  it("an uncertain send leads with the same attempt ahead of a new missing fee and a draft review, with no Send", () => {
    const shown = step("offer-tenant", {
      primary: {
        label: RENEWAL_STAGE_NEXT_STEP.checkSend,
        target: "renewal-card-message-tenant",
      },
    });
    const priority = projectGuidedPriority(
      facts(
        shown,
        {
          working: { rent: 1400, effectiveDate: null, endDate: null },
          message: { ready: true, label: "Review and send", target: "x" },
          extensions: {
            offerCharges: { target: "renewal-offer-charges", transitionsReady: false },
          },
        },
        {
          evidence: {
            owner: { unconfirmedSequenceId: null, corrected: [] },
            tenant: { unconfirmedSequenceId: "sequence-0001", corrected: [] },
          } as unknown as RenewalStage["evidence"],
        },
      ),
    );
    expect(priority.state).toBe("reconcile");
    expect(priority.tier).toBe(2);
    expect(priority.lead).toMatchObject({
      key: "check-send",
      label: "Check whether the message went out",
      target: "renewal-card-message-tenant",
    });
    expect(priority.suppressSend).toBe(true);
    expect(priority.inputs.map((entry) => entry.label)).not.toContain(
      "Review offer charges",
    );
    expect(priority.inputs.some((entry) => /send/i.test(entry.label))).toBe(false);
  });

  it("reads an unconfirmed send from the real stage projection on the owner step", () => {
    const base = getRenewalLeaseWorkspace(LEASE)!;
    const context = {
      ...renewalStageContextFor(
        { ...base.summary, guidance: base.guidance },
        evidenceInput([
          message({ cycleId: CYCLE_ID, acceptedAtMs: null, unconfirmed: true }),
        ]),
        null,
      ),
      cycleDateIso: "2026-12-31",
    };
    const state = emptyRenewalWorkspace(LEASE, CYCLE_ID, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    const projected = projectRenewalStage(state, context);
    const owner = projected.steps.find((entry) => entry.id === "ask-owner")!;
    const priority = projectGuidedPriority({
      stage: projected,
      shown: owner,
      canEdit: true,
      message: { ready: true, label: "Review and send", target: "x" },
    });
    expect(priority.state).toBe("reconcile");
    expect(priority.lead?.label).toBe(RENEWAL_STAGE_NEXT_STEP.checkSend);
    expect(priority.suppressSend).toBe(true);
  });

  it("two missing current facts lead in the outcome order: lease end, then base rent", () => {
    const priority = projectGuidedPriority(
      facts(step("check-numbers"), {
        lease: {
          endMissing: true,
          baseRentFix: true,
          baseRentReason: "RentVine lists $940 and the lease shows $900.",
        },
        housingAssistanceActive: true,
      }),
    );
    expect(priority.state).toBe("missing");
    expect(priority.inputs.map((entry) => entry.key)).toEqual([
      "current-lease-end",
      "current-base-rent",
      "housing-assistance",
    ]);
    expect(priority.lead?.label).toBe("Verify current lease end");
    const baseOnly = projectGuidedPriority(
      facts(step("check-numbers"), { lease: { endMissing: false, baseRentFix: true } }),
    );
    expect(baseOnly.lead).toMatchObject({
      key: "current-base-rent",
      label: "Correct the current base rent",
      target: "renewal-working-current-rent",
      owner: "check-numbers",
    });
  });

  it("a missing fact for a different action never holds independent work", () => {
    // Compare market rent with a usable comparison and no renewal dates: the dates belong to the
    // offer, so Rent to recommend still leads.
    const priority = projectGuidedPriority(
      facts(
        step("compare-market", {
          primary: { label: "Compare market rent", target: "renewal-section-comps" },
        }),
        {
          comparison: { state: "stored" },
          working: { rent: null, effectiveDate: null, endDate: null },
        },
      ),
    );
    expect(priority.state).toBe("act");
    expect(priority.lead).toMatchObject({
      key: "rent-to-recommend",
      label: "Rent to recommend",
      target: "renewal-now-rent-to-recommend",
      kind: "field",
    });
  });

  it("the offer routes a missing base to Compare market rent with its reason, as a cross-outcome link", () => {
    const priority = projectGuidedPriority(
      facts(step("offer-tenant"), {
        working: { rent: null, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      }),
    );
    expect(priority.state).toBe("missing");
    expect(priority.lead).toMatchObject({
      key: "renewal-base-rent",
      label: "Set renewal base rent",
      target: "renewal-now-rent-to-recommend",
      owner: "compare-market",
      reason: "The offer needs the renewal base rent.",
    });
    expect(priority.crossOutcome).toBe(true);
    // The assisted path governs the base through its own rent choice.
    expect(
      projectGuidedPriority(
        facts(step("offer-tenant"), {
          assisted: true,
          working: { rent: null, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        }),
      ).lead,
    ).toMatchObject({ owner: "assisted-rent", target: "renewal-assisted-rent-choice" });
  });

  it("orders the offer: lease end, base, start, end, charges, then an included resource only after transitions", () => {
    const missing = projectGuidedPriority(
      facts(step("offer-tenant"), {
        lease: { endMissing: true, baseRentFix: false },
        working: { rent: null, effectiveDate: null, endDate: null },
        message: {
          ready: false,
          label: "Check tenant email addresses in RentVine",
          target: "m",
        },
        extensions: {
          offerCharges: { target: "renewal-offer-charges", transitionsReady: false },
          includedResource: {
            label: "Add the insurance flyer",
            target: "renewal-resource-entry-insurance_flyer",
          },
        },
      }),
    );
    expect(missing.inputs.map((entry) => entry.key)).toEqual([
      "current-lease-end",
      "renewal-base-rent",
      "renewal-start",
      "renewal-end",
      "offer-charges",
      "message-fix",
    ]);
    const ready = projectGuidedPriority(
      facts(step("offer-tenant"), {
        working: { rent: 1400, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        extensions: {
          offerCharges: { target: "renewal-offer-charges", transitionsReady: true },
          includedResource: {
            label: "Add the insurance flyer",
            target: "renewal-resource-entry-insurance_flyer",
          },
        },
      }),
    );
    expect(ready.inputs.map((entry) => entry.key)).toEqual([
      "offer-charges",
      "included-resource",
    ]);
  });

  it("R-S281-14 (rewritten on purpose): the offer's missing renewal dates are its own work, opened in place, not a route to Ask the owner", () => {
    const priority = projectGuidedPriority(
      facts(step("offer-tenant"), {
        lease: { endMissing: false, baseRentFix: false },
        working: { rent: 1400, effectiveDate: null, endDate: null },
      }),
    );
    const dates = priority.inputs.filter(
      (entry) => entry.key === "renewal-start" || entry.key === "renewal-end",
    );
    expect(dates.map((entry) => entry.owner)).toEqual(["offer-tenant", "offer-tenant"]);
    expect(priority.lead?.key).toBe("renewal-start");
    expect(priority.crossOutcome).toBe(false);
  });

  it("S265 slot: a missing required flyer leads with its Connections entry only once its own transition decisions are ready; otherwise the next message fix", () => {
    const flyer = {
      label: "Shared resource link: Insurance flyer",
      target: resourceEntryHref("insurance_flyer"),
      reason: "The insurance flyer is required for this offer.",
    };
    const offer = (transitionsReady: boolean, ready = false) =>
      projectGuidedPriority(
        facts(step("offer-tenant"), {
          working: { rent: 1400, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
          message: ready
            ? {
                ready: true,
                label: "Review and send",
                target: "renewal-card-message-tenant",
              }
            : {
                ready: false,
                label: "Review the marked values",
                target: "renewal-card-message-tenant",
              },
          extensions: { includedResource: { ...flyer, transitionsReady } },
        }),
      );
    const held = offer(false);
    expect(held.inputs.map((entry) => entry.key)).toEqual(["message-fix"]);
    expect(held.lead?.label).toBe("Review the marked values");
    const resource = offer(true);
    expect(resource.state).toBe("missing");
    expect(resource.lead).toMatchObject({
      key: "included-resource",
      label: flyer.label,
      target: "/connections#renewal-resource-entry-insurance_flyer",
      owner: "offer-tenant",
      reason: flyer.reason,
    });
    expect(resource.cue).toBe(flyer.reason);
    // With the resource in order and the message ready, the offer leads to its exact review.
    const ready = projectGuidedPriority(
      facts(step("offer-tenant"), {
        working: { rent: 1400, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        message: {
          ready: true,
          label: "Review and send",
          target: "renewal-card-message-tenant",
        },
      }),
    );
    expect(ready.lead?.label).toBe("Review tenant offer");
  });

  it("S265 slot: the fix comes from the one inclusion projection and readiness item, with the Admin handoff for other roles", () => {
    const inclusion = (
      problems: TenantResourceInclusion["problems"],
      holds: TenantResourceInclusion["holds"] = [],
    ): TenantResourceInclusion => ({
      includedIds: [],
      included: [],
      problems,
      required: ["insurance_flyer"],
      holds,
    });
    const required = {
      resourceId: "insurance_flyer" as const,
      field: "insuranceFlyer" as TenantResourceInclusion["problems"][number]["field"],
      kind: "required_absent" as const,
      message: "The insurance flyer is required for this offer.",
    };
    const readiness = (canManageResources: boolean) =>
      projectMessageReadiness({
        channel: "tenant",
        missing: [{ field: required.field, message: required.message }],
        canManageResources,
      }).items;
    expect(includedResourceFix(inclusion([required]), readiness(true))).toEqual({
      label: "Shared resource link: Insurance flyer",
      href: "/connections#renewal-resource-entry-insurance_flyer",
      reason: required.message,
      transitionsReady: true,
    });
    expect(includedResourceFix(inclusion([required]), readiness(false))?.reason).toBe(
      `${required.message} ${RESOURCE_ADMIN_HANDOFF}`,
    );
    expect(
      includedResourceFix(
        inclusion([required], ["insurance_transition"]),
        readiness(true),
      )?.transitionsReady,
    ).toBe(false);
    // A problem with a resource the offer does not require, or no problem, gives no fix.
    expect(
      includedResourceFix(
        { ...inclusion([{ ...required, resourceId: "rbp_flyer", field: "rbpFlyer" }]) },
        readiness(true),
      ),
    ).toBeNull();
    expect(includedResourceFix(inclusion([]), readiness(true))).toBeNull();
    expect(includedResourceFix(null, null)).toBeNull();
  });

  it("a ready offer leads to Review tenant offer, and a ready owner message to Review owner message", () => {
    expect(
      projectGuidedPriority(
        facts(step("offer-tenant"), {
          working: { rent: 1400, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
          message: { ready: true, label: "Review and send", target: "x" },
        }),
      ).lead?.label,
    ).toBe("Review tenant offer");
    expect(
      projectGuidedPriority(
        facts(step("ask-owner"), {
          message: { ready: true, label: "Review and send", target: "x" },
        }),
      ).lead?.label,
    ).toBe("Review owner message");
  });

  it("an eligible owner reply leads ahead of message fixes; S262 names its own answer control", () => {
    const shown = step("ask-owner", {
      primary: {
        label: "Record the owner's decision",
        target: "renewal-manual-owner_response",
      },
    });
    const replied = projectGuidedPriority(
      facts(shown, {
        ownerReply: true,
        message: { ready: false, label: "Set up your signature", target: "s" },
      }),
    );
    // S262's "Record the owner's answer" on the Now card is the lead, ahead of message fixes.
    expect(replied.lead).toMatchObject({
      key: "owner-answer",
      kind: "field",
      label: "Record the owner's answer",
      target: "renewal-owner-decision-from-reply",
    });
    const explicit = projectGuidedPriority(
      facts(shown, {
        extensions: { ownerAnswer: { target: "renewal-manual-owner_response" } },
      }),
    );
    expect(explicit.lead).toMatchObject({
      label: "Record the owner's answer",
      target: "renewal-manual-owner_response",
    });
  });

  it("a failed save on the active editor leads with its exact recovery", () => {
    const priority = projectGuidedPriority(
      facts(step("compare-market"), {
        comparison: { state: "stored" },
        editors: [
          {
            key: "terms_rent",
            label: "Rent to recommend",
            target: "renewal-now-rent-to-recommend",
            phase: "failed",
            message: "Another operator changed it first.",
          },
        ],
      }),
    );
    expect(priority.state).toBe("recover");
    expect(priority.lead?.target).toBe("renewal-now-rent-to-recommend");
    // The editor's own status keeps the refusal words and its retry; the cue names the field.
    expect(priority.cue).toBe("Not saved yet: Rent to recommend.");
  });

  it("waiting leads with who and since when, and offers the next independent handoff", () => {
    const shown = step("ask-owner", {
      state: "waiting",
      primary: {
        label: "Record the owner's response",
        target: "renewal-manual-owner_response",
      },
    });
    const priority = projectGuidedPriority(
      facts(
        shown,
        {},
        {
          waiting: {
            party: "the owner",
            sinceIso: "2026-11-04T16:00:00.000Z",
            lastContactIso: "2026-11-04T16:00:00.000Z",
            watching: "Replies.",
          },
        },
      ),
    );
    expect(priority.state).toBe("wait");
    expect(priority.cue).toMatch(/^Waiting on the owner since /);
    expect(priority.lead?.target).toBe("renewal-manual-owner_response");
  });

  it("a read-only person sees the state and the handoff, with no editor lead", () => {
    const priority = projectGuidedPriority({
      ...facts(step("compare-market"), { comparison: { state: "stored" } }),
      canEdit: false,
    });
    expect(priority.state).toBe("read_only");
    expect(priority.lead).toBeNull();
    expect(priority.cue).toContain("Editor access");
  });

  it("access and applicability come first: not part, retired, an unreadable record", () => {
    expect(
      projectGuidedPriority(facts(step("documents", { state: "not_part" }))).state,
    ).toBe("not_part");
    expect(
      projectGuidedPriority(
        facts(step("check-numbers"), {}, {
          stage: { key: "retired", label: "Retired" },
          blocker: { label: "Review retirement", target: "renewal-current-stage" },
        } as Partial<RenewalStage>),
      ).state,
    ).toBe("retired");
    expect(
      projectGuidedPriority(
        facts(
          step("check-numbers"),
          { lease: { endMissing: true, baseRentFix: true } },
          {
            blocker: {
              label: "Reload records and history",
              target: "renewal-card-manual-records",
            },
          },
        ),
      ).lead?.label,
    ).toBe("Reload records and history");
  });

  it("an incomplete case on Complete leads with the first exact unfinished action from its outcome", () => {
    const current = step("offer-tenant", {
      label: "Offer the tenant",
      primary: { label: "Send the tenant offer", target: "renewal-card-message-tenant" },
    });
    const complete = step("complete", { state: "open" });
    const priority = projectGuidedPriority({
      stage: stage(current, { steps: [current, complete] }),
      shown: complete,
      canEdit: true,
    });
    expect(priority.lead).toMatchObject({
      key: "unfinished",
      owner: "offer-tenant",
      label: "Send the tenant offer",
    });
    expect(priority.crossOutcome).toBe(true);
  });

  it("is presentation only: the same facts always give the same priority and nothing is stored", () => {
    const input = facts(step("offer-tenant"), {
      working: { rent: null, effectiveDate: null, endDate: null },
    });
    const frozen = JSON.stringify(input);
    expect(projectGuidedPriority(input)).toEqual(projectGuidedPriority(input));
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe("S269/S270 exact names for every outcome", () => {
  it("names a return for every path step, with the settled tenant offer words", () => {
    expect(GUIDED_RETURN_LABELS["offer-tenant"]).toBe("Return to tenant offer");
    for (const id of RENEWAL_PATH_STEP_IDS)
      expect(GUIDED_RETURN_LABELS[id]).toMatch(/^Return to /);
  });

  it("names the S270 groups and Verification for every standard outcome", () => {
    // S281 R-S281-12 (rewritten on purpose): Ask the owner and Offer the tenant name the message
    // and the other ways to send as their own groups, ahead of their record group.
    expect(GUIDED_MESSAGE_GROUP_LABELS).toEqual({
      message: "Message",
      otherWays: "Other ways to send",
    });
    expect(
      RENEWAL_PATH_STANDARD_STEPS.map((id) => GUIDED_SECONDARY_WORK_LABELS[id]),
    ).toEqual([
      "Correct other lease facts",
      "Comparison inputs and deliberate rerun",
      "Outreach record",
      "Record of contact",
      "Other packet and handoff work",
      "Other follow-ups",
      null,
    ]);
    expect(
      RENEWAL_PATH_STANDARD_STEPS.map((id) => GUIDED_VERIFICATION_LABELS[id]),
    ).toEqual([
      "Verify lease numbers",
      "Verify market comparison",
      "Verify owner terms and outreach",
      "Verify offer facts and delivery",
      "Verify forms and signing evidence",
      "Verify follow-up and source updates",
      "Verify completion",
    ]);
    for (const id of RENEWAL_PATH_STEP_IDS)
      expect(GUIDED_VERIFICATION_LABELS[id]).toMatch(/^Verify /);
    expect(GUIDED_PRIORITY_TIER).toMatchObject({ reconcile: 2, missing: 3, act: 4 });
  });
});

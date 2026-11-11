// S269 R-S269-1 / ARCH-S269-1: the one live priority for a Guided outcome. It reads the shared
// stage projection (renewal-stage.ts), the outcome's existing step ownership (renewal-path.ts) and
// the facts the lease page already holds, and names what the outcome heading leads with: the one
// state, one short cue and the one input, exact fix or action, in the S269 order. It is
// presentation only. It stores nothing, adds no prerequisite between outcomes, never advances the
// stage and never operates a control: every lead names an existing control by its id, and its
// existing owner keeps its handler, validation, review and confirmation.
//
// Precedence (S269 "Choose the first applicable state in this order"):
//   1. access and applicability: not part of the path, retired, done, read only;
//   2. an unresolved previous effect for the intended action (mail: Check whether the message
//      went out, on the same attempt), ahead of any missing fact, draft review or Send;
//   3. the active editor's failed or pending save or stale basis, then the first material
//      missing input in the outcome's order;
//   4. the eligible editor or next action, or the honest wait (who and since when).
//
// S262's "Record the owner's answer" and S263's date fixes ("Verify current lease end", "Enter
// renewal start date", "Enter renewal end date") are read through their own labels and controls.
// The `extensions` facts are where an explicit task (an owner answer to record), S264 (offer
// charges), S265 (an included resource) and S268 (the packet lead) name their own control; an
// absent one leaves the order as it is. Pure and client-safe.

import {
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
  type MessageMissingInput,
} from "./message-readiness";
import type { TenantResourceInclusion } from "./tenant-resource-inclusion";
import {
  ENTER_RENEWAL_END_LABEL,
  ENTER_RENEWAL_START_LABEL,
  RETURN_TO_TENANT_OFFER_LABEL,
  VERIFY_CURRENT_LEASE_END_LABEL,
} from "./renewal-date-proposal";
import {
  ASSISTED_CONTROL_IDS,
  NOT_PART_OF_PATH_LABEL,
  RENEWAL_PATH_LABELS,
  type RenewalPathStepId,
} from "./renewal-path";
import { KICKOFF_FIX_TARGETS } from "./renewal-preparation";
import {
  RENEWAL_STAGE_NEXT_STEP,
  renewalStageWaitingLine,
  type RenewalPathStepView,
  type RenewalStage,
} from "./renewal-stage";
import { WORKING_CURRENT_RENT_TARGET } from "./workspace-targets";

/** The one state a Guided outcome leads with, in precedence order (tier 1 to 4). */
export type GuidedPriorityState =
  | "not_part"
  | "retired"
  | "read_only"
  | "done"
  | "reconcile"
  | "recover"
  | "missing"
  | "act"
  | "wait";

export const GUIDED_PRIORITY_TIER: Readonly<Record<GuidedPriorityState, 1 | 2 | 3 | 4>> =
  {
    not_part: 1,
    retired: 1,
    read_only: 1,
    done: 1,
    reconcile: 2,
    recover: 3,
    missing: 3,
    act: 4,
    wait: 4,
  };

/** The exact words S269 settles for its leads, links and returns. */
export const GUIDED_PRIORITY_WORDS = {
  // S263 owns the date fixes' words; the priority uses the same ones.
  verifyCurrentLeaseEnd: VERIFY_CURRENT_LEASE_END_LABEL,
  correctCurrentBaseRent: "Correct the current base rent",
  housingAssistance: "Housing assistance",
  compareMarketRent: "Compare market rent",
  rentToRecommend: "Rent to recommend",
  recordOwnerAnswer: "Record the owner's answer",
  choosePricingBasis: "Choose the pricing basis",
  reviewOwnerMessage: "Review owner message",
  setRenewalBaseRent: "Set renewal base rent",
  enterRenewalStart: ENTER_RENEWAL_START_LABEL,
  enterRenewalEnd: ENTER_RENEWAL_END_LABEL,
  reviewOfferCharges: "Review offer charges",
  reviewTenantOffer: "Review tenant offer",
  continueToOffer: "Continue to Offer the tenant",
  showCurrentStep: "Show current step",
} as const;

/** R-S269-3: the exact return a cross-outcome fix offers, named for the outcome it started in. */
export const GUIDED_RETURN_LABELS: Readonly<Record<RenewalPathStepId, string>> = {
  "check-numbers": "Return to lease details",
  "compare-market": "Return to market rent comparison",
  "ask-owner": "Return to owner approval",
  // S263's one return from a date fix uses the same words.
  "offer-tenant": RETURN_TO_TENANT_OFFER_LABEL,
  documents: "Return to documents and signatures",
  "finish-up": "Return to finish up",
  complete: "Return to completion",
  "month-to-month-review": "Return to month-to-month review",
  "non-renewal-handoff": "Return to non-renewal handoff",
  "assisted-program-contact": "Return to program contact",
  "assisted-owner-renewal-answer": "Return to the owner's renewal answer",
  "assisted-rent": "Return to rent for this renewal",
};

/** S270: the exact read-only Verification name for each outcome, in Guided and Full. */
export const GUIDED_VERIFICATION_LABELS: Readonly<Record<RenewalPathStepId, string>> = {
  "check-numbers": "Verify lease numbers",
  "compare-market": "Verify market comparison",
  "ask-owner": "Verify owner terms and outreach",
  "offer-tenant": "Verify offer facts and delivery",
  documents: "Verify forms and signing evidence",
  "finish-up": "Verify follow-up and source updates",
  complete: "Verify completion",
  // The variants use the equivalent label with their actual term, handoff or program evidence.
  "month-to-month-review": "Verify lease term",
  "non-renewal-handoff": "Verify non-renewal handoff",
  "assisted-program-contact": "Verify program contact",
  "assisted-owner-renewal-answer": "Verify owner renewal answer",
  "assisted-rent": "Verify rent choice",
};

/**
 * S270: the exact named secondary Work group for each outcome; null where the outcome has no
 * independent optional work (Complete), so no empty group or placeholder is shown.
 */
export const GUIDED_SECONDARY_WORK_LABELS: Readonly<
  Record<RenewalPathStepId, string | null>
> = {
  "check-numbers": "Correct other lease facts",
  "compare-market": "Comparison inputs and deliberate rerun",
  "ask-owner": "Owner message options and outreach record",
  "offer-tenant": "Tenant offer options and record of contact",
  documents: "Other packet and handoff work",
  "finish-up": "Other follow-ups",
  complete: null,
  "month-to-month-review": null,
  "non-renewal-handoff": null,
  "assisted-program-contact": null,
  "assisted-owner-renewal-answer": null,
  "assisted-rent": null,
};

/** Every input, fix or action an outcome can lead with, by its own key. */
export type GuidedInputKey =
  | "current-lease-end"
  | "current-base-rent"
  | "charge-difference"
  | "numbers-difference"
  | "housing-assistance"
  | "continue"
  | "compare-market"
  | "comparison-recovery"
  | "rent-to-recommend"
  | "owner-answer"
  | "pricing-choice"
  | "message-fix"
  | "review-message"
  | "tenant-answer"
  | "renewal-base-rent"
  | "renewal-start"
  | "renewal-end"
  | "offer-charges"
  | "included-resource"
  | "packet-lead"
  | "check-send"
  | "settle-check"
  | "blocker"
  | "editor"
  | "step-action"
  | "unfinished";

export interface GuidedPriorityInput {
  readonly key: GuidedInputKey;
  /** The exact visible label: the field's own label or the action's words. */
  readonly label: string;
  /** The existing control the lead names (an element id on the lease page). */
  readonly target: string;
  /** The outcome whose Work owns that control. */
  readonly owner: RenewalPathStepId;
  readonly kind: "field" | "fix" | "action";
  /** Required for this outcome's intended action, or optional. */
  readonly required: boolean;
  /** Why it is needed now, in words, when it belongs to another outcome or holds this one. */
  readonly reason: string | null;
  /** The slice that brings this control's own owner, while that slice is still arriving. */
  readonly arrivesWith?: "S264" | "S265" | "S268";
}

export interface GuidedPriority {
  readonly stepId: RenewalPathStepId;
  readonly state: GuidedPriorityState;
  readonly tier: 1 | 2 | 3 | 4;
  /** One short status or decision cue for the outcome heading; null when the lead says it. */
  readonly cue: string | null;
  /** The one input, exact fix or action the outcome leads with; null for a pure hold. */
  readonly lead: GuidedPriorityInput | null;
  /** The outcome's open inputs in S269 order, lead first; lower ones stay reachable. */
  readonly inputs: readonly GuidedPriorityInput[];
  /** True when no Send, Schedule or review may compete with the lead (reconciliation). */
  readonly suppressSend: boolean;
  /** True when the lead is owned by another outcome: an exact link with its reason. */
  readonly crossOutcome: boolean;
}

/** One existing editor of this outcome whose save has not settled. */
export interface GuidedEditorState {
  readonly key: string;
  readonly label: string;
  readonly target: string;
  readonly phase: "saving" | "failed";
  readonly message?: string;
  readonly conflict?: boolean;
}

/** S262, S263, S264, S265 and S268 name their own controls here when they arrive. */
export interface GuidedPriorityExtensions {
  /** S262: an eligible owner answer to record, or explicit navigation to record a known one. */
  readonly ownerAnswer?: { readonly target: string; readonly label?: string } | null;
  /** Existing rules require a pricing choice before outreach. */
  readonly pricingChoice?: { readonly target: string } | null;
  /** S263: the exact current lease end fix and Working renewal terms date fields. */
  readonly currentLeaseEnd?: { readonly target: string } | null;
  readonly renewalStart?: { readonly target: string } | null;
  readonly renewalEnd?: { readonly target: string } | null;
  /** S264: the first unresolved offer charge row or transition choice. */
  readonly offerCharges?: {
    readonly target: string;
    /** True once every applicable transition decision is made. */
    readonly transitionsReady: boolean;
  } | null;
  /**
   * S265: a required included resource (such as a flyer) the exact offer still needs, with its
   * one Connections entry (`target` is that page address) and the problem as its reason.
   */
  readonly includedResource?: {
    readonly label: string;
    readonly target: string;
    readonly owner?: RenewalPathStepId;
    readonly reason?: string | null;
    /** False while an applicable transition decision is open; the resource waits until then. */
    readonly transitionsReady?: boolean;
  } | null;
  /** S268: the first pending packet input or the exact source or authority handoff. */
  readonly packetLead?: { readonly label: string; readonly target: string } | null;
}

/** The prepared message of an audience step: Review when ready, else its first fix. */
export interface GuidedMessageFacts {
  readonly ready: boolean;
  /** The words the existing message owner gives its one action (the fix label when not ready). */
  readonly label: string;
  readonly target: string;
  readonly reason?: string | null;
}

export interface GuidedPriorityFacts {
  readonly stage: RenewalStage;
  readonly shown: RenewalPathStepView;
  readonly canEdit: boolean;
  /** This outcome's editors whose save is in flight or failed. */
  readonly editors?: readonly GuidedEditorState[];
  /** Check the numbers and the offer: the verified current lease facts. */
  readonly lease?: {
    readonly endMissing: boolean;
    /** The one base decision (S261) needs a correction or names competing values. */
    readonly baseRentFix: boolean;
    readonly baseRentReason?: string | null;
    readonly chargeFix?: { readonly label: string; readonly target: string } | null;
    readonly numbersFix?: { readonly label: string; readonly target: string } | null;
  } | null;
  /** S266: Housing assistance is in active Work (a program indication or an explicit task). */
  readonly housingAssistanceActive?: boolean;
  /** Compare market rent: the one preparation projection's stored comparison. */
  readonly comparison?: {
    readonly state: string;
    readonly fix?: { readonly label: string; readonly target: string } | null;
  } | null;
  /** The lease's Working renewal terms (S157). */
  readonly working?: {
    readonly rent: number | null;
    readonly effectiveDate: string | null;
    readonly endDate: string | null;
  } | null;
  /** The step's prepared message (S249), when its owner gives one. */
  readonly message?: GuidedMessageFacts | null;
  /** S252: an observed owner reply makes the owner's decision recordable here. */
  readonly ownerReply?: boolean;
  /** S251: the housing assistance path governs the renewal base. */
  readonly assisted?: boolean;
  /** S250: a verified standing agreement covers the owner step. */
  readonly standingCovered?: boolean;
  readonly extensions?: GuidedPriorityExtensions;
}

const MARKET_RENT_TARGET = "renewal-market-comparison-controls";
const RENT_TO_RECOMMEND_TARGET = "renewal-now-rent-to-recommend";
// S263: the verified current lease end is corrected through the existing lease fact correction.
const LEASE_END_TARGET = KICKOFF_FIX_TARGETS.correctFact;
const PRICING_BASIS_TARGET = "renewal-pricing-basis";
const HOUSING_TARGET = "renewal-now-housing-assistance";
/** S262: "Record the owner's answer" for an observed reply, on the Now card. */
export const OWNER_ANSWER_FROM_REPLY_TARGET = "renewal-owner-decision-from-reply";

function input(
  value: Omit<GuidedPriorityInput, "required" | "reason" | "kind"> &
    Partial<Pick<GuidedPriorityInput, "required" | "reason" | "kind">>,
): GuidedPriorityInput {
  return { kind: "fix", required: true, reason: null, ...value };
}

/** The outcome's material missing inputs for its intended action, in the S269 order. */
function missingInputs(facts: GuidedPriorityFacts): GuidedPriorityInput[] {
  const { shown } = facts;
  const ext = facts.extensions ?? {};
  const lease = facts.lease ?? null;
  const working = facts.working ?? null;
  const list: GuidedPriorityInput[] = [];
  const leaseEnd = (owner: RenewalPathStepId, reason: string | null) =>
    input({
      key: "current-lease-end",
      label: GUIDED_PRIORITY_WORDS.verifyCurrentLeaseEnd,
      target: ext.currentLeaseEnd?.target ?? LEASE_END_TARGET,
      owner,
      reason,
    });
  switch (shown.id) {
    case "check-numbers": {
      // Current lease identity and term or end date, then the current base rent, then a
      // material current charge difference, then a material housing assistance fact.
      if (lease?.endMissing) list.push(leaseEnd("check-numbers", null));
      if (lease?.baseRentFix)
        list.push(
          input({
            key: "current-base-rent",
            label: GUIDED_PRIORITY_WORDS.correctCurrentBaseRent,
            target: WORKING_CURRENT_RENT_TARGET,
            owner: "check-numbers",
            kind: "field",
            reason: lease.baseRentReason ?? null,
          }),
        );
      if (lease?.chargeFix)
        list.push(
          input({
            key: "charge-difference",
            label: lease.chargeFix.label,
            target: lease.chargeFix.target,
            owner: "check-numbers",
          }),
        );
      else if (lease?.numbersFix && !lease.baseRentFix && !lease.endMissing)
        list.push(
          input({
            key: "numbers-difference",
            label: lease.numbersFix.label,
            target: lease.numbersFix.target,
            owner: "check-numbers",
          }),
        );
      if (facts.housingAssistanceActive)
        list.push(
          input({
            key: "housing-assistance",
            label: GUIDED_PRIORITY_WORDS.housingAssistance,
            target: HOUSING_TARGET,
            owner: "check-numbers",
            kind: "field",
          }),
        );
      return list;
    }
    case "compare-market": {
      const comparison = facts.comparison ?? null;
      if (!comparison || comparison.state === "stored") return list;
      // An unavailable lookup leads with its existing recovery or the eligible manual
      // recommendation; otherwise the explicit permitted Compare market rent action.
      list.push(
        comparison.fix
          ? input({
              key: "comparison-recovery",
              label: comparison.fix.label,
              target: comparison.fix.target,
              owner: "compare-market",
            })
          : input({
              key: "compare-market",
              label: GUIDED_PRIORITY_WORDS.compareMarketRent,
              target: MARKET_RENT_TARGET,
              owner: "compare-market",
              kind: "action",
            }),
      );
      return list;
    }
    case "ask-owner": {
      if (ext.pricingChoice)
        list.push(
          input({
            key: "pricing-choice",
            label: GUIDED_PRIORITY_WORDS.choosePricingBasis,
            target: ext.pricingChoice.target ?? PRICING_BASIS_TARGET,
            owner: "ask-owner",
          }),
        );
      if (facts.message && !facts.message.ready)
        list.push(
          input({
            key: "message-fix",
            label: facts.message.label,
            target: facts.message.target,
            owner: "ask-owner",
            reason: facts.message.reason ?? null,
          }),
        );
      return list;
    }
    case "offer-tenant": {
      // The verified current lease end, the working base, the working start and end, the offer
      // charges, an included resource once the transitions are decided, then the message fix.
      if (lease?.endMissing)
        list.push(leaseEnd("check-numbers", "The offer needs the current lease end."));
      if (working && working.rent === null)
        list.push(
          input({
            key: "renewal-base-rent",
            label: GUIDED_PRIORITY_WORDS.setRenewalBaseRent,
            target: facts.assisted
              ? ASSISTED_CONTROL_IDS.rentChoice
              : facts.standingCovered
                ? PRICING_BASIS_TARGET
                : RENT_TO_RECOMMEND_TARGET,
            owner: facts.assisted
              ? "assisted-rent"
              : facts.standingCovered
                ? "ask-owner"
                : "compare-market",
            reason: "The offer needs the renewal base rent.",
          }),
        );
      if (working && working.effectiveDate === null)
        list.push(
          input({
            key: "renewal-start",
            label: GUIDED_PRIORITY_WORDS.enterRenewalStart,
            target: ext.renewalStart?.target ?? WORKING_START_FIELD_ID,
            owner: "ask-owner",
            kind: "field",
            reason: "The offer needs the renewal start date.",
          }),
        );
      if (working && working.endDate === null)
        list.push(
          input({
            key: "renewal-end",
            label: GUIDED_PRIORITY_WORDS.enterRenewalEnd,
            target: ext.renewalEnd?.target ?? WORKING_END_FIELD_ID,
            owner: "ask-owner",
            kind: "field",
            reason: "The offer needs the renewal end date.",
          }),
        );
      if (ext.offerCharges)
        list.push(
          input({
            key: "offer-charges",
            label: GUIDED_PRIORITY_WORDS.reviewOfferCharges,
            target: ext.offerCharges.target,
            owner: "offer-tenant",
            arrivesWith: "S264",
          }),
        );
      // Only once the applicable transition decisions are ready (the offer charges' own and the
      // resource requirements') does a missing required resource lead with its fix.
      if (
        ext.includedResource &&
        ext.includedResource.transitionsReady !== false &&
        (ext.offerCharges?.transitionsReady ?? true)
      )
        list.push(
          input({
            key: "included-resource",
            label: ext.includedResource.label,
            target: ext.includedResource.target,
            owner: ext.includedResource.owner ?? "offer-tenant",
            reason: ext.includedResource.reason ?? null,
            arrivesWith: "S265",
          }),
        );
      if (facts.message && !facts.message.ready)
        list.push(
          input({
            key: "message-fix",
            label: facts.message.label,
            target: facts.message.target,
            owner: "offer-tenant",
            reason: facts.message.reason ?? null,
          }),
        );
      return list;
    }
    case "documents":
      if (ext.packetLead)
        list.push(
          input({
            key: "packet-lead",
            label: ext.packetLead.label,
            target: ext.packetLead.target,
            owner: "documents",
            arrivesWith: "S268",
          }),
        );
      return list;
    default:
      return list;
  }
}

/** The eligible editor or next action when nothing earlier governs (tier 4). */
function actionFor(facts: GuidedPriorityFacts): GuidedPriorityInput | null {
  const { shown, stage } = facts;
  const primary = shown.primary;
  switch (shown.id) {
    case "compare-market":
      // A usable saved comparison leads with Rent to recommend, the one editable field.
      if (facts.comparison?.state === "stored")
        return input({
          key: "rent-to-recommend",
          label: GUIDED_PRIORITY_WORDS.rentToRecommend,
          target: RENT_TO_RECOMMEND_TARGET,
          owner: "compare-market",
          kind: "field",
        });
      break;
    case "ask-owner":
      if (shown.state === "covered")
        return input({
          key: "continue",
          label: GUIDED_PRIORITY_WORDS.continueToOffer,
          target: "renewal-outcome-offer-tenant",
          owner: "ask-owner",
          kind: "action",
        });
      if (facts.message?.ready)
        return input({
          key: "review-message",
          label: GUIDED_PRIORITY_WORDS.reviewOwnerMessage,
          target: facts.message.target,
          owner: "ask-owner",
          kind: "action",
        });
      break;
    case "offer-tenant":
      if (facts.message?.ready)
        return input({
          key: "review-message",
          label: GUIDED_PRIORITY_WORDS.reviewTenantOffer,
          target: facts.message.target,
          owner: "offer-tenant",
          kind: "action",
        });
      break;
    case "complete":
      // An incomplete case shows the first exact unfinished action, from its own outcome.
      if (stage.currentStepId !== "complete" && shown.state !== "done") {
        const current = stage.steps.find((step) => step.id === stage.currentStepId);
        if (current?.primary)
          return input({
            key: "unfinished",
            label: current.primary.label,
            target: current.primary.target,
            owner: current.id,
            kind: "action",
            reason: `Not finished yet: ${current.label}.`,
          });
      }
      break;
    default:
      break;
  }
  if (!primary) return null;
  return input({
    key: primary.continueTo ? "continue" : "step-action",
    label: primary.label,
    target: primary.continueTo ? `renewal-outcome-${primary.continueTo}` : primary.target,
    owner: shown.id,
    kind: "action",
  });
}

function cueFor(
  facts: GuidedPriorityFacts,
  state: GuidedPriorityState,
  lead: GuidedPriorityInput | null,
): string | null {
  const { shown, stage } = facts;
  const audience =
    shown.id === "ask-owner" || shown.id === "assisted-owner-renewal-answer"
      ? "owner"
      : "tenant";
  switch (state) {
    case "not_part":
      return `${NOT_PART_OF_PATH_LABEL}.`;
    case "retired":
      // The retirement review is the lead; the stage line already says so.
      return null;
    case "read_only":
      return "You can review this step. Changes here need Editor access in Renewals.";
    case "done":
      return "Done.";
    case "reconcile":
      return `The last ${audience} message is not confirmed yet.`;
    case "recover":
      if (lead?.key === "editor") {
        // The editor's own status keeps its exact words and retry; the cue names the field.
        const editor = facts.editors?.find((entry) => entry.target === lead.target);
        return editor?.phase === "saving"
          ? `Saving: ${editor.label}.`
          : `Not saved yet: ${editor?.label ?? lead.label}.`;
      }
      return null;
    case "missing":
      return lead?.reason ?? null;
    case "wait":
      return stage.waiting && shown.id === stage.currentStepId
        ? renewalStageWaitingLine(stage.waiting)
        : null;
    default:
      return null;
  }
}

/** R-S269-1: the one live priority for the outcome the Guided view shows. */
export function projectGuidedPriority(facts: GuidedPriorityFacts): GuidedPriority {
  const { stage, shown } = facts;
  const isCurrent = shown.id === stage.currentStepId;
  const audience =
    shown.id === "ask-owner" || shown.id === "assisted-owner-renewal-answer"
      ? "owner"
      : shown.id === "offer-tenant"
        ? "tenant"
        : null;
  const finish = (
    state: GuidedPriorityState,
    lead: GuidedPriorityInput | null,
    inputs: readonly GuidedPriorityInput[] = lead ? [lead] : [],
    suppressSend = false,
  ): GuidedPriority => ({
    stepId: shown.id,
    state,
    tier: GUIDED_PRIORITY_TIER[state],
    cue: cueFor(facts, state, lead),
    lead,
    inputs,
    suppressSend,
    crossOutcome: Boolean(lead && lead.owner !== shown.id),
  });

  // 1. Access and applicability.
  if (shown.state === "not_part") return finish("not_part", null);
  if (isCurrent && stage.stage.key === "retired")
    return finish(
      "retired",
      stage.blocker?.target
        ? input({
            key: "blocker",
            label: stage.blocker.label,
            target: stage.blocker.target,
            owner: shown.id,
            kind: "action",
          })
        : null,
    );
  if (
    isCurrent &&
    stage.blocker &&
    stage.blocker.target === "renewal-card-manual-records"
  )
    return finish(
      "recover",
      input({
        key: "blocker",
        label: stage.blocker.label,
        target: stage.blocker.target,
        owner: shown.id,
        kind: "action",
      }),
    );

  // 2. An unresolved previous effect for the intended action leads, on the same attempt.
  const evidence = audience ? stage.evidence[audience] : null;
  if (
    audience &&
    (evidence?.unconfirmedSequenceId ||
      shown.primary?.label === RENEWAL_STAGE_NEXT_STEP.checkSend)
  ) {
    const lead = input({
      key: "check-send",
      label: RENEWAL_STAGE_NEXT_STEP.checkSend,
      target: shown.primary?.target ?? `renewal-card-message-${audience}`,
      owner: shown.id,
      kind: "action",
    });
    return finish("reconcile", facts.canEdit ? lead : null, [lead], true);
  }

  if (!facts.canEdit)
    // A read-only person sees the actual state and the permitted handoff; nothing to edit.
    return finish(
      shown.state === "waiting" ? "wait" : shown.state === "done" ? "done" : "read_only",
      null,
    );

  if (shown.state === "done" && shown.id !== "complete" && !shown.primary)
    return finish("done", null);

  // 3. The active editor's failed or pending save, a stale basis, then the first missing input.
  const editor =
    facts.editors?.find((entry) => entry.phase === "failed") ??
    facts.editors?.find((entry) => entry.phase === "saving");
  if (editor)
    return finish(
      "recover",
      input({
        key: "editor",
        label: editor.label,
        target: editor.target,
        owner: shown.id,
        kind: "field",
      }),
    );
  if (isCurrent && stage.blocker)
    return finish(
      "recover",
      input({
        key: "blocker",
        label: stage.blocker.label,
        target: stage.blocker.target ?? "renewal-refresh",
        owner: shown.id,
        kind: "action",
      }),
    );
  if (shown.primary?.label === RENEWAL_STAGE_NEXT_STEP.settleCheck)
    return finish(
      "recover",
      input({
        key: "settle-check",
        label: shown.primary.label,
        target: shown.primary.target,
        owner: shown.id,
        kind: "action",
      }),
    );
  // An eligible actual answer leads ahead of preparation facts that serve a different action.
  const answerFirst =
    (shown.id === "ask-owner" && (facts.ownerReply || facts.extensions?.ownerAnswer)) ||
    (shown.id === "offer-tenant" &&
      shown.state === "current" &&
      shown.primary !== null &&
      /response|decision|form/i.test(shown.primary.label));
  if (answerFirst) {
    // S262: an observed owner reply opens "Record the owner's answer" on the Now card; an
    // explicit task names the answer control it opens through the extension.
    const ownerAnswer =
      facts.extensions?.ownerAnswer ??
      (facts.ownerReply ? { target: OWNER_ANSWER_FROM_REPLY_TARGET } : null);
    const lead =
      shown.id === "ask-owner" && ownerAnswer
        ? input({
            key: "owner-answer",
            label: ownerAnswer.label ?? GUIDED_PRIORITY_WORDS.recordOwnerAnswer,
            target: ownerAnswer.target,
            owner: "ask-owner",
            kind: "field",
          })
        : shown.primary
          ? input({
              key: shown.id === "ask-owner" ? "owner-answer" : "tenant-answer",
              label: shown.primary.label,
              target: shown.primary.target,
              owner: shown.id,
              kind: "field",
            })
          : null;
    if (lead) return finish("act", lead);
  }
  if (shown.state !== "waiting" && shown.state !== "covered") {
    const missing = missingInputs(facts);
    if (missing.length > 0) return finish("missing", missing[0]!, missing);
  }

  // 4. The eligible editor or next action, or the honest wait.
  const action = actionFor(facts);
  if (shown.state === "waiting" || shown.scheduled || shown.state === "covered")
    return finish("wait", action);
  return finish("act", action);
}

/**
 * S265 into S269 (Offer the tenant order): the first required tenant resource the exact offer
 * content still needs, as its readiness item names it (with the Admin handoff a role that does
 * not maintain the links reads), its one Connections entry, and whether the applicable transition
 * decisions are ready. Null when every required resource is in order. Pure; reads nothing.
 */
export function includedResourceFix(
  inclusion: TenantResourceInclusion | null,
  readinessItems: readonly MessageMissingInput[] | null,
): {
  readonly label: string;
  readonly href: string;
  readonly reason: string;
  readonly transitionsReady: boolean;
} | null {
  if (!inclusion || !readinessItems) return null;
  const problem = inclusion.problems.find((entry) =>
    inclusion.required.includes(entry.resourceId),
  );
  const item = problem
    ? readinessItems.find((entry) => entry.field === problem.field)
    : undefined;
  if (!item || item.target.kind !== "route") return null;
  return {
    label: item.target.label,
    href: item.target.href,
    reason: item.message,
    transitionsReady: inclusion.holds.length === 0,
  };
}

/** The path step label a return names, for the step a cross-outcome fix started in. */
export function guidedReturnLabel(stepId: RenewalPathStepId): string {
  return GUIDED_RETURN_LABELS[stepId] ?? `Return to ${RENEWAL_PATH_LABELS[stepId]}`;
}

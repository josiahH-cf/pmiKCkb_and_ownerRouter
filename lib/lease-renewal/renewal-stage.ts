// S247 R-S247-3 (ARCH-S247-1): the ONE stage projection. The desk row, the lease page's guided
// view, assistant answers about a lease and My Work lease links read the stage and the one next
// step from here, so they cannot name different next steps. It walks the path definition in
// `renewal-path.ts` over the existing predicates: the staff lane (`manualRenewalSummary`), the
// S248 evidence (`outreach-evidence.ts`), the S246 target verdict and the shared desk guidance.
//
// Pure and client-safe. It stores nothing and gates nothing (ARCH-S247-3): every step can be
// chosen and worked at any time, and only a control's own inputs and authority limit it (S156).
// R-S248-12: nothing here derives a reminder, a deadline, a follow-up or a schedule; elapsed time
// is stated as a fact ("since 11/04/2026") and nothing more.

import { formatCalendarDate, formatCalendarDateOrTimestamp } from "@/lib/date-display";
import {
  MANUAL_ACTIVITIES,
  MANUAL_REQUIRED_RENEWAL,
  currentManualTenantOutcome,
  currentRentChoice,
  emptyRenewalWorkspace,
  currentStaffActivity,
  manualActionLabel,
  manualActivitySatisfied,
  manualRenewalSummary,
  type ManualActivity,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  audienceEvidenceSentence,
  derivedOutreachAttribution,
  outreachDate,
  NO_WORK_RECORD_CYCLE,
  outreachFill,
  outreachScopeFor,
  projectOutreachEvidence,
  type AudienceOutreachEvidence,
  type DerivedOutreachRecord,
  type LeaseOutreachEvidenceInput,
  type OutreachCheck,
  type OutreachEvidence,
  type OutreachFill,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  NOT_PART_OF_PATH_LABEL,
  RENEWAL_PATH_DEFINITION,
  assistedProgramContactLabel,
  renewalPathSteps,
  type RenewalPathStepId,
  type RenewalPathVariants,
} from "@/lib/lease-renewal/renewal-path";
import type { RenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";
import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  RENEWAL_WORK_STATUS_LABELS,
  type RenewalWorkStatus,
} from "@/lib/lease-renewal/work-status";

export const RENEWAL_STAGE_VERSION = "renewal-stage/v1" as const;

const TEAM = "the PMI KC team";

/** The exact next-step words the evidence states read (S248). */
export const RENEWAL_STAGE_NEXT_STEP = {
  checkSend: "Check whether the message went out",
  checkAddress: "Check the address and send again",
  sentFromGmail: "I sent it from Gmail",
  confirmFinished: "Confirm this renewal is finished",
  notOutreach: "This was not the renewal outreach",
  /** R-S248-9: both facts are shown and neither wins; staff record which one is right. */
  settleCheck: "Review both facts and record what happened",
} as const;

/**
 * Everything the projection reads besides the staff record. The server builds it once from the
 * same loaded row the desk renders; the lease page recomputes the stage from it and the live staff
 * record after each save, so both read the same facts. Serializable.
 */
export interface RenewalStageContext {
  readonly leaseId: string;
  /** The staff-record read failed for this render; nothing about it is known. */
  readonly staffRecordUnavailable: boolean;
  /** The existing standing owner authority (S194) covering this lease's current record. */
  readonly standingAgreement: {
    readonly label: string | null;
    readonly reason: string;
  } | null;
  /**
   * S250 R-S250-6: a standing agreement is the lease's pricing basis but does not cover it now (a
   * typed rent different from the rule, an ended, revoked or unverifiable agreement, a conflict).
   * The lease returns to Ask the owner with this reason in words.
   */
  readonly standingLeft?: { readonly reason: string } | null;
  /** S251: the lease's Housing assistance Yes fact with its program; null for No or not set. */
  readonly housingAssistance: { readonly program: string } | null;
  /**
   * S251 R-S251-10: RentVine text mentions housing assistance while the fact is not set. A
   * suggestion only: it changes no step, stage or order.
   */
  readonly housingAssistanceMention?: true;
  /**
   * Check the numbers: the shared desk guidance's rent verification and the open differences.
   * S249 R-S249-1: where the preparation projection was made, these come from its numbers check
   * (RentVine as the basis, D-OP-7) and `line` states "Numbers agree" or the one difference.
   */
  readonly numbers: {
    readonly verified: boolean;
    readonly openDifferences: number;
    readonly line?: string;
  };
  /**
   * S249 ARCH-S249-1: the one preparation projection for this lease and cycle; absent where it was
   * not made (a sample lease). A stored comparison for the cycle completes Compare market rent.
   */
  readonly preparation?: RenewalPreparation | null;
  readonly term: { readonly monthToMonth: boolean; readonly reviewNeeded: boolean };
  /** RentVine reports a move-out notice: the later steps become the non-renewal handoff. */
  readonly moveOutInitiated: boolean;
  /** S246 R-S246-5: RentVine reports a later lease end than the recorded cycle. */
  readonly sourceRenewal: {
    readonly recordedDateIso: string;
    readonly sourceDateIso: string;
    readonly cycleId: string;
    readonly revision: number;
  } | null;
  /** The shared guidance says the lease needs verification; the Now card leads with this. */
  readonly verification: { readonly label: string; readonly refresh: boolean } | null;
  /** S119: the hand-set staff work status for the current cycle, when one is saved. */
  readonly handStatus: { readonly key: RenewalWorkStatus; readonly label: string } | null;
  /** S75: the last contact the follow-up projection observed. */
  readonly lastContactAtIso: string | null;
  /**
   * S232 R-S232-4: the staff record and the linked Gmail thread disagree, in both facts' words, as
   * `leaseWorkStatusLines` writes them; null when they agree or no thread fact is known.
   */
  readonly threadCheck: string | null;
  /** S248: this lease's linked renewal messages, records and drafts; null when not read. */
  readonly outreach: LeaseOutreachEvidenceInput | null;
  /**
   * AC-S248-4: the lease's current cycle date (the RentVine lease end, or a month-to-month
   * lease's review date), which places a message that named no cycle while the lease has no work
   * record. Absent or null: no such message counts.
   */
  readonly cycleDateIso?: string | null;
  /**
   * R-S248-7: the confirmed RentVine updates the lease page read with their receipts. A receipt
   * read back marks its Finish up item done as verified by the provider. Absent where no receipt
   * was read (the desk row); the staff record and the operating Sheet receipts still show.
   */
  readonly providerUpdates?: readonly RenewalProviderUpdate[] | null;
}

/** R-S248-7: one confirmed RentVine update and whether its receipt was read back. */
export interface RenewalProviderUpdate {
  readonly id: string;
  readonly label: string;
  readonly verified: boolean;
  /** The update's own state in the existing words ("Applied with receipt" and the rest). */
  readonly stateLabel: string;
}

/** R-S248-7: who settled a Finish up item; each reads in its own words. */
export type RenewalFinishUpOrigin = "staff" | "provider_verified";

/** R-S248-7: one item of Finish up: a follow-up, an operating Sheet or a RentVine update. */
export interface RenewalFinishUpItem {
  readonly key: string;
  readonly label: string;
  readonly done: boolean;
  readonly origin: RenewalFinishUpOrigin | null;
  /** The item's state in words, distinct for staff-recorded and provider-verified. */
  readonly detail: string;
  /** S251 R-S251-9: the item is not part of this lease's path and asks for nothing. */
  readonly notPart?: true;
}

/** R-S248-7: the words a Finish up item's state reads in. */
export const RENEWAL_FINISH_UP_WORDS = {
  staff: "Done: recorded by staff",
  providerVerified: "Done: verified by the provider's receipt",
  open: "Open",
} as const;

export type RenewalPathStepState =
  | "done"
  | "current"
  | "open"
  | "waiting"
  | "covered"
  | "not_part";

export interface RenewalPathStepView {
  readonly id: RenewalPathStepId;
  readonly label: string;
  readonly state: RenewalPathStepState;
  /** One line about this step's state; null when its label is enough. */
  readonly detail: string | null;
  /** The step's one primary action, or null when the step asks for nothing. */
  readonly primary: { readonly label: string; readonly target: string } | null;
  readonly controls: readonly string[];
  /** A scheduled first message is not yet sent: nothing to send again or record about it. */
  readonly scheduled?: boolean;
}

export interface RenewalStageWaiting {
  readonly party: string;
  readonly sinceIso: string | null;
  readonly lastContactIso: string | null;
  readonly watching: string;
}

export interface RenewalStageCheck {
  readonly kind: "evidence" | "linked_thread";
  /** Both facts in one sentence. */
  readonly sentence: string;
}

export interface RenewalDerivedFact {
  readonly record: DerivedOutreachRecord;
  readonly attribution: string;
}

export interface RenewalStage {
  readonly version: typeof RENEWAL_STAGE_VERSION;
  readonly stage: { readonly key: RenewalWorkStatus; readonly label: string };
  /** One line: the stage, who the lease waits on and since when, or the fact to settle. */
  readonly stageLine: string;
  readonly currentStepId: RenewalPathStepId;
  readonly nextStep: {
    readonly label: string;
    readonly stepId: RenewalPathStepId;
    /** The legacy `step` value for links from surfaces that predate the path. */
    readonly processStepId: RenewalProcessStepId | null;
  };
  readonly waiting: RenewalStageWaiting | null;
  /** The evidence sentence behind the stage ("Owner replied 11/05/2026"), when there is one. */
  readonly evidenceLine: string | null;
  readonly steps: readonly RenewalPathStepView[];
  /**
   * R-S248-9: staff recorded something different after the evidence time, or (S232) the staff
   * record and the linked Gmail thread disagree. Both facts, and neither wins.
   */
  readonly check: RenewalStageCheck | null;
  /** The S248 evidence disagreement itself, when that is the check. */
  readonly evidenceCheck: OutreachCheck | null;
  /** R-S248-10: facts the app derived, with where they came from. */
  readonly derived: readonly RenewalDerivedFact[];
  /** R-S247-8: the hand-set status and the derived stage in one line when they differ. */
  readonly handStatusLine: string | null;
  /** Something to resolve before relying on the stage: a refresh or a record reload. */
  readonly blocker: { readonly label: string; readonly target: string | null } | null;
  readonly evidence: OutreachEvidence;
  /** R-S248-7: Finish up's items: follow-ups, operating Sheet updates and RentVine updates. */
  readonly finishUp: readonly RenewalFinishUpItem[];
}

const STEP_FOR_ACTIVITY: Record<
  ManualActivity | "owner_response" | "tenant_response" | "complete",
  RenewalPathStepId
> = {
  program_contact: "assisted-program-contact",
  owner_outreach: "ask-owner",
  owner_response: "ask-owner",
  tenant_offer: "offer-tenant",
  tenant_response: "offer-tenant",
  information_form: "offer-tenant",
  form_returned: "offer-tenant",
  documents: "documents",
  document_delivery: "documents",
  signatures: "documents",
  insurance: "finish-up",
  rhino: "finish-up",
  pet: "finish-up",
  charges: "finish-up",
  inspection: "finish-up",
  filter: "finish-up",
  utilities: "finish-up",
  assisted_housing: "finish-up",
  non_renewal_handoff: "non-renewal-handoff",
  complete: "complete",
};

const DOCUMENT_ACTIVITIES: readonly ManualActivity[] = [
  "documents",
  "document_delivery",
  "signatures",
];
const FOLLOW_UP_ACTIVITIES: readonly ManualActivity[] = MANUAL_REQUIRED_RENEWAL.filter(
  (key) => STEP_FOR_ACTIVITY[key] === "finish-up",
);

/** Imperative wording for the staff activities whose labels read as records. */
const ACTIVITY_NEXT_STEP: Partial<Record<ManualActivity, string>> = {
  documents: "Prepare the required documents",
  document_delivery: "Deliver the required documents",
  signatures: "Collect the required signatures",
  information_form: "Send the renewal information form",
  form_returned: "Record the returned information form",
  non_renewal_handoff: "Record the non-renewal handoff",
};

function stageLabel(key: RenewalWorkStatus): string {
  return RENEWAL_WORK_STATUS_LABELS[key];
}

/** "since 11/04/2026", from an instant or a calendar date. */
function since(iso: string | null): string {
  return iso ? ` since ${formatCalendarDateOrTimestamp(iso).split(",")[0]}` : "";
}

function msIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

type Lane = ReturnType<typeof manualRenewalSummary>;

interface Evaluation {
  readonly state: RenewalWorkspaceState | null;
  readonly lane: Lane;
  readonly fill: OutreachFill;
  readonly evidence: OutreachEvidence;
  readonly context: RenewalStageContext;
  readonly variants: RenewalPathVariants;
}

const satisfiedFor = (evaluation: Evaluation) => (key: ManualActivity) => {
  const { state, fill } = evaluation;
  // S251 R-S251-9: without Housing assistance Yes the assisted-housing follow-up asks nothing.
  if (key === "assisted_housing" && !evaluation.variants.housingAssistance) return true;
  if (!state) return false;
  if (manualActivitySatisfied(state, key)) return true;
  if (key === "owner_outreach") return Boolean(fill.owner_outreach);
  if (key === "tenant_offer") return Boolean(fill.tenant_offer);
  return false;
};

/** The audience step's evidence-aware substate: what the step shows and its next step. */
function audienceStep(
  evaluation: Evaluation,
  audience: "owner" | "tenant",
): {
  readonly state: RenewalPathStepState;
  readonly stage: RenewalWorkStatus;
  readonly nextStep: string;
  readonly primary: { label: string; target: string } | null;
  readonly detail: string | null;
  readonly waiting: RenewalStageWaiting | null;
  readonly scheduled?: boolean;
} {
  const { lane, state } = evaluation;
  const satisfied = satisfiedFor(evaluation);
  const evidence: AudienceOutreachEvidence = evaluation.evidence[audience];
  const definition =
    RENEWAL_PATH_DEFINITION[audience === "owner" ? "ask-owner" : "offer-tenant"];
  const outreachKey = audience === "owner" ? "owner_outreach" : "tenant_offer";
  const responseKey = audience === "owner" ? "owner_response" : "tenant_response";
  const messageTarget =
    audience === "owner" ? "renewal-card-message-owner" : "renewal-card-message-tenant";
  const responseTarget = `renewal-manual-${responseKey}`;
  const who = audience === "owner" ? "owner" : "tenant";
  const sentence = audienceEvidenceSentence(evidence);
  const outreachDone = satisfied(outreachKey);
  const tenantOutcome = state ? currentManualTenantOutcome(state) : null;
  // As in the staff lane, a current tenant counter reopens the owner response.
  const counterReopen =
    satisfied("tenant_offer") && tenantOutcome === "counter_change_requested";
  // The recorded answer that ends the step.
  const decided =
    audience === "owner"
      ? (state?.ownerResponse?.outcome === "approved_terms" && !counterReopen) ||
        state?.ownerResponse?.outcome === "declined_non_renewal"
      : tenantOutcome === "accepted" || tenantOutcome === "declined_nonrenewing";
  if (audience === "owner" && evaluation.context.standingAgreement && !decided)
    return {
      state: "covered",
      stage: definition.stage,
      nextStep: definition.primary.label,
      primary: null,
      detail: null,
      waiting: null,
    };
  if (audience === "tenant" && tenantOutcome === "counter_change_requested") {
    const label = manualActionLabel("tenant_response", lane);
    return {
      state: "open",
      stage: definition.stage,
      nextStep: label,
      primary: { label, target: responseTarget },
      detail: "The tenant requested a change to the current terms.",
      waiting: null,
    };
  }
  if (decided) {
    return {
      state: "done",
      stage: definition.stage,
      nextStep: definition.primary.label,
      primary: null,
      detail: null,
      waiting: null,
    };
  }
  // R-S248-9 (L41): the staff record and the app's evidence disagree. Both facts are shown and
  // neither wins, so the one next step settles the check at the staff record it concerns; it is
  // never a new send.
  const check = evaluation.fill.checks.find((entry) => entry.audience === audience);
  if (check) {
    const target =
      check.subject === "response" ? responseTarget : `renewal-manual-${outreachKey}`;
    return {
      state: "current",
      stage:
        check.subject === "response"
          ? (definition.waitingStage ?? definition.stage)
          : definition.stage,
      nextStep: RENEWAL_STAGE_NEXT_STEP.settleCheck,
      primary: { label: RENEWAL_STAGE_NEXT_STEP.settleCheck, target },
      detail: `Needs a check: The staff record ${check.staffRecord}; the app's records ${check.appEvidence}.`,
      waiting: null,
    };
  }
  if (outreachDone) {
    const replied =
      audience === "owner" ? Boolean(lane.ownerReplied) : Boolean(lane.tenantReplied);
    const revision = audience === "owner" && Boolean(lane.ownerRevisionRequested);
    const staffMove = lane.nextActivity === responseKey && lane.waitingParty === "staff";
    if (replied || revision || staffMove) {
      const label = manualActionLabel(responseKey, lane);
      return {
        state: "current",
        stage: definition.waitingStage ?? definition.stage,
        nextStep: label,
        primary: { label, target: responseTarget },
        detail: replied ? sentence : null,
        waiting: null,
      };
    }
    // R-S247-5: waiting is a state; who, since when, the last contact and what is watched.
    const derived = evidence.derived;
    const staffRecord = state ? currentStaffActivity(state, outreachKey) : null;
    const sinceIso =
      msIso(derived?.sentAtMs ?? null) ??
      staffRecord?.occurredAt ??
      staffRecord?.recordedAt ??
      null;
    return {
      state: "waiting",
      stage: definition.waitingStage ?? definition.stage,
      nextStep: manualActionLabel(responseKey, lane),
      primary: { label: manualActionLabel(responseKey, lane), target: responseTarget },
      detail: sentence,
      waiting: {
        party: `the ${who}`,
        sinceIso,
        lastContactIso:
          msIso(evidence.lastSentAtMs) ?? evaluation.context.lastContactAtIso ?? sinceIso,
        watching: definition.waiting!.watching,
      },
    };
  }
  // Not yet sent: the evidence state names its own next step and never counts as outreach.
  switch (evidence.state) {
    case "unconfirmed":
      return {
        state: "current",
        stage: definition.stage,
        nextStep: RENEWAL_STAGE_NEXT_STEP.checkSend,
        primary: { label: RENEWAL_STAGE_NEXT_STEP.checkSend, target: messageTarget },
        detail: sentence,
        waiting: null,
      };
    case "delivery_failed":
      return {
        state: "current",
        stage: definition.stage,
        nextStep: RENEWAL_STAGE_NEXT_STEP.checkAddress,
        primary: { label: RENEWAL_STAGE_NEXT_STEP.checkAddress, target: messageTarget },
        detail: sentence,
        waiting: null,
      };
    case "scheduled":
      return {
        state: "waiting",
        stage: definition.stage,
        nextStep: `Review the scheduled ${who} message`,
        primary: { label: `Review the scheduled ${who} message`, target: messageTarget },
        detail: sentence,
        waiting: {
          party: "the scheduled send",
          sinceIso: null,
          lastContactIso: evaluation.context.lastContactAtIso,
          watching: `The ${who} message is counted as sent only once Gmail accepts it.`,
        },
        scheduled: true,
      };
    case "draft":
      return {
        state: "current",
        stage: definition.stage,
        nextStep: "Send the Gmail draft",
        primary: {
          label: RENEWAL_STAGE_NEXT_STEP.sentFromGmail,
          target: `renewal-manual-${outreachKey}`,
        },
        detail: sentence,
        waiting: null,
      };
    default:
      return {
        state: "current",
        stage: definition.stage,
        nextStep: definition.primary.label,
        primary: definition.primary,
        detail: null,
        waiting: null,
      };
  }
}

/**
 * S251 R-S251-5: "Ask the owner whether to renew this tenant". Renew (or an approval of terms,
 * which settles the answer and the rent together, R-S251-8) ends the step; Do not renew takes the
 * lease to the existing non-renewal handoff. An outreach recorded or accepted for this cycle waits
 * on the owner's answer; "No answer yet" keeps waiting.
 */
function assistedAnswerStep(evaluation: Evaluation): {
  readonly state: RenewalPathStepState;
  readonly stage: RenewalWorkStatus;
  readonly nextStep: string;
  readonly primary: { label: string; target: string } | null;
  readonly detail: string | null;
  readonly waiting: RenewalStageWaiting | null;
  readonly scheduled?: boolean;
} {
  const { state, lane } = evaluation;
  const definition = RENEWAL_PATH_DEFINITION["assisted-owner-renewal-answer"];
  const answer = state?.ownerResponse?.outcome ?? null;
  if (
    answer === "renew_tenant" ||
    answer === "approved_terms" ||
    answer === "declined_non_renewal"
  )
    return {
      state: "done",
      stage: definition.stage,
      nextStep: definition.primary.label,
      primary: null,
      detail:
        answer === "declined_non_renewal"
          ? "The owner does not want to renew this tenant."
          : answer === "approved_terms"
            ? "The owner approved the terms, which answers renewing and the rent together."
            : "The owner wants to renew this tenant.",
      waiting: null,
    };
  const satisfied = satisfiedFor(evaluation);
  const evidence = evaluation.evidence.owner;
  const sentence = audienceEvidenceSentence(evidence);
  if (!satisfied("owner_outreach") && answer !== "no_response")
    return {
      state: "current",
      stage: definition.stage,
      nextStep: definition.label,
      primary: definition.primary,
      detail: sentence,
      waiting: null,
    };
  if (lane.ownerReplied || lane.ownerRevisionRequested)
    return {
      state: "current",
      stage: definition.waitingStage ?? definition.stage,
      nextStep: definition.primary.label,
      primary: definition.primary,
      detail: sentence,
      waiting: null,
    };
  const derived = evidence.derived;
  const staffRecord = state ? currentStaffActivity(state, "owner_outreach") : null;
  const sinceIso =
    msIso(derived?.sentAtMs ?? null) ??
    staffRecord?.occurredAt ??
    staffRecord?.recordedAt ??
    state?.ownerResponse?.occurredAt ??
    state?.ownerResponse?.recordedAt ??
    null;
  return {
    state: "waiting",
    stage: definition.waitingStage ?? definition.stage,
    nextStep: definition.primary.label,
    primary: definition.primary,
    detail: sentence,
    waiting: {
      party: "the owner",
      sinceIso,
      lastContactIso:
        msIso(evidence.lastSentAtMs) ?? evaluation.context.lastContactAtIso ?? sinceIso,
      watching: definition.waiting!.watching,
    },
  };
}

function activityStepState(
  evaluation: Evaluation,
  keys: readonly ManualActivity[],
): { done: boolean; next: ManualActivity | null } {
  const satisfied = satisfiedFor(evaluation);
  const next = keys.find((key) => !satisfied(key)) ?? null;
  return { done: next === null && evaluation.state !== null, next };
}

function variantsFor(
  state: RenewalWorkspaceState | null,
  lane: Lane,
  context: RenewalStageContext,
): RenewalPathVariants {
  return {
    nonRenewal: lane.nonRenewal
      ? { source: "recorded" }
      : context.moveOutInitiated
        ? { source: "rentvine" }
        : null,
    monthToMonth: context.term.monthToMonth,
    standingAgreement: context.standingAgreement,
    housingAssistance: context.housingAssistance
      ? {
          program: context.housingAssistance.program,
          rentChoice: currentRentChoice(state),
        }
      : null,
  };
}

/**
 * R-S248-7: Finish up's items. A follow-up is done when staff recorded it; an operating Sheet
 * update is done when its confirmed update was read back (the existing receipt sync marks it
 * verified); a RentVine update is done when its receipt was read. Nothing here completes the lease:
 * completion stays the staff confirmation.
 */
function finishUpItems(
  evaluation: Evaluation,
  keys: readonly ManualActivity[],
): RenewalFinishUpItem[] {
  const { state, context } = evaluation;
  const satisfied = satisfiedFor(evaluation);
  const items: RenewalFinishUpItem[] = keys.map((key) => {
    // S251 R-S251-9: the assisted-housing follow-up is part of the path only with Housing
    // assistance Yes; otherwise it reads as not part of this lease's path and asks for nothing.
    if (key === "assisted_housing" && !evaluation.variants.housingAssistance)
      return {
        key: `follow-up:${key}`,
        label: MANUAL_ACTIVITIES[key].label,
        done: true,
        origin: null,
        detail: NOT_PART_OF_PATH_LABEL,
        notPart: true,
      };
    const done = satisfied(key);
    return {
      key: `follow-up:${key}`,
      label: MANUAL_ACTIVITIES[key].label,
      done,
      origin: done ? "staff" : null,
      detail: done ? RENEWAL_FINISH_UP_WORDS.staff : RENEWAL_FINISH_UP_WORDS.open,
    };
  });
  for (const [field, update] of Object.entries(state?.sourceUpdates ?? {})) {
    const verified = update.state === "verified";
    const label =
      (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
    items.push({
      key: `sheet:${field}`,
      label: `Operating Sheet: ${label}`,
      done: verified,
      origin: verified ? "provider_verified" : null,
      detail: verified
        ? RENEWAL_FINISH_UP_WORDS.providerVerified
        : update.state === "prepared"
          ? "Prepared, waiting for its own confirmation"
          : update.state === "unavailable"
            ? "Preparation unavailable"
            : "Waiting to be prepared",
    });
  }
  for (const update of context.providerUpdates ?? [])
    items.push({
      key: `rentvine:${update.id}`,
      label: update.label,
      done: update.verified,
      origin: update.verified ? "provider_verified" : null,
      detail: update.verified
        ? RENEWAL_FINISH_UP_WORDS.providerVerified
        : update.stateLabel,
    });
  return items;
}

/** S251 R-S251-6: the rent step's one line once a choice is recorded. */
function assistedRentDetail(state: RenewalWorkspaceState | null): string | null {
  if (state?.ownerResponse?.outcome === "approved_terms")
    return "The owner approved the terms, which settles the rent for this renewal.";
  const choice = currentRentChoice(state);
  if (choice === "keep_current")
    return "Keep the current rent: the working rent is the current rent, so the rent comparison and the owner's rent decision are not part of this lease's path.";
  if (choice === "propose_change")
    return "Propose a change: the prepared comparison, the recommendation and the owner's rent decision follow.";
  return null;
}

/** The current step: the staff lane's step once work has started, else the first open one. */
function currentStepFor(
  evaluation: Evaluation,
  steps: readonly { id: RenewalPathStepId; applies: boolean; done: boolean }[],
): RenewalPathStepId {
  const { lane, state, context, evidence } = evaluation;
  if (lane.complete) return "complete";
  if (context.sourceRenewal) return "complete";
  if (evaluation.variants.nonRenewal?.source === "rentvine" && !lane.nonRenewal) {
    const handoffDone = state
      ? manualActivitySatisfied(state, "non_renewal_handoff")
      : false;
    return handoffDone ? "complete" : "non-renewal-handoff";
  }
  const laneStep = STEP_FOR_ACTIVITY[lane.nextActivity];
  const started =
    Boolean(state) &&
    (Object.keys(state!.activities).length > 0 ||
      state!.ownerResponse !== null ||
      state!.tenantResponse !== null ||
      state!.completion !== null);
  const progressed =
    started ||
    evidence.owner.state !== "none" ||
    evidence.tenant.state !== "none" ||
    Boolean(context.standingAgreement) ||
    // R-S250-6: leaving the rule returns the lease to Ask the owner, not to the comparison.
    Boolean(context.standingLeft);
  if (!progressed) {
    const first = steps.find(
      (step) =>
        step.applies &&
        !step.done &&
        (step.id === "month-to-month-review" ||
          step.id === "check-numbers" ||
          step.id === "compare-market"),
    );
    if (first) return first.id;
  }
  const assisted = evaluation.variants.housingAssistance;
  if (assisted && laneStep === "ask-owner") {
    // S251 ARCH-S251-2: the owner step of the assisted order is the renewing answer, then the
    // rent choice, then (only with Propose a change) the comparison and the owner's rent decision.
    const answer = state?.ownerResponse?.outcome;
    if (answer !== "renew_tenant" && answer !== "approved_terms")
      return "assisted-owner-renewal-answer";
    if (!assisted.rentChoice) return "assisted-rent";
    const compare = steps.find((step) => step.id === "compare-market");
    return compare?.applies && !compare.done ? "compare-market" : "ask-owner";
  }
  return laneStep;
}

/**
 * BEH-S247-4 / AC-S247-1: the one stage and next step for a lease. `standingCovered` is the
 * standing authority bound to this exact staff record revision (S194), as Focus reads it.
 */
export function projectRenewalStage(
  recordedState: RenewalWorkspaceState | null,
  context: RenewalStageContext,
  options: { readonly standingCovered?: boolean } = {},
): RenewalStage {
  const standingCovered = options.standingCovered ?? Boolean(context.standingAgreement);
  // AC-S248-4: messages that named this record's cycle, and those that named none inside the
  // cycle's own renewal window.
  const evidence = projectOutreachEvidence(
    context.outreach,
    outreachScopeFor(recordedState, context.cycleDateIso ?? null),
  );
  // A lease with no work record yet is read as an empty record on no cycle, so the app's own
  // accepted message still records the outreach; nothing is saved by reading it.
  const state =
    recordedState ??
    (evidence.owner.state !== "none" || evidence.tenant.state !== "none"
      ? emptyRenewalWorkspace(context.leaseId, NO_WORK_RECORD_CYCLE, {
          kind: "lease_bound",
          source: "No work record yet",
        })
      : null);
  const fill = outreachFill(state, evidence);
  const lane = manualRenewalSummary(state, {
    standingOwnerAuthority: standingCovered,
    evidence: fill,
    housingAssistance: context.housingAssistance,
  });
  const scopedContext: RenewalStageContext = standingCovered
    ? context
    : { ...context, standingAgreement: null };
  const variants = variantsFor(state, lane, scopedContext);
  const evaluation: Evaluation = {
    state,
    lane,
    fill,
    evidence,
    context: scopedContext,
    variants,
  };
  const satisfied = satisfiedFor(evaluation);
  const owner = audienceStep(evaluation, "owner");
  const tenant = audienceStep(evaluation, "tenant");
  const assistedAnswer = variants.housingAssistance
    ? assistedAnswerStep(evaluation)
    : null;
  const ownerAnswer = state?.ownerResponse?.outcome ?? null;
  const documents = activityStepState(evaluation, DOCUMENT_ACTIVITIES);
  const followUps = activityStepState(evaluation, FOLLOW_UP_ACTIVITIES);
  const finishUp = finishUpItems(evaluation, FOLLOW_UP_ACTIVITIES);
  const finishUpCounted = finishUp.filter((item) => !item.notPart);
  const verifiedUpdates = finishUp.filter((item) => item.origin === "provider_verified");
  const handoffDone = state
    ? manualActivitySatisfied(state, "non_renewal_handoff")
    : false;
  // Documents delivered and signatures outstanding: the step waits on the signers.
  const deliveryRecord =
    state && documents.next === "signatures" && satisfied("document_delivery")
      ? currentStaffActivity(state, "document_delivery")
      : null;

  const doneFor = (id: RenewalPathStepId): boolean => {
    switch (id) {
      case "month-to-month-review":
        return !scopedContext.term.reviewNeeded;
      case "check-numbers":
        return (
          scopedContext.numbers.verified && scopedContext.numbers.openDifferences === 0
        );
      case "compare-market":
        // R-S249-2: a stored comparison for this cycle is reused; it needs no second run.
        return (
          Boolean(state?.preparation) ||
          scopedContext.preparation?.comparison.state === "stored"
        );
      case "ask-owner":
        return owner.state === "done";
      case "offer-tenant":
        return tenant.state === "done";
      case "documents":
        return documents.done;
      case "finish-up":
        return followUps.done;
      case "non-renewal-handoff":
        return handoffDone;
      case "complete":
        return lane.complete;
      // S251 ARCH-S251-2: the assisted order's predicates, over the staff record.
      case "assisted-program-contact":
        return state ? manualActivitySatisfied(state, "program_contact") : false;
      case "assisted-owner-renewal-answer":
        return assistedAnswer?.state === "done";
      case "assisted-rent":
        return Boolean(currentRentChoice(state)) || ownerAnswer === "approved_terms";
      default:
        return false;
    }
  };
  const pathSteps = renewalPathSteps(variants).map((step) => ({
    ...step,
    done: step.applies && doneFor(step.id),
  }));
  const currentStepId = currentStepFor(evaluation, pathSteps);

  const views: RenewalPathStepView[] = pathSteps.map((step) => {
    const definition = RENEWAL_PATH_DEFINITION[step.id];
    const base = {
      id: step.id,
      // S251 R-S251-4: the program contact step names the lease's own program.
      label:
        step.id === "assisted-program-contact"
          ? assistedProgramContactLabel(variants.housingAssistance?.program)
          : definition.label,
      controls: definition.controls,
    };
    if (!step.applies)
      return {
        ...base,
        state: "not_part",
        detail: NOT_PART_OF_PATH_LABEL,
        primary: null,
      };
    if (
      step.id === "ask-owner" &&
      scopedContext.standingAgreement &&
      owner.state !== "done"
    )
      return {
        ...base,
        state: "covered",
        detail: scopedContext.standingAgreement.label
          ? `Covered by ${scopedContext.standingAgreement.label}: no owner message needed`
          : scopedContext.standingAgreement.reason,
        primary: null,
      };
    const audience =
      step.id === "ask-owner"
        ? owner
        : step.id === "offer-tenant"
          ? tenant
          : step.id === "assisted-owner-renewal-answer"
            ? assistedAnswer
            : null;
    const isCurrent = step.id === currentStepId;
    const stateFor = (): RenewalPathStepState => {
      if (step.done) return "done";
      if (audience?.state === "waiting") return "waiting";
      if (step.id === "documents" && deliveryRecord) return "waiting";
      return isCurrent ? "current" : "open";
    };
    const primary =
      audience?.primary ??
      (step.id === "documents" && documents.next
        ? {
            label:
              ACTIVITY_NEXT_STEP[documents.next] ??
              MANUAL_ACTIVITIES[documents.next].label,
            target: `renewal-manual-${documents.next}`,
          }
        : step.id === "finish-up" && followUps.next
          ? {
              label: `Finish up: ${MANUAL_ACTIVITIES[followUps.next].label}`,
              target: `renewal-manual-${followUps.next}`,
            }
          : step.id === "check-numbers"
            ? scopedContext.numbers.openDifferences > 0 || !scopedContext.numbers.verified
              ? definition.primary
              : {
                  label: "Continue to Compare market rent",
                  target: "renewal-section-comps",
                }
            : step.id === "complete" && scopedContext.sourceRenewal && !lane.complete
              ? {
                  label: RENEWAL_STAGE_NEXT_STEP.confirmFinished,
                  target: "renewal-manual-complete",
                }
              : step.id === "complete" && lane.complete
                ? {
                    label: "Review the recorded completion",
                    target: "renewal-manual-complete",
                  }
                : definition.primary);
    const detail =
      audience?.detail ??
      (step.id === "check-numbers" && scopedContext.numbers.line
        ? scopedContext.numbers.line
        : step.id === "check-numbers"
          ? scopedContext.numbers.openDifferences > 0
            ? scopedContext.numbers.openDifferences === 1
              ? "One difference to settle"
              : `${scopedContext.numbers.openDifferences} differences to settle`
            : scopedContext.numbers.verified
              ? "Numbers agree"
              : "The current rent needs a check"
          : step.id === "complete" && scopedContext.sourceRenewal && !lane.complete
            ? `RentVine now reports lease end ${formatCalendarDate(scopedContext.sourceRenewal.sourceDateIso)}; this cycle recorded ${formatCalendarDate(scopedContext.sourceRenewal.recordedDateIso)}`
            : step.id === "finish-up" && finishUpCounted.length > 0
              ? `${finishUpCounted.filter((item) => item.done).length} of ${finishUpCounted.length} items done${
                  verifiedUpdates.length
                    ? `; ${verifiedUpdates.length} verified by the provider's receipt`
                    : ""
                }`
              : step.id === "assisted-rent"
                ? assistedRentDetail(state)
                : step.id === "ask-owner" &&
                    scopedContext.standingLeft &&
                    owner.state !== "done"
                  ? scopedContext.standingLeft.reason
                  : null);
    return {
      ...base,
      state: stateFor(),
      detail,
      primary,
      ...(audience?.scheduled ? { scheduled: true } : {}),
    };
  });

  const current = views.find((step) => step.id === currentStepId)!;
  const currentDefinition = RENEWAL_PATH_DEFINITION[currentStepId];
  const audience =
    currentStepId === "ask-owner"
      ? owner
      : currentStepId === "offer-tenant"
        ? tenant
        : currentStepId === "assisted-owner-renewal-answer"
          ? assistedAnswer
          : null;
  // The one next step: the current step's primary action, or the staff lane's own wording.
  const nextStepLabel = (() => {
    if (audience) return audience.nextStep;
    if (currentStepId === "documents" || currentStepId === "finish-up")
      return current.primary?.label ?? currentDefinition.primary.label;
    if (currentStepId === "non-renewal-handoff")
      return ACTIVITY_NEXT_STEP.non_renewal_handoff!;
    if (currentStepId === "complete")
      return scopedContext.sourceRenewal && !lane.complete
        ? RENEWAL_STAGE_NEXT_STEP.confirmFinished
        : lane.complete
          ? "Review the recorded completion"
          : "Record staff completion";
    // The step's own label (the program contact names the lease's program).
    return current.label;
  })();
  const stageKey: RenewalWorkStatus = (() => {
    if (audience) return audience.stage;
    if (currentStepId === "documents")
      return documents.next === "signatures"
        ? "waiting_on_signatures"
        : "preparing_lease_documents";
    if (currentStepId === "complete")
      return lane.complete ? "complete_staff_status" : "completing_follow_up";
    return currentDefinition.stage;
  })();
  const documentsWaiting: RenewalStageWaiting | null =
    currentStepId === "documents" && deliveryRecord
      ? {
          party: RENEWAL_PATH_DEFINITION.documents.waiting!.party,
          sinceIso: deliveryRecord.occurredAt ?? deliveryRecord.recordedAt,
          lastContactIso: scopedContext.lastContactAtIso,
          watching: RENEWAL_PATH_DEFINITION.documents.waiting!.watching,
        }
      : null;
  const waiting = audience?.waiting ?? documentsWaiting;
  const evidenceLine = audience?.detail ?? null;
  // R-S248-9 first; S232's staff-record and linked-thread disagreement keeps its own words.
  const check: RenewalStageCheck | null = fill.checks[0]
    ? {
        kind: "evidence",
        sentence: `The staff record ${fill.checks[0].staffRecord}; the app's records ${fill.checks[0].appEvidence}.`,
      }
    : scopedContext.threadCheck
      ? { kind: "linked_thread", sentence: scopedContext.threadCheck }
      : null;
  const recordedAtIso = latestRecordIso(state, fill);
  const label = stageLabel(stageKey);
  const stageLine = (() => {
    // A failed read is the thing to resolve; it never reads as nothing recorded (S232).
    if (scopedContext.staffRecordUnavailable)
      return "Needs verification: the staff record could not be read";
    if (scopedContext.verification)
      return `Needs verification: ${scopedContext.verification.label.trim().replace(/\.$/, "")}`;
    if (check) return `Needs a check: ${check.sentence}`;
    if (lane.complete) return label;
    if (waiting && waiting.party.startsWith("the ") && label.startsWith("Waiting on"))
      return `${label}${since(waiting.sinceIso)}`;
    if (waiting) return `${label}: ${evidenceLine ?? `waiting on ${waiting.party}`}`;
    if (evidenceLine) return `${label}: ${evidenceLine}`;
    if (currentStepId === "complete" && scopedContext.sourceRenewal)
      return `${label}: RentVine reports a later lease end`;
    return recordedAtIso
      ? `${label}, waiting on ${TEAM}${since(recordedAtIso)}`
      : `${label}, nothing recorded yet`;
  })();
  const derived: RenewalDerivedFact[] = [fill.owner_outreach, fill.tenant_offer]
    .filter((record): record is DerivedOutreachRecord => record !== null)
    .map((record) => ({ record, attribution: derivedOutreachAttribution(record) }));
  const handStatusLine =
    scopedContext.handStatus && scopedContext.handStatus.key !== stageKey
      ? `Set by hand: ${scopedContext.handStatus.label}. From the recorded work: ${label}.`
      : null;
  const blocker = scopedContext.staffRecordUnavailable
    ? {
        label: "Reload records and history",
        target: "renewal-card-manual-records",
      }
    : scopedContext.verification
      ? {
          label: scopedContext.verification.label,
          target: scopedContext.verification.refresh ? null : "renewal-card-data-check",
        }
      : null;
  return {
    version: RENEWAL_STAGE_VERSION,
    stage: { key: stageKey, label },
    stageLine,
    currentStepId,
    nextStep: {
      label: nextStepLabel,
      stepId: currentStepId,
      processStepId: currentDefinition.processStepId,
    },
    waiting,
    evidenceLine,
    steps: views.map((step) =>
      step.id === currentStepId && step.state === "open"
        ? { ...step, state: "current" }
        : step,
    ),
    check,
    evidenceCheck: fill.checks[0] ?? null,
    derived,
    handStatusLine,
    blocker,
    evidence,
    finishUp,
  };
}

/** The newest staff record or derived fact on this cycle, for "since" on the team's move. */
function latestRecordIso(
  state: RenewalWorkspaceState | null,
  fill: OutreachFill,
): string | null {
  const times: number[] = [];
  if (state) {
    for (const value of [
      state.ownerResponse?.recordedAt,
      state.tenantResponse?.recordedAt,
      state.completion?.recordedAt,
      state.preparation?.recordedAt,
      ...Object.values(state.activities).map((record) => record?.recordedAt),
    ]) {
      const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
      if (Number.isFinite(ms)) times.push(ms);
    }
  }
  for (const record of [fill.owner_outreach, fill.tenant_offer])
    if (record) times.push(record.sentAtMs);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * The compact stage a desk row and an assistant answer carry: the same stage line and next step
 * the lease page shows, from the same projection.
 */
export interface RenewalStageSummary {
  readonly version: typeof RENEWAL_STAGE_VERSION;
  readonly stage: RenewalStage["stage"];
  readonly stageLine: string;
  readonly currentStepId: RenewalPathStepId;
  readonly currentStepLabel: string;
  readonly nextStep: RenewalStage["nextStep"];
  readonly needsCheck: boolean;
  readonly checkDetail: string | null;
  readonly waiting: RenewalStageWaiting | null;
  /** The hand-set status and the derived stage, when they differ. */
  readonly handStatusLine: string | null;
}

export function summarizeRenewalStage(stage: RenewalStage): RenewalStageSummary {
  return {
    version: stage.version,
    stage: stage.stage,
    stageLine: stage.stageLine,
    currentStepId: stage.currentStepId,
    currentStepLabel:
      stage.steps.find((step) => step.id === stage.currentStepId)?.label ??
      RENEWAL_PATH_DEFINITION[stage.currentStepId].label,
    nextStep: stage.nextStep,
    needsCheck: stage.check !== null,
    checkDetail: stage.check?.sentence ?? null,
    waiting: stage.waiting,
    handStatusLine: stage.handStatusLine,
  };
}

/** The stage's one waiting sentence for the Now card (L19). */
export function renewalStageWaitingLine(waiting: RenewalStageWaiting): string {
  const parts = [`Waiting on ${waiting.party}`];
  if (waiting.sinceIso) parts.push(`since ${outreachDate(Date.parse(waiting.sinceIso))}`);
  const line = parts.join(" ");
  const contact = waiting.lastContactIso
    ? ` Last contact ${outreachDate(Date.parse(waiting.lastContactIso))}.`
    : " No contact recorded yet.";
  return `${line}.${contact} The app is watching: ${waiting.watching}`;
}

/** Who the stage waits on, in the stage's own words ("Waiting on the owner"); null when no one. */
export function renewalStageWaitingOn(
  stage: Pick<RenewalStageSummary, "waiting">,
): string | null {
  return stage.waiting ? `Waiting on ${stage.waiting.party}` : null;
}

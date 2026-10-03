import {
  MANUAL_ACTIVITIES,
  manualActionLabel,
  manualRenewalSummary,
} from "@/lib/lease-renewal/workspace-state";
// S82 desk guidance: one pure, serializable projection of current base rent, rent verification,
// overall status and the suggested next action for every table row.
//
// This is display state only. It never persists a second workflow, substitutes a Sheet or offer
// value for the displayed RentVine amount, or coerces a missing rent to zero. S156/S157: the
// staff-recorded lane is the guide, a source difference is advisory evidence, and nothing here
// withholds work. Status precedence: needs_verification (a stale or incomplete read, or a flagged
// lease fact), complete, waiting, ready, then needs_review for a lease outside the worklist.

import type { Capability } from "@/lib/auth/roles";
import type {
  DeskDataCurrency,
  DeskGuidanceDestination,
  DeskLeaseAction,
  DeskLeaseGuidance,
  DeskLeaseSummaryBase,
  DeskRentVerification,
  DeskReconItem,
} from "@/lib/lease-renewal/desk-model";
import {
  OVERALL_STATUS_URGENCY_RANK,
  type RenewalOverallStatus,
} from "@/lib/lease-renewal/desk-query-v2";
import type { RenewalProcessProjection } from "@/lib/lease-renewal/renewal-process";
import type { LiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";

export type {
  DeskBlockerType,
  DeskGuidanceDestination,
  DeskLeaseAction,
  DeskLeaseBlocker,
  DeskLeaseGuidance,
  DeskRentVerification,
} from "@/lib/lease-renewal/desk-model";

/**
 * The guidance rules this build renders, exposed on each desk row so the independent production
 * reconciliation can tell which rules a serving revision follows (an earlier revision has none).
 */
export const DESK_GUIDANCE_CONTRACT = "s156-staff-lane";

/** Grounded control gates only; every other blocker link is plain phase navigation. */
export const DESK_EVIDENCE_CAPABILITY: Readonly<Partial<Record<string, Capability>>> = {
  "source-conflicts-resolved": "edit",
  "owner-decision": "edit",
};

export interface DeskGuidanceInput {
  readonly summary: Pick<
    DeskLeaseSummaryBase,
    | "id"
    | "disposition"
    | "reason"
    | "reasonLabel"
    | "retention"
    | "followUp"
    | "manualProgress"
  >;
  readonly process: RenewalProcessProjection | null;
  readonly dataCheck: readonly DeskReconItem[] | null;
  /**
   * The shared summary's lease-scoped current rent (lease detail `baseRentAmount` when enriched,
   * else the export view's value); never a substituted value.
   */
  readonly rentvineCurrentRent: number | null;
  /** The shared workspace/draft rent decision, when the lease was reconciled. */
  readonly rentDecision: LiveOwnerCurrentRentDecision | null;
  readonly currencyState: DeskDataCurrency["state"];
  readonly readComplete: boolean;
  /** False means saved workflow state could not be read; dependent status/action must fail closed. */
  readonly progressStateAvailable?: boolean;
}

const WAITING_PARTY_LABEL: Record<string, string> = {
  owner: "the owner",
  tenant: "the tenant",
  team: "the PMI KC team",
  document_coordinator: "the document coordinator",
};

function rentVerification(input: DeskGuidanceInput): DeskRentVerification {
  const destination: DeskGuidanceDestination = {
    kind: "workspace_phase",
    stepId: "verify-renewal",
  };
  if (!input.readComplete || input.currencyState === "expired") {
    return { state: "unavailable", verifiedByResolutionDiffers: false, destination };
  }
  const decision = input.rentDecision;
  if (!decision) {
    return {
      state: "needs_verification",
      verifiedByResolutionDiffers: false,
      destination,
    };
  }
  const agreement = decision.currentRentEvidence.agreement;
  const fresh = decision.currentRentEvidence.currencyState === "fresh";
  const hasPositiveCurrentRent =
    typeof decision.currentRent === "number" &&
    Number.isFinite(decision.currentRent) &&
    decision.currentRent > 0;
  if (
    fresh &&
    hasPositiveCurrentRent &&
    (agreement === "agree" || agreement === "resolved")
  ) {
    const differs =
      agreement === "resolved" &&
      input.rentvineCurrentRent !== null &&
      decision.currentRent !== input.rentvineCurrentRent;
    return {
      state: "verified",
      verifiedByResolutionDiffers:
        differs || (agreement === "resolved" && input.rentvineCurrentRent === null),
      destination,
    };
  }
  return { state: "needs_verification", verifiedByResolutionDiffers: false, destination };
}

/** S142: the causes behind a Needs-verification status, in the order its guidance label names them. */
export type DeskVerificationCause =
  | "progress_unreadable"
  | "read_incomplete"
  | "data_expired"
  | "disposition_review"
  | "process_needs_verification"
  | "rent_unverified";

/**
 * S156/S157: the staff-recorded lane guides every lease in the worklist. A lease with nothing
 * recorded yet is guided to the first staff activity; the earlier evidence-graph stages no longer
 * order, hold or block work, and a rent or source difference is shown as advisory evidence
 * (`rentVerification`), never as a status.
 */
function staffLane(input: DeskGuidanceInput) {
  return (
    input.summary.manualProgress ?? (input.process ? manualRenewalSummary(null) : null)
  );
}

/** True when the lease's guidance is Needs verification; shared with the S142 action projection. */
export function deskNeedsVerification(input: DeskGuidanceInput): boolean {
  return (
    (input.progressStateAvailable === false && !input.summary.manualProgress) ||
    !input.readComplete ||
    input.currencyState === "expired" ||
    input.summary.disposition === "review"
  );
}

/**
 * The cause the Needs-verification guidance label names, in its precedence. Only meaningful when
 * `deskNeedsVerification` is true; the S142 projection maps it to the same recovery action.
 */
export function deskVerificationCause(input: DeskGuidanceInput): DeskVerificationCause {
  if (input.progressStateAvailable === false) return "progress_unreadable";
  if (!input.readComplete) return "read_incomplete";
  if (input.currencyState === "expired") return "data_expired";
  return "disposition_review";
}

/** S142: the guidance's Needs-verification cause for this exact input, or null. */
export function deskGuidanceVerificationCause(
  input: DeskGuidanceInput,
): DeskVerificationCause | null {
  return deskNeedsVerification(input) ? deskVerificationCause(input) : null;
}

/** The party wording the waiting guidance uses; shared with the S142 projection. */
export function deskWaitingPartyLabel(party: string | null | undefined): string | null {
  return party ? (WAITING_PARTY_LABEL[party] ?? null) : null;
}

function overallStatus(input: DeskGuidanceInput): RenewalOverallStatus {
  if (deskNeedsVerification(input)) return "needs_verification";
  const manual = staffLane(input);
  if (!manual) return "needs_review";
  if (manual.complete) return "complete";
  if (
    manual.nextActivity === "owner_response" ||
    manual.nextActivity === "tenant_response"
  )
    return "waiting";
  return "ready";
}

function action(input: DeskGuidanceInput, status: RenewalOverallStatus): DeskLeaseAction {
  const manual = staffLane(input);
  if (manual && status !== "needs_verification") {
    const key = manual.nextActivity;
    const section =
      key === "owner_response"
        ? "owner"
        : key === "tenant_response"
          ? "tenant"
          : key in MANUAL_ACTIVITIES
            ? MANUAL_ACTIVITIES[key as keyof typeof MANUAL_ACTIVITIES].section
            : "documents";
    const label = manualActionLabel(key);
    return {
      kind: manual.complete ? "complete" : status === "waiting" ? "waiting" : "act",
      label: manual.complete ? "Review completion recorded by staff." : label,
      destination: {
        kind: "workspace_phase",
        stepId:
          section === "owner"
            ? "owner-decision"
            : section === "tenant"
              ? "tenant-decision"
              : "compliance-close",
        controlId: `renewal-manual-${manual.complete ? "complete" : key}`,
      },
    };
  }
  switch (status) {
    // The staff lane above answers Ready, Waiting and Complete; Blocked is no longer produced.
    case "blocked":
    case "complete":
    case "waiting":
    case "ready":
      return {
        kind: "review",
        label: input.summary.reasonLabel,
        destination: { kind: "none" },
      };
    case "needs_verification": {
      const cause = deskVerificationCause(input);
      if (cause === "progress_unreadable") {
        return {
          kind: "needs_verification",
          label: "Saved renewal progress could not be read. Refresh to see it.",
          destination: { kind: "none" },
        };
      }
      if (cause === "read_incomplete") {
        return {
          kind: "needs_verification",
          label: "The portfolio read did not complete. Refresh to see current data.",
          destination: { kind: "none" },
        };
      }
      if (cause === "data_expired") {
        return {
          kind: "needs_verification",
          label: "Lease data is out of date. Refresh to see current data.",
          destination: { kind: "none" },
        };
      }
      return {
        kind: "needs_verification",
        label: `${input.summary.reasonLabel}. Check it against an authoritative source.`,
        destination: input.summary.id
          ? { kind: "workspace_phase", stepId: "verify-renewal" }
          : { kind: "none" },
      };
    }
    case "needs_review":
      return {
        kind: "review",
        label: input.summary.reasonLabel,
        destination: { kind: "none" },
      };
  }
}

/** Build one lease's guidance projection. Pure; every fact comes from the passed evidence. */
export function buildDeskLeaseGuidance(input: DeskGuidanceInput): DeskLeaseGuidance {
  const status = overallStatus(input);
  return {
    currentBaseRent:
      typeof input.rentvineCurrentRent === "number" &&
      Number.isFinite(input.rentvineCurrentRent)
        ? input.rentvineCurrentRent
        : null,
    currentBaseRentSource: "RentVine",
    rentVerification: rentVerification(input),
    overallStatus: status,
    urgencyRank: OVERALL_STATUS_URGENCY_RANK[status],
    // S156: nothing here withholds work. The flag marks a row whose data needs a fresh read or a
    // source check; there are no prerequisite blockers.
    isBlocked: status === "needs_verification",
    blockers: [],
    contract: DESK_GUIDANCE_CONTRACT,
    action: action(input, status),
  };
}

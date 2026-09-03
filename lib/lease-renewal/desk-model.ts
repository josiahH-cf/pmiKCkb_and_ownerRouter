// Neutral Renewal Desk view contracts shared by the authenticated Live surfaces.
//
// This module contains no records, fixtures, or constructors. Deterministic sample data belongs in
// `tests/helpers`; Production code imports only these shapes and presentation constants.

import type { Capability } from "@/lib/auth/roles";
import type {
  CohortDisposition,
  CohortReason,
  DateWindow,
  RenewalCohort,
} from "@/lib/lease-renewal/cohort";
import type {
  RenewalOverallStatus,
  RenewalRentVerificationState,
} from "@/lib/lease-renewal/desk-query-v2";
import type { LeaseTerm, LeaseTermProjection } from "@/lib/lease-renewal/lease-term";
import type {
  RenewalProcessStatus,
  RenewalProcessStepId,
  RenewalSubstepState,
} from "@/lib/lease-renewal/renewal-process";
import type { EffectiveRuleView } from "@/lib/lease-renewal/notice-rules";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import type { OwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import type { RenewalReadinessResult } from "@/lib/lease-renewal/renewal-readiness";
import type { RenewalOwnerDecision } from "@/lib/lease-renewal/renewal-progress";
import {
  RENEWAL_STAGE_NEXT_ACTIONS,
  RENEWAL_STEPPER_STEPS,
  type RenewalProcessProjection,
  type RenewalTenantOutcome,
} from "@/lib/lease-renewal/renewal-process";
import type { TenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";
import type { ExternalDeskDestination } from "@/lib/lease-renewal/desk-destinations";

/** S72: the six renewal steps, derived from the one immutable renewal-v1 definition. */
export const RENEWAL_STEPS = RENEWAL_STEPPER_STEPS;

/** Next-step copy per stage (index-aligned with RENEWAL_STEPS). */
export const STAGE_NEXT_ACTION = RENEWAL_STAGE_NEXT_ACTIONS;

const REASON_LABEL: Record<CohortReason, string> = {
  actionable: "Ready to work",
  month_to_month: "Month-to-month",
  owner_authorized: "Owner-authorized hold",
  program: "Program lease",
  no_end_date: "No end date on file",
  off_cycle_date: "Off-cycle end date",
  out_of_window: "Outside this window",
  term_needs_review: "Lease term needs review",
};

/** Humanized label for a cohort skip/review reason. */
export function humanizeCohortReason(reason: CohortReason): string {
  return REASON_LABEL[reason];
}

export interface DeskReconCandidate {
  source: string;
  sourceSystem: string;
  value: string;
  confidence: string;
}

export interface DeskReconItem {
  fieldKey: string;
  fieldLabel: string;
  /** Bodyless identity of this exact record+field decision, when it raised a queue item. */
  sourceTriggerKey?: string;
  /** Exact source facts this item represents; a resolution is current only when this matches. */
  candidateFingerprint?: string;
  agreement:
    | "agree"
    | "conflict"
    | "single_source"
    | "missing"
    | "resolved"
    | "dismissed";
  candidates: DeskReconCandidate[];
}

/** Exact source-backed display fact. The ref identifies the lease and measured field path. */
export interface DeskIdentityFact {
  label: string;
  sourceRef: string;
}

export interface RenewalDeskIdentity {
  address: DeskIdentityFact | null;
  property: DeskIdentityFact | null;
  tenants: DeskIdentityFact[];
  owners: DeskIdentityFact[];
}

export type RenewalDeskRetentionState =
  | { state: "window"; label: string }
  | { state: "needs_verification"; label: string }
  | { state: "tracked_incomplete"; label: string }
  /** S103: a month-to-month lease whose annual review falls inside the current window. */
  | { state: "periodic_review"; label: string }
  | { state: "outside"; label: string };

export type RenewalDeskWaitingKey =
  | NonNullable<RenewalFollowUpProjection["waiting"]["party"]>
  | "not_waiting"
  | "needs_verification";

/** Precomputed, serializable keys. Only exact source/progress/follow-up facts enter this index. */
export interface RenewalDeskQueryKeys {
  normalizedLeaseId: string;
  normalizedSearchText: string;
  endDateIso: string | null;
  endMonth: string | null;
  ownerLabels: string[];
  normalizedOwners: string[];
  tenantLabels: string[];
  normalizedTenants: string[];
  workflowStepId: string | null;
  workflowStepIndex: number | null;
  waitingOn: RenewalDeskWaitingKey;
  dueState: RenewalFollowUpProjection["due"]["state"];
  dueAtIso: string | null;
  /** Null means source conflicts were not evaluated; it never masquerades as zero. */
  sourceConflictCount: number | null;
  /** S103: the one shared lease term, so the table filter never reclassifies from dates. */
  leaseTerm: LeaseTerm;
  /** S103: the month-to-month annual review date, or null when the term or anchor is unresolved. */
  nextReviewIso: string | null;
}

export interface DeskLeaseSummaryBase {
  id: string;
  addressLabel: string;
  propertyNameLabel: string | null;
  tenantNameLabel: string;
  tenantNameLabels: string[];
  ownerNameLabels: string[];
  identity: RenewalDeskIdentity;
  endDateIso: string | null;
  disposition: CohortDisposition;
  reason: CohortReason;
  reasonLabel: string;
  /** S103: the one lease-term projection shared by desk, workspace, query, and assistant. */
  leaseTerm: LeaseTermProjection;
  /**
   * S102/S104: the tenant's contractual base rent from the lease detail, and the export unit's
   * listed rent as a labelled reference. Both surfaces read these from this one projection, so a
   * row and its lease workspace can never disagree about which rent they show.
   */
  currentRent: number | null;
  unitListedRent: number | null;
  retention: RenewalDeskRetentionState;
  processVersion: string | null;
  workflowStepId: string | null;
  stageIndex: number;
  stageLabel: string | null;
  nextAction: string | null;
  openConflicts: number;
  /** Exact current source links validated server-side; absent values retain in-app fallbacks. */
  sourceDestinations?: {
    rentvine?: ExternalDeskDestination;
  };
  /** S75: one source-backed contact/policy projection on canonical Live cards. */
  followUp?: RenewalFollowUpProjection;
}

export interface DeskLeaseSummary extends DeskLeaseSummaryBase {
  queryKeys: RenewalDeskQueryKeys;
}

/** S82 guidance vocabulary — pure serializable types; the builder lives in `desk-guidance.ts`. */
export type DeskGuidanceDestination =
  | { kind: "workspace_phase"; stepId: RenewalProcessStepId }
  | { kind: "none" };

export type DeskBlockerType = "source" | "evidence" | "dependency";

export interface DeskLeaseBlocker {
  readonly id: string;
  readonly label: string;
  readonly type: DeskBlockerType;
  readonly phaseId: RenewalProcessStepId | null;
  readonly destination: DeskGuidanceDestination;
  readonly requiredCapability?: Capability;
}

export interface DeskRentVerification {
  readonly state: RenewalRentVerificationState;
  /** True only when an exact current resolution verified a value differing from RentVine. */
  readonly verifiedByResolutionDiffers: boolean;
  readonly destination: DeskGuidanceDestination;
}

export type DeskLeaseAction =
  | { readonly kind: "blocked" }
  | {
      readonly kind: "act";
      readonly label: string;
      readonly destination: DeskGuidanceDestination;
      readonly requiredCapability?: Capability;
    }
  | {
      readonly kind: "waiting";
      readonly label: string;
      readonly destination: DeskGuidanceDestination;
    }
  | {
      readonly kind: "complete";
      readonly label: string;
      readonly destination: DeskGuidanceDestination;
    }
  | {
      readonly kind: "needs_verification";
      readonly label: string;
      readonly destination: DeskGuidanceDestination;
    }
  | {
      readonly kind: "review";
      readonly label: string;
      readonly destination: DeskGuidanceDestination;
    };

export interface DeskLeaseGuidance {
  /** The canonical RentVine `unit.rent` value; null renders Needs Verification, never zero. */
  readonly currentBaseRent: number | null;
  readonly currentBaseRentSource: "RentVine";
  readonly rentVerification: DeskRentVerification;
  readonly overallStatus: RenewalOverallStatus;
  readonly urgencyRank: number;
  readonly isBlocked: boolean;
  readonly blockers: readonly DeskLeaseBlocker[];
  readonly action: DeskLeaseAction;
}

/**
 * App-owned S72 projection markers kept separate from source facts. Production assurance uses these
 * only to verify desk-guidance parity; they are not independent evidence for Gmail, policy, packet,
 * RentVine, Sheet, or progress truth.
 */
export interface DeskProcessStateMarker {
  readonly status: RenewalProcessStatus;
  readonly currentStepId: RenewalProcessStepId;
  readonly currentStepState: RenewalSubstepState;
}

/** One canonical table row: the S78 summary plus its S82 guidance projection. */
export interface DeskLeaseRow extends DeskLeaseSummary {
  readonly guidance: DeskLeaseGuidance;
  readonly processState: DeskProcessStateMarker | null;
}

/**
 * The ONE renewal ordering (S70, AC-S70-1 / AC-S70-2). Soonest lease end date first; a lease with no
 * end date sorts last; ties break on the stable lease id so the order does not shuffle between
 * reloads. ISO dates sort lexicographically, so no parsing is needed.
 *
 * Before S70 the queue had no sort at all and inherited RentVine export row order, while the
 * "Needs your attention" fold directly above it DID sort by soonest end date — two lists on one page
 * in two different orders. Both now call this function, so they cannot drift apart again.
 */
export function compareLeaseEndDate(
  a: { endDateIso: string | null; id?: string },
  b: { endDateIso: string | null; id?: string },
): number {
  if (a.endDateIso !== b.endDateIso) {
    if (a.endDateIso === null) return 1;
    if (b.endDateIso === null) return -1;
    return a.endDateIso < b.endDateIso ? -1 : 1;
  }
  return (a.id ?? "").localeCompare(b.id ?? "");
}

/**
 * S58: the age/refresh facts of the snapshot a surface rendered. Exactly one of four UI states
 * derives from these (in precedence order): expired → too-old-to-act; refreshing → refreshing;
 * lastError → last-updated-and-could-not-refresh; otherwise → updated-with-age. The age comes from
 * the snapshot timestamp, never from render time.
 */
export interface DeskDataCurrency {
  state: "fresh" | "stale" | "expired";
  readAtIso: string;
  ageMs: number;
  refreshing: boolean;
  lastError: boolean;
}

export interface RenewalDeskView {
  windows: DateWindow[];
  cohort: RenewalCohort;
  /**
   * S57: whether the underlying paged RentVine export read returned the whole portfolio. When false
   * the desk renders an explicit incomplete-read notice and labels its counts as partial — a partial
   * read is never presented as the portfolio.
   */
  readComplete: boolean;
  /** S58: the served snapshot's currency. */
  dataCurrency: DeskDataCurrency;
  /** S78/S82: the one complete serialized source consumed by the table and every derived view. */
  items: DeskLeaseRow[];
  actionable: DeskLeaseRow[];
  review: DeskLeaseRow[];
  skipped: DeskLeaseRow[];
  outOfWindow: DeskLeaseRow[];
  /** S103: month-to-month leases on the annual review rhythm, never in the monthly cohort. */
  periodicReview: DeskLeaseRow[];
}

export interface RenewalWorkspaceLiveState {
  leaseId: string;
  ownerDecision: RenewalOwnerDecision | null;
  ownerDecisionCurrent: boolean;
  tenantOfferDraftId: string | null;
  tenantOutcome: RenewalTenantOutcome | null;
  processVersion: string;
  complete: boolean;
}

export interface RenewalLeaseWorkspace {
  summary: DeskLeaseSummary;
  /**
   * S104: the same guidance projection the desk row carries, built once by `buildDeskLeaseGuidance`
   * from the same process/data-check/rent inputs. Surfaces read it; they never recompute status,
   * blockers, or the next action locally.
   */
  guidance: DeskLeaseGuidance;
  /** False only when this stable lease is open for source inspection outside an active/tracked flow. */
  workflowAvailable: boolean;
  steps: typeof RENEWAL_STEPS;
  currentStepIndex: number;
  process: RenewalProcessProjection;
  dataCheck: DeskReconItem[];
  ownerDraft: OwnerRenewalDraft;
  tenantDraft: TenantOfferDraft | null;
  readiness: RenewalReadinessResult;
  notice: EffectiveRuleView | null;
  /** Byte-equal to the projection on this lease's Live desk summary. */
  followUp?: RenewalFollowUpProjection;
  live?: RenewalWorkspaceLiveState;
  /** S58: present on the LIVE workspace; expired disables compose/record controls with a plain
   *  explanation (the routes refuse server-side regardless). The sample workspace omits it. */
  dataCurrency?: DeskDataCurrency;
  /**
   * S59: the lease's known unit attributes from the live export (`unit.beds`,
   * `unit.fullBaths`/`unit.halfBaths`, `unit.postalCode`/`property.postalCode`), threaded to the
   * comp lookup so the estimate fits the unit. Absent attributes stay absent — never guessed.
   */
  compAttributes?: { bedrooms?: number; bathrooms?: number; postalCode?: string };
  /** S60: the authoritative current rent (RentVine), for the INTERNAL under-market signal only. */
  currentRent?: number;
  /**
   * S102: the export unit's listed rent, shown only as a labelled reference beside the tenant's
   * base rent. It never feeds verification, proposals, drafts, or the Sheet comparison.
   */
  unitListedRent?: number;
}

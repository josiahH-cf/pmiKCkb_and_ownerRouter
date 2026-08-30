// Neutral Renewal Desk view contracts shared by the authenticated Live surfaces.
//
// This module contains no records, fixtures, or constructors. Deterministic sample data belongs in
// `tests/helpers`; Production code imports only these shapes and presentation constants.

import type {
  CohortDisposition,
  CohortReason,
  DateWindow,
  RenewalCohort,
} from "@/lib/lease-renewal/cohort";
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
  agreement: "agree" | "conflict" | "single_source" | "missing";
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
  retention: RenewalDeskRetentionState;
  processVersion: string | null;
  workflowStepId: string | null;
  stageIndex: number;
  stageLabel: string | null;
  nextAction: string | null;
  openConflicts: number;
  /** S75: one source-backed contact/policy projection on canonical Live cards. */
  followUp?: RenewalFollowUpProjection;
}

export interface DeskLeaseSummary extends DeskLeaseSummaryBase {
  queryKeys: RenewalDeskQueryKeys;
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
  /** S78: the one complete serialized source consumed by controls, list, and attention fold. */
  items: DeskLeaseSummary[];
  actionable: DeskLeaseSummary[];
  review: DeskLeaseSummary[];
  skipped: DeskLeaseSummary[];
  outOfWindow: DeskLeaseSummary[];
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
}

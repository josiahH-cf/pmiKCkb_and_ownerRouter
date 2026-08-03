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
import type { OwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import type { RenewalReadinessResult } from "@/lib/lease-renewal/renewal-readiness";
import type { RenewalOwnerDecision } from "@/lib/lease-renewal/renewal-progress";
import type { TenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";

/** The four renewal steps, in process order. */
export const RENEWAL_STEPS = [
  { id: "data", label: "Data check" },
  { id: "owner", label: "Owner decision" },
  { id: "tenant", label: "Tenant offer" },
  { id: "build", label: "Build docs" },
] as const;

/** Next-step copy per stage (index-aligned with RENEWAL_STEPS). */
export const STAGE_NEXT_ACTION = [
  "Confirm the rent before drafting",
  "Get the owner's rent decision",
  "Review the tenant offer drafts",
  "Run the build-out checks",
] as const;

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
  agreement: "agree" | "conflict" | "single_source" | "missing";
  candidates: DeskReconCandidate[];
}

export interface DeskLeaseSummary {
  id: string;
  addressLabel: string;
  tenantNameLabel: string;
  endDateIso: string | null;
  disposition: CohortDisposition;
  reason: CohortReason;
  reasonLabel: string;
  stageIndex: number;
  stageLabel: string | null;
  nextAction: string | null;
  openConflicts: number;
}

export interface RenewalDeskView {
  windows: DateWindow[];
  cohort: RenewalCohort;
  actionable: DeskLeaseSummary[];
  review: DeskLeaseSummary[];
  skipped: DeskLeaseSummary[];
  outOfWindow: DeskLeaseSummary[];
}

export interface RenewalWorkspaceLiveState {
  leaseId: string;
  ownerDecision: RenewalOwnerDecision | null;
  tenantOfferDraftId: string | null;
  complete: boolean;
}

export interface RenewalLeaseWorkspace {
  summary: DeskLeaseSummary;
  steps: typeof RENEWAL_STEPS;
  currentStepIndex: number;
  dataCheck: DeskReconItem[];
  ownerDraft: OwnerRenewalDraft;
  tenantDraft: TenantOfferDraft | null;
  readiness: RenewalReadinessResult;
  notice: EffectiveRuleView | null;
  live?: RenewalWorkspaceLiveState;
}

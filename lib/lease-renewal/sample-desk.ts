// Synthetic "Renewal Desk" dataset (Phase-1 UI, read-only / draft-only).
//
// The app is still source-blocked (no approved live sheet/lease feed), so the Renewal Desk renders a
// deterministic, in-boundary SAMPLE batch — the same simulation-only posture as `simulation.ts`. Its
// only job is to drive the redesigned surfaces and EXERCISE the four already-built renewal modules in
// the order the work actually happens:
//   - classifyRenewalCohort  → the triage board (actionable / review / skip / out-of-window)
//   - buildOwnerRenewalDraft → step 2 (owner email, source-tagged, "Needs Verification" markers)
//   - buildTenantOfferDraft  → step 3 (tenant offer across email / portal / text)
//   - evaluateRenewalReadiness → step 4 (the 7 must-never-miss build-out checks)
//
// Labels are synthetic (no real tenant PII). Pure and deterministic: no I/O, no Date.now() — the
// renewal windows are fixed inputs. Every draft/result it surfaces carries production_allowed:false.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  classifyRenewalCohort,
  type CohortDisposition,
  type CohortReason,
  type DateWindow,
  type RenewalCohort,
} from "@/lib/lease-renewal/cohort";
import {
  buildOwnerRenewalDraft,
  type OwnerDraftInput,
  type OwnerRenewalDraft,
} from "@/lib/lease-renewal/owner-draft";
import {
  buildTenantOfferDraft,
  type OwnerDecision,
  type TenantOfferDraft,
} from "@/lib/lease-renewal/tenant-draft";
import {
  evaluateRenewalReadiness,
  type RenewalReadinessInput,
  type RenewalReadinessResult,
} from "@/lib/lease-renewal/renewal-readiness";
import {
  DEFAULT_NOTICE_RULE_SET,
  buildEffectiveRuleView,
  detectNoticeStatus,
  resolveNoticeRule,
  type EffectiveRuleView,
} from "@/lib/lease-renewal/notice-rules";

/** Deterministic reference date for the sample batch's notice status ("as of" this date). The live
 *  page passes the real current date; the sample keeps a fixed date so the desk stays reproducible. */
export const SAMPLE_NOTICE_REFERENCE_DATE = "2026-07-14";

/** The active batch: leases ending end-of-August through end-of-September 2026. */
export const SAMPLE_DESK_WINDOWS: DateWindow[] = [
  { startIso: "2026-08-01", endIso: "2026-09-30" },
];

/** The four renewal steps, in process order. */
export const RENEWAL_STEPS = [
  { id: "data", label: "Data check" },
  { id: "owner", label: "Owner decision" },
  { id: "tenant", label: "Tenant offer" },
  { id: "build", label: "Build docs" },
] as const;

/** Next-step copy per stage (index-aligned with RENEWAL_STEPS). Shared with the live desk. */
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

/** Humanized label for a cohort skip/review reason (Desk chips). */
export function humanizeCohortReason(reason: CohortReason): string {
  return REASON_LABEL[reason];
}

export interface DeskReconCandidate {
  source: string;
  sourceSystem: string;
  value: string;
  confidence: string;
}

/** One reconciled field for the per-lease Data-check step (mirrors the live engine's shape). */
export interface DeskReconItem {
  fieldKey: string;
  fieldLabel: string;
  agreement: "agree" | "conflict" | "single_source" | "missing";
  candidates: DeskReconCandidate[];
}

interface DeskLeaseSeed {
  id: string;
  addressLabel: string;
  tenantNameLabel: string;
  /** Synthetic RentVine-shaped record fed to classifyRenewalCohort. */
  lease: RawLease;
  /** Stage index into RENEWAL_STEPS for actionable leases; -1 when not actionable. */
  stageIndex: number;
  dataCheck: DeskReconItem[];
  owner: OwnerDraftInput;
  /** Present once the owner has recorded a decision (unlocks the tenant offer). */
  ownerDecision?: { decision: OwnerDecision; offeredRent: number };
  charges?: { rbp?: number; insurance?: number };
  infoFormUrl?: string;
  readiness: RenewalReadinessInput;
}

const SAMPLE_INFO_FORM = "https://forms.gle/sample-renewal-intake";
const STANDARD_CHARGES = { rbp: 28, insurance: 11.95 };

const AGREE_DATE = (iso: string): DeskReconItem => ({
  fieldKey: "renewal_date",
  fieldLabel: "Lease end date",
  agreement: "agree",
  candidates: [
    { source: "rentvine", sourceSystem: "RentVine", value: iso, confidence: "Verified" },
    { source: "sheet", sourceSystem: "Sheet", value: iso, confidence: "Likely" },
  ],
});

const AGREE_RENT = (display: string): DeskReconItem => ({
  fieldKey: "current_rent",
  fieldLabel: "Rent",
  agreement: "agree",
  candidates: [
    {
      source: "rentvine",
      sourceSystem: "RentVine",
      value: display,
      confidence: "Verified",
    },
    { source: "sheet", sourceSystem: "Sheet", value: display, confidence: "Likely" },
  ],
});

// Synthetic batch — a realistic mix so every cohort disposition and every step is represented.
const SAMPLE_DESK_SEEDS: readonly DeskLeaseSeed[] = [
  {
    id: "lease-4821-maple-4",
    addressLabel: "4821 Maple Ct, Unit 4",
    tenantNameLabel: "the Delgado household",
    lease: { leaseID: "4821-4", endDate: "2026-08-31", leaseType: "Fixed Term" },
    stageIndex: 1,
    dataCheck: [AGREE_RENT("$1,250"), AGREE_DATE("2026-08-31")],
    owner: {
      addressLabel: "4821 Maple Ct, Unit 4",
      currentRent: 1250,
      market: {
        rangeLow: 1295,
        rangeHigh: 1395,
        specificNumber: 1325,
        compsScreenshotRef: "[Attach the comps screenshot before sending]",
      },
    },
    charges: STANDARD_CHARGES,
    infoFormUrl: SAMPLE_INFO_FORM,
    readiness: {
      inheritedLease: false,
      yearBuilt: 1996,
      city: "Lee's Summit",
      hasPet: false,
      securityDepositType: "cash",
      landlordIsLlc: true,
      landlordName: "Maple Holdings LLC",
      leaseStartIso: "2025-09-01",
    },
  },
  {
    id: "lease-1207-walnut-2",
    addressLabel: "1207 Walnut St, Unit 2",
    tenantNameLabel: "M. Carter",
    lease: { leaseID: "1207-2", endDate: "2026-08-31", leaseType: "Fixed Term" },
    stageIndex: 0,
    dataCheck: [
      {
        fieldKey: "current_rent",
        fieldLabel: "Rent",
        agreement: "conflict",
        candidates: [
          {
            source: "rentvine",
            sourceSystem: "RentVine",
            value: "$1,250",
            confidence: "Verified",
          },
          {
            source: "sheet",
            sourceSystem: "Sheet",
            value: "$1,289",
            confidence: "Needs Verification",
          },
        ],
      },
      AGREE_DATE("2026-08-31"),
    ],
    owner: { addressLabel: "1207 Walnut St, Unit 2", currentRent: 1250 },
    charges: STANDARD_CHARGES,
    infoFormUrl: SAMPLE_INFO_FORM,
    readiness: {
      inheritedLease: true,
      templateSelected: null,
      yearBuilt: 1971,
      city: "Independence",
      hasPet: null,
      leaseStartIso: "2024-09-01",
    },
  },
  {
    id: "lease-318-cedar-7",
    addressLabel: "318 Cedar Ave, Unit 7",
    tenantNameLabel: "the Nguyen household",
    lease: { leaseID: "318-7", endDate: "2026-09-30", leaseType: "Fixed Term" },
    stageIndex: 2,
    dataCheck: [AGREE_RENT("$1,180"), AGREE_DATE("2026-09-30")],
    owner: {
      addressLabel: "318 Cedar Ave, Unit 7",
      currentRent: 1180,
      market: {
        rangeLow: 1225,
        rangeHigh: 1300,
        specificNumber: 1260,
        compsScreenshotRef: "[Attach the comps screenshot before sending]",
      },
    },
    ownerDecision: { decision: "increase", offeredRent: 1260 },
    charges: STANDARD_CHARGES,
    infoFormUrl: SAMPLE_INFO_FORM,
    readiness: {
      inheritedLease: false,
      yearBuilt: 2004,
      city: "Kansas City",
      hasPet: true,
      petDepositSet: true,
      securityDepositType: "replacement_policy",
      claimsCashHeld: false,
      landlordIsLlc: false,
      leaseStartIso: "2024-10-01",
    },
  },
  {
    id: "lease-77-birch-1",
    addressLabel: "77 Birch Ln, Unit 1",
    tenantNameLabel: "R. Okafor",
    lease: { leaseID: "77-1", endDate: "2026-09-15", leaseType: "Fixed Term" },
    stageIndex: -1,
    dataCheck: [],
    owner: { addressLabel: "77 Birch Ln, Unit 1", currentRent: 1095 },
    readiness: {},
  },
  {
    id: "lease-540-oak-3",
    addressLabel: "540 Oak Dr, Unit 3",
    tenantNameLabel: "the Power household",
    lease: { leaseID: "540-3", leaseType: "Month-to-Month" },
    stageIndex: -1,
    dataCheck: [],
    owner: { addressLabel: "540 Oak Dr, Unit 3", currentRent: 1340 },
    readiness: {},
  },
  {
    id: "lease-915-pine-5",
    addressLabel: "915 Pine St, Unit 5",
    tenantNameLabel: "the Hassan household",
    lease: { leaseID: "915-5", endDate: "2026-09-30", leaseType: "Section 8 Program" },
    stageIndex: -1,
    dataCheck: [],
    owner: { addressLabel: "915 Pine St, Unit 5", currentRent: 1410 },
    readiness: {},
  },
  {
    id: "lease-12-elm-9",
    addressLabel: "12 Elm Ct, Unit 9",
    tenantNameLabel: "J. Romero",
    lease: { leaseID: "12-9", endDate: "2026-10-31", leaseType: "Fixed Term" },
    stageIndex: -1,
    dataCheck: [],
    owner: { addressLabel: "12 Elm Ct, Unit 9", currentRent: 1205 },
    readiness: {},
  },
];

export interface DeskLeaseSummary {
  id: string;
  addressLabel: string;
  tenantNameLabel: string;
  endDateIso: string | null;
  disposition: CohortDisposition;
  reason: CohortReason;
  reasonLabel: string;
  /** Stage index into RENEWAL_STEPS, or -1 when not actionable. */
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

export interface RenewalLeaseWorkspace {
  summary: DeskLeaseSummary;
  steps: typeof RENEWAL_STEPS;
  currentStepIndex: number;
  dataCheck: DeskReconItem[];
  ownerDraft: OwnerRenewalDraft;
  /** Present only once the owner has recorded a decision. */
  tenantDraft: TenantOfferDraft | null;
  readiness: RenewalReadinessResult;
  /** Read-only effective notice-rule view for this lease (F2). Null when no lease-end is on file. */
  notice: EffectiveRuleView | null;
}

function toSummary(
  seed: DeskLeaseSeed,
  classification: RenewalCohort["classifications"][number],
): DeskLeaseSummary {
  const isActionable = classification.disposition === "actionable";
  const stageIndex = isActionable ? seed.stageIndex : -1;
  return {
    id: seed.id,
    addressLabel: seed.addressLabel,
    tenantNameLabel: seed.tenantNameLabel,
    endDateIso: classification.endDateIso,
    disposition: classification.disposition,
    reason: classification.reason,
    reasonLabel: REASON_LABEL[classification.reason],
    stageIndex,
    stageLabel: stageIndex >= 0 ? RENEWAL_STEPS[stageIndex].label : null,
    nextAction: stageIndex >= 0 ? STAGE_NEXT_ACTION[stageIndex] : null,
    openConflicts: seed.dataCheck.filter((item) => item.agreement === "conflict").length,
  };
}

/** The Renewal Desk: classify the sample batch and bucket it by disposition (pure, deterministic). */
export function getRenewalDeskView(): RenewalDeskView {
  const leases = SAMPLE_DESK_SEEDS.map((seed) => seed.lease);
  const cohort = classifyRenewalCohort(leases, { windows: SAMPLE_DESK_WINDOWS });
  const summaries = SAMPLE_DESK_SEEDS.map((seed, index) =>
    toSummary(seed, cohort.classifications[index]),
  );

  return {
    windows: SAMPLE_DESK_WINDOWS,
    cohort,
    actionable: summaries.filter((s) => s.disposition === "actionable"),
    review: summaries.filter((s) => s.disposition === "review"),
    skipped: summaries.filter((s) => s.disposition === "skip"),
    outOfWindow: summaries.filter((s) => s.disposition === "out_of_window"),
  };
}

/**
 * The per-lease workspace: builds the owner draft, the tenant offer (once a decision exists), and the
 * readiness checklist via the real modules. Returns null for an unknown or non-actionable lease. Pure.
 */
export function getRenewalLeaseWorkspace(
  id: string,
  referenceDateIso: string = SAMPLE_NOTICE_REFERENCE_DATE,
): RenewalLeaseWorkspace | null {
  const seedIndex = SAMPLE_DESK_SEEDS.findIndex((seed) => seed.id === id);
  if (seedIndex === -1) return null;
  const seed = SAMPLE_DESK_SEEDS[seedIndex];

  const cohort = classifyRenewalCohort(
    SAMPLE_DESK_SEEDS.map((s) => s.lease),
    { windows: SAMPLE_DESK_WINDOWS },
  );
  const classification = cohort.classifications[seedIndex];
  if (classification.disposition !== "actionable") return null;

  const summary = toSummary(seed, classification);
  const ownerDraft = buildOwnerRenewalDraft(seed.owner);

  // Effective notice rule for this lease. The sample desk is app-plane synthetic data, so it uses the
  // built-in DEFAULT rule set (values UNVERIFIED); the live surfaces read the seeded config record.
  const resolvedNoticeRule = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {
    leaseId: seed.id,
  });
  const notice = classification.endDateIso
    ? buildEffectiveRuleView(
        resolvedNoticeRule,
        detectNoticeStatus(
          resolvedNoticeRule,
          {
            leaseEndDateIso: classification.endDateIso,
            renewalLetterSentIso: null,
            tenantResponded: false,
          },
          referenceDateIso,
        ),
      )
    : null;

  const tenantDraft =
    seed.ownerDecision && classification.endDateIso
      ? buildTenantOfferDraft({
          tenantNameLabel: seed.tenantNameLabel,
          leaseEndDateIso: classification.endDateIso,
          ownerDecision: seed.ownerDecision.decision,
          offeredRent: seed.ownerDecision.offeredRent,
          charges: seed.charges,
          infoFormUrl: seed.infoFormUrl,
        })
      : null;

  return {
    summary,
    steps: RENEWAL_STEPS,
    currentStepIndex: seed.stageIndex,
    dataCheck: seed.dataCheck,
    ownerDraft,
    tenantDraft,
    readiness: evaluateRenewalReadiness(seed.readiness),
    notice,
  };
}

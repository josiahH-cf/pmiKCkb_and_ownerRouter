import type { Role } from "@/lib/auth/roles";
import {
  buildDeskLeaseGuidance,
  deskGuidanceVerificationCause,
  type DeskGuidanceInput,
} from "@/lib/lease-renewal/desk-guidance";
import type {
  DeskReconItem,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import { buildRenewalActionSnapshot } from "@/lib/lease-renewal/renewal-action-snapshot";
import type { RenewalActionSnapshot } from "@/lib/lease-renewal/renewal-actions";
import { projectRenewalIssues } from "@/lib/lease-renewal/renewal-issues";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  type ManualActivity,
  type RenewalWorkspaceState,
  type StaffActivityRecord,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S142-S145 fixtures: a sample lease workspace whose shared guidance, S127 issues and action
// snapshot are all rebuilt by the real builders from one set of inputs, so the projection is
// always compared with the guidance the page would actually carry for that state.

export const FIXTURE_CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

export interface ActionFixtureOptions {
  readonly leaseId?: string;
  readonly role?: Role;
  /** undefined: no staff lane mounted; "unreadable": the staff-record read failed. */
  readonly manual?: RenewalWorkspaceState | null | "unreadable";
  readonly currency?: "fresh" | "stale" | "expired";
  readonly readComplete?: boolean;
  readonly dispositionReview?: boolean;
  readonly rentAgreement?: DeskReconItem["agreement"];
  readonly progressUnavailable?: boolean;
  readonly moveOutInitiated?: boolean;
  readonly unavailable?: readonly string[];
  readonly rentChargeStatus?: readonly RentChargeOutcomeRow[] | null;
  readonly termNeedsReview?: boolean;
  readonly workflowAvailable?: boolean;
  readonly correctionPanel?: boolean;
}

export function actionFixture(options: ActionFixtureOptions = {}): {
  readonly workspace: RenewalLeaseWorkspace;
  readonly snapshot: RenewalActionSnapshot;
} {
  const base = getRenewalLeaseWorkspace(options.leaseId ?? "lease-318-cedar-7")!;
  const manual = options.manual;
  const state = manual && manual !== "unreadable" ? manual : null;
  const dataCheck = options.rentAgreement
    ? base.dataCheck.map((item) =>
        item.fieldKey === "current_rent"
          ? { ...item, agreement: options.rentAgreement! }
          : item,
      )
    : base.dataCheck;
  const summary = {
    ...base.summary,
    ...(state ? { manualProgress: manualRenewalSummary(state) } : {}),
    ...(options.dispositionReview
      ? { disposition: "review" as const, reasonLabel: "Lease end date is missing" }
      : {}),
    ...(options.moveOutInitiated
      ? {
          moveOut: {
            state: "initiated",
            reason: "notice_status",
            label: "RentVine shows a move-out notice for this lease.",
          } as unknown as MoveOutDisposition,
        }
      : {}),
    ...(options.termNeedsReview
      ? {
          leaseTerm: {
            ...base.summary.leaseTerm,
            term: "needs_review" as const,
          },
        }
      : {}),
  };
  const workflowAvailable = options.workflowAvailable ?? base.workflowAvailable;
  const guidanceInput: DeskGuidanceInput = {
    summary,
    process: workflowAvailable ? base.process : null,
    dataCheck,
    rentvineCurrentRent: summary.currentRent,
    rentDecision: null,
    currencyState: options.currency ?? "fresh",
    readComplete: options.readComplete ?? true,
  };
  const workspace: RenewalLeaseWorkspace = {
    ...base,
    summary,
    dataCheck,
    workflowAvailable,
    guidance: buildDeskLeaseGuidance(guidanceInput),
    verificationCause: deskGuidanceVerificationCause(guidanceInput),
    dataCurrency: {
      state: options.currency ?? "fresh",
      readAtIso: "2026-09-30T17:00:00.000Z",
    } as RenewalLeaseWorkspace["dataCurrency"],
  };
  const unavailable = new Set([
    ...(options.unavailable ?? []),
    ...(options.progressUnavailable ? ["progress"] : []),
    ...(manual === "unreadable" ? ["manual"] : []),
  ]);
  const issues = projectRenewalIssues({
    guidance: workspace.guidance,
    summary: workspace.summary,
    readComplete: true,
    currencyState: options.currency ?? "fresh",
    progressStateAvailable: !unavailable.has("progress"),
    sheetWritebackPaused: false,
  });
  const snapshot = buildRenewalActionSnapshot({
    workspace,
    role: options.role ?? "Editor",
    issues,
    manualLaneMounted: manual !== undefined,
    manualState: manual === "unreadable" ? undefined : manual,
    manualReadUnavailable: manual === "unreadable",
    unavailableSources: unavailable,
    rentChargeStatus: options.rentChargeStatus ?? null,
    correctionPanel: options.correctionPanel ?? true,
  });
  return { workspace, snapshot };
}

function staffRecord(termsRevision: number, extra: Partial<StaffActivityRecord> = {}) {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    actorUid: "fixture-staff",
    recordedAt: "2026-09-30T12:00:00.000Z",
    source: "Fixture source",
    termsRevision,
    ...extra,
  };
}

export interface ManualFixture {
  readonly owner?:
    | "no_response"
    | "revision_requested"
    | "approved_terms"
    | "declined_non_renewal";
  readonly tenant?:
    | "awaiting_response"
    | "accepted"
    | "counter_change_requested"
    | "declined_nonrenewing"
    | "needs_verification";
  readonly done?: readonly ManualActivity[];
  /** Activities recorded against the previous terms revision. */
  readonly stale?: readonly ManualActivity[];
  readonly notApplicable?: readonly ManualActivity[];
  readonly preparation?: boolean;
  readonly completion?: boolean;
  readonly termsRevision?: number;
  readonly cycleId?: string;
}

/** A staff-recorded cycle for the sample lease in the requested state. */
export function manualFixture(
  fixture: ManualFixture = {},
  leaseId = "lease-318-cedar-7",
): RenewalWorkspaceState {
  const state = emptyRenewalWorkspace(leaseId, fixture.cycleId ?? FIXTURE_CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  const terms =
    fixture.termsRevision ?? (fixture.owner && fixture.owner !== "no_response" ? 1 : 0);
  state.termsRevision = terms;
  state.revision = 5;
  if (fixture.owner)
    state.ownerResponse = {
      ...staffRecord(terms),
      outcome: fixture.owner,
      ...(fixture.owner === "approved_terms"
        ? { terms: { rent: 1450, effectiveDate: "2027-01-01", endDate: "2027-12-31" } }
        : {}),
    };
  if (fixture.tenant)
    state.tenantResponse = { ...staffRecord(terms), outcome: fixture.tenant };
  for (const key of fixture.done ?? [])
    state.activities[key] = { ...staffRecord(terms), outcome: "done" };
  for (const key of fixture.stale ?? [])
    state.activities[key] = { ...staffRecord(terms - 1), outcome: "done" };
  for (const key of fixture.notApplicable ?? [])
    state.activities[key] = {
      ...staffRecord(terms, {
        reason: "The lease has no such obligation",
        applicabilityPolicy: "Approved applicability rule v1",
      }),
      outcome: "not_applicable",
    };
  if (fixture.preparation)
    state.preparation = {
      market: { rangeLow: 1400, rangeHigh: 1500 },
      source: "Fixture comps",
      recordedAt: "2026-09-30T12:00:00.000Z",
      recordedByUid: "fixture-staff",
      revision: 2,
    };
  if (fixture.completion) state.completion = staffRecord(terms);
  return state;
}

export const AFTER_ACCEPTANCE: readonly ManualActivity[] = [
  "information_form",
  "form_returned",
  "documents",
  "document_delivery",
  "signatures",
  "insurance",
  "rhino",
  "pet",
  "charges",
  "inspection",
  "filter",
  "utilities",
  "assisted_housing",
];

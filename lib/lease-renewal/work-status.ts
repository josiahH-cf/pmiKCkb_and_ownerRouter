import { formatBusinessTimestamp } from "@/lib/date-display";

// S119: the staff work status. A bounded, app-owned lease annotation that says where staff report
// the renewal work stands. It is projected once for the lease information panel, the compact lease
// context and the desk filter. It is not derived progress, not provider evidence, not completion:
// nothing here reads or changes owner approval, tenant acceptance, deliveries, signatures, source
// updates or the recorded manual cycle. Pure and client-safe.

export const RENEWAL_WORK_STATUSES = [
  "verifying_lease_and_rent",
  "preparing_market_comparison",
  "preparing_owner_outreach",
  "waiting_on_owner_response",
  "preparing_tenant_offer",
  "waiting_on_tenant_response",
  "preparing_lease_documents",
  "waiting_on_signatures",
  "completing_follow_up",
  "non_renewal_handoff",
  "complete_staff_status",
] as const;
export type RenewalWorkStatus = (typeof RENEWAL_WORK_STATUSES)[number];

/** The bounded workflow meanings. There is no "messaged tenants" state and no custom builder. */
export const RENEWAL_WORK_STATUS_LABELS: Record<RenewalWorkStatus, string> = {
  verifying_lease_and_rent: "Verifying lease and rent",
  preparing_market_comparison: "Preparing market comparison",
  preparing_owner_outreach: "Preparing owner outreach",
  waiting_on_owner_response: "Waiting on owner response",
  preparing_tenant_offer: "Preparing tenant offer",
  waiting_on_tenant_response: "Waiting on tenant response",
  preparing_lease_documents: "Preparing lease documents / Dotloop",
  waiting_on_signatures: "Waiting on signatures",
  completing_follow_up: "Completing follow-up",
  non_renewal_handoff: "Non-renewal handoff",
  complete_staff_status: "Complete: staff status",
};

export const RENEWAL_WORK_STATUS_SCHEMA_VERSION = "renewal-work-status/v1";
export const RENEWAL_WORK_STATUS_CONTROL_LABEL = "Work status (recorded by staff)";
export const RENEWAL_WORK_STATUS_SAVE_LABEL = "Save status";
export const NOT_RECORDED_WORK_STATUS_LABEL = "Not recorded";
export const UNAVAILABLE_WORK_STATUS_LABEL =
  "Not available: the saved status could not be read";

export const RENEWAL_WORK_STATUS_FILTERS = [
  "all",
  "not_recorded",
  ...RENEWAL_WORK_STATUSES,
] as const;
export type RenewalWorkStatusFilter = (typeof RENEWAL_WORK_STATUS_FILTERS)[number];

/** The desk index key. Unavailable is never a filter value and never matches one. */
export type RenewalWorkStatusQueryKey =
  | "unavailable"
  | "not_recorded"
  | RenewalWorkStatus;

export interface RenewalWorkStatusRecord {
  readonly schemaVersion: typeof RENEWAL_WORK_STATUS_SCHEMA_VERSION;
  readonly leaseId: string;
  readonly revision: number;
  readonly status: RenewalWorkStatus;
  readonly recordedAt: string;
  /** The stable server-derived actor reference. */
  readonly recordedByUid: string;
  /** The readable identity captured at record time; retained even if a name later changes. */
  readonly recordedByLabel: string;
  /** The renewal cycle current when the status was saved; null when none had started. */
  readonly cycleId: string | null;
  /** The saving operation id; a lost response is resolved by comparing it on readback. */
  readonly eventId: string;
}

export interface RenewalWorkStatusActivity {
  readonly id: string;
  readonly leaseId: string;
  readonly revision: number;
  readonly previousStatus: RenewalWorkStatus | null;
  readonly status: RenewalWorkStatus;
  readonly recordedAt: string;
  readonly recordedByUid: string;
  readonly recordedByLabel: string;
  readonly cycleId: string | null;
}

/**
 * How the saved value relates to the current renewal cycle: saved during it, saved earlier (a
 * previous cycle or before any cycle started), saved with no cycle at all, or unverifiable
 * because the current cycle could not be read.
 */
export type RenewalWorkStatusCycleRelation =
  | "current"
  | "previous"
  | "none"
  | "unverified";

export type RenewalWorkStatusProjection =
  | { readonly state: "unavailable" }
  | { readonly state: "not_recorded" }
  | {
      readonly state: "recorded";
      readonly status: RenewalWorkStatus;
      readonly label: string;
      readonly revision: number;
      readonly recordedAt: string;
      readonly recordedByUid: string;
      readonly recordedByLabel: string;
      readonly cycleId: string | null;
      readonly cycleRelation: RenewalWorkStatusCycleRelation;
    };

export type RenewalWorkStatusRead =
  | { readonly available: false }
  | { readonly available: true; readonly record: RenewalWorkStatusRecord | null };

/** What the lease page hands the information panel: the read outcome, history and cycle. */
export interface RenewalWorkStatusPanelInput {
  readonly available: boolean;
  readonly record: RenewalWorkStatusRecord | null;
  readonly history: readonly RenewalWorkStatusActivity[];
  /** The current manual cycle id, null when none exists, undefined when it could not be read. */
  readonly currentCycleId: string | null | undefined;
}

export const WORK_STATUS_CYCLE_NOTES: Record<RenewalWorkStatusCycleRelation, string> = {
  current: "Recorded during the current renewal cycle.",
  previous:
    "Recorded in a previous renewal cycle. The current cycle has no saved status yet.",
  none: "Recorded without a started renewal cycle.",
  unverified:
    "Its renewal cycle could not be verified because the cycle record was not read.",
};

function cycleRelation(
  recordCycleId: string | null,
  currentCycleId: string | null | undefined,
): RenewalWorkStatusCycleRelation {
  if (currentCycleId === undefined) return "unverified";
  if (currentCycleId === null) return recordCycleId === null ? "none" : "unverified";
  return recordCycleId === currentCycleId ? "current" : "previous";
}

/**
 * The one projection every surface reads. `currentCycleId` is the lease's current manual cycle
 * (null when none exists) or undefined when that cycle could not be read.
 */
export function projectRenewalWorkStatus(
  read: RenewalWorkStatusRead,
  currentCycleId: string | null | undefined,
): RenewalWorkStatusProjection {
  if (!read.available) return { state: "unavailable" };
  if (!read.record) return { state: "not_recorded" };
  const record = read.record;
  return {
    state: "recorded",
    status: record.status,
    label: RENEWAL_WORK_STATUS_LABELS[record.status],
    revision: record.revision,
    recordedAt: record.recordedAt,
    recordedByUid: record.recordedByUid,
    recordedByLabel: record.recordedByLabel,
    cycleId: record.cycleId,
    cycleRelation: cycleRelation(record.cycleId, currentCycleId),
  };
}

export function workStatusQueryKey(
  projection: RenewalWorkStatusProjection | undefined,
): RenewalWorkStatusQueryKey {
  if (!projection || projection.state === "unavailable") return "unavailable";
  if (projection.state === "not_recorded") return "not_recorded";
  return projection.status;
}

export function matchesWorkStatusFilter(
  filter: RenewalWorkStatusFilter,
  key: RenewalWorkStatusQueryKey,
): boolean {
  if (filter === "all") return true;
  return key === filter;
}

export function workStatusDisplayLabel(
  projection: RenewalWorkStatusProjection | undefined,
): string {
  if (!projection || projection.state === "unavailable")
    return UNAVAILABLE_WORK_STATUS_LABEL;
  if (projection.state === "not_recorded") return NOT_RECORDED_WORK_STATUS_LABEL;
  return projection.label;
}

export function workStatusFilterLabel(filter: RenewalWorkStatusFilter): string {
  if (filter === "all") return "Staff status: all";
  if (filter === "not_recorded") return `Staff status: ${NOT_RECORDED_WORK_STATUS_LABEL}`;
  return `Staff status: ${RENEWAL_WORK_STATUS_LABELS[filter]}`;
}

/** S126: the shared business-time rendering (MM/DD/YYYY, time, zone); an unparseable timestamp is shown as recorded. */
export function formatWorkStatusRecordedAt(iso: string): string {
  return Number.isFinite(Date.parse(iso)) ? formatBusinessTimestamp(iso) : iso;
}

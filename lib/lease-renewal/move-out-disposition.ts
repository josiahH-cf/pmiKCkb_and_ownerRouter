import type { RawLease, RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import { leaseDetailOf, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import type { LeaseDataAgeState } from "@/lib/lease-renewal/live-lease-cache";

/**
 * S124 (F03): one typed, source-attributed move-out disposition over the documented RentVine read
 * contract, established read-only on 2026-09-20:
 *
 * - `GET /leases/statuses` is the account's lease status table. Each row carries `leaseStatusID`,
 *   `name`, `primaryLeaseStatusID` (1 pending, 2 active, 3 closed) and the documented flags
 *   `isPendingMoveOutStatus` / `isCompletedMoveOutStatus`. A notice given, a vacated unit and an
 *   eviction in progress are the statuses whose `isPendingMoveOutStatus` is set; the flag, never the
 *   status name, is the positive evidence.
 * - Every export row and lease detail carries `leaseStatusID`; the lease detail also carries
 *   `noticeDate`, `expectedMoveOutDate` and `moveOutDate`. Those dates are shown as evidence and are
 *   never, on their own, treated as a notice: an active status with a notice date or an expected
 *   move-out date is a conflict to review, not initiation. `moveOutDate` is also a legacy lease-end
 *   alias in the field map; it stays exactly that.
 *
 * The projection reads only. It never writes, cancels, completes, closes or messages anything, and a
 * manual staff non-renewal decision stays a separate app-owned fact (see `manualRenewalSummary`).
 */
export type MoveOutDispositionState =
  | "initiated"
  | "not_initiated"
  | "withdrawn"
  | "unknown";

export type MoveOutDispositionReason =
  | "notice_status"
  | "active_without_notice"
  | "withdrawn_after_prior_notice"
  | "status_table_unavailable"
  | "lease_status_missing"
  | "status_unresolved"
  | "lease_not_active"
  | "detail_unavailable"
  | "notice_evidence_without_status"
  | "stale_source";

export interface MoveOutEvidence {
  readonly origin: "rentvine_lease_status";
  readonly leaseId: string | null;
  readonly statusId: string | null;
  readonly statusName: string | null;
  readonly primaryStatusId: string | null;
  readonly pendingMoveOut: boolean | null;
  readonly completedMoveOut: boolean | null;
  readonly noticeDateIso: string | null;
  readonly expectedMoveOutIso: string | null;
  readonly moveOutIso: string | null;
}

export type MoveOutFreshness = LeaseDataAgeState | "unavailable";

export interface MoveOutDisposition {
  readonly state: MoveOutDispositionState;
  readonly reason: MoveOutDispositionReason;
  /** Operator-facing sentence; source-attributed and never a send, close or completion claim. */
  readonly label: string;
  readonly evidence: MoveOutEvidence;
  readonly freshness: MoveOutFreshness;
  readonly observedAtIso: string | null;
}

export type LeaseStatusTableRead =
  | { readonly status: "available"; readonly statuses: readonly RentVineLeaseStatus[] }
  | { readonly status: "unavailable" };

/** An earlier app-owned observation of an initiated notice for the same lease identity. */
export interface PriorMoveOutEvidence {
  readonly state: "initiated";
  readonly observedAtIso: string;
}

export interface MoveOutDispositionInput {
  readonly lease: RawLease;
  readonly statusTable: LeaseStatusTableRead;
  readonly freshness: MoveOutFreshness;
  readonly observedAtIso: string | null;
  readonly prior?: PriorMoveOutEvidence | null;
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function isoDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function findLeaseStatus(
  statuses: readonly RentVineLeaseStatus[],
  statusId: string | null,
): RentVineLeaseStatus | null {
  if (statusId === null) return null;
  const matches = statuses.filter((status) => status.leaseStatusID === statusId);
  return matches.length === 1 ? matches[0] : null;
}

function withNotice(dateIso: string | null, expectedIso: string | null): string {
  const parts: string[] = [];
  if (dateIso) parts.push(`notice ${dateIso}`);
  if (expectedIso) parts.push(`expected move-out ${expectedIso}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export function projectMoveOutDisposition(
  input: MoveOutDispositionInput,
): MoveOutDisposition {
  const { lease, statusTable, freshness, observedAtIso } = input;
  const detail = leaseDetailOf(lease);
  const detailAvailable = detail?.status === "available";
  const statusId =
    (detailAvailable ? cleanText(detail.leaseStatusId) : null) ??
    cleanText(lease.leaseStatusID) ??
    cleanText(lease.leaseStatusId);
  const noticeDateIso = detailAvailable ? isoDate(detail.noticeDate) : null;
  const expectedMoveOutIso =
    (detailAvailable ? isoDate(detail.expectedMoveOutDate) : null) ??
    isoDate(lease.expectedMoveOutDate);
  const moveOutIso =
    (detailAvailable ? isoDate(detail.moveOutDate) : null) ?? isoDate(lease.moveOutDate);
  const status =
    statusTable.status === "available"
      ? findLeaseStatus(statusTable.statuses, statusId)
      : null;
  const evidence: MoveOutEvidence = {
    origin: "rentvine_lease_status",
    leaseId: leaseViewId(lease) ?? null,
    statusId,
    statusName: status?.name ?? null,
    primaryStatusId:
      status?.primaryLeaseStatusID ?? cleanText(lease.primaryLeaseStatusID),
    pendingMoveOut: status?.isPendingMoveOutStatus ?? null,
    completedMoveOut: status?.isCompletedMoveOutStatus ?? null,
    noticeDateIso,
    expectedMoveOutIso,
    moveOutIso,
  };
  const base = { evidence, freshness, observedAtIso } as const;
  const unknown = (
    reason: MoveOutDispositionReason,
    label: string,
  ): MoveOutDisposition => ({
    state: "unknown",
    reason,
    label,
    ...base,
  });

  if (statusTable.status !== "available")
    return unknown(
      "status_table_unavailable",
      "Move-out evidence unknown: the RentVine lease status list could not be read. Review the lease in RentVine before outreach.",
    );
  if (statusId === null)
    return unknown(
      "lease_status_missing",
      "Move-out evidence unknown: this lease carries no RentVine status. Review the lease in RentVine before outreach.",
    );
  if (!status)
    return unknown(
      "status_unresolved",
      `Move-out evidence unknown: RentVine status id ${statusId} is not in the account's lease status list. Review the lease in RentVine before outreach.`,
    );
  if (
    status.isPendingMoveOutStatus === true ||
    status.isCompletedMoveOutStatus === true
  ) {
    const stale = freshness === "expired";
    return {
      state: "initiated",
      reason: "notice_status",
      label: `Move-out initiated in RentVine: ${status.name}${withNotice(noticeDateIso, expectedMoveOutIso)}.${stale ? " This RentVine read is expired; refresh before relying on it." : ""} Ordinary renewal outreach is unavailable; use the non-renewal handoff.`,
      ...base,
    };
  }
  if (status.primaryLeaseStatusID !== "2")
    return unknown(
      "lease_not_active",
      `Move-out evidence is not read for a pending or closed lease (${status.name}).`,
    );
  if (!detailAvailable)
    return unknown(
      "detail_unavailable",
      `Move-out evidence unknown: RentVine shows ${status.name}, but the lease detail could not be read, so the absence of a notice is unverified. Review before outreach.`,
    );
  if (noticeDateIso || expectedMoveOutIso)
    return unknown(
      "notice_evidence_without_status",
      `Move-out evidence conflicts: RentVine shows ${status.name} together with a notice date or expected move-out date${withNotice(noticeDateIso, expectedMoveOutIso)}. Review the lease in RentVine before outreach.`,
    );
  if (freshness === "expired")
    return unknown(
      "stale_source",
      `Move-out evidence unknown: the RentVine read showing ${status.name} is expired. Refresh before relying on the absence of a notice.`,
    );
  if (input.prior?.state === "initiated")
    return {
      state: "withdrawn",
      reason: "withdrawn_after_prior_notice",
      label: `RentVine no longer shows a move-out notice (${status.name}); a notice was observed ${input.prior.observedAtIso.slice(0, 10)}. Review the lease and any manual non-renewal decision before resuming outreach.`,
      ...base,
    };
  return {
    state: "not_initiated",
    reason: "active_without_notice",
    label: `No move-out notice in RentVine (${status.name}).`,
    ...base,
  };
}

export type MoveOutQueryKey = MoveOutDispositionState;

export const MOVE_OUT_DESK_FILTERS = [
  "all",
  "initiated",
  "exclude_initiated",
  "unknown",
  "not_initiated",
  "non_renewal",
] as const;
export type MoveOutDeskFilter = (typeof MOVE_OUT_DESK_FILTERS)[number];

export const MOVE_OUT_CONTROL_LABEL = "Move-out notice";

export const MOVE_OUT_FILTER_LABELS: Record<MoveOutDeskFilter, string> = {
  all: "All move-out states",
  initiated: "Move-out initiated (RentVine)",
  exclude_initiated: "Exclude confirmed move-outs",
  unknown: "Move-out evidence unknown",
  not_initiated: "No move-out notice (RentVine)",
  non_renewal: "Non-renewal (RentVine notice or staff decision)",
};

export function moveOutFilterLabel(filter: MoveOutDeskFilter): string {
  return MOVE_OUT_FILTER_LABELS[filter];
}

/**
 * The desk filter over the row's disposition key. An absent key (the disposition was not read)
 * counts as unknown, never as no notice; "exclude confirmed" keeps unknown rows; "non_renewal"
 * unions the provider notice with the audited staff non-renewal decision without merging them.
 */
export function matchesMoveOutFilter(
  filter: MoveOutDeskFilter,
  key: MoveOutQueryKey | undefined,
  manualNonRenewal: boolean,
): boolean {
  const state: MoveOutQueryKey = key ?? "unknown";
  switch (filter) {
    case "all":
      return true;
    case "initiated":
      return state === "initiated";
    case "exclude_initiated":
      return state !== "initiated";
    case "unknown":
      return state === "unknown";
    case "not_initiated":
      return state === "not_initiated";
    case "non_renewal":
      return state === "initiated" || manualNonRenewal;
  }
}

export const MOVE_OUT_STATE_LABELS: Record<MoveOutDispositionState, string> = {
  initiated: "Move-out initiated",
  not_initiated: "No move-out notice",
  withdrawn: "Move-out notice withdrawn",
  unknown: "Move-out evidence unknown",
};

/** Short row text; the sentence-level label carries the review guidance. */
export function moveOutIndicatorLabel(disposition: MoveOutDisposition): string {
  const name = disposition.evidence.statusName;
  const suffix = name ? ` (${name})` : "";
  return `${MOVE_OUT_STATE_LABELS[disposition.state]}${suffix}`;
}

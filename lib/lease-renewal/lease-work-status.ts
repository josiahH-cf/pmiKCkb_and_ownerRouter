// S232 R-S232-4 (ARCH-S232-2, BEH-S232-3): one status, waiting-on party, evidence source and next
// action per lease, read by both the desk row and Focus. When the staff record and the message
// evidence disagree the lease reads "Needs a check" with both facts, and neither wins by
// precedence.
//
// S279 R-S279-2 / R-S279-3: the comparison reads the one waiting projection (`lease-waiting.ts`):
// the staff record against the current message's own thread in the lease's evidence, never one
// viewer's own mailbox links, so every staff member reads the same status. The check names the fix.
// Pure and client-safe; nothing here reads a provider, records anything or derives outreach.

import { formatCalendarDateOrTimestamp } from "@/lib/date-display";
import { staffLaneGuidance } from "@/lib/lease-renewal/desk-guidance";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { RenewalOverallStatus } from "@/lib/lease-renewal/desk-query-v2";
import type { LeaseWaiting, LeaseWaitingCheck } from "@/lib/lease-renewal/lease-waiting";
import type { OutreachFill } from "@/lib/lease-renewal/outreach-evidence";
import {
  manualRenewalSummary,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

type StaffLane = Pick<
  ReturnType<typeof manualRenewalSummary>,
  "complete" | "waitingParty"
>;

export type LeaseWorkStatusState = RenewalOverallStatus | "needs_check";

export interface LeaseWorkStatusInput {
  /** The lease's guidance status, as the desk row carries it or Focus recomputes it. */
  readonly status: RenewalOverallStatus;
  /** The staff lane behind a Ready, Waiting or Complete status; null for any other status. */
  readonly staffLane: StaffLane | null;
  /** The newest time on the staff record; null when nothing is recorded. */
  readonly staffRecordedAtIso: string | null;
  /** True when the staff-record read failed, so nothing about it is known. */
  readonly staffRecordUnavailable?: boolean;
  /**
   * S279: the one waiting projection over the lease's own message evidence; null when the
   * evidence was not read. No viewer identity or mailbox link enters it.
   */
  readonly waiting: LeaseWaiting | null;
  /** When the RentVine read behind this view was taken. */
  readonly sourceReadAtIso: string | null;
}

export interface LeaseWorkStatus {
  readonly status: LeaseWorkStatusState;
  readonly label: string;
  /** Who the lease waits on, in words; null once complete or when the staff lane does not guide. */
  readonly waitingOn: string | null;
  /** Both facts and the fix, when the staff record and the current message's thread disagree. */
  readonly check: LeaseWaitingCheck | null;
  /** The record the status comes from and its time. */
  readonly evidence: {
    readonly source: "staff_record" | "staff_record_unavailable" | "source_read";
    readonly atIso: string | null;
    /** True when the staff lane guides the lease but nothing is recorded on it yet. */
    readonly nothingRecorded: boolean;
  };
}

export const LEASE_WORK_STATUS_LABEL: Record<LeaseWorkStatusState, string> = {
  needs_verification: "Needs verification",
  blocked: "Blocked",
  complete: "Complete",
  waiting: "Waiting",
  ready: "Ready",
  needs_review: "Needs review",
  needs_check: "Needs a check",
};

const PARTY = {
  staff: "the PMI KC team",
  owner: "the owner",
  tenant: "the tenant",
} as const;

/** Build the one lease status. Pure; every fact comes from the passed records. */
export function projectLeaseWorkStatus(input: LeaseWorkStatusInput): LeaseWorkStatus {
  const plain = (status: LeaseWorkStatusState) => ({
    status,
    label: LEASE_WORK_STATUS_LABEL[status],
  });
  if (input.staffRecordUnavailable) {
    return {
      ...plain(input.status),
      waitingOn: null,
      check: null,
      evidence: {
        source: "staff_record_unavailable",
        atIso: input.sourceReadAtIso,
        nothingRecorded: false,
      },
    };
  }
  const lane = input.staffLane;
  const recorded = input.staffRecordedAtIso !== null;
  const evidence: LeaseWorkStatus["evidence"] =
    lane && recorded
      ? {
          source: "staff_record",
          atIso: input.staffRecordedAtIso,
          nothingRecorded: false,
        }
      : {
          source: "source_read",
          atIso: input.sourceReadAtIso,
          nothingRecorded: Boolean(lane),
        };
  if (!lane) return { ...plain(input.status), waitingOn: null, check: null, evidence };
  // R-S279-3: a check exists only when the staff record and the same message's evidence really
  // disagree; an app-confirmed send with no reply is one fact, never a check.
  const check = input.waiting?.readable ? input.waiting.check : null;
  if (check) {
    return { ...plain("needs_check"), waitingOn: null, check, evidence };
  }
  return {
    status: input.status,
    // The desk's wording for a completion staff recorded.
    label:
      lane.complete && input.status === "complete"
        ? "Completed: recorded by staff"
        : LEASE_WORK_STATUS_LABEL[input.status],
    waitingOn: lane.complete ? null : PARTY[lane.waitingParty],
    check: null,
    evidence,
  };
}

/** True for the statuses the staff lane decides; the others come from the source read. */
export function staffLaneStatus(status: RenewalOverallStatus): boolean {
  return status === "ready" || status === "waiting" || status === "complete";
}

/**
 * The desk row's input: the guidance status it carries and the same staff lane that guidance read
 * (a row with nothing recorded is guided by the first staff activity), with the row's own waiting
 * projection.
 */
export function deskLeaseWorkStatusInput(
  row: Pick<
    DeskLeaseRow,
    "guidance" | "manualProgress" | "staffRecordedAtIso" | "staffRecordUnavailable"
  > & { readonly leaseWaiting?: LeaseWaiting | null },
  sourceReadAtIso: string | null,
): LeaseWorkStatusInput {
  const status = row.guidance.overallStatus;
  return {
    status,
    staffLane: staffLaneStatus(status)
      ? (row.manualProgress ?? manualRenewalSummary(null))
      : null,
    staffRecordedAtIso: row.staffRecordedAtIso ?? null,
    ...(row.staffRecordUnavailable ? { staffRecordUnavailable: true } : {}),
    waiting: row.leaseWaiting ?? null,
    sourceReadAtIso,
  };
}

/**
 * Focus's input: the live staff record (recomputed after each save) with the waiting projection
 * read against that same record and the server's read time. A status the staff lane does not
 * decide keeps the server's value.
 */
export function focusLeaseWorkStatusInput(input: {
  readonly serverStatus: RenewalOverallStatus;
  readonly staffRecord:
    | { readonly readable: false }
    | { readonly readable: true; readonly state: RenewalWorkspaceState | null };
  readonly standingOwnerAuthority: boolean;
  /** S279: the waiting projection for this lease, read against the same staff record. */
  readonly waiting: LeaseWaiting | null;
  readonly sourceReadAtIso: string | null;
  /** S248: the lease's message evidence read into the staff lane, as the desk row reads it. */
  readonly evidence?: OutreachFill | null;
}): LeaseWorkStatusInput {
  const shared = { waiting: input.waiting, sourceReadAtIso: input.sourceReadAtIso };
  if (!input.staffRecord.readable)
    return {
      status: "needs_verification",
      staffLane: null,
      staffRecordedAtIso: null,
      staffRecordUnavailable: true,
      ...shared,
    };
  if (!staffLaneStatus(input.serverStatus))
    return {
      status: input.serverStatus,
      staffLane: null,
      staffRecordedAtIso: null,
      ...shared,
    };
  const lane = manualRenewalSummary(input.staffRecord.state, {
    standingOwnerAuthority: input.standingOwnerAuthority,
    evidence: input.evidence ?? null,
  });
  return {
    status: staffLaneGuidance(lane).status,
    staffLane: lane,
    staffRecordedAtIso: staffRecordLatestAtIso(input.staffRecord.state),
    ...shared,
  };
}

/** The newest time recorded on the staff record, or null when nothing is recorded. */
export function staffRecordLatestAtIso(
  state: RenewalWorkspaceState | null | undefined,
): string | null {
  if (!state) return null;
  const times = [
    state.ownerResponse?.recordedAt,
    state.tenantResponse?.recordedAt,
    state.completion?.recordedAt,
    state.preparation?.recordedAt,
    ...Object.values(state.activities).map((record) => record?.recordedAt),
  ].filter(
    (value): value is string =>
      typeof value === "string" && !Number.isNaN(Date.parse(value)),
  );
  if (times.length === 0) return null;
  return times.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}

/** The status's supporting lines in plain words; the desk row and Focus render exactly these. */
export function leaseWorkStatusLines(status: LeaseWorkStatus): {
  readonly waiting: string | null;
  readonly check: string | null;
  readonly evidence: string;
} {
  // An unknown time is left out rather than guessed.
  const at = (prefix: string, iso: string | null) =>
    iso ? `${prefix} ${formatCalendarDateOrTimestamp(iso)}` : "";
  const evidence = status.evidence;
  return {
    waiting: status.waitingOn ? `Waiting on: ${status.waitingOn}` : null,
    // R-S279-3: both facts and the fix, in the same words as the stage line.
    check: status.check ? status.check.sentence : null,
    evidence:
      evidence.source === "staff_record"
        ? `From the staff record${at(", saved", evidence.atIso)}`
        : evidence.source === "staff_record_unavailable"
          ? "The staff record could not be read; refresh before relying on this status."
          : `From the RentVine read${at(" at", evidence.atIso)}${evidence.nothingRecorded ? "; nothing recorded by staff yet" : ""}`,
  };
}

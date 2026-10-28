// S232 R-S232-4 (ARCH-S232-2, BEH-S232-3): one status, waiting-on party, evidence source and next
// action per lease, read by both the desk row and Focus. The staff record and the linked Gmail
// thread are two waiting facts; when both are known and they disagree the lease reads "Needs a
// check" with both facts, and neither wins by precedence. Pure and client-safe; nothing here reads
// a provider, records anything or derives outreach.

import { formatCalendarDateOrTimestamp } from "@/lib/date-display";
import { staffLaneGuidance } from "@/lib/lease-renewal/desk-guidance";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { RenewalOverallStatus } from "@/lib/lease-renewal/desk-query-v2";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import {
  manualRenewalSummary,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

type StaffLane = Pick<
  ReturnType<typeof manualRenewalSummary>,
  "complete" | "waitingParty"
>;

/** The follow-up facts the status compares and cites; serializable from server to client. */
export type LeaseWorkStatusFollowUp = Pick<
  RenewalFollowUpProjection,
  "waiting" | "lastContact"
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
  /** The follow-up projection's waiting fact and last contact for this lease. */
  readonly followUp: LeaseWorkStatusFollowUp | null;
  /** When the RentVine read behind this view was taken. */
  readonly sourceReadAtIso: string | null;
}

export interface LeaseWorkStatus {
  readonly status: LeaseWorkStatusState;
  readonly label: string;
  /** Who the lease waits on, in words; null once complete or when the staff lane does not guide. */
  readonly waitingOn: string | null;
  /** Both waiting facts, in words, when the staff record and the linked thread disagree. */
  readonly check: { readonly staffRecord: string; readonly linkedThread: string } | null;
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

/** The staff record's waiting fact: whose move it names, or complete. */
function staffFact(lane: StaffLane, recorded: boolean): string {
  if (!recorded) return "has no work recorded yet";
  return lane.complete ? "says complete" : `says waiting on ${PARTY[lane.waitingParty]}`;
}

type ThreadFact = {
  readonly party: keyof typeof PARTY | "none" | "outside";
  readonly words: string;
};

/**
 * The linked Gmail thread's waiting fact, or null when no thread fact is known. A process-step
 * fallback is not a thread fact, so it is never compared with the staff record.
 */
function threadFact(followUp: LeaseWorkStatusFollowUp | null): ThreadFact | null {
  const waiting = followUp?.waiting;
  if (!waiting || waiting.source?.kind !== "gmail_thread") return null;
  if (waiting.state === "not_waiting")
    return { party: "none", words: "not waiting on anyone" };
  if (waiting.state !== "verified") return null;
  switch (waiting.party) {
    case "owner":
      return { party: "owner", words: `waiting on ${PARTY.owner}` };
    case "tenant":
      return { party: "tenant", words: `waiting on ${PARTY.tenant}` };
    case "team":
      return { party: "staff", words: `waiting on ${PARTY.staff}` };
    case "unresolved_source":
      return { party: "outside", words: "waiting on someone outside PMI KC" };
    default:
      return null;
  }
}

/** True when the thread's fact says the same as the staff record's. */
function agrees(lane: StaffLane, thread: ThreadFact): boolean {
  if (lane.complete) return thread.party === "none";
  // Not waiting on anyone outside PMI KC is the team's own move.
  if (lane.waitingParty === "staff")
    return thread.party === "staff" || thread.party === "none";
  return thread.party === lane.waitingParty;
}

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
  const thread = threadFact(input.followUp);
  if (thread && !agrees(lane, thread)) {
    return {
      ...plain("needs_check"),
      waitingOn: null,
      check: { staffRecord: staffFact(lane, recorded), linkedThread: thread.words },
      evidence,
    };
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
 * (a row with nothing recorded is guided by the first staff activity).
 */
export function deskLeaseWorkStatusInput(
  row: Pick<
    DeskLeaseRow,
    "guidance" | "manualProgress" | "staffRecordedAtIso" | "staffRecordUnavailable"
  > & { readonly followUp?: LeaseWorkStatusFollowUp | null },
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
    followUp: row.followUp ?? null,
    sourceReadAtIso,
  };
}

/**
 * Focus's input: the live staff record (recomputed after each save) with the server's follow-up
 * facts and read time. A status the staff lane does not decide keeps the server's value.
 */
export function focusLeaseWorkStatusInput(input: {
  readonly serverStatus: RenewalOverallStatus;
  readonly staffRecord:
    | { readonly readable: false }
    | { readonly readable: true; readonly state: RenewalWorkspaceState | null };
  readonly standingOwnerAuthority: boolean;
  readonly followUp: LeaseWorkStatusFollowUp | null;
  readonly sourceReadAtIso: string | null;
}): LeaseWorkStatusInput {
  const shared = { followUp: input.followUp, sourceReadAtIso: input.sourceReadAtIso };
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
    check: status.check
      ? `The staff record ${status.check.staffRecord}; the linked Gmail thread says ${status.check.linkedThread}.`
      : null,
    evidence:
      evidence.source === "staff_record"
        ? `From the staff record${at(", saved", evidence.atIso)}`
        : evidence.source === "staff_record_unavailable"
          ? "The staff record could not be read; refresh before relying on this status."
          : `From the RentVine read${at(" at", evidence.atIso)}${evidence.nothingRecorded ? "; nothing recorded by staff yet" : ""}`,
  };
}

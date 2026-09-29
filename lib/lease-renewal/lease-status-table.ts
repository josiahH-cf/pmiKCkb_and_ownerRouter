import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import {
  noticeAdmissionContext,
  type NoticeSourceAdmission,
} from "./notice-source-admission";
import type { LeaseStatusTableRead } from "@/lib/lease-renewal/move-out-disposition";

// S124: one bounded, memoized read of the documented RentVine lease status table (`GET
// /leases/statuses`). The table is account configuration, not customer data, and changes rarely; a
// short TTL keeps every desk render and message preparation from re-reading it while a failure is
// never cached (the next caller retries). This module has no write capability.

export const LEASE_STATUS_TABLE_TTL_MS = 15 * 60_000;

export interface LeaseStatusTableReader {
  listLeaseStatuses?: () => Promise<RentVineLeaseStatus[]>;
  beforeStatusSourceRead?: (readAtMs: number) => Promise<NoticeSourceAdmission | void>;
}

let cached: {
  statuses: readonly RentVineLeaseStatus[];
  readAtMs: number;
  noticeAdmitted: boolean;
  admittedLeaseKeys: readonly string[];
  admissionContext?: object;
  admissionEpoch: number;
} | null = null;
let inflight: Promise<readonly RentVineLeaseStatus[]> | null = null;
let admissionEpoch = 0;
const admissionContexts = new WeakMap<
  readonly RentVineLeaseStatus[],
  { context?: object; epoch: number }
>();

export function clearLeaseStatusTableCache(): void {
  admissionEpoch++;
  cached = null;
  inflight = null;
}

export async function readLeaseStatusTable(
  reader: LeaseStatusTableReader,
  nowMs: number,
): Promise<LeaseStatusTableRead> {
  if (typeof reader.listLeaseStatuses !== "function") return { status: "unavailable" };
  if (cached && nowMs - cached.readAtMs < LEASE_STATUS_TABLE_TTL_MS) {
    return {
      status: "available",
      statuses: cached.statuses,
      readAtMs: cached.readAtMs,
      noticeAdmitted: cached.noticeAdmitted,
      admittedLeaseKeys: cached.admittedLeaseKeys,
    };
  }
  try {
    let sourceReadAt = nowMs;
    let admittedLeaseKeys: readonly string[] = [];
    let admissionContext: object | undefined;
    const epoch = admissionEpoch;
    inflight ??= Promise.resolve()
      .then(async () => {
        const admittedAt = await reader.beforeStatusSourceRead?.(nowMs);
        if (admittedAt) {
          sourceReadAt = admittedAt.readAtMs;
          admittedLeaseKeys = admittedAt.leaseKeys;
          admissionContext = noticeAdmissionContext(admittedAt);
        }
        return reader.listLeaseStatuses!();
      })
      .then((statuses) => {
        cached = {
          statuses: Object.freeze([...statuses]),
          readAtMs: sourceReadAt,
          noticeAdmitted: typeof reader.beforeStatusSourceRead === "function",
          admittedLeaseKeys,
          admissionContext,
          admissionEpoch: epoch,
        };
        admissionContexts.set(cached.statuses, { context: admissionContext, epoch });
        return cached.statuses;
      });
    const statuses = await inflight;
    return {
      status: "available",
      statuses,
      readAtMs: cached!.readAtMs,
      noticeAdmitted: cached!.noticeAdmitted,
      admittedLeaseKeys: cached!.admittedLeaseKeys,
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    inflight = null;
  }
}

/** Lease-specific admission repair joins an existing status read without dropping its slot. */
export async function readLeaseStatusTableForAdmission(
  reader: LeaseStatusTableReader,
  nowMs: number,
  context: object,
  leaseKey: string | readonly string[],
  minimumReadAtMs = 0,
): Promise<LeaseStatusTableRead> {
  if (!Number.isFinite(nowMs) || !Number.isFinite(minimumReadAtMs) || minimumReadAtMs < 0)
    throw new Error("A finite admission timestamp is required.");
  const accepted = () => {
    const current = cached;
    return (
      current !== null &&
      current.noticeAdmitted &&
      current.admissionContext === context &&
      current.admissionEpoch === admissionEpoch &&
      (typeof leaseKey === "string" ? [leaseKey] : leaseKey).every((key) =>
        current.admittedLeaseKeys.includes(key),
      ) &&
      Number.isFinite(current.readAtMs) &&
      current.readAtMs >= minimumReadAtMs &&
      nowMs - current.readAtMs < LEASE_STATUS_TABLE_TTL_MS
    );
  };
  if (!accepted()) {
    const pending = inflight;
    if (pending) await pending.catch(() => undefined);
    if (!accepted()) {
      // The previous request is settled. Never clear a running read to start a competing one.
      cached = null;
    }
  }
  const result = await readLeaseStatusTable(reader, nowMs);
  if (
    result.status !== "available" ||
    !(typeof leaseKey === "string" ? [leaseKey] : leaseKey).every((key) =>
      result.admittedLeaseKeys?.includes(key),
    ) ||
    !accepted()
  ) {
    throw new Error("The status source did not admit the requested notice context.");
  }
  return result;
}

/** Check a held status result without exposing the store/provider context in the read model. */
export function leaseStatusTableHasAdmission(
  result: LeaseStatusTableRead,
  nowMs: number,
  context: object,
  leaseKey: string | readonly string[],
): boolean {
  if (result.status !== "available") return false;
  const admission = admissionContexts.get(result.statuses);
  return (
    cached?.statuses === result.statuses &&
    admission?.context === context &&
    admission?.epoch === admissionEpoch &&
    result.noticeAdmitted === true &&
    (typeof leaseKey === "string" ? [leaseKey] : leaseKey).every(
      (key) => result.admittedLeaseKeys?.includes(key) === true,
    ) &&
    Number.isFinite(nowMs) &&
    Number.isFinite(result.readAtMs) &&
    nowMs - result.readAtMs! < LEASE_STATUS_TABLE_TTL_MS
  );
}

import { RentVineError, type RawLease } from "@/lib/integrations/rentvine/client";
import type { RentVineLeaseUpdatePayload } from "@/lib/integrations/rentvine/write-client";
import type { RentVineProofBinding } from "@/lib/lease-renewal/rentvine-proof-contract";
import { RENTVINE_PROOF_IDENTITY_FIELDS } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

export type RentVineProofProviderErrorCode =
  | "provider_read_failed"
  | "provider_shape"
  | "provider_identity_mismatch"
  | "provider_state_drift"
  | "provider_readback_mismatch";

/** Value-free provider refusal; no raw provider body or customer value enters the message. */
export class RentVineProofProviderError extends Error {
  constructor(public readonly code: RentVineProofProviderErrorCode) {
    super(`S30 RentVine proof refused (${code}).`);
    this.name = "RentVineProofProviderError";
  }
}

export interface RentVineProofReader {
  getLease(leaseId: string): Promise<RawLease>;
}

export interface RentVineProofWriter {
  updateLease(leaseId: string, payload: RentVineLeaseUpdatePayload): Promise<unknown>;
}

export interface RentVineProofLeaseSnapshot {
  leaseId: string;
  startDate: string;
  endDate: string | null;
}

function exactIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function parseRentVineProofLeaseSnapshot(
  raw: unknown,
  binding: RentVineProofBinding,
): RentVineProofLeaseSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RentVineProofProviderError("provider_shape");
  }
  const source = raw as Record<string, unknown>;
  const selectedIdentity = source[binding.target.identityField];
  if (
    selectedIdentity === undefined ||
    selectedIdentity === null ||
    String(selectedIdentity).trim() !== binding.target.leaseId
  ) {
    throw new RentVineProofProviderError("provider_identity_mismatch");
  }
  for (const identityField of RENTVINE_PROOF_IDENTITY_FIELDS) {
    const candidate = source[identityField];
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim() !== binding.target.leaseId
    ) {
      throw new RentVineProofProviderError("provider_identity_mismatch");
    }
  }
  if (!exactIsoDate(source.startDate)) {
    throw new RentVineProofProviderError("provider_shape");
  }
  if (source.endDate !== null && !exactIsoDate(source.endDate)) {
    throw new RentVineProofProviderError("provider_shape");
  }
  return Object.freeze({
    leaseId: binding.target.leaseId,
    startDate: source.startDate,
    endDate: source.endDate as string | null,
  });
}

export async function readRentVineProofLeaseSnapshot(
  reader: RentVineProofReader,
  binding: RentVineProofBinding,
): Promise<RentVineProofLeaseSnapshot> {
  let raw: RawLease;
  try {
    raw = await reader.getLease(binding.target.leaseId);
  } catch {
    throw new RentVineProofProviderError("provider_read_failed");
  }
  return parseRentVineProofLeaseSnapshot(raw, binding);
}

export function assertRentVineProofLeaseBefore(
  snapshot: RentVineProofLeaseSnapshot,
  binding: RentVineProofBinding,
): void {
  if (
    snapshot.leaseId !== binding.target.leaseId ||
    snapshot.startDate !== binding.target.startDate ||
    snapshot.endDate !== binding.target.before
  ) {
    throw new RentVineProofProviderError("provider_state_drift");
  }
}

export function assertRentVineProofLeaseAfter(
  snapshot: RentVineProofLeaseSnapshot,
  binding: RentVineProofBinding,
): void {
  if (
    snapshot.leaseId !== binding.target.leaseId ||
    snapshot.startDate !== binding.target.startDate ||
    snapshot.endDate !== binding.target.after
  ) {
    throw new RentVineProofProviderError("provider_readback_mismatch");
  }
}

/** The one effect reachable from S30: same lease, fresh startDate, one endDate replacement. */
export function updateRentVineProofLeaseEndDate(
  writer: RentVineProofWriter,
  binding: RentVineProofBinding,
  snapshot: RentVineProofLeaseSnapshot,
): Promise<unknown> {
  assertRentVineProofLeaseBefore(snapshot, binding);
  return writer.updateLease(binding.target.leaseId, {
    startDate: snapshot.startDate,
    endDate: binding.target.after,
  });
}

/** A response known to refuse before applying is failed; uncertain transport/server results are ambiguous. */
export function rentVineProofWriteOutcome(error: unknown): "failed" | "ambiguous" {
  if (!(error instanceof RentVineError)) return "ambiguous";
  if ([400, 401, 403, 404, 409, 422, 429].includes(error.status)) return "failed";
  return "ambiguous";
}

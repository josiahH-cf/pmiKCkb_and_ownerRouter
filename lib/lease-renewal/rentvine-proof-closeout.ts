import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import {
  RENTVINE_PROOF_ACTION_KEY,
  rentVineProofReceiptHash,
} from "@/lib/lease-renewal/rentvine-proof-contract";

export interface RentVineProofCloseoutRecord {
  id: string;
  schemaVersion: "s30-closeout-v1";
  actionKey: typeof RENTVINE_PROOF_ACTION_KEY;
  proofRefHash: string;
  forwardExecutionId: string;
  forwardReceiptHash: string;
  rollbackExecutionId: string;
  rollbackReceiptHash: string;
  committedSeedAllowed: false;
  runtimeExecutable: false;
  closedReadbackAt: string;
  createdAt: string;
}

export interface RentVineProofCloseoutStore {
  get(id: string): Promise<RentVineProofCloseoutRecord | null>;
  create(record: RentVineProofCloseoutRecord): Promise<"created" | "reused">;
}

export function sameRentVineProofCloseoutEvidence(
  left: RentVineProofCloseoutRecord,
  right: RentVineProofCloseoutRecord,
): boolean {
  return (
    canonicalJson(stableCloseoutEvidence(left)) ===
    canonicalJson(stableCloseoutEvidence(right))
  );
}

function stableCloseoutEvidence(
  value: RentVineProofCloseoutRecord,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== "closedReadbackAt" && key !== "createdAt",
    ),
  );
}

export function rentVineProofCloseoutId(proofRef: string): string {
  return `s30-closeout-${hashExecutionPreview({ schemaVersion: "s30-closeout-v1", proofRef }).slice(0, 48)}`;
}

export function buildRentVineProofCloseoutRecord(input: {
  proofRef: string;
  forward: ExternalExecutionRecord;
  rollback: ExternalExecutionRecord;
  nowMs: number;
}): RentVineProofCloseoutRecord {
  const { forward, rollback } = input;
  if (
    forward.workflowId !== input.proofRef ||
    rollback.workflowId !== input.proofRef ||
    forward.actionId !== "rentvine-proof:forward" ||
    rollback.actionId !== "rentvine-proof:rollback" ||
    forward.actionKey !== RENTVINE_PROOF_ACTION_KEY ||
    rollback.actionKey !== RENTVINE_PROOF_ACTION_KEY ||
    forward.state !== "succeeded" ||
    rollback.state !== "succeeded" ||
    forward.attemptCount !== 1 ||
    rollback.attemptCount !== 1 ||
    !forward.receipt ||
    !rollback.receipt ||
    !Number.isFinite(input.nowMs)
  ) {
    throw new Error(
      "S30 closeout requires exact successful forward and rollback receipts.",
    );
  }
  const createdAt = new Date(input.nowMs).toISOString();
  return Object.freeze({
    id: rentVineProofCloseoutId(input.proofRef),
    schemaVersion: "s30-closeout-v1",
    actionKey: RENTVINE_PROOF_ACTION_KEY,
    proofRefHash: hashExecutionPreview({ proofRef: input.proofRef }),
    forwardExecutionId: forward.id,
    forwardReceiptHash: rentVineProofReceiptHash(forward.receipt),
    rollbackExecutionId: rollback.id,
    rollbackReceiptHash: rentVineProofReceiptHash(rollback.receipt),
    committedSeedAllowed: false,
    runtimeExecutable: false,
    closedReadbackAt: createdAt,
    createdAt,
  });
}

export class MemoryRentVineProofCloseoutStore implements RentVineProofCloseoutStore {
  readonly records = new Map<string, RentVineProofCloseoutRecord>();

  async get(id: string): Promise<RentVineProofCloseoutRecord | null> {
    return this.records.get(id) ?? null;
  }

  async create(record: RentVineProofCloseoutRecord): Promise<"created" | "reused"> {
    const existing = this.records.get(record.id);
    if (existing) {
      if (!sameRentVineProofCloseoutEvidence(existing, record)) {
        throw new Error("S30 closeout identity has conflicting evidence.");
      }
      return "reused";
    }
    this.records.set(record.id, structuredClone(record));
    return "created";
  }
}

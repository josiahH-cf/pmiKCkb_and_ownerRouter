import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import type { DataMode } from "@/lib/data-mode";
import { executionEvidenceMarker } from "@/lib/data-mode";

/** Strict bodyless receipt boundary shared by the S20 and S22 execution ledgers. */
export function parseExternalReceipt(
  value: unknown,
  expectedActionKey: string,
  reconciliation: boolean,
  dataMode: DataMode = "live",
): Readonly<ExternalActionReceipt> {
  if (!value || typeof value !== "object") {
    throw new Error("Provider receipt is not an object.");
  }
  const receipt = value as Record<string, unknown>;
  if (
    receipt.actionKey !== expectedActionKey ||
    typeof receipt.providerRef !== "string" ||
    !receipt.providerRef.trim() ||
    receipt.providerRef.length > 1_000 ||
    typeof receipt.resultHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(receipt.resultHash) ||
    typeof receipt.createdAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.createdAt)) ||
    typeof receipt.reconciled !== "boolean" ||
    receipt.reconciled !== reconciliation ||
    (receipt.outcome !== undefined &&
      receipt.outcome !== "succeeded" &&
      receipt.outcome !== "not_applicable")
  ) {
    throw new Error("Provider receipt failed strict runtime validation.");
  }
  return Object.freeze({
    actionKey: receipt.actionKey,
    ...executionEvidenceMarker(dataMode),
    providerRef: receipt.providerRef.trim(),
    resultHash: receipt.resultHash.toLowerCase(),
    reconciled: receipt.reconciled,
    createdAt: new Date(receipt.createdAt).toISOString(),
    ...(receipt.outcome ? { outcome: receipt.outcome } : {}),
  } as ExternalActionReceipt);
}

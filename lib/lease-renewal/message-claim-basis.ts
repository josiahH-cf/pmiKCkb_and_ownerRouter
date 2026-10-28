import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  workingEntry,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
/**
 * S234 R-S234-2: the Working terms a message was composed from, each with its revision. They are
 * the renewal terms, so the claim re-reads them in its transaction and any terms save after the
 * preview refuses it.
 */
export function workingTermsFingerprint(working: RenewalWorkingRecord | null) {
  const field = (key: string) => {
    const entry = workingEntry(working, key);
    return entry ? { value: entry.value, revision: entry.revision } : null;
  };
  return hashExecutionPreview({
    rent: field("terms_rent"),
    effectiveDate: field("terms_effective_date"),
    endDate: field("terms_end_date"),
  });
}
export function workspaceMessageBasisFingerprint(head: Record<string, unknown>) {
  return hashExecutionPreview({
    cycleId: head.cycleId,
    termsRevision: head.termsRevision,
    ownerResponse: head.ownerResponse,
    tenantResponse: head.tenantResponse,
    preparation: head.preparation,
  });
}
export function messageResourceFingerprint(settings: Record<string, unknown> | null) {
  const entries = settings?.entries as Record<string, unknown> | undefined;
  return hashExecutionPreview({
    resources:
      settings === null
        ? null
        : {
            insurance_flyer: entries?.insurance_flyer ?? null,
            renewal_information_form: entries?.renewal_information_form ?? null,
            rbp_flyer: entries?.rbp_flyer ?? null,
          },
  });
}
export interface RenewalMessageClaimBasis {
  workspaceFingerprint: string;
  sourceFingerprint: string;
  resourceFingerprint: string;
  preparationRevision: number;
  /** Absent only on historical receipts; never sufficient for a new claim. */
  noticeSafety?: { scopeHash: string; version: number; semanticHash: string };
  /** S234: absent only on snapshots prepared before it; never sufficient for a new claim. */
  workingTermsFingerprint?: string;
}
